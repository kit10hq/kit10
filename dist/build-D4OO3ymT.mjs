import { a as server_runtime, i as output_static_path, n as is_prod, r as output_path, t as config } from "./options-D2oYgwiy.mjs";
import { n as source_path, t as project_path } from "./options-bbHkPexD.mjs";
import { a as createLetterId, i as createId, n as workers_imports, o as escapeAttributeValue, t as workers_data } from "./workers-BbNt0iik.mjs";
import nodePath from "node:path";
import fs, { readdirSync } from "node:fs";
import * as fs$2 from "node:fs/promises";
import fs$1 from "node:fs/promises";
import { inspect, promisify } from "node:util";
import zlib from "node:zlib";
import { createPathsMatcher, getTsconfig } from "get-tsconfig";
import * as esbuild from "esbuild";
import { parseSync } from "oxc-parser";
import browserslist from "browserslist";
import { browserslistToTargets, transform } from "lightningcss";
import { HTMLRewriter } from "html-rewriter-wasm";
import pkg from "@minify-html/node";
//#region src/build/fs/directory.ts
const directories_created = /* @__PURE__ */ new Set();
const directories_creating = /* @__PURE__ */ new Map();
/** Returns all directories containing given path. */
function getDirectories(project_dir) {
	const result = /* @__PURE__ */ new Set();
	let project_dir_created;
	for (const part of project_dir.split(nodePath.sep)) {
		project_dir_created = project_dir_created === void 0 ? part : nodePath.join(project_dir_created, part);
		result.add(project_dir_created);
	}
	return result;
}
/** Creates directory and dedupes directory creation requests. */
function createDirectory(project_dir) {
	if (directories_created.has(project_dir)) return;
	if (directories_creating.has(project_dir)) return directories_creating.get(project_dir);
	const project_dir_list = getDirectories(project_dir);
	const output_dir = project_dir === "." ? output_static_path : nodePath.join(output_static_path, project_dir);
	const promise = fs$2.mkdir(output_dir, { recursive: true });
	for (const dir of project_dir_list) directories_creating.set(dir, promise);
	promise.then(() => {
		for (const dir of project_dir_list) {
			directories_created.add(dir);
			directories_creating.delete(dir);
		}
	});
	return promise;
}
/** Clear the dist directory. */
async function clearDistDirectory() {
	directories_created.clear();
	directories_creating.clear();
	await fs$2.mkdir(output_path, { recursive: true });
	const promises = [];
	{
		const entries = await fs$2.readdir(output_path, { withFileTypes: true });
		for (const entry of entries) {
			const path = nodePath.join(output_path, entry.name);
			if (path !== output_static_path) promises.push(fs$2.rm(path, { recursive: true }));
		}
	}
	{
		const entries = await fs$2.readdir(output_static_path, { withFileTypes: true });
		for (const entry of entries) promises.push(fs$2.rm(nodePath.join(output_static_path, entry.name), { recursive: true }));
	}
	await Promise.all(promises);
}
//#endregion
//#region src/build/fs/gzip.ts
const zlib_gzip = promisify(zlib.gzip);
const EXT_COMPRESS = new Set([
	"html",
	"css",
	"js",
	"json",
	"svg",
	"xml",
	"txt"
]);
/** Compresses the given content using gzip and writes it to the specified path. */
async function gzip(content, path) {
	const content_gzipped = await zlib_gzip(content, { level: 9 });
	await fs$1.writeFile(path, content_gzipped);
	return content_gzipped.byteLength;
}
//#endregion
//#region src/build/utils.ts
const tsconfig = getTsconfig(project_path);
const matchPath = tsconfig ? createPathsMatcher(tsconfig) : void 0;
/** Checks if path points to a file in the project. */
function describeImportSpecifier(specifier, mode = "ts") {
	if (specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/")) return {
		local: true,
		type: "path"
	};
	if (specifier.startsWith("file:")) return {
		local: true,
		type: "url-file"
	};
	if (/^[a-z][a-z\d+.-]*:/iu.test(specifier)) return {
		local: false,
		type: "url"
	};
	if (mode === "ts") {
		if (specifier.startsWith("#")) throw new Error(`Shebang paths are not supported: "${specifier}".`);
		if (matchPath?.(specifier)?.length) return {
			local: true,
			type: "alias"
		};
		return {
			local: false,
			type: "package"
		};
	}
	return {
		local: true,
		type: "path-slashless"
	};
}
/** Returns the path to a file imported from another file. */
function resolveProjectPath(base_project_path, relative_path) {
	return relative_path.startsWith("/") ? relative_path.slice(1) : nodePath.join(nodePath.dirname(base_project_path), relative_path);
}
//#endregion
//#region src/build/artifact.ts
const all = /* @__PURE__ */ new Map();
const collections = {
	pre_html: /* @__PURE__ */ new Set(),
	html: /* @__PURE__ */ new Set(),
	entrypoints: /* @__PURE__ */ new Set(),
	bundle: /* @__PURE__ */ new Set()
};
const dependencies = /* @__PURE__ */ new Map();
const dependents = /* @__PURE__ */ new Map();
const flushed_table = [];
const link_headers = {};
var Artifact = class Artifact {
	id = createId(36);
	#project_path;
	#content = null;
	meta = {};
	constructor(project_path, content) {
		if (project_path.startsWith("/") || project_path.startsWith("./") || project_path.startsWith("../") || project_path.startsWith("#")) throw new Error(`Invalid path for artifact: "${project_path}".`);
		this.#project_path = project_path;
		if (all.has(this.#project_path)) return all.get(project_path);
		all.set(this.#project_path, this);
		if (content !== void 0) this.#content = Array.isArray(content) ? content : [content];
	}
	create(arg0) {
		let relative_path;
		let content;
		if (typeof arg0 === "string") relative_path = arg0;
		else {
			relative_path = this.filename.replace(/\.[^.]+$/u, `-${createId()}.${arg0.ext}`);
			content = arg0.content ?? [];
		}
		const newArtifact = new Artifact(resolveProjectPath(this.#project_path, "./" + relative_path), content);
		this.link(newArtifact);
		return newArtifact;
	}
	/** Adds artifact as a dependency of this artifact. */
	link(artifact) {
		if (!dependencies.has(this)) dependencies.set(this, /* @__PURE__ */ new Set());
		dependencies.get(this).add(artifact);
		if (!dependents.has(artifact)) dependents.set(artifact, /* @__PURE__ */ new Set());
		dependents.get(artifact).add(this);
	}
	/** Removes artifact as a dependency of this artifact. */
	unlink(artifact) {
		dependencies.get(this)?.delete(artifact);
		const childArtifact_dependents = dependents.get(artifact);
		childArtifact_dependents?.delete(this);
		if (!childArtifact_dependents || childArtifact_dependents.size === 0) artifact.delete();
	}
	get project_path() {
		return this.#project_path;
	}
	get absolute_path() {
		return nodePath.join(source_path, this.#project_path);
	}
	get filename() {
		return this.#project_path.split(nodePath.sep).at(-1);
	}
	updateFilename(filename) {
		if (filename.includes(nodePath.sep)) throw new Error(`filename must not include path separators: ${filename}`);
		all.delete(this.#project_path);
		this.#project_path = this.#project_path.replace(/\/[^/]+$/u, `/${filename}`);
		all.set(this.#project_path, this);
	}
	get is_page() {
		return this.#project_path.match(/\+page\.[^.]+$/u) !== null;
	}
	get ext() {
		return this.#project_path.split("/").at(-1).split(".").at(-1);
	}
	/** Updates the file extension. */
	updateExt(ext) {
		all.delete(this.#project_path);
		this.#project_path = this.#project_path.replace(/\.[^.]+$/u, `.${ext}`);
		all.set(this.#project_path, this);
	}
	/** Returns read-only copy of the dependencies of this artifact. */
	get dependencies() {
		return new Set(dependencies.get(this));
	}
	#load() {
		if (this.#content === null) return fs$1.readFile(this.absolute_path).then((content) => {
			this.#content = [content];
		});
	}
	#blob_cache;
	get #blob() {
		if (this.#content === null) throw new Error(`Content not loaded for ${this.#project_path}.`);
		if (this.#blob_cache === void 0) this.#blob_cache = new Blob(this.#content);
		return this.#blob_cache;
	}
	async text() {
		await this.#load();
		return this.#blob.text();
	}
	async arrayBuffer() {
		await this.#load();
		return this.#blob.arrayBuffer();
	}
	async bytes() {
		await this.#load();
		return this.#blob.bytes();
	}
	/** Returns the size of the artifact in bytes. */
	async size() {
		await this.#load();
		return this.#blob.size;
	}
	/**
	* Returns the size of the artifact in bytes, assuming it has been loaded.
	* @throws {Error} If there is no content in memory (file was not read from disk).
	*/
	get sizeUnsafe() {
		return this.#blob.size;
	}
	/** Updates artifact contents, replacing any existing content. */
	update(data) {
		this.#content = Array.isArray(data) ? data : [data];
		this.#blob_cache = void 0;
	}
	/** Appends to the artifact contents. */
	append(data) {
		if (this.#content === null) throw new Error(`Content not loaded for ${this.#project_path}.`);
		this.#content.push(data);
		this.#blob_cache = void 0;
	}
	/** Deletes the artifact from build context. */
	delete() {
		all.delete(this.#project_path);
		const thisArtifact_dependents = dependents.get(this);
		if (thisArtifact_dependents) for (const dependentArtifact of thisArtifact_dependents) dependencies.get(dependentArtifact)?.delete(this);
		const thisAartifact_dependencies = dependencies.get(this);
		if (thisAartifact_dependencies) for (const dependencyArtifact of thisAartifact_dependencies) this.unlink(dependencyArtifact);
		dependents.delete(this);
		dependencies.delete(this);
		for (const collection of Object.values(collections)) collection.delete(this);
	}
	#flush_promise;
	get is_flushed() {
		return this.#flush_promise !== void 0;
	}
	/** Writes the artifact to disk. */
	flush() {
		this.#flush_promise ??= this.#flush();
		return this.#flush_promise;
	}
	async #flush() {
		const output_path = nodePath.join(output_static_path, this.#project_path);
		let gzip_size;
		if (this.#content === null && !is_prod && EXT_COMPRESS.has(this.ext) !== true) await fs$1.cp(this.absolute_path, output_path);
		else {
			const content = await this.bytes();
			const promises = [fs$1.writeFile(output_path, content)];
			if (is_prod) promises.push(gzip(content, output_path + ".gz"));
			const [, gzip_result] = await Promise.all(promises);
			if (typeof gzip_result === "number") gzip_size = gzip_result;
		}
		flushed_table.push({
			filename: this.#project_path,
			size: String(this.sizeUnsafe).padStart(7),
			...gzip_size === void 0 ? {} : { gzip_size: String(gzip_size).padStart(9) }
		});
	}
	toString() {
		return [
			`Artifact(${this.#project_path}) {`,
			`  id: ${this.id}`,
			`  content: <${this.#content ? `${this.#blob.size} bytes` : "not loaded"}>`,
			`}`
		].join("\n");
	}
	[inspect.custom]() {
		return this.toString();
	}
};
/** Writes a single artifact to disk. */
async function flushOne(artifact) {
	if (artifact.is_flushed) return;
	await createDirectory(nodePath.dirname(artifact.project_path));
	const promises = [artifact.flush()];
	const link_header_parts = [];
	for (const dependencyArtifact of artifact.dependencies) {
		promises.push(flushOne(dependencyArtifact));
		switch (dependencyArtifact.ext) {
			case "js":
				link_header_parts.push(`</${encodeURI(dependencyArtifact.project_path)}>; rel=modulepreload`);
				break;
			case "css":
				link_header_parts.push(`</${encodeURI(dependencyArtifact.project_path)}>; rel=preload; as=style`);
				break;
		}
	}
	if (link_header_parts.length > 0) link_headers[artifact.project_path] = link_header_parts.join(", ");
	await Promise.all(promises);
}
/** Writes all artifacts to disk. */
async function flush() {
	const promises = [];
	for (const artifact of collections.entrypoints.values()) promises.push(flushOne(artifact));
	await Promise.all(promises);
	if (is_prod) console.table(flushed_table);
}
//#endregion
//#region src/build/bundler/imports.ts
/** Scans JavaScript code and absolutifies import paths. */
function rewriteImports(project_path, code) {
	const dirname = nodePath.dirname("/" + project_path);
	const ast = parseSync(project_path, code);
	let position_delta = 0;
	for (const import_ of ast.module.staticImports) {
		const { value: path, start, end } = import_.moduleRequest;
		const absolute_path = nodePath.normalize(nodePath.join(dirname, path));
		const substring = JSON.stringify(absolute_path);
		code = code.slice(0, start + position_delta) + substring + code.slice(end + position_delta);
		position_delta += substring.length - (end - start);
	}
	for (const import_ of ast.module.dynamicImports) {
		const { start, end } = import_.moduleRequest;
		const path = code.slice(start + 1 + position_delta, end - 1 + position_delta);
		const absolute_path = nodePath.normalize(nodePath.join(dirname, path));
		const substring = JSON.stringify(absolute_path);
		code = code.slice(0, start + position_delta) + substring + code.slice(end + position_delta);
		position_delta += substring.length - (end - start);
	}
	return code;
}
//#endregion
//#region src/build/bundler/options.ts
const esbuild_options = {
	absWorkingDir: source_path,
	outdir: "/",
	bundle: true,
	chunkNames: "js/chunks/[hash]",
	format: "esm",
	metafile: true,
	minify: is_prod,
	write: false
};
/** Checks if the given path exists and returns the corresponding TypeScript path if it does. */
async function jsTsResolver(path) {
	const path_ts = path.replace(/\.js$/u, ".ts");
	try {
		await fs$1.access(path_ts);
		return path_ts;
	} catch {}
}
const esbuildTsJsResolverPlugin = {
	name: "ts-js-resolver",
	setup(build) {
		build.onResolve({ filter: /\.js$/ }, async (args) => {
			if (!describeImportSpecifier(args.path).local) return;
			const path_ts = await jsTsResolver(nodePath.resolve(args.resolveDir, args.path));
			if (path_ts !== void 0) return { path: path_ts };
		});
	}
};
/** Resolves import to a file, if it points to source file. */
async function getAbsolutePathOnResolve(args) {
	const importSpecifier = describeImportSpecifier(args.path);
	if (!importSpecifier.local) return;
	let absolute_path;
	if (importSpecifier.type === "alias") {
		const match = matchPath(args.path);
		if (match.length !== 1) throw new Error(`Kit10 does not support multiple matches for TypeScript aliases (found for "${args.path}").`);
		if (match[0] === void 0) return;
		absolute_path = await jsTsResolver(match[0]) ?? match[0];
	} else absolute_path = args.resolveDir.length === 0 || args.path.startsWith("/") ? args.path : nodePath.join(args.resolveDir, args.path);
	if (!absolute_path.startsWith(source_path)) return;
	return absolute_path;
}
//#endregion
//#region src/build/bundler/worker.ts
const worker_files = /* @__PURE__ */ new Map();
function getWorkerCodeParts(worker_name) {
	if (worker_name === "+service") return {
		class: "ServiceWorker",
		import: "service-worker",
		request_fn: "broadcastToWindows"
	};
	return {
		class: "Worker",
		import: "worker",
		request_fn: "sendReqeustToWindow"
	};
}
/** Builds worker. */
async function createWorker(worker_name) {
	const worker_client_path = `+workers/${worker_name}/+worker.client.js`;
	const worker_window_path = `+workers/${worker_name}/+worker.window.js`;
	const code_parts = getWorkerCodeParts(worker_name);
	const worker_data = workers_data.get(worker_name);
	const in_window_worker_client_lines = [];
	const in_window_handler_parts = [];
	for (const [path, specifiers] of worker_data.imports) {
		const id = createLetterId();
		const in_window_imports = [];
		for (const specifier of specifiers) {
			const specifier_imported = `${id}_${specifier}`;
			in_window_imports.push(`${specifier} as ${specifier_imported}`);
			in_window_handler_parts.push(`\t\t${JSON.stringify(`${path}:${specifier}`)}: ${specifier_imported},`);
		}
		in_window_worker_client_lines.push(`import { ${in_window_imports.join(", ")} } from '../../${path}';`);
		buildDollarSrcModule(worker_name, path);
	}
	in_window_worker_client_lines.push(`import { Kit10${code_parts.class}Client } from 'kit10/${code_parts.import}/client';`, `const kit10${code_parts.class}Client = new Kit10${code_parts.class}Client(`, `\t${JSON.stringify(worker_name)},`, `\t${JSON.stringify(worker_name === "+service" ? "/+service-worker.js" : `/+workers/${worker_name}/+worker.worker.js`)},`, `\t() => import(${JSON.stringify(`./+worker.window.js`)}),`, `\t{`, ...in_window_handler_parts, `\t},`, `);`);
	for (const specifier of worker_data.exports) in_window_worker_client_lines.push(`export function ${specifier}(...args) {`, `\treturn kit10${code_parts.class}Client.send(${JSON.stringify(specifier)}, args);`, `}`);
	createWorkerEntrypointFiles(worker_name);
	worker_files.set(worker_client_path, in_window_worker_client_lines.join("\n"));
	await bundleWorker(worker_name);
	return [new Artifact(worker_client_path, worker_files.get(worker_client_path)), new Artifact(worker_window_path, worker_files.get(worker_window_path))];
}
/** Build a file that worker will use to send requests to the window. */
function buildDollarSrcModule(worker_name, path) {
	const src_path = `$src/${path}`;
	if (worker_files.has(src_path)) return;
	const specifiers = workers_imports.get(path);
	if (!specifiers) throw new Error(`No imports found for module "${src_path}".`);
	const code_parts = getWorkerCodeParts(worker_name);
	const lines = [`import { ${code_parts.request_fn} } from "kit10/${code_parts.import}/server"`];
	for (const specifier of specifiers) lines.push(`export function ${specifier}(...args) {`, `\treturn ${code_parts.request_fn}(${JSON.stringify(`${path}:${specifier}`)}, args);`, `}`);
	worker_files.set(src_path, lines.join("\n"));
}
/** Creates entrypoint file for worker, which will be used as "+worker.window.js". */
function createWorkerEntrypointFiles(worker_name) {
	const code_parts = getWorkerCodeParts(worker_name);
	const lines = [
		`import * as handlers from "./+worker.js";`,
		`import { Kit10${code_parts.class}Server } from "kit10/${code_parts.import}/server";`,
		`const kit10${code_parts.class}Server = new Kit10${code_parts.class}Server(${JSON.stringify(worker_name)}, handlers);`
	];
	worker_files.set(`+workers/${worker_name}/+worker.window.js`, lines.join("\n"));
	lines.push(`kit10${code_parts.class}Server.bindWorker();`);
	worker_files.set(`+workers/${worker_name}/+worker.worker.js`, lines.join("\n"));
}
const esbuildKit10WorkerPlugin = {
	name: "kit10-worker",
	setup(build) {
		build.onResolve({ filter: /.*/ }, async (args) => {
			if (worker_files.has(args.path)) return {
				path: args.path,
				namespace: "worker"
			};
			const absolute_path = await getAbsolutePathOnResolve(args);
			if (absolute_path === void 0) return;
			return { path: absolute_path };
		});
		build.onLoad({
			filter: /.*/,
			namespace: "worker"
		}, (args) => {
			if (worker_files.has(args.path) !== true) {
				console.error(`Unknown worker file: ${args.path}`);
				process.exit(1);
				return;
			}
			let resolve_dir = source_path;
			if (args.path.endsWith("/+worker.worker.js")) {
				const match = args.path.match(/^\+workers\/(?<name>\+?[-a-z\d_]+)\//iu);
				if (!match) {
					console.error(`Invalid worker entrypoint file: ${args.path}`);
					process.exit(1);
					return;
				}
				resolve_dir = nodePath.join(source_path, `+workers/${match.groups.name}`);
			}
			return {
				contents: worker_files.get(args.path),
				loader: "ts",
				resolveDir: resolve_dir
			};
		});
	}
};
/** Bundles worker code into single file. */
async function bundleWorker(worker_name) {
	const project_path = `+workers/${worker_name}/+worker.worker.js`;
	const result = await esbuild.build({
		...esbuild_options,
		plugins: [esbuildTsJsResolverPlugin, esbuildKit10WorkerPlugin],
		entryPoints: [project_path],
		splitting: false
	});
	if (result.outputFiles?.length !== 1) {
		console.error(`Expected 1 output file, got ${result.outputFiles?.length} (bundleWorker ${worker_name})`);
		process.exit(1);
		return;
	}
	const artifact = new Artifact(project_path, result.outputFiles[0].contents);
	collections.entrypoints.add(artifact);
}
//#endregion
//#region src/build/plugins/css.ts
const targets = browserslistToTargets(browserslist(">= 0.25%"));
const cssPlugin = {
	filter: /\.css$/u,
	async transform(artifact, options) {
		const code = await artifact.bytes();
		artifact.update(transform({
			filename: artifact.absolute_path,
			code,
			targets,
			minify: options.is_prod
		}).code);
	}
};
//#endregion
//#region src/build/plugins.ts
const plugins = config.plugins ?? [];
plugins.push(cssPlugin);
/** Applies the plugins from the config. */
async function applyPlugins(artifacts) {
	const artifacts_set = artifacts instanceof Set ? artifacts : new Set(artifacts);
	for (const plugin of plugins) {
		const promises = [];
		for (const artifact of artifacts_set) if (plugin.filter === "*" || (plugin.filter.lastIndex = 0, plugin.filter.test(artifact.project_path))) {
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
//#region src/build/bundler.ts
const SENTINEL_PATH = `${createId()}.js`;
/** Returns esbuild loader by onLoad args. */
function getLoaderByOnLoadArgs(args) {
	switch (args.with.type) {
		case "json": return "json";
		case "text": return "text";
		case "bytes": return "binary";
	}
}
/** Returns esbuild loader for the given path. */
function getLoaderByFilePath(path) {
	switch (path.split(".").at(-1)) {
		case "js":
		case "mjs":
		case "cjs": return "js";
		case "ts":
		case "mts":
		case "cts": return "ts";
		case "json": return "json";
		case "css": return "css";
		case "txt": return "text";
	}
	return "copy";
}
const esbuild_entrypoints = /* @__PURE__ */ new Map();
const esbuildKit10Plugin = {
	name: "kit10",
	setup(build) {
		build.onResolve({ filter: /.*/ }, async (args) => {
			if (args.path.startsWith("$workers/")) return {
				path: args.path,
				namespace: "worker"
			};
			if (args.path.startsWith("$src/")) return {
				path: args.path,
				namespace: "worker-src"
			};
			const absolute_path = await getAbsolutePathOnResolve(args);
			if (absolute_path === void 0) return;
			return {
				path: await jsTsResolver(absolute_path) ?? absolute_path,
				namespace: "artifact"
			};
		});
		const tempArtifacts = /* @__PURE__ */ new Set();
		build.onLoad({
			filter: /.*/,
			namespace: "artifact"
		}, async (args) => {
			const resolveDir = nodePath.dirname(args.path);
			if (args.path.includes(SENTINEL_PATH)) return {
				contents: "export default null;",
				loader: "js"
			};
			const artifact = new Artifact(args.path.replace(source_path, "").slice(1));
			esbuild_entrypoints.set(artifact.project_path, artifact);
			tempArtifacts.add(artifact);
			await applyPlugins([artifact]);
			const loader = getLoaderByOnLoadArgs(args) ?? getLoaderByFilePath(artifact.project_path);
			if (loader === void 0) {
				console.error(`No plugins given for compiling ".${artifact.ext}" files to bundle with esbuild (found "${args.path}").`);
				process.exit(1);
			}
			return {
				contents: await artifact.text(),
				loader,
				resolveDir
			};
		});
		build.onLoad({
			filter: /.*/,
			namespace: "worker"
		}, async (args) => {
			const match = args.path.match(/^\$workers\/(?<name>\+?[-a-z\d_]+)$/iu);
			if (!match) {
				console.error(`Invalid worker import: ${args.path}`);
				process.exit(1);
			}
			const worker_name = match.groups.name;
			const artifacts_worker = await createWorker(worker_name);
			for (const artifact of artifacts_worker) tempArtifacts.add(artifact);
			return {
				contents: await artifacts_worker[0].text(),
				loader: "ts",
				resolveDir: nodePath.join(source_path, "+workers", worker_name)
			};
		});
		build.onLoad({
			filter: /.*/,
			namespace: "worker-src"
		}, (args) => {
			const contents = worker_files.get(args.path);
			if (contents === void 0) {
				console.error(`Invalid worker-src import: ${args.path}`);
				process.exit(1);
			}
			return {
				contents,
				loader: "ts",
				resolveDir: source_path
			};
		});
		build.onEnd(() => {
			for (const artifact of tempArtifacts) if (!collections.bundle.has(artifact)) artifact.delete();
		});
	}
};
/** Runs JS/TS bundling */
async function bundle() {
	const paths = [];
	for (const artifact of collections.bundle) paths.push(artifact.absolute_path);
	const result = await esbuild.build({
		...esbuild_options,
		plugins: [esbuildKit10Plugin],
		entryPoints: [nodePath.join(source_path, SENTINEL_PATH), ...paths],
		splitting: true
	});
	if (result.errors.length > 0) {
		console.error("esbuild errors:");
		for (const error of result.errors) console.error(error.text);
		process.exit(1);
	}
	const metafile = processMetafile(result.metafile);
	for (const output of result.outputFiles) {
		if (output.path.includes(SENTINEL_PATH)) continue;
		const output_project_path = output.path.slice(1);
		const meta = metafile.get(output_project_path);
		if (meta === void 0) throw new Error(`No metafile entry found for ${output_project_path}.`);
		let artifact;
		if (meta.project_path !== void 0 && esbuild_entrypoints.has(meta.project_path) && nodePath.dirname(meta.project_path) === nodePath.dirname(output_project_path)) {
			artifact = esbuild_entrypoints.get(meta.project_path);
			artifact.updateFilename(output_project_path.split(nodePath.sep).at(-1));
		} else artifact = new Artifact(output_project_path);
		artifact.update(rewriteImports(artifact.project_path, output.text));
		collections.bundle.add(artifact);
	}
	for (const [project_path, { imports }] of metafile) {
		const artifact = new Artifact(project_path);
		for (const imported_project_path of imports) {
			const importedArtifact = new Artifact(imported_project_path);
			artifact.link(importedArtifact);
		}
	}
}
/** Processes the esbuild metafile. */
function processMetafile(metafile) {
	const result = /* @__PURE__ */ new Map();
	const output_prefix = nodePath.relative(esbuild_options.absWorkingDir, esbuild_options.outdir) + "/";
	const output_entrypoint_prefix = `artifact:${esbuild_options.absWorkingDir}/`;
	for (const [output_path, output] of Object.entries(metafile.outputs)) {
		if (output_path.includes(SENTINEL_PATH) || output_path.startsWith("data:")) continue;
		if (!output_path.startsWith(output_prefix)) throw new Error(`Esbuild output "${output_path}" does not start with "${output_prefix}".`);
		const output_project_path = output_path.slice(output_prefix.length);
		let project_path;
		if (output.entryPoint !== void 0) {
			if (output.entryPoint.startsWith(output_entrypoint_prefix) !== true) throw new Error(`Esbuild entrypoint "${output.entryPoint}" does not start with "${output_entrypoint_prefix}": ${output.entryPoint}`);
			project_path = output.entryPoint.slice(output_entrypoint_prefix.length);
		}
		result.set(output_project_path, {
			project_path,
			imports: output.imports.filter((import_) => !import_.path.startsWith("data:")).map((import_) => {
				if (!import_.path.startsWith(output_prefix)) throw new Error(`Esbuild output import "${import_.path}" does not start with "${output_prefix}".`);
				return import_.path.slice(output_prefix.length);
			})
		});
	}
	return result;
}
//#endregion
//#region src/build/formatter.ts
const PATH = [
	"/opt/homebrew/bin",
	"/usr/local/bin",
	"/usr/bin",
	"/bin",
	process.env.PATH ?? ""
].join(":");
/** Formats output files. Useful for development builds. */
async function formatOutput() {
	const biome_config_string = await fs$1.readFile(nodePath.join(import.meta.dirname, "../biome.json"), "utf8");
	const biome_config = JSON.parse(biome_config_string);
	delete biome_config.vcs;
	biome_config.files.includes = ["**"];
	const config_path = nodePath.join(output_path, "biome.json");
	await fs$1.writeFile(config_path, JSON.stringify(biome_config));
	const { execSync } = await import("node:child_process");
	execSync(`npx biome format --write`, {
		cwd: output_path,
		env: {
			...process.env,
			PATH
		}
	});
	await fs$1.rm(config_path);
}
//#endregion
//#region src/build/html/parse.ts
/** Parses HTML artifacts to extract metadata and content. */
async function parseHtml(artifact) {
	let first_tag_name;
	let is_kit10_head = false;
	const result_kit10_head = [];
	const result_html = [];
	const rewriter = new HTMLRewriter((chunk) => {
		if (is_kit10_head) result_kit10_head.push(chunk);
		else result_html.push(chunk);
	});
	let tag_content = [];
	rewriter.on("*", {
		element(element) {
			first_tag_name ??= element.tagName.toLowerCase();
			tag_content = [];
		},
		text(node) {
			if (node.text) tag_content.push(node.text);
		}
	});
	rewriter.on("kit10\\:head", { element(element) {
		is_kit10_head = true;
		element.removeAndKeepContent();
		element.onEndTag(() => {
			is_kit10_head = false;
		});
	} });
	rewriter.on("kit10\\:page", { element(element) {
		element.replace(PAGE_PLACEHOLDER, { html: true });
	} });
	rewriter.on("head", { element(element) {
		element.append(HEAD_PLACEHOLDER, { html: true });
	} });
	let unitedScriptArtifact;
	rewriter.on("script", { element(element) {
		const attr_src = element.getAttribute("src");
		if (attr_src !== null && describeImportSpecifier(attr_src, "html").local !== true) return;
		const attributes = new Map(element.attributes);
		attributes.delete("kit10:inline");
		attributes.delete("src");
		if (attr_src === null || element.getAttribute("kit10:inline") !== null) {
			let scriptArtifact;
			if (attr_src === null) {
				scriptArtifact = artifact.create({ ext: "js" });
				element.onEndTag(() => {
					scriptArtifact.update(tag_content);
				});
			} else scriptArtifact = artifact.create(attr_src);
			element.replace(`<!--${scriptArtifact.id}-->`, { html: true });
			scriptArtifact.meta.script = {
				inline: true,
				attributes
			};
			collections.bundle.add(scriptArtifact);
		} else {
			if (unitedScriptArtifact) element.remove();
			else {
				unitedScriptArtifact = artifact.create({ ext: "united.js" });
				unitedScriptArtifact.meta.script = {
					inline: false,
					attributes: new Map([["type", "module"]])
				};
				element.replace(`<!--${unitedScriptArtifact.id}-->`, { html: true });
				collections.bundle.add(unitedScriptArtifact);
			}
			unitedScriptArtifact.append(`import "./${attr_src}";\n`);
		}
	} });
	rewriter.on("style", { element(element) {
		const attributes = new Map(element.attributes);
		const styleArtifact = artifact.create({ ext: "css" });
		styleArtifact.meta.style = {
			inline: true,
			attributes
		};
		element.replace(`<!--${styleArtifact.id}-->`, { html: true });
		element.onEndTag(() => {
			styleArtifact.update(tag_content);
		});
		collections.bundle.add(styleArtifact);
	} });
	rewriter.on("link", { element(element) {
		const attr_href = element.getAttribute("href");
		if (attr_href === null) return;
		if (describeImportSpecifier(attr_href, "html").local !== true) return;
		const attributes = new Map(element.attributes);
		attributes.delete("kit10:inline");
		attributes.delete("href");
		if (element.getAttribute("rel") === "stylesheet" || element.getAttribute("rel") === "preload" && element.getAttribute("as") === "style") {
			const linkArtifact = artifact.create(attr_href);
			element.replace(`<!--${linkArtifact.id}-->`, { html: true });
			linkArtifact.meta.style = {
				inline: element.getAttribute("kit10:inline") !== null,
				attributes
			};
			collections.bundle.add(linkArtifact);
		}
	} });
	rewriter.on("img", { element(element) {
		const attr_src = element.getAttribute("src");
		if (attr_src !== null) {
			if (describeImportSpecifier(attr_src, "html").local !== true) return;
			const attributes = new Map(element.attributes);
			attributes.delete("kit10:inline");
			attributes.delete("src");
			const elementArtifact = artifact.create(attr_src);
			elementArtifact.meta.element = {
				element: "img",
				inline: element.getAttribute("kit10:inline") !== null,
				attributes
			};
			element.replace(`<!--${elementArtifact.id}-->`, { html: true });
			collections.bundle.add(elementArtifact);
		}
	} });
	rewriter.write(await artifact.bytes());
	rewriter.end();
	return {
		is_full_page: first_tag_name === "html",
		kit10_head: result_kit10_head,
		html: result_html
	};
}
//#endregion
//#region src/build/html/template.ts
const HEAD_PLACEHOLDER = `<!--${createId(36)}-->`;
const PAGE_PLACEHOLDER = `<!--${createId(36)}-->`;
const artifact = new Artifact("+template.html");
/** Prepares the +template.html file by parsing it and splitting into parts to easy wrapping. */
async function prepareTemplate() {
	const htmlParsed = await parseHtml(artifact);
	let parts = (await new Blob(htmlParsed.html).text()).split(HEAD_PLACEHOLDER);
	const part_0 = parts[0];
	parts = parts[1].split(PAGE_PLACEHOLDER);
	return [
		part_0,
		parts[0],
		parts[1]
	];
}
const template_parts = await prepareTemplate();
/** Wraps page HTML in the template HTML. */
function wrapInTemplate(pageHtmlParsed) {
	return [
		template_parts[0],
		...pageHtmlParsed.kit10_head,
		template_parts[1],
		...pageHtmlParsed.html,
		template_parts[2]
	];
}
//#endregion
//#region src/build/html/minify.ts
const { minify } = pkg;
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
/** Minifies HTML artifact. */
function minifyHtml(content) {
	return minify(Buffer.from(content), MINIFY_HTML_OPTIONS);
}
//#endregion
//#region src/build/html.ts
/** Compiles non-HTML artifacts to HTML using plugins. */
async function compileToHtml() {
	await applyPlugins(collections.pre_html);
	for (const artifact of collections.pre_html) {
		if (artifact.ext !== "html") {
			console.error(`No plugin found for ".${artifact.ext}" pages (for "${artifact.project_path}").`);
			process.exit(1);
		}
		collections.html.add(artifact);
	}
	collections.pre_html.clear();
}
/** Processes single HTML file. */
async function processOneHtml(artifact$1) {
	const htmlParsed = await parseHtml(artifact$1);
	if (htmlParsed.is_full_page) artifact$1.update(htmlParsed.html);
	else {
		artifact$1.update(wrapInTemplate(htmlParsed));
		for (const dependencyArtifact of artifact.dependencies) artifact$1.link(dependencyArtifact);
	}
}
/** Extracts resources (script, style, link, etc) from HTML, wraps HTML content with a common template... */
async function processHtml() {
	const promises = [];
	for (const artifact of collections.html) {
		promises.push(processOneHtml(artifact));
		collections.entrypoints.add(artifact);
	}
	await Promise.all(promises);
}
const INLINE_TRESHOLD = config.build?.inlineTreshold ?? 2e3;
/** Puts back resources into the HTML pages. */
async function finalizeHtml() {
	const promises = [];
	for (const artifact of collections.html) promises.push(finalizeHtmlOne(artifact));
	await Promise.all(promises);
}
/** Puts back resources into the HTML page. */
async function finalizeHtmlOne(artifact) {
	let contents = await artifact.text();
	const promises = [];
	for (const dependencyArtifact of artifact.dependencies) {
		if (dependencyArtifact.meta.script) {
			promises.push(computeReplacementScript(artifact, dependencyArtifact));
			continue;
		}
		if (dependencyArtifact.meta.style) {
			promises.push(computeReplacementStyle(artifact, dependencyArtifact));
			continue;
		}
		if (dependencyArtifact.meta.element) {
			promises.push(computeReplacementElement(artifact, dependencyArtifact));
			continue;
		}
	}
	const replacements = await Promise.all(promises);
	for (const [search, replace] of replacements) contents = contents.replaceAll(search, replace);
	artifact.update(is_prod ? minifyHtml(contents) : contents);
}
/** Returns the replacement script tag for the given dependency artifact. */
async function computeReplacementScript(artifact, dependencyArtifact) {
	const script_metadata = dependencyArtifact.meta.script;
	let script_contents;
	if (script_metadata.inline || dependencyArtifact.sizeUnsafe <= INLINE_TRESHOLD) {
		script_contents = await dependencyArtifact.text();
		for (const artifact_ of dependencyArtifact.dependencies) artifact.link(artifact_);
		artifact.unlink(dependencyArtifact);
	}
	let tag = "<script";
	if (script_contents === void 0) tag += ` src="/${dependencyArtifact.project_path}"`;
	if (script_metadata.attributes) for (const [key, value] of script_metadata.attributes) tag += ` ${key}="${escapeAttributeValue(value)}"`;
	tag += ">";
	if (script_contents !== void 0) tag += script_contents;
	tag += "<\/script>";
	return [`<!--${dependencyArtifact.id}-->`, tag];
}
const LINK_ATTRS_REMOVE_ON_STYLE = new Set([
	"rel",
	"as",
	"onload"
]);
/** Returns the replacement style tag for the given dependency artifact. */
async function computeReplacementStyle(artifact, dependencyArtifact) {
	const style_metadata = dependencyArtifact.meta.style;
	let script_contents;
	if (style_metadata.inline) {
		script_contents = await dependencyArtifact.text();
		for (const artifact_ of dependencyArtifact.dependencies) artifact.link(artifact_);
		artifact.unlink(dependencyArtifact);
	}
	let tag = "";
	if (script_contents === void 0) {
		tag += `<link href="/${dependencyArtifact.project_path}"`;
		for (const [key, value] of new Map([["rel", "stylesheet"], ...style_metadata.attributes ?? []])) tag += ` ${key}="${escapeAttributeValue(value)}"`;
		tag += ">";
	} else {
		tag += `<style`;
		if (style_metadata.attributes) {
			for (const [key, value] of style_metadata.attributes) if (!LINK_ATTRS_REMOVE_ON_STYLE.has(tag)) tag += ` ${key}="${escapeAttributeValue(value)}"`;
		}
		tag += `>${script_contents}</style>`;
	}
	return [`<!--${dependencyArtifact.id}-->`, tag];
}
/** Returns the replacement style tag for the given dependency artifact. */
function computeReplacementElement(artifact, dependencyArtifact) {
	const metadata = dependencyArtifact.meta.element;
	let tag = "";
	tag += `<${metadata.element} src="/${dependencyArtifact.project_path}"`;
	if (metadata.attributes) for (const [key, value] of metadata.attributes) tag += ` ${key}="${escapeAttributeValue(value)}"`;
	tag += ">";
	return [`<!--${dependencyArtifact.id}-->`, tag];
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
		route_part: getCatchAllRoutePart(match_optional_catch_all.groups.key),
		specificity: {
			type: 3,
			static_length: 0
		}
	}];
	const match_catch_all = RE_CATCH_ALL.exec(name);
	if (match_catch_all) return [{
		route_part: getCatchAllRoutePart(match_catch_all.groups.key),
		specificity: {
			type: 3,
			static_length: 0
		}
	}];
	let has_optional = false;
	let static_length = name.length;
	const route_part = name.replaceAll(/\[\[(?<parameter_name>[a-z_][a-z_\d]*)\]\](?<next_char>[^\da-z_]|$)/giu, (substring, parameter_name, next_char) => {
		static_length -= substring.length - next_char.length;
		has_optional = true;
		return `:${getParameterRoutePart(parameter_name, true)}${next_char}`;
	}).replaceAll(/\[(?<parameter_name>[a-z_][a-z_\d]*)\](?<next_char>[^\da-z_]|$)/giu, (substring, parameter_name, next_char) => {
		static_length -= substring.length - next_char.length;
		return `:${getParameterRoutePart(parameter_name, false)}${next_char}`;
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
/** Return route part for parameter. */
function getParameterRoutePart(name, optional) {
	if (server_runtime === "hono") return `:${name}${optional ? "?" : ""}`;
	if (server_runtime === "nginx") return optional ? "(?:[^/]+)?" : "[^/]+";
	throw new Error(`Unsupported server runtime "${server_runtime}".`);
}
/** Return route part for catch-all parameter. */
function getCatchAllRoutePart(name) {
	if (server_runtime === "hono") return `:${name}{.+}`;
	if (server_runtime === "nginx") return `.+`;
	throw new Error(`Unsupported server runtime "${server_runtime}".`);
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
				absolute_path: entry_path,
				ext: entrypoint.ext
			};
			else state.children.push({
				route: (state.route === "/" ? "" : state.route) + nodePath.sep + route_def.route_part,
				file: {
					absolute_path: entry_path,
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
*/
function processEntrypoints() {
	const routes_data = getRoutes(source_path);
	for (const route_data of routes_data) {
		const artifact = new Artifact(nodePath.relative(source_path, route_data.file.absolute_path));
		app_routes.set(route_data.route, artifact);
		if (artifact.ext === "html") collections.html.add(artifact);
		else collections.pre_html.add(artifact);
	}
}
/** Writes router files to the output directory. */
async function flushRouter() {
	await fs$1.cp(nodePath.join(import.meta.dirname, "../template/server", server_runtime), output_path, { recursive: true });
	const server_port = (is_prod ? config.server?.port : null) ?? 3e3;
	if (server_runtime === "hono") {
		const app_routes_js = [];
		for (const [route, artifact] of app_routes.entries()) app_routes_js.push(`app.get('${route}', serveFile('/${artifact.project_path}'));`);
		const PATH_MAIN = nodePath.join(output_path, "main.js");
		let contents = await fs$1.readFile(PATH_MAIN, "utf8");
		contents = contents.replaceAll(/[/.]+\/src\/reexports\/(?<name>[a-z]+)\.js/gu, "kit10/$<name>").replace("const LINK_HEADERS = {};", `const LINK_HEADERS = ${JSON.stringify(link_headers)};`).replace("// MARK: app", app_routes_js.join("\n")).replace("port: 0,", `port: ${server_port},`);
		if (is_prod) while (true) {
			const index_ws_start = contents.indexOf("// MARK: devserver\n");
			if (index_ws_start === -1) break;
			const index_ws_end = contents.indexOf("// MARK: devserver end\n");
			contents = contents.slice(0, index_ws_start) + contents.slice(index_ws_end + 22);
		}
		await fs$1.writeFile(PATH_MAIN, contents, "utf8");
	} else if (server_runtime === "nginx") {
		const app_routes_map = [];
		for (const [route, artifact] of app_routes.entries()) {
			const nginx_path = `/${artifact.project_path}`;
			if (`${route}+page.html` === nginx_path || `${route}/index+page.html` === nginx_path) continue;
			app_routes_map.push(`~^${route}$ ${nginx_path};`);
		}
		const config_http_path = nodePath.join(output_path, "http.conf");
		const config_server_path = nodePath.join(output_path, "server.conf");
		let [contents_http, contents_server] = await Promise.all([fs$1.readFile(config_http_path, "utf8"), fs$1.readFile(config_server_path, "utf8")]);
		contents_http = contents_http.replace("# MARK: link headers", Object.entries(link_headers).map(([file, link_header]) => `/${file} ${JSON.stringify(link_header)};`).join("\n	")).replace("# MARK: routes", app_routes_map.join("\n	"));
		contents_server = contents_server.replace("listen 3000;", `listen ${server_port};`);
		await Promise.all([fs$1.writeFile(config_http_path, contents_http, "utf8"), fs$1.writeFile(config_server_path, contents_server, "utf8")]);
	}
}
//#endregion
//#region src/build.ts
const start = process.hrtime.bigint();
await clearDistDirectory();
processEntrypoints();
await compileToHtml();
await processHtml();
await bundle();
await finalizeHtml();
artifact.delete();
await flush();
await flushRouter();
if (!is_prod) await formatOutput();
{
	const assets_path = nodePath.join(source_path, "+assets");
	if (fs.existsSync(assets_path)) fs.cpSync(assets_path, nodePath.join(output_static_path, "+assets"), { recursive: true });
}
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
