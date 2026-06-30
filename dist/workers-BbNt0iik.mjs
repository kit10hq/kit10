import { n as source_path } from "./options-bbHkPexD.mjs";
import nodePath from "node:path";
import fs from "node:fs/promises";
import { customAlphabet } from "nanoid";
import { parseSync } from "oxc-parser";
//#region src/utils.ts
const createId = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", 16);
customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 16);
const createLetterId = customAlphabet("abcdefghijklmnopqrstuvwxyz", 16);
/** Returns a safe value for an HTML attribute. */
function escapeAttributeValue(value) {
	return value.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
/** Removes all files and subdirectories from a directory, but not the directory itself. */
async function clearDir(dir) {
	const files = await fs.readdir(dir);
	await Promise.all(files.map((file) => fs.rm(nodePath.join(dir, file), { recursive: true })));
}
//#endregion
//#region src/lib/workers.ts
/** Imports that used by workers to call window code. */
const workers_data = /* @__PURE__ */ new Map();
/** Combined imports from all workers. */
const workers_imports = /* @__PURE__ */ new Map();
const WORKERS_DIR = nodePath.join(source_path, "+workers");
const promises = [];
for (const entry of await fs.readdir(WORKERS_DIR, { withFileTypes: true })) {
	if (entry.isDirectory() !== true) throw new Error(`Expected directory at "+workers/${entry.name}".`);
	promises.push(scanWorker(entry.name));
}
await Promise.all(promises);
/** Scans worker files. */
async function scanWorker(worker_name) {
	const worker_dir = nodePath.join(WORKERS_DIR, worker_name);
	const worker_entries = await fs.readdir(worker_dir, {
		withFileTypes: true,
		recursive: true
	});
	const worker_main_absolute_path = nodePath.join(worker_dir, "+worker.ts");
	const worker_main_project_path = worker_main_absolute_path.slice(source_path.length + 1);
	workers_data.set(worker_name, {
		project_path: worker_main_project_path,
		imports: /* @__PURE__ */ new Map(),
		exports: /* @__PURE__ */ new Set()
	});
	const promises_worker = [];
	for (const entry of worker_entries) {
		if (entry.isFile() === false) continue;
		const absolute_path = nodePath.join(entry.parentPath, entry.name);
		promises_worker.push(parseWorkerFile(worker_name, absolute_path, worker_main_absolute_path === absolute_path));
	}
	await Promise.all(promises_worker);
}
/** Parses a worker file. */
async function parseWorkerFile(worker_name, absolute_path, is_main) {
	const worker_data = workers_data.get(worker_name);
	const { module } = parseSync(absolute_path, await fs.readFile(absolute_path, "utf8"));
	for (const import_ of module.staticImports) {
		let path = import_.moduleRequest.value;
		if (!path.startsWith("$src/")) continue;
		path = path.slice(5);
		for (const import_entry of import_.entries) {
			if (import_entry.isType) continue;
			const { name } = import_entry.importName;
			if (name !== null) {
				if (!worker_data.imports.has(path)) worker_data.imports.set(path, /* @__PURE__ */ new Set());
				worker_data.imports.get(path).add(name);
				if (!workers_imports.has(path)) workers_imports.set(path, /* @__PURE__ */ new Set());
				workers_imports.get(path).add(name);
			}
		}
	}
	if (is_main) for (const export_ of module.staticExports) for (const export_entry of export_.entries) {
		if (export_entry.isType) continue;
		const { name } = export_entry.exportName;
		if (name === null) continue;
		worker_data.exports.add(name);
	}
}
//#endregion
export { createLetterId as a, createId as i, workers_imports as n, escapeAttributeValue as o, clearDir as r, workers_data as t };
