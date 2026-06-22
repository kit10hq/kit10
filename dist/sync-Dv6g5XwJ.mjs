import { n as source_path, t as project_path } from "./options-bbHkPexD.mjs";
import { n as workers_imports, r as clearDir, t as workers_data } from "./workers-BbNt0iik.mjs";
import nodePath from "node:path";
import fs from "node:fs/promises";
import { parseSync } from "oxc-parser";
//#region src/sync/options.ts
const KIT10_DIR = nodePath.join(project_path, ".kit10");
const KIT10_TYPES_DIR = nodePath.join(project_path, ".kit10", "types");
//#endregion
//#region src/sync/workers.ts
const WORKERS_DIR = nodePath.join(KIT10_TYPES_DIR, "workers");
/** Creates d.ts files for workers. */
async function syncWorkers() {
	await fs.mkdir(WORKERS_DIR, { recursive: true });
	await clearDir(WORKERS_DIR);
	const promises = [generateWorkersLibs()];
	for (const worker_name of workers_data.keys()) promises.push(generateWorkerDts(worker_name));
	await Promise.all(promises);
}
/** Generates `.d.ts` file for a worker with its exports. */
async function generateWorkerDts(worker_name) {
	const { project_path, exports } = workers_data.get(worker_name);
	const lines = [];
	for (const specifier of exports) lines.push(`export function ${specifier}(`, `\t...args: Parameters<typeof import('../../../src/${project_path}').${specifier}>`, `): Promise<ReturnType<typeof import('../../../src/${project_path}').${specifier}>>;`);
	await fs.writeFile(nodePath.join(WORKERS_DIR, `${worker_name}.d.ts`), lines.join("\n"));
}
/** Generates `workers.d.ts` file with all modules imported by all workers. */
async function generateWorkersLibs() {
	const promises = [];
	for (const path of workers_imports.keys()) promises.push(getModuleSpecifiers(path));
	const data = await Promise.all(promises);
	const lines = ["type PromisifyExports<T> = { [K in keyof T]: T[K] extends (...args: infer A) => infer R ? (...args: A) => Promise<Awaited<R>> : never; };"];
	for (const { path, specifiers } of data) {
		lines.push(`declare module '$src/${path}' {`);
		if (specifiers.length > 0) lines.push(`\texport const { ${[...specifiers].join(", ")} }: PromisifyExports<typeof import('../../src/${path}')>;`);
		lines.push(`}`);
	}
	await fs.writeFile(nodePath.join(KIT10_TYPES_DIR, "workers.d.ts"), lines.join("\n"));
}
/** Reads a module code and returns its exported specifiers. */
async function getModuleSpecifiers(path) {
	const { module } = parseSync("anonymous.ts", await readFileByImportPath(path));
	const specifiers = [];
	for (const exports of module.staticExports) for (const entry of exports.entries) {
		if (entry.isType) continue;
		const { name } = entry.exportName;
		if (name === null) continue;
		specifiers.push(name);
	}
	return {
		path,
		specifiers
	};
}
/** Reads a file from given import path, with fallback to .ts extension if .js file is not found. */
async function readFileByImportPath(path) {
	const promises = [fs.readFile(nodePath.join(source_path, path), "utf8")];
	if (path.endsWith(".js")) promises.unshift(fs.readFile(nodePath.join(source_path, path.replace(/\.js$/u, ".ts")), "utf8"));
	const results = await Promise.allSettled(promises);
	const contents = results.find((result) => result.status === "fulfilled")?.value;
	if (contents === void 0) throw results.find((result) => result.status === "rejected")?.reason;
	return contents;
}
//#endregion
//#region src/sync.ts
await fs.mkdir(KIT10_DIR, { recursive: true });
await clearDir(KIT10_DIR);
await Promise.all([fs.cp(nodePath.join(import.meta.dirname, "../template/tsconfig.template.json"), nodePath.join(KIT10_DIR, "tsconfig.json")), syncWorkers()]);
//#endregion
export {};
