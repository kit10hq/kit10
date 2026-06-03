import { a as source_path, i as output_static_path, n as is_prod, r as output_path, t as config } from "./options-Hr4G0kDO.mjs";
import nodePath from "node:path";
import fs from "node:fs/promises";
import { customAlphabet } from "nanoid";
import { HTMLRewriter } from "html-rewriter-wasm";
import { readdirSync } from "node:fs";
//#region src/utils.ts
const createId = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", 16);
customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 16);
//#endregion
//#region src/build/artifact.ts
const artifacts = /* @__PURE__ */ new Map();
const artifacts_dependencies = /* @__PURE__ */ new WeakSet();
const artifact_collections = {
	pre_html: /* @__PURE__ */ new Set(),
	html: /* @__PURE__ */ new Set()
};
const directories = /* @__PURE__ */ new Set();
const mkdir_promises = [];
const SYMBOL = Symbol("Artifact");
var Artifact = class Artifact {
	id = createId();
	#path;
	#content = null;
	#parentArtifact;
	dependencies = /* @__PURE__ */ new Set();
	meta = {};
	constructor(symbol, arg0, ext) {
		if (symbol !== SYMBOL) throw new Error("Artifact constructor is private, use createArtifact() instead.");
		if (typeof arg0 === "string") {
			let path = arg0;
			if (path.startsWith("/") || path.startsWith(".")) {
				path = nodePath.relative(source_path, path);
				if (path.startsWith(".")) throw new Error(`Invalid path for artifact: "${path}".`);
			}
			this.#path = path;
		} else {
			this.#parentArtifact = arg0;
			this.#parentArtifact.dependencies.add(this);
			this.#path = `${arg0.path.includes("/") ? arg0.path.slice(0, arg0.path.lastIndexOf("/") + 1) : ""}${this.id}.${ext}`;
			artifacts_dependencies.add(this);
		}
		artifacts.set(this.#path, this);
		const dir = nodePath.dirname(nodePath.join(output_static_path, this.#path));
		if (!directories.has(dir)) {
			directories.add(dir);
			mkdir_promises.push(fs.mkdir(dir, { recursive: true }));
		}
	}
	get path() {
		return this.#path;
	}
	get is_page() {
		return this.#path.match(/\+page\.[^.]+$/u) !== null;
	}
	get ext() {
		return this.#path.split(".").pop() ?? "";
	}
	/** Updates the file extension. */
	updateExt(ext) {
		artifacts.delete(this.#path);
		this.#path = this.#path.replace(/\.[^.]+$/u, `.${ext}`);
		artifacts.set(this.#path, this);
	}
	get is_loaded() {
		return this.#content !== null;
	}
	/** Loads the file content from the source. */
	async load() {
		if (typeof this.#content === "string") throw new Error(`Artifact "${this.path}" already has content, but source was requested. This can lead to incorrect behavior.`);
		this.#content = await fs.readFile(nodePath.join(source_path, this.path), "utf8");
	}
	/** Returns the file content. */
	text() {
		if (this.#content === void 0 || this.#content === null) throw new Error(`Artifact "${this.path}" not loaded.`);
		return this.#content;
	}
	/** Updates temporary file content. */
	update(content) {
		this.#content = content;
	}
	/** Appends content to the temporary file. */
	append(content) {
		this.#content = (this.#content ?? "") + content;
	}
	/** Deletes the temporary file. */
	delete() {
		this.#content = null;
		artifacts.delete(this.path);
		if (this.#parentArtifact !== void 0) this.#parentArtifact.dependencies.delete(this);
	}
	/** Creates dependency artifact. */
	create(ext, content) {
		const artifact = new Artifact(SYMBOL, this, ext);
		artifact.update(content);
		return artifact;
	}
	/** Makes artifact independent. */
	detach() {
		if (this.#parentArtifact !== void 0) {
			this.#parentArtifact.dependencies.delete(this);
			artifacts_dependencies.delete(this);
		}
	}
};
/**
* Returns whether the given path has a temporary content.
* @param path - The path to check.
*/
function isArtifactAt(path) {
	return typeof artifacts.get(path)?.text() === "string";
}
/**
* Creates or retrieves an Artifact for the given path.
* @param path - The path of the artifact.
* @returns -
*/
function createArtifact(path) {
	let artifact = artifacts.get(path);
	if (artifact === void 0) artifact = new Artifact(SYMBOL, path);
	return artifact;
}
/** Logs artifacts. */
function logArtifacts() {
	console.log([...artifacts.keys()]);
	console.log("artifacts", new Map([...artifacts.values()].map((artifact) => [artifact.path, artifact.text()])));
}
/** Writes all temporary files to disk. */
async function flushArtifacts() {
	await Promise.all(mkdir_promises);
	const promises = [];
	for (const artifact of artifacts.values()) {
		if (artifacts_dependencies.has(artifact)) continue;
		const output_file_path = nodePath.join(output_static_path, artifact.path);
		const content = artifact.text();
		let promise;
		if (content === null) {
			const source_file_path = nodePath.join(source_path, artifact.path);
			promise = fs.cp(source_file_path, output_file_path);
		} else promise = fs.writeFile(output_file_path, content);
		promises.push(promise);
	}
	await Promise.all(promises);
}
//#endregion
//#region src/build/plugins.ts
/** Applies the plugins from the config. */
async function applyPlugins(artifacts, plugins) {
	if (!plugins) return;
	const artifacts_set = artifacts instanceof Set ? artifacts : new Set(artifacts);
	for (const plugin of plugins) {
		const promises = [];
		for (const artifact of artifacts_set) if (plugin.filter === "*" || plugin.filter.test(artifact.path)) {
			const result = plugin.transform(artifact, { is_prod });
			if (result instanceof Promise) promises.push(result);
		}
		if (promises.length > 0) await Promise.all(promises);
	}
}
//#endregion
//#region src/build/bundler.ts
const SENTINEL_PATH = `${createId()}.js`;
const paths = /* @__PURE__ */ new Set();
const bundlerPlugin = {
	name: "kit10",
	setup(build) {
		build.onResolve({ filter: /.*/ }, (args) => {
			console.log("bundler onResolve", args);
			if (args.path === SENTINEL_PATH || isArtifactAt(args.path)) return {
				path: args.path,
				namespace: "artifact"
			};
			else if (args.path.startsWith(".")) {
				console.log(nodePath.join(nodePath.dirname(nodePath.join(source_path, args.importer)), args.path));
				return { path: nodePath.join(nodePath.dirname(nodePath.join(source_path, args.importer)), args.path) };
			}
		});
		build.onLoad({
			filter: /.*/,
			namespace: "artifact"
		}, (args) => {
			return {
				contents: args.path === SENTINEL_PATH ? "export default null;" : createArtifact(args.path).text(),
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
			console.log("bundler onLoad", args);
			const ext = args.path.slice(args.path.lastIndexOf("."));
			if (!known_exts.has(ext) && args.path.startsWith(source_path)) {
				const artifact = createArtifact(args.path);
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
	const result = await Bun.build({
		plugins: [bundlerPlugin],
		entrypoints: [SENTINEL_PATH, ...paths],
		format: "esm",
		minify: is_prod,
		naming: { chunk: "js/chunks/[hash].js" },
		splitting: true
	});
	for (const output of result.outputs) {
		const static_path = nodePath.resolve("/", output.path).slice(1);
		if (static_path !== SENTINEL_PATH) createArtifact(static_path).update(await output.text());
	}
}
//#endregion
//#region src/build/plugins/html/imports.ts
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const htmlScanImportsPlugin = {
	filter: "*",
	transform(artifact) {
		const scriptSrcArtifact = artifact.create("js", "");
		let result = "";
		const rewriter = new HTMLRewriter((chunk) => {
			result += textDecoder.decode(chunk);
		});
		let tag_content = "";
		rewriter.on("script", {
			element(element) {
				tag_content = "";
				if (element.getAttribute("type") === "module") {
					const attr_src = element.getAttribute("src");
					if (attr_src === null) {
						const scriptArtifact = artifact.create("js", "");
						paths.add(scriptArtifact.path);
						element.replace(`<!--${scriptArtifact.id}-->`, { html: true });
						element.onEndTag(() => {
							scriptArtifact.update(tag_content);
						});
					} else {
						scriptSrcArtifact.append(`import '${attr_src}';\n`);
						element.remove();
					}
				}
			},
			text(node) {
				if (node.text) tag_content += node.text;
			}
		});
		rewriter.on("head", { element(element) {
			element.append(`<!--${scriptSrcArtifact.id}-->`, { html: true });
		} });
		rewriter.write(textEncoder.encode(artifact.text()));
		rewriter.end();
		if (scriptSrcArtifact.text().length > 0) paths.add(scriptSrcArtifact.path);
		else {
			result = result.replace(`<!--${scriptSrcArtifact.id}-->`, "");
			scriptSrcArtifact.delete();
		}
		artifact.update(result);
	}
};
const htmlWriteImportsPlugin = {
	filter: "*",
	transform(artifact) {
		let content = artifact.text();
		for (const artifactDependency of artifact.dependencies) {
			const script_content = artifactDependency.text();
			let html;
			if (script_content.length > 2e3) {
				html = `<script type="module" src="/${artifactDependency.path}"><\/script>`;
				artifactDependency.detach();
			} else {
				html = `<script type="module">\n${script_content}<\/script>`;
				artifactDependency.delete();
			}
			content = content.replace(`<!--${artifactDependency.id}-->`, html);
		}
		artifact.update(content);
	}
};
//#endregion
//#region src/build/plugins/html/template.ts
const page_template = await fs.readFile(nodePath.join(source_path, "+template.html"), "utf8");
const htmlTemplatePlugin = {
	filter: "*",
	transform(artifact) {
		artifact.update(page_template.replace("<kit10:page></kit10:page>", artifact.text()));
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
		const artifact = createArtifact(nodePath.relative(source_path, route_data.file.path));
		if (artifact.ext === "html") artifact_collections.html.add(artifact);
		else artifact_collections.pre_html.add(artifact);
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
		for (const [route, artifact] of app_routes.entries()) app_routes_js.push(`app.get('${route}', (c) => handler(c, '${artifact.path}'));`);
		const PATH_MAIN = nodePath.join(output_path, "main.js");
		let contents = await fs.readFile(PATH_MAIN, "utf8");
		contents = contents.replace("// MARK: app", app_routes_js.join("\n")).replace("port: 0,", `port: ${config.server?.port ?? 3e3},`);
		await fs.writeFile(PATH_MAIN, contents, "utf8");
	}
}
//#endregion
//#region src/build.ts
await parseEntrypoints();
await applyPlugins(artifact_collections.pre_html, config.plugins);
for (const artifact of artifact_collections.pre_html) {
	if (artifact.ext !== "html") {
		console.error(`No plugin found for ".${artifact.ext}" pages (for "${artifact.path}").`);
		process.exit(1);
	}
	artifact_collections.html.add(artifact);
}
artifact_collections.pre_html.clear();
await applyPlugins(artifact_collections.html.values(), [htmlTemplatePlugin, htmlScanImportsPlugin]);
await bundle();
await applyPlugins(artifact_collections.html.values(), [htmlWriteImportsPlugin]);
logArtifacts();
await flushRouter();
await flushArtifacts();
//#endregion
export {};
