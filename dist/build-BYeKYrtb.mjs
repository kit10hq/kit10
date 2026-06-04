import { a as source_path, i as output_static_path, n as is_prod, r as output_path, t as config } from "./options-C9TSuTfd.mjs";
import nodePath from "node:path";
import fs from "node:fs/promises";
import { customAlphabet } from "nanoid";
import * as esbuild from "esbuild";
import { promisify } from "node:util";
import zlib from "node:zlib";
import { HTMLRewriter } from "html-rewriter-wasm";
import { minify } from "@minify-html/node";
import { readdirSync } from "node:fs";
//#region src/utils.ts
const createId = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", 16);
customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 16);
//#endregion
//#region src/build/plugins.ts
/** Applies the plugins from the config. */
async function applyPlugins(artifacts, plugins) {
	if (!plugins) return;
	const artifacts_set = artifacts instanceof Set ? artifacts : new Set(artifacts);
	for (const plugin of plugins) {
		const promises = [];
		for (const artifact of artifacts_set) if (plugin.filter === "*" || plugin.filter.test(artifact.path)) {
			const result = plugin.transform(artifact, {
				source_path,
				is_prod
			});
			if (result instanceof Promise) promises.push(result);
		}
		if (promises.length > 0) await Promise.all(promises);
		if (plugin.end) {
			const result = plugin.end();
			if (result instanceof Promise) await result;
		}
	}
}
//#endregion
//#region src/build/artifact.ts
const all = /* @__PURE__ */ new Map();
const collections = {
	pre_html: /* @__PURE__ */ new Set(),
	html: /* @__PURE__ */ new Set(),
	bundler: /* @__PURE__ */ new Set()
};
const dependencies = /* @__PURE__ */ new Map();
const dependents = /* @__PURE__ */ new Map();
/**
* Links parent artifact to child artifact in dependencies map.
* @param parent Key artifact.
* @param child Value artifact.
*/
function link(parent, child) {
	if (!dependencies.has(parent)) dependencies.set(parent, /* @__PURE__ */ new Set());
	dependencies.get(parent).add(child);
	if (!dependents.has(child)) dependents.set(child, /* @__PURE__ */ new Set());
	dependents.get(child).add(parent);
}
const directories = /* @__PURE__ */ new Set();
const mkdir_promises = [];
const textEncoder$1 = new TextEncoder();
const textDecoder$1 = new TextDecoder();
const SYMBOL = Symbol("Artifact");
var Artifact = class Artifact {
	id = createId();
	#path;
	#content = null;
	meta = {};
	constructor(symbol, arg0, options) {
		if (symbol !== SYMBOL) throw new Error("Artifact constructor is private, use createArtifact() instead.");
		if (typeof arg0 === "string") {
			let path = arg0;
			if (path.startsWith("/") || path.startsWith(".")) {
				path = nodePath.relative(source_path, path);
				if (path.startsWith(".")) throw new Error(`Invalid path for artifact: "${path}".`);
			}
			this.#path = path;
		} else {
			link(arg0, this);
			if (options.keep_name) this.#path = arg0.path + "." + options.ext;
			else {
				this.#path = arg0.path.includes(nodePath.sep) ? nodePath.dirname(arg0.path) + "/" : "";
				this.#path += `${this.id}.${options.ext}`;
			}
		}
		all.set(this.#path, this);
		const dir = nodePath.dirname(nodePath.join(output_static_path, this.#path));
		if (!directories.has(dir)) {
			directories.add(dir);
			mkdir_promises.push(fs.mkdir(dir, { recursive: true }));
		}
	}
	get path() {
		return this.#path;
	}
	get absolute_path() {
		return nodePath.join(source_path, this.#path);
	}
	get is_page() {
		return this.#path.match(/\+page\.[^.]+$/u) !== null;
	}
	get ext() {
		return this.#path.split(".").pop() ?? "";
	}
	/** Updates the file extension. */
	updateExt(ext) {
		all.delete(this.#path);
		this.#path = this.#path.replace(/\.[^.]+$/u, `.${ext}`);
		all.set(this.#path, this);
	}
	get is_loaded() {
		return this.#content !== null;
	}
	/** Loads the file content from the source. */
	async load() {
		if (typeof this.#content === "string") throw new Error(`Artifact "${this.path}" already has content, but source was requested. This can lead to incorrect behavior.`);
		this.#content = await fs.readFile(nodePath.join(source_path, this.path), "utf8");
	}
	/** Returns content type. */
	get type() {
		if (this.#content instanceof Uint8Array) return "binary";
		if (typeof this.#content === "string") return "text";
		return "unknown";
	}
	/** Returns the file content as a string. */
	text() {
		if (typeof this.#content === "string") return this.#content;
		if (this.#content instanceof Uint8Array) return textDecoder$1.decode(this.#content);
		throw new Error(`Artifact "${this.path}" not loaded.`);
	}
	/** Returns the file content as a buffer. */
	buffer() {
		if (this.#content instanceof Uint8Array) return this.#content;
		if (typeof this.#content === "string") return textEncoder$1.encode(this.#content);
		throw new Error(`Artifact "${this.path}" not loaded.`);
	}
	/** Updates temporary file content. */
	update(content) {
		this.#content = content;
	}
	/** Appends content to the temporary file. */
	append(content) {
		if (typeof this.#content !== "string") throw new TypeError(`Cannot append to artifact "${this.path}" with buffer content inside.`);
		this.#content = (this.#content ?? "") + content;
	}
	/** Links this artifact to another artifact. */
	link(artifact) {
		link(this, artifact);
	}
	/** Deletes the temporary file. */
	delete() {
		this.#content = null;
		const artifact_dependents = dependents.get(this);
		if (artifact_dependents) for (const artifact of artifact_dependents) dependencies.get(artifact)?.delete(this);
		const artifact_dependencies = dependencies.get(this);
		if (artifact_dependencies) for (const artifact of artifact_dependencies) artifact.delete();
		dependents.delete(this);
		dependencies.delete(this);
		all.delete(this.path);
	}
	/** Creates dependency artifact. */
	create(content, options) {
		const artifact = new Artifact(SYMBOL, this, options);
		artifact.update(content);
		return artifact;
	}
	/** Processes the artifact. */
	async process() {
		await applyPlugins([this], config.plugins);
	}
};
/**
* Returns whether the given path has a temporary content.
* @param path - The path to check.
*/
function isArtifactAt(path) {
	return typeof all.get(path)?.text() === "string";
}
/**
* Creates or retrieves an Artifact for the given path.
* @param path - The path of the artifact.
* @returns -
*/
function create(path) {
	let artifact = all.get(path);
	if (artifact === void 0) artifact = new Artifact(SYMBOL, path);
	return artifact;
}
/** Logs artifacts. */
function print() {
	console.log(`${all.size} artifacts:`);
	const info = [];
	for (const artifact of all.values()) {
		if (artifact.meta.noout === true) continue;
		info.push({
			filename: artifact.path,
			size: String(artifact.type === "text" ? artifact.text().length : artifact.type === "binary" ? artifact.buffer().length : "?").padStart(6)
		});
	}
	console.table(info.toSorted((a, b) => a.filename.localeCompare(b.filename)));
}
/** Writes all temporary files to disk. */
async function flush() {
	await Promise.all(mkdir_promises);
	const promises = [];
	for (const artifact of all.values()) {
		if (artifact.meta.noout === true) continue;
		const output_file_path = nodePath.join(output_static_path, artifact.path);
		let promise;
		if (artifact.is_loaded) promise = fs.writeFile(output_file_path, artifact.buffer());
		else {
			const source_file_path = nodePath.join(source_path, artifact.path);
			promise = fs.cp(source_file_path, output_file_path);
		}
		promises.push(promise);
	}
	await Promise.all(promises);
}
//#endregion
//#region src/build/bundler.ts
const SENTINEL_PATH = `${createId()}.js`;
const esbuildPlugin = {
	name: "kit10",
	setup(build) {
		build.onResolve({ filter: /.*/ }, (args) => {
			if (args.path === SENTINEL_PATH || isArtifactAt(args.path)) return {
				path: args.path,
				namespace: "artifact"
			};
		});
		build.onLoad({
			filter: /.*/,
			namespace: "artifact"
		}, (args) => {
			return {
				contents: args.path === SENTINEL_PATH ? "export default null;" : create(args.path).text(),
				loader: "ts",
				resolveDir: nodePath.dirname(args.path)
			};
		});
		const known_exts = new Set([
			"js",
			"mjs",
			"cjs",
			"ts",
			"mts",
			"cts",
			"json"
		]);
		const tempArtifacts = /* @__PURE__ */ new Set();
		build.onLoad({ filter: /.*/ }, async (args) => {
			const ext = args.path.slice(args.path.lastIndexOf("."));
			if (!known_exts.has(ext) && args.path.startsWith(source_path)) {
				const artifact = create(args.path);
				if (args.namespace !== "artifact") tempArtifacts.add(artifact);
				if (!artifact.is_loaded) await artifact.load();
				await applyPlugins([artifact], config.plugins);
				if (!known_exts.has(artifact.ext)) {
					console.error(`No plugins given for compiling ".${artifact.ext}" files to bundle JavaScript/TypeScript (found "${args.path}").`);
					process.exit(1);
				}
				return {
					contents: artifact.text(),
					loader: "ts",
					resolveDir: nodePath.dirname(args.path)
				};
			}
		});
		build.onEnd(() => {
			for (const artifact of tempArtifacts) artifact.delete();
		});
	}
};
/** Runs JS/TS bundling */
async function bundle() {
	const paths = [];
	for (const artifact of collections.bundler) paths.push(artifact.path);
	const result = await esbuild.build({
		absWorkingDir: source_path,
		plugins: [esbuildPlugin],
		entryPoints: [SENTINEL_PATH, ...paths],
		outdir: "/",
		bundle: true,
		chunkNames: "js/chunks/[hash]",
		format: "esm",
		minify: is_prod,
		splitting: true,
		write: false
	});
	if (result.errors.length > 0) {
		console.error("esbuild errors:");
		for (const error of result.errors) console.error(error.text);
		process.exit(1);
	}
	for (const output of result.outputFiles) {
		const static_path = output.path.slice(1);
		if (static_path !== SENTINEL_PATH) {
			const artifact = create(static_path);
			artifact.update(output.text);
			collections.bundler.add(artifact);
		}
	}
}
//#endregion
//#region src/build/plugins/gzip.ts
const gzip = promisify(zlib.gzip);
const gzipPlugin = {
	filter: /\.(?:css|html|js|json|svg)$/u,
	async transform(artifact, options) {
		if (options.is_prod) {
			const buffer = artifact.buffer();
			const buffer_compressed = await gzip(buffer, { level: 9 });
			if (buffer_compressed.length < buffer.length) artifact.create(buffer_compressed, {
				ext: "gz",
				keep_name: true
			});
		}
	}
};
//#endregion
//#region src/build/plugins/html/imports.ts
const HEAD_PLACEHOLDER = `<!--${createId()}-->`;
const PAGE_PLACEHOLDER = `<!--${createId()}-->`;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const html_inline_threshold = config.build?.html_inline_threshold ?? 2e3;
let template_html_start;
let template_html_end;
const htmlScanImportsPlugin = {
	filter: "*",
	async transform(artifact) {
		const scriptSrcArtifact = artifact.create("", { ext: "js" });
		scriptSrcArtifact.meta.html_type = "head";
		let result = "";
		const rewriter = new HTMLRewriter((chunk) => {
			result += textDecoder.decode(chunk);
		});
		const promises = [];
		let tag_content = "";
		rewriter.on("*", {
			element() {
				tag_content = "";
			},
			text(node) {
				if (node.text) tag_content += node.text;
			}
		});
		rewriter.on("kit10\\:page", { element(element) {
			element.replace(PAGE_PLACEHOLDER, { html: true });
		} });
		rewriter.on("script", { element(element) {
			if (element.getAttribute("type") === "module") {
				const attr_src = element.getAttribute("src");
				if (attr_src === null) {
					const scriptArtifact = artifact.create("", { ext: "js" });
					scriptArtifact.meta.html_type = "script";
					collections.bundler.add(scriptArtifact);
					element.replace(`<!--${scriptArtifact.id}-->`, { html: true });
					element.onEndTag(() => {
						scriptArtifact.update(tag_content);
					});
				} else {
					scriptSrcArtifact.append(`import '${attr_src}';\n`);
					element.remove();
				}
			} else throw new Error("Only script with type=\"module\" is supported for now.");
		} });
		rewriter.on("style", { element(element) {
			const styleArtifact = artifact.create("", { ext: "css" });
			styleArtifact.meta.html_type = "style";
			element.setInnerContent(`/* ${styleArtifact.id} */`);
			element.onEndTag(() => {
				styleArtifact.update(tag_content);
				promises.push(styleArtifact.process());
			});
		} });
		rewriter.on("link", { element(element) {
			if (element.getAttribute("rel") === "stylesheet" || element.getAttribute("rel") === "preload" && element.getAttribute("as") === "style") {
				const path = element.getAttribute("href");
				if (path !== null) {
					const linkArtifact = create(nodePath.join(nodePath.dirname(artifact.path), path));
					linkArtifact.meta.html_type = "link";
					artifact.link(linkArtifact);
					promises.push(linkArtifact.load().then(() => linkArtifact.process()));
					element.setAttribute("href", linkArtifact.id);
				}
			}
		} });
		rewriter.on("head", { element(element) {
			console.log("head element", artifact.path);
			element.append(HEAD_PLACEHOLDER, { html: true });
		} });
		rewriter.write(textEncoder.encode(artifact.text()));
		rewriter.end();
		if (scriptSrcArtifact.text().length > 0) collections.bundler.add(scriptSrcArtifact);
		else scriptSrcArtifact.delete();
		artifact.update((template_html_start ?? "") + result + (template_html_end ?? ""));
		if (artifact.is_page) for (const artifactDependency of dependencies.get(templateArtifact) ?? []) artifact.link(artifactDependency);
		await Promise.all(promises);
	}
};
const htmlWriteImportsPlugin = {
	filter: "*",
	transform(artifact) {
		let content = artifact.text();
		let head_content = "";
		for (const artifactDependency of dependencies.get(artifact) ?? []) switch (artifactDependency.meta.html_type) {
			case "head": {
				const script_content = artifactDependency.text();
				let html;
				if (script_content.length > html_inline_threshold) html = `<script type="module" src="/${artifactDependency.path}"><\/script>`;
				else {
					html = `<script type="module">\n${script_content}<\/script>`;
					artifactDependency.delete();
				}
				head_content += html + "\n";
				break;
			}
			case "script": {
				const script_content = artifactDependency.text();
				let html;
				if (script_content.length > html_inline_threshold) html = `<script type="module" src="/${artifactDependency.path}"><\/script>`;
				else {
					html = `<script type="module">\n${script_content}<\/script>`;
					artifactDependency.delete();
				}
				content = content.replaceAll(`<!--${artifactDependency.id}-->`, html);
				break;
			}
			case "style":
				content = content.replaceAll(`/* ${artifactDependency.id} */`, artifactDependency.text());
				artifactDependency.delete();
				break;
			case "link":
				content = content.replaceAll(artifactDependency.id, "/" + artifactDependency.path);
				break;
		}
		content = content.replaceAll(HEAD_PLACEHOLDER, head_content);
		artifact.update(content);
	}
};
const templateArtifact = create("+template.html");
templateArtifact.meta.noout = true;
await templateArtifact.load();
await applyPlugins([templateArtifact], [htmlScanImportsPlugin]);
[template_html_start, template_html_end] = templateArtifact.text().split(PAGE_PLACEHOLDER);
//#endregion
//#region src/build/plugins/html/minify.ts
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
const minifyHtmlPlugin = {
	filter: "*",
	transform(artifact, options) {
		if (options.is_prod) {
			const html = artifact.text();
			const html_minified = minify(Buffer.from(html), MINIFY_HTML_OPTIONS).toString("utf8");
			artifact.update(html_minified);
		}
	}
};
//#endregion
//#region src/env.ts
const kit10_template_path = nodePath.join(import.meta.dirname, "..", "template", "hono");
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
* @param path The path to read files from.
* @returns The routes for the given path.
*/
function getRoutes(path) {
	return flatState(walk(path));
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
/** A map of routes to their corresponding Artifact instances. */
const app_routes = /* @__PURE__ */ new Map();
/**
* Returns a list of TempFile instances for the app entrypoints.
* @returns -
*/
async function parseEntrypoints() {
	const routes_data = getRoutes(source_path);
	const promises = [];
	for (const route_data of routes_data) {
		const artifact = create(nodePath.relative(source_path, route_data.file.path));
		if (artifact.ext === "html") collections.html.add(artifact);
		else collections.pre_html.add(artifact);
		app_routes.set(route_data.route, artifact);
		promises.push(artifact.load());
	}
	await Promise.all(promises);
}
/** Writes router files to the output directory. */
async function flushRouter() {
	await fs.cp(kit10_template_path, output_path, { recursive: true });
	{
		const app_routes_js = [];
		for (const [route, artifact] of app_routes.entries()) app_routes_js.push(`app.get('${route}', serveFile('/${artifact.path}'));`);
		const PATH_MAIN = nodePath.join(output_path, "main.js");
		let contents = await fs.readFile(PATH_MAIN, "utf8");
		contents = contents.replace("// MARK: app", app_routes_js.join("\n")).replace("port: 0,", `port: ${config.server?.port ?? 3e3},`);
		await fs.writeFile(PATH_MAIN, contents, "utf8");
	}
}
//#endregion
//#region src/build.ts
const start = process.hrtime.bigint();
await parseEntrypoints();
await applyPlugins(collections.pre_html, config.plugins);
for (const artifact of collections.pre_html) {
	if (artifact.ext !== "html") {
		console.error(`No plugin found for ".${artifact.ext}" pages (for "${artifact.path}").`);
		process.exit(1);
	}
	collections.html.add(artifact);
}
collections.pre_html.clear();
await applyPlugins(collections.html.values(), [htmlScanImportsPlugin]);
await bundle();
await applyPlugins(collections.bundler.values(), config.plugins);
await applyPlugins(collections.html.values(), [htmlWriteImportsPlugin, minifyHtmlPlugin]);
await applyPlugins(all.values(), [gzipPlugin]);
print();
await flushRouter();
await flush();
/**
* Format nanoseconds as a human-readable string.
* @param nanoseconds - The number of nanoseconds to format.
* @returns The formatted string.
*/
function formatNanoseconds(nanoseconds) {
	for (const { unit, factor } of [
		{
			unit: "s",
			factor: 1e9
		},
		{
			unit: "ms",
			factor: 1e6
		},
		{
			unit: "µs",
			factor: 1e3
		},
		{
			unit: "ns",
			factor: 1
		}
	]) {
		const value = nanoseconds / factor;
		if (value >= 1 || unit === "ns") {
			const strValue = value.toPrecision(3);
			return `${Number.parseFloat(strValue)} ${unit}`;
		}
	}
	return "0 ns";
}
console.log(`Complete in ${formatNanoseconds(Number(process.hrtime.bigint() - start))}.`);
//#endregion
export {};
