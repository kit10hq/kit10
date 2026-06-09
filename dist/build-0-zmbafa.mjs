import { _ as vitePlugins, a as virtualHtmlPlugin, d as textEncoder, f as configPlugin, g as source_path, h as output_static_path, i as preprocessBuildRoutes, l as isAbsoluteOrSpecialPath, m as output_path, o as routes, p as config, t as templatePlugin, u as textDecoder } from "./template-Bzai6c8v.mjs";
import fs from "node:fs/promises";
import nodePath from "node:path";
import { build } from "vite";
import { promisify } from "node:util";
import zlib from "node:zlib";
import minifyHtml from "@minify-html/node";
import { HTMLRewriter } from "html-rewriter-wasm";
//#region src/build/plugins/gzip.ts
const gzip = promisify(zlib.gzip);
const filter = /\.(?:html|xml|css|json|js|mjs|svg)$/iu;
/** Creates a Vite plugin that compresses output files. */
function gzipPlugin() {
	return {
		name: "kit10:gzip-static",
		apply: "build",
		enforce: "post",
		async writeBundle() {
			const promises = [];
			for await (const path of walk(output_static_path)) {
				if (!filter.test(path) || path.endsWith(".gz")) continue;
				const buffer = await fs.readFile(path);
				if (buffer.length > 1e3) {
					const compressed = await gzip(buffer, { level: 9 });
					if (compressed.length < buffer.length) promises.push(fs.writeFile(`${path}.gz`, compressed));
				}
			}
			await Promise.all(promises);
		}
	};
}
/**
* Walks through a directory and yields the paths of all files.
* @param dir The directory to walk through.
*/
async function* walk(dir) {
	for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
		const path = nodePath.join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(path);
		else if (entry.isFile()) yield path;
	}
}
//#endregion
//#region src/build/plugins/html-minify.ts
const MINIFY_HTML_OPTIONS = {
	allow_noncompliant_unquoted_attribute_values: false,
	allow_optimal_entities: false,
	allow_removing_spaces_between_attributes: false,
	keep_closing_tags: false,
	keep_comments: false,
	keep_html_and_head_opening_tags: true,
	keep_input_type_text_attr: true,
	keep_ssi_comments: false,
	minify_css: false,
	minify_doctype: false,
	minify_js: false,
	preserve_brace_template_syntax: false,
	preserve_chevron_percent_template_syntax: false,
	remove_bangs: true,
	remove_processing_instructions: true
};
/**
* A Vite plugin that minifies HTML.
* @param options - The minification options to pass to `@minify-html/node`.
*/
function htmlMinifyPlugin(options = MINIFY_HTML_OPTIONS) {
	return {
		name: "kit10:html-minify",
		transformIndexHtml: {
			order: "post",
			handler(html) {
				return minifyHtml.minify(Buffer.from(html), options).toString("utf8");
			}
		}
	};
}
//#endregion
//#region src/build/plugins/js-inline.ts
const RE_HTML = /\.html$/iu;
const RE_IMPORT_META = /\bimport\.meta\b/u;
const RE_RELATIVE_SPECIFIER = /^\.{1,2}\//u;
const RE_DYNAMIC_IMPORT = /\bimport\s*\(\s*(?<quote>["'])(?<specifier>\.{1,2}\/[^"']+)\k<quote>\s*\)/gu;
const RE_FROM_SPECIFIER = /\bfrom\s*(?<quote>["'])(?<specifier>\.{1,2}\/[^"']+)\k<quote>/gu;
const RE_SIDE_EFFECT_IMPORT = /\bimport\s*(?<quote>["'])(?<specifier>\.{1,2}\/[^"']+)\k<quote>/gu;
/** Creates a Vite plugin that inlines single-owner JavaScript assets into HTML. */
function jsInlinePlugin() {
	return {
		name: "kit10:js-inline",
		apply: "build",
		enforce: "post",
		generateBundle(_options, bundle_raw) {
			const threshold = config.build?.jsInlineTreshold ?? 3e3;
			if (threshold <= 0) return;
			const bundle = bundle_raw;
			const html_assets = getHtmlAssets(bundle);
			const candidates = getInlineCandidates(bundle, getHtmlImporters(bundle, html_assets), getJsImporters(bundle), threshold);
			if (candidates.size === 0) return;
			rewriteHtmlAssets(bundle, html_assets, candidates);
			for (const file_name of candidates.keys()) Reflect.deleteProperty(bundle, file_name);
		}
	};
}
/** Returns emitted HTML assets. */
function getHtmlAssets(bundle) {
	return Object.values(bundle).filter((item) => item.type === "asset" && RE_HTML.test(item.fileName));
}
/** Returns which HTML files import each JavaScript asset directly. */
function getHtmlImporters(bundle, html_assets) {
	const importers = /* @__PURE__ */ new Map();
	for (const html_asset of html_assets) for (const file_name of getHtmlModuleScripts(html_asset)) {
		if (!isChunk(bundle[file_name])) continue;
		if (!importers.has(file_name)) importers.set(file_name, /* @__PURE__ */ new Set());
		importers.get(file_name).add(html_asset.fileName);
	}
	return importers;
}
/** Returns module script asset file names imported by an HTML asset. */
function getHtmlModuleScripts(html_asset) {
	const file_names = /* @__PURE__ */ new Set();
	let ignored_output = "";
	const rewriter = new HTMLRewriter((chunk) => {
		ignored_output += textDecoder.decode(chunk);
	});
	rewriter.on("script", { element(element) {
		if (element.getAttribute("type") !== "module") return;
		const src = element.getAttribute("src");
		if (!src) return;
		const file_name = resolveHtmlUrl(html_asset.fileName, src);
		if (file_name) file_names.add(file_name);
	} });
	rewriter.write(textEncoder.encode(assetToString(html_asset)));
	rewriter.end();
	ignored_output = "";
	return file_names;
}
/** Returns which JavaScript chunks import each JavaScript chunk. */
function getJsImporters(bundle) {
	const importers = /* @__PURE__ */ new Map();
	for (const item of Object.values(bundle)) {
		if (!isChunk(item)) continue;
		for (const file_name of [...item.imports, ...item.dynamicImports]) {
			if (!importers.has(file_name)) importers.set(file_name, /* @__PURE__ */ new Set());
			importers.get(file_name).add(item.fileName);
		}
	}
	return importers;
}
/** Returns all JavaScript assets that can be inlined into their sole HTML owner. */
function getInlineCandidates(bundle, html_importers, js_importers, threshold) {
	const candidates = /* @__PURE__ */ new Map();
	for (const [file_name, html_owners] of html_importers) {
		if (html_owners.size !== 1 || (js_importers.get(file_name)?.size ?? 0) > 0) continue;
		const item = bundle[file_name];
		if (!isChunk(item)) continue;
		if (RE_IMPORT_META.test(item.code) || textEncoder.encode(item.code).length > threshold) continue;
		candidates.set(file_name, item);
	}
	return candidates;
}
/** Rewrites HTML assets, inlining candidate JavaScript chunks. */
function rewriteHtmlAssets(bundle, html_assets, candidates) {
	for (const html_asset of html_assets) {
		let result = "";
		const rewriter = new HTMLRewriter((chunk) => {
			result += textDecoder.decode(chunk);
		});
		rewriter.on("script", { element(element) {
			const type = element.getAttribute("type");
			const src = element.getAttribute("src");
			if (type !== "module" || !src) return;
			const file_name = resolveHtmlUrl(html_asset.fileName, src);
			const chunk = file_name ? candidates.get(file_name) : void 0;
			if (!file_name || !chunk) return;
			element.replace(createInlineScriptHtml(element.attributes, chunk), { html: true });
		} });
		rewriter.on("link", { element(element) {
			const rel = element.getAttribute("rel");
			const href = element.getAttribute("href");
			if (!rel || !href || !hasRel(rel, "modulepreload")) return;
			const file_name = resolveHtmlUrl(html_asset.fileName, href);
			if (file_name && candidates.has(file_name)) element.remove();
		} });
		rewriter.write(textEncoder.encode(assetToString(html_asset)));
		rewriter.end();
		html_asset.source = result;
	}
}
/** Creates inline script HTML from a JavaScript chunk. */
function createInlineScriptHtml(attributes, chunk) {
	let html = "<script";
	for (const [name, value] of attributes) {
		if (name === "src" || name === "crossorigin" || name === "integrity") continue;
		html += ` ${name}="${escapeAttribute(value)}"`;
	}
	const code = escapeScriptContent(rewriteRelativeImports(chunk.code, chunk.fileName));
	return `${html}>${code}<\/script>`;
}
/** Rewrites relative JavaScript import specifiers to root-absolute URLs. */
function rewriteRelativeImports(code, file_name) {
	return code.replace(RE_DYNAMIC_IMPORT, (...args) => replaceImportSpecifier(args, file_name)).replace(RE_FROM_SPECIFIER, (...args) => replaceImportSpecifier(args, file_name)).replace(RE_SIDE_EFFECT_IMPORT, (...args) => replaceImportSpecifier(args, file_name));
}
/** Replaces a regex-matched import specifier. */
function replaceImportSpecifier(args, file_name) {
	const match = args.at(-1);
	if (!isGroupsMatch(match)) return String(args[0]);
	const { quote, specifier } = match;
	const rewritten_specifier = toRootAbsoluteSpecifier(file_name, specifier);
	return String(args[0]).replace(`${quote}${specifier}${quote}`, `${quote}${rewritten_specifier}${quote}`);
}
/** Converts a chunk-relative import specifier to a root-absolute URL. */
function toRootAbsoluteSpecifier(file_name, specifier) {
	if (!RE_RELATIVE_SPECIFIER.test(specifier)) return specifier;
	return "/" + nodePath.posix.normalize(nodePath.posix.join(nodePath.posix.dirname(file_name), specifier));
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
/** Returns whether an emitted item is a JavaScript chunk. */
function isChunk(item) {
	return item?.type === "chunk";
}
/** Returns whether an HTML rel attribute contains a token. */
function hasRel(rel, token) {
	return rel.split(/\s+/u).some((rel_token) => rel_token.toLowerCase() === token);
}
/** Returns a safe value for an HTML attribute. */
function escapeAttribute(value) {
	return value.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
/** Escapes JavaScript text for embedding in a script tag. */
function escapeScriptContent(value) {
	return value.replaceAll("<\/script", "<\\/script").replaceAll("<!--", "<\\!--");
}
/** Returns whether a regex replacement match contains named groups. */
function isGroupsMatch(value) {
	return typeof value === "object" && value !== null && "quote" in value && "specifier" in value && typeof value.quote === "string" && typeof value.specifier === "string";
}
//#endregion
//#region src/build/server.ts
/** Configures the production server. */
async function makeServer() {
	const app_routes_js = [];
	for (const route_data of routes) app_routes_js.push(`app.get('${route_data.route}', serveFile('${route_data.file.path.replace(source_path, "")}'));`);
	const PATH_MAIN = nodePath.join(output_path, "main.js");
	let contents = await fs.readFile(PATH_MAIN, "utf8");
	contents = contents.replace("// MARK: app", app_routes_js.join("\n")).replace("port: 0,", `port: ${config.server?.port ?? 3e3},`);
	await fs.writeFile(PATH_MAIN, contents, "utf8");
}
//#endregion
//#region src/build/target/build.ts
await fs.rm(output_path, {
	recursive: true,
	force: true
});
await fs.cp(nodePath.join(import.meta.dirname, "..", "template", "hono"), output_path, { recursive: true });
await preprocessBuildRoutes(routes);
const input = {};
for (const route_data of routes) {
	const name = nodePath.relative(source_path, route_data.file.path).replace(/\+page\.[a-z\d]+/u, "").replaceAll("/", "_").replaceAll("[", "(").replaceAll("]", ")");
	input[name] = route_data.file.path;
}
await build({
	root: source_path,
	configFile: false,
	appType: "custom",
	plugins: [
		configPlugin(),
		virtualHtmlPlugin(),
		templatePlugin(),
		...vitePlugins,
		jsInlinePlugin(),
		htmlMinifyPlugin(),
		gzipPlugin()
	],
	build: {
		outDir: output_static_path,
		emptyOutDir: true,
		manifest: true,
		rolldownOptions: {
			input,
			output: {
				assetFileNames: "assets/[name]-[hash][extname]",
				chunkFileNames: "assets/chunks/[name]-[hash].js",
				entryFileNames: "assets/[name]-[hash].js"
			}
		}
	}
});
await makeServer();
//#endregion
export {};
