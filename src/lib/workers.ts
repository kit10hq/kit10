import fs from 'node:fs/promises';
import nodePath from 'node:path';
import { parseSync } from 'oxc-parser';
import * as options from '../options.js';

// type Dirent = Awaited<ReturnType<typeof fs.readdir>>[number];
type WorkerData = {
	project_path: string;
	/** Identifiers worker exports from itself, making them available to window. */
	exports: Set<string>;
	/** Map of modules worker imports from window code to call and set of identifiers from those modules worker wants to call. */
	imports: Map<string, Set<string>>;
};

/** Imports that used by workers to call window code. */
export const workers_data: Map<string, WorkerData> = new Map<
	string,
	WorkerData
>();
/** Combined imports from all workers. */
export const workers_imports: Map<string, Set<string>> = new Map<
	string,
	Set<string>
>();

const WORKERS_DIR = nodePath.join(options.source_path, '+workers');

const promises: Promise<unknown>[] = [];
for (const entry of await fs.readdir(WORKERS_DIR, {
	withFileTypes: true,
})) {
	if (entry.isDirectory() !== true) {
		throw new Error(`Expected directory at "+workers/${entry.name}".`);
	}

	// oxlint-disable-next-line unicorn/prefer-top-level-await
	promises.push(scanWorker(entry.name));
}

await Promise.all(promises);

/** Scans worker files. */
async function scanWorker(worker_name: string) {
	const worker_dir = nodePath.join(WORKERS_DIR, worker_name);
	const worker_entries = await fs.readdir(worker_dir, {
		withFileTypes: true,
		recursive: true,
	});

	const worker_main_absolute_path = nodePath.join(worker_dir, '+worker.ts');
	const worker_main_project_path = worker_main_absolute_path.slice(
		options.source_path.length + 1,
	);

	workers_data.set(worker_name, {
		project_path: worker_main_project_path,
		imports: new Map<string, Set<string>>(),
		exports: new Set<string>(),
	});

	const promises_worker = [];
	for (const entry of worker_entries) {
		if (entry.isFile() === false) {
			continue;
		}

		const absolute_path = nodePath.join(entry.parentPath, entry.name);

		promises_worker.push(
			parseWorkerFile(
				worker_name,
				absolute_path,
				worker_main_absolute_path === absolute_path,
			),
		);
	}

	await Promise.all(promises_worker);
}

/** Parses a worker file. */
async function parseWorkerFile(
	worker_name: string,
	absolute_path: string,
	is_main: boolean,
) {
	const worker_data = workers_data.get(worker_name)!;

	const content = await fs.readFile(absolute_path, 'utf8');

	const { module } = parseSync(absolute_path, content);

	for (const import_ of module.staticImports) {
		let path = import_.moduleRequest.value;
		if (!path.startsWith('$src/')) {
			continue;
		}

		path = path.slice(5);

		// console.log('import', path);

		for (const import_entry of import_.entries) {
			if (import_entry.isType) {
				continue;
			}

			const { name } = import_entry.importName;

			if (name !== null) {
				if (!worker_data.imports.has(path)) {
					worker_data.imports.set(path, new Set<string>());
				}

				worker_data.imports.get(path)!.add(name);

				if (!workers_imports.has(path)) {
					workers_imports.set(path, new Set<string>());
				}

				workers_imports.get(path)!.add(name);
			}
		}
	}

	if (is_main) {
		for (const export_ of module.staticExports) {
			for (const export_entry of export_.entries) {
				if (export_entry.isType) {
					continue;
				}

				const { name } = export_entry.exportName;
				if (name === null) {
					continue;
				}

				worker_data.exports.add(name);
			}
		}
	}
}
