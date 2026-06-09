import fs from "node:fs/promises";
import nodePath from "node:path";
import { HTMLRewriter } from "html-rewriter-wasm";
import * as esbuild from "esbuild";
import { readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
//#region src/build/options.ts
const is_prod = process.argv[2] === "build";
const config = (await import(nodePath.join(process.cwd(), "kit10.config.js"))).default;
const vitePlugins = [];
const kit10HtmlPreprocessors = [];
if (config.plugins) for (const plugin of config.plugins) if (plugin && "kit10" in plugin) {
	if (plugin.htmlPreprocessor) kit10HtmlPreprocessors.push(plugin.htmlPreprocessor);
	if (plugin.vitePlugins) vitePlugins.push(...plugin.vitePlugins);
} else vitePlugins.push(plugin);
const source_path = nodePath.join(process.cwd(), "src");
const output_path = nodePath.join(process.cwd(), "dist");
const output_static_path = nodePath.join(output_path, "static");
//#endregion
//#region src/build/plugins/config.ts
/** Configures the Vite plugin that updates Vite config. */
function configPlugin() {
	return {
		name: "kit10:config",
		config() {
			return { css: { preprocessorOptions: config.build?.css_preprocessors } };
		}
	};
}
//#endregion
//#region src/utils.ts
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
/**
* Returns whether a path already has non-relative behavior.
* @param path -
* @returns -
*/
function isAbsoluteOrSpecialPath(path) {
	return path.startsWith("/") || path.startsWith("#") || path.startsWith("//") || /^[a-z][a-z\d+.-]*:/iu.test(path);
}
//#endregion
//#region src/build/html.ts
const KIT10_INLINE_STYLE_ATTR = "data-kit10-inline-style";
const inlined = /* @__PURE__ */ new Map();
const inlined_promises = /* @__PURE__ */ new Map();
const inline_style_sources = /* @__PURE__ */ new Map();
/** Returns stylesheets marked as inline while rewriting an HTML file. */
function getInlineStyleSources(path) {
	return new Set(inline_style_sources.get(path));
}
/** Returns a safe value for an HTML attribute. */
function escapeAttribute$1(value) {
	return value.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
/** Does actual bundling of JS/TS file into one. */
async function bundleDo(path) {
	const [output] = (await esbuild.build({
		absWorkingDir: source_path,
		entryPoints: ["." + path],
		outdir: "/",
		bundle: true,
		format: "esm",
		minify: is_prod,
		write: false
	})).outputFiles;
	if (!output) throw new Error("No output file");
	const contents = textDecoder.decode(output.contents);
	if (is_prod) inlined.set(path, contents);
	return contents;
}
/** Bundles JS/TS file into one. */
async function bundle(path) {
	if (!path.startsWith("/")) throw new Error("Path for bundle must be absolute.");
	if (inlined.has(path)) return inlined.get(path);
	if (inlined_promises.has(path)) return inlined_promises.get(path);
	const promise = bundleDo(path);
	inlined_promises.set(path, promise);
	const contents = await promise;
	inlined_promises.delete(path);
	return contents;
}
/**
* Rewrites html.
* @param path - The absolute file path of the html file.
* @param contents - The html to rewrite.
* @returns -
*/
async function rewriteHtml(path, contents) {
	const dir = nodePath.dirname(path);
	const scripts_to_inline = [];
	let result = "";
	let first_tag_name;
	let is_kit10_head = false;
	let kit10_head = "";
	const rewriter = new HTMLRewriter((chunk) => {
		const chunk_string = textDecoder.decode(chunk);
		if (is_kit10_head) kit10_head += chunk_string;
		else result += chunk_string;
	});
	rewriter.on("*", { element(element) {
		first_tag_name ??= element.tagName.toLowerCase();
	} });
	rewriter.on("kit10\\:head", { element(element) {
		is_kit10_head = true;
		element.removeAndKeepContent();
		element.onEndTag(() => {
			is_kit10_head = false;
		});
	} });
	rewriter.on("img", { element(node) {
		const import_path = node.getAttribute("src");
		if (import_path) node.setAttribute("src", absolutePath(dir, import_path));
	} });
	registerScriptHandler(rewriter, dir, scripts_to_inline);
	registerLinkHandler(rewriter, dir, path);
	rewriter.write(textEncoder.encode(contents));
	rewriter.end();
	const html = await replaceInlineScripts(result, scripts_to_inline);
	return {
		is_full_page: first_tag_name === "html",
		kit10_head,
		html
	};
}
/** Registers script URL rewriting and kit10:inline script bundling. */
function registerScriptHandler(rewriter, dir, scripts_to_inline) {
	let inline_script_index = 0;
	rewriter.on("script", { element(element) {
		const import_path = element.getAttribute("src");
		if (!import_path) return;
		element.setAttribute("src", absolutePath(dir, import_path));
		if (element.getAttribute("kit10:inline") === null) return;
		const import_path_absolute = absolutePath(dir, import_path);
		const inline_contents = bundle(import_path_absolute);
		const placeholder = `kit10:inline-script:${inline_script_index++}`;
		element.replace(`<!--${placeholder}-->`, { html: true });
		scripts_to_inline.push({
			attributes: getInlineScriptAttributes(element),
			contents: inline_contents,
			path: import_path_absolute,
			placeholder
		});
	} });
}
/** Registers link URL rewriting and kit10:inline stylesheet markers. */
function registerLinkHandler(rewriter, dir, html_path) {
	rewriter.on("link", { element(element) {
		const import_path = element.getAttribute("href");
		if (!import_path) return;
		const import_path_absolute = absolutePath(dir, import_path);
		element.setAttribute("href", import_path_absolute);
		if (element.getAttribute("kit10:inline") !== null && isInlineStyleLink(element)) {
			addInlineStyleSource(html_path, import_path_absolute);
			element.removeAttribute("kit10:inline");
			element.setAttribute(KIT10_INLINE_STYLE_ATTR, import_path_absolute);
			if (isPreloadStyleLink(element)) {
				element.setAttribute("rel", "stylesheet");
				element.removeAttribute("as");
			}
		}
	} });
}
/** Registers a stylesheet that should be inlined after Vite processes it. */
function addInlineStyleSource(html_path, path) {
	if (!inline_style_sources.has(html_path)) inline_style_sources.set(html_path, /* @__PURE__ */ new Set());
	inline_style_sources.get(html_path).add(path.replace(/[?#].*$/u, ""));
}
/** Replaces script placeholders with their bundled contents. */
async function replaceInlineScripts(html, scripts_to_inline) {
	const replacements = await Promise.all(scripts_to_inline.map(async (script) => {
		return {
			html: await createInlineScriptHtml(script),
			placeholder: script.placeholder
		};
	}));
	let result = html;
	for (const replacement of replacements) result = result.replace(`<!--${replacement.placeholder}-->`, replacement.html);
	return result;
}
/** Creates inline script HTML. */
async function createInlineScriptHtml(script) {
	const inlined_contents = await script.contents;
	let html = `<script data-src="${escapeAttribute$1(script.path)}" vite-ignore`;
	for (const [key, value] of script.attributes) html += ` ${key}="${escapeAttribute$1(value)}"`;
	return `${html}>${escapeScriptContent(inlined_contents)}<\/script>`;
}
/** Returns script attributes that should survive inlining. */
function getInlineScriptAttributes(element) {
	return [...element.attributes].filter(([key]) => key !== "src" && key !== "kit10:inline" && key !== "vite-ignore" && key !== "data-src");
}
/**
* Converts a relative path to absolute.
* @param dir - The directory of the file.
* @param path - The relative path to convert.
* @returns -
*/
function absolutePath(dir, path) {
	if (isAbsoluteOrSpecialPath(path)) return path;
	return nodePath.normalize(nodePath.join(dir, path)).replace(source_path, "");
}
/** Escapes JavaScript text for embedding in a script tag. */
function escapeScriptContent(value) {
	return value.replaceAll("<\/script", "<\\/script").replaceAll("<!--", "<\\!--");
}
/** Returns whether a rel attribute contains a token. */
function hasRel(rel, token) {
	return rel?.split(/\s+/u).some((rel_token) => rel_token.toLowerCase() === token) ?? false;
}
/** Returns whether a link points to a stylesheet that should be inlined. */
function isInlineStyleLink(element) {
	return hasRel(element.getAttribute("rel"), "stylesheet") || isPreloadStyleLink(element);
}
/** Returns whether a link preloads a stylesheet. */
function isPreloadStyleLink(element) {
	return hasRel(element.getAttribute("rel"), "preload") && element.getAttribute("as")?.toLowerCase() === "style";
}
//#endregion
//#region src/build/plugins/css-inline.ts
const RE_HTML = /\.html$/iu;
const RE_CSS = /\.css$/iu;
const RE_EXTERNAL_URL = /^(?:[a-z][a-z\d+.-]*:|\/\/)/iu;
/** Creates a Vite plugin that inlines marked stylesheet links into HTML. */
function cssInlinePlugin() {
	return {
		name: "kit10:css-inline",
		apply: "build",
		enforce: "post",
		generateBundle(_options, bundle_raw) {
			const bundle = bundle_raw;
			const css_sources = getCssSources(bundle);
			for (const html_asset of getHtmlAssets(bundle)) html_asset.source = inlineBuildStyles(bundle, html_asset, css_sources);
		}
	};
}
/** Inlines marked stylesheet links in dev HTML using the running Vite server. */
async function inlineDevStyles(html, server) {
	const { html: rewritten_html, styles } = extractInlineStyles(html, getMarkedInlineStyle);
	let result = rewritten_html;
	await Promise.all(styles.map(async (style) => {
		const css = await loadDevCss(style.href, server);
		result = result.replace(`<!--${style.placeholder}-->`, createInlineStyleHtml(style.attributes, css, style.source));
	}));
	return result;
}
/** Inlines marked stylesheet links in an emitted HTML asset. */
function inlineBuildStyles(bundle, html_asset, css_sources) {
	const inline_sources = getBuildInlineSources(html_asset.fileName);
	const { html, styles } = extractInlineStyles(assetToString(html_asset), (element) => getBuildInlineStyle(element, html_asset.fileName, inline_sources, css_sources));
	let result = html;
	for (const style of styles) {
		const file_name = resolveHtmlUrl(html_asset.fileName, style.href);
		const css_asset = file_name ? bundle[file_name] : void 0;
		if (!file_name || !isCssAsset(css_asset)) throw new Error(`Can not inline stylesheet "${style.href}" from "${html_asset.fileName}".`);
		result = result.replace(`<!--${style.placeholder}-->`, createInlineStyleHtml(style.attributes, assetToString(css_asset), style.source));
	}
	return result;
}
/** Extracts marked stylesheet links and leaves placeholders behind. */
function extractInlineStyles(html, getInlineStyle) {
	const styles = [];
	let result = "";
	let inline_style_index = 0;
	const rewriter = new HTMLRewriter((chunk) => {
		result += textDecoder.decode(chunk);
	});
	rewriter.on("link", { element(element) {
		const inline_style = getInlineStyle(element);
		if (inline_style === null) return;
		const placeholder = `kit10:inline-style:${inline_style_index++}`;
		styles.push({
			attributes: [...element.attributes],
			href: inline_style.href,
			placeholder,
			source: inline_style.source
		});
		element.replace(`<!--${placeholder}-->`, { html: true });
	} });
	rewriter.write(textEncoder.encode(html));
	rewriter.end();
	return {
		html: result,
		styles
	};
}
/** Returns a marked inline stylesheet candidate, if present. */
function getMarkedInlineStyle(element) {
	const source = element.getAttribute(KIT10_INLINE_STYLE_ATTR);
	if (source === null) return null;
	const href = element.getAttribute("href");
	if (!href) throw new Error(`Can not inline stylesheet without "href" attribute.`);
	return {
		href,
		source
	};
}
/** Returns a build inline stylesheet candidate, if present. */
function getBuildInlineStyle(element, html_file_name, inline_sources, css_sources) {
	const marked_style = getMarkedInlineStyle(element);
	if (marked_style) return marked_style;
	const href = element.getAttribute("href");
	if (!href) return null;
	const file_name = resolveHtmlUrl(html_file_name, href);
	const source = file_name ? css_sources.get(file_name) : void 0;
	if (!source || !inline_sources.has(source)) return null;
	return {
		href,
		source
	};
}
/** Returns stylesheet source URLs requested inline for an HTML output file. */
function getBuildInlineSources(html_file_name) {
	const html_path = nodePath.join(source_path, html_file_name);
	const template_path = nodePath.join(source_path, "+template.html");
	return new Set([...getInlineStyleSources(template_path), ...getInlineStyleSources(html_path)]);
}
/** Returns a map from emitted CSS file name to root-absolute source URL. */
function getCssSources(bundle) {
	const css_sources = /* @__PURE__ */ new Map();
	for (const item of Object.values(bundle)) if (isChunk(item)) addChunkCssSources(css_sources, item);
	else if (isCssAsset(item)) addAssetCssSources(css_sources, item);
	return css_sources;
}
/** Adds CSS sources found through Vite chunk metadata. */
function addChunkCssSources(css_sources, chunk) {
	const css_file_names = chunk.viteMetadata?.importedCss;
	if (!css_file_names) return;
	for (const source of getChunkSourceUrls(chunk)) for (const css_file_name of css_file_names) css_sources.set(css_file_name, source);
}
/** Adds CSS sources found directly on CSS assets. */
function addAssetCssSources(css_sources, asset) {
	for (const source of asset.originalFileNames ?? []) {
		const source_url = toSourceUrl(source);
		if (source_url) css_sources.set(asset.fileName, source_url);
	}
}
/** Returns source URLs that produced a chunk. */
function getChunkSourceUrls(chunk) {
	const sources = /* @__PURE__ */ new Set();
	for (const source of [chunk.facadeModuleId, ...chunk.moduleIds ?? []]) {
		const source_url = source ? toSourceUrl(source) : null;
		if (source_url) sources.add(source_url);
	}
	return sources;
}
/** Converts a source file name to a root-absolute source URL. */
function toSourceUrl(file_name) {
	const path = nodePath.isAbsolute(file_name) ? file_name : nodePath.join(source_path, file_name);
	const relative_path = nodePath.relative(source_path, path);
	if (relative_path.startsWith("..") || nodePath.isAbsolute(relative_path)) return null;
	return "/" + relative_path.split(nodePath.sep).join("/");
}
/** Loads transformed direct CSS from the dev server. */
async function loadDevCss(href, server) {
	const url = toDirectCssUrl(href);
	const result = await server.transformRequest(url);
	if (!result) throw new Error(`Can not inline stylesheet "${href}".`);
	return result.code;
}
/** Converts a stylesheet href to Vite's direct CSS request URL. */
function toDirectCssUrl(href) {
	const clean_href = href.replace(/#.*$/u, "");
	if (RE_EXTERNAL_URL.test(clean_href)) throw new Error(`Can not inline external stylesheet "${href}".`);
	return clean_href + (clean_href.includes("?") ? "&" : "?") + "direct";
}
/** Creates inline style HTML from transformed CSS. */
function createInlineStyleHtml(attributes, css, source) {
	let html = `<style data-src="${escapeAttribute(source)}" vite-ignore`;
	for (const [name, value] of attributes) {
		if (isRemovedLinkAttribute(name)) continue;
		html += ` ${name}="${escapeAttribute(value)}"`;
	}
	return `${html}>${escapeStyleContent(css)}</style>`;
}
/** Returns emitted HTML assets. */
function getHtmlAssets(bundle) {
	return Object.values(bundle).filter((item) => isAsset(item) && RE_HTML.test(item.fileName));
}
/** Resolves an HTML URL to an emitted bundle file name. */
function resolveHtmlUrl(html_file_name, url) {
	const clean_url = url.replace(/[?#].*$/u, "");
	if (isAbsoluteOrSpecialPath(clean_url)) {
		if (!clean_url.startsWith("/") || clean_url.startsWith("//")) return null;
		return clean_url.slice(1);
	}
	return nodePath.posix.normalize(nodePath.posix.join(nodePath.posix.dirname(html_file_name), clean_url));
}
/** Returns an asset source as a string. */
function assetToString(asset) {
	return typeof asset.source === "string" ? asset.source : textDecoder.decode(asset.source);
}
/** Returns whether an emitted item is a CSS asset. */
function isCssAsset(item) {
	return isAsset(item) && RE_CSS.test(item.fileName);
}
/** Returns whether an emitted item is a JavaScript chunk. */
function isChunk(item) {
	return item?.type === "chunk" && "fileName" in item;
}
/** Returns whether an emitted item is an asset. */
function isAsset(item) {
	return item?.type === "asset" && "fileName" in item && "source" in item;
}
/** Returns whether a link attribute should be removed from the style tag. */
function isRemovedLinkAttribute(name) {
	return name === "href" || name === "rel" || name === "as" || name === "crossorigin" || name === "integrity" || name === "kit10:inline" || name === "data-kit10-inline-style" || name === "vite-ignore" || name === "data-src";
}
/** Returns a safe value for an HTML attribute. */
function escapeAttribute(value) {
	return value.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
/** Escapes CSS text for embedding in a style tag. */
function escapeStyleContent(value) {
	return value.replaceAll("</style", "<\\/style").replaceAll("<!--", "<\\!--");
}
//#endregion
//#region src/build/router/filename.ts
const RE_ENTRYPOINT = /^(?<name>.+)\+page\.(?<ext>[a-z]+)$/iu;
const RE_OPTIONAL_CATCH_ALL = /^\[\[\.\.\.(?<key>[a-z_][\da-z_]*)\]\]$/iu;
const RE_CATCH_ALL = /^\[\.\.\.(?<key>[a-z_][\da-z_]*)\]$/iu;
/**
* Checks if file is an entrypoint file (i.e. ends with `+page.html`).
* Returns the filename without the `.page.html` extension, or `null` if not found.
*/
function getEntrypointName(name) {
	const match = RE_ENTRYPOINT.exec(name);
	if (!match) return null;
	return {
		name: match.groups.name,
		ext: match.groups.ext
	};
}
/**
* Returns specificity for route.
*
* Values:
* - 0: static route (e.g. `/foo`)
* - 1: route with parameter (e.g. `/foo-:id`)
* - 2: route with optional parameter (e.g. `/foo-:id?`)
* - 3: route with greedy parameter (e.g. `/foo-:id+`)
* - 4: (NOT USED) route with wildcard (e.g. `/*`)
* @param name -
* @returns -
*/
function parseFilename(name) {
	if (name.length === 0) throw new Error("File name can not be just +page.<ext>.");
	const match_optional_catch_all = RE_OPTIONAL_CATCH_ALL.exec(name);
	if (match_optional_catch_all) return [{
		route_part: "",
		specificity: {
			type: 0,
			static_length: 0
		}
	}, {
		route_part: `:${match_optional_catch_all.groups.key}{.+}`,
		specificity: {
			type: 3,
			static_length: 0
		}
	}];
	const match_catch_all = RE_CATCH_ALL.exec(name);
	if (match_catch_all) return [{
		route_part: `:${match_catch_all.groups.key}{.+}`,
		specificity: {
			type: 3,
			static_length: 0
		}
	}];
	let has_optional = false;
	let static_length = name.length;
	const route_part = name.replaceAll(/(\[([a-z_][\da-z_]*)\]|\[\[([a-z_][\da-z_]*)\]\])([^\da-z_]|$)/giu, (...args) => {
		static_length -= args[1].length;
		if (args[3] !== void 0) {
			has_optional = true;
			return `:${args[3]}?${args[4]}`;
		}
		return `:${args[2]}${args[4]}`;
	});
	if (name !== route_part) return [{
		route_part,
		specificity: {
			type: has_optional ? 2 : 1,
			static_length
		}
	}];
	if (name.includes("[") !== true) return [{
		route_part,
		specificity: {
			type: 0,
			static_length: 0
		}
	}];
	throw new Error(`Invalid filename "${name}".`);
}
//#endregion
//#region src/build/router/file-tree.ts
/**
* Returns the routes for the given path.
* @returns -
*/
function getRoutes() {
	return flatState(walk(source_path));
}
/**
* Walks the file tree at the given path and populates the walk state with the routes.
* @param path The path to walk.
* @param state The walk state to populate.
*/
function walk(path, state) {
	state ??= {
		file: void 0,
		route: "/",
		specificity: {
			type: 0,
			static_length: 0
		},
		children: []
	};
	const entries = readdirSync(path, { withFileTypes: true });
	if (process.env.NODE_ENV === "test") for (let i = entries.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[entries[i], entries[j]] = [entries[j], entries[i]];
	}
	for (const entry of entries) {
		const entry_path = nodePath.join(entry.parentPath, entry.name);
		if (entry.isFile()) {
			const entrypoint = getEntrypointName(entry.name);
			if (entrypoint === null) continue;
			if (entrypoint.name.length === 0) throw new Error(`File name can not be just +page.<ext>, got ${entry_path}.`);
			const route_defs = parseFilename(entrypoint.name);
			for (const route_def of route_defs) if (route_def.route_part.length === 0 || route_def.route_part === "index") state.file = {
				path: entry_path,
				ext: entrypoint.ext
			};
			else state.children.push({
				route: (state.route === "/" ? "" : state.route) + nodePath.sep + route_def.route_part,
				file: {
					path: entry_path,
					ext: entrypoint.ext
				},
				specificity: route_def.specificity
			});
		} else if (entry.isDirectory()) {
			const route_defs = parseFilename(entry.name);
			if (route_defs.length > 1) throw new Error(`Invalid directory name "${entry.name}" at "${entry_path}".`);
			const route_def = route_defs[0];
			const walk_state_child = {
				file: void 0,
				route: (state.route === "/" ? "" : state.route) + nodePath.sep + route_def.route_part,
				specificity: route_def.specificity,
				children: []
			};
			state.children.push(walk_state_child);
			walk(entry_path, walk_state_child);
		}
	}
	sortRoutes(state);
	return state;
}
/**
* Flattens the state into a list of routes.
* @param state The state to flatten.
*/
function flatState(state, routes_data = []) {
	if (state.file !== void 0) routes_data.push({
		route: state.route,
		file: state.file
	});
	if ("children" in state) for (const child of state.children) flatState(child, routes_data);
	return routes_data;
}
/**
* Sorts the routes in the given result.
* @param result The result to sort.
*/
function sortRoutes(result) {
	result.children.sort((a, b) => {
		if (a.specificity.type !== b.specificity.type) return a.specificity.type - b.specificity.type;
		if (a.specificity.static_length !== b.specificity.static_length) return b.specificity.static_length - a.specificity.static_length;
		return 0;
	});
}
//#endregion
//#region src/build/router.ts
const routes = getRoutes();
//#endregion
//#region src/build/template.ts
const TEMPLATE_PATH = "+template.html";
const TEMPLATE_PATH_ABSOLUTE = nodePath.join(source_path, TEMPLATE_PATH);
/**
* Reads the +template.html file from the source path, if it exists.
* @returns - The contents of the template file, or `undefined` if it does not exist.
*/
async function readTemplate() {
	try {
		await fs.access(TEMPLATE_PATH_ABSOLUTE);
		return fs.readFile(TEMPLATE_PATH_ABSOLUTE, "utf8");
	} catch {
		return null;
	}
}
/**
* Splits +template.html file into parts to place page contents in between.
* @returns -
*/
function splitTemplate(html) {
	const placeholder_head = `<!--${randomUUID()}-->`;
	const placeholder_page = `<!--${randomUUID()}-->`;
	let result = "";
	const rewriter = new HTMLRewriter((chunk) => {
		result += textDecoder.decode(chunk);
	});
	rewriter.on("head", { element(element) {
		element.append(placeholder_head, { html: true });
	} });
	rewriter.on("kit10\\:page", { element(element) {
		element.replace(placeholder_page, { html: true });
	} });
	rewriter.write(textEncoder.encode(html));
	rewriter.end();
	const parts_by_head = result.split(placeholder_head);
	if (parts_by_head.length !== 2) throw new Error(`Internal error: can not split ${TEMPLATE_PATH} by head comment.`);
	const before_head = parts_by_head[0];
	const parts_by_page = parts_by_head[1].split(placeholder_page);
	if (parts_by_page.length !== 2) throw new Error(`${TEMPLATE_PATH} must contain exactly one <kit10:page> tag.`);
	return {
		before_head,
		before_page: parts_by_page[0],
		after_page: parts_by_page[1]
	};
}
/**
* Wraps the HTML content in the template parts.
* @param templateParts - The template parts to wrap the HTML content in.
* @param htmlContent - The HTML content to wrap.
* @returns The wrapped HTML content.
*/
function wrapInTemplate(templateParts, htmlContent) {
	return templateParts.before_head + htmlContent.kit10_head + templateParts.before_page + htmlContent.html + templateParts.after_page;
}
//#endregion
//#region src/build/plugins/virtual-html.ts
const RE_EXTENSION = /\.[^.]+$/u;
const virtualHtmlFiles = /* @__PURE__ */ new Map();
/** Returns the virtual HTML path for a route source file. */
function getRouteHtmlPath(file) {
	if (file.ext === "html") return file.path;
	return file.path.replace(RE_EXTENSION, ".html");
}
/** Returns the dev/build URL for a route HTML file. */
function getRouteHtmlUrl(path) {
	return "/" + nodePath.relative(source_path, path);
}
/** Loads route HTML, preprocessing non-HTML route files into virtual HTML. */
async function loadRouteHtml(file) {
	if (file.ext === "html") return {
		html: await fs.readFile(file.path, "utf8"),
		path: file.path
	};
	const preprocessor = getHtmlPreprocessor(file.path);
	const path = getRouteHtmlPath(file);
	const html = await preprocessor.transform(file.path);
	virtualHtmlFiles.set(getVirtualHtmlKey(path), html);
	return {
		html,
		path
	};
}
/** Preprocesses build routes and rewrites non-HTML routes to their virtual HTML files. */
async function preprocessBuildRoutes(routes) {
	const route_html_results = await Promise.all(routes.map(async (route_data) => {
		if (route_data.file.ext === "html") return null;
		return {
			route_data,
			route_html: await loadRouteHtml(route_data.file)
		};
	}));
	for (const route_html_result of route_html_results) {
		if (route_html_result === null) continue;
		route_html_result.route_data.file.path = route_html_result.route_html.path;
		route_html_result.route_data.file.ext = "html";
	}
}
/** Creates a Vite plugin that serves generated virtual HTML files. */
function virtualHtmlPlugin() {
	return {
		name: "kit10:virtual-html",
		enforce: "pre",
		resolveId(id) {
			if (hasQueryOrHash(id)) return;
			const key = getVirtualHtmlKey(id);
			if (virtualHtmlFiles.has(key)) return key;
		},
		load(id) {
			if (hasQueryOrHash(id)) return;
			return virtualHtmlFiles.get(getVirtualHtmlKey(id));
		}
	};
}
/** Returns the single HTML preprocessor matching a source file. */
function getHtmlPreprocessor(path) {
	const preprocessors = kit10HtmlPreprocessors.filter((preprocessor) => path.match(preprocessor.filter) !== null);
	if (preprocessors.length === 0) throw new Error(`No Kit10 HTML preprocessor matched "${path}". Add a plugin that can transform ".${nodePath.extname(path).slice(1)}" pages to HTML.`);
	if (preprocessors.length > 1) throw new Error(`Multiple Kit10 HTML preprocessors matched "${path}". Make plugin filters mutually exclusive.`);
	return preprocessors[0];
}
/** Returns a stable key for virtual HTML file lookups. */
function getVirtualHtmlKey(path) {
	return nodePath.resolve(path);
}
/** Returns whether an id contains Vite query/hash metadata. */
function hasQueryOrHash(path) {
	return /[?#]/u.test(path);
}
//#endregion
//#region src/build/plugins/template.ts
/**
* Returns a set of all routed paths.
*/
function getRoutedPaths(routes_) {
	return new Set(routes_.map((route_data) => nodePath.resolve(getRouteHtmlPath(route_data.file))));
}
/** Creates a Vite plugin that wraps route HTML fragments with +template.html. */
function templatePlugin() {
	let routed_paths = getRoutedPaths(routes);
	let templateParts = null;
	return {
		name: "kit10:template",
		enforce: "pre",
		transformIndexHtml: {
			order: "pre",
			async handler(html, context) {
				if (!is_prod) routed_paths = getRoutedPaths(getRoutes());
				if (!routed_paths.has(context.filename)) return;
				const htmlContent = await rewriteHtml(context.filename, html);
				html = htmlContent.html;
				if (htmlContent.is_full_page) return html;
				if (!templateParts || !is_prod) {
					let template_html = await readTemplate();
					if (template_html === null) throw new Error(`Requested template, but ${TEMPLATE_PATH_ABSOLUTE} not found.`);
					template_html = (await rewriteHtml(TEMPLATE_PATH_ABSOLUTE, template_html)).html;
					templateParts = splitTemplate(template_html);
				}
				return wrapInTemplate(templateParts, htmlContent);
			}
		}
	};
}
//#endregion
export { output_static_path as _, virtualHtmlPlugin as a, cssInlinePlugin as c, isAbsoluteOrSpecialPath as d, textDecoder as f, output_path as g, config as h, preprocessBuildRoutes as i, inlineDevStyles as l, configPlugin as m, getRouteHtmlUrl as n, routes as o, textEncoder as p, loadRouteHtml as r, getRoutes as s, templatePlugin as t, rewriteHtml as u, source_path as v, vitePlugins as y };
