import * as fs from 'node:fs/promises';
import nodePath from 'node:path';
import * as buildOptions from '../options.js';

const directories_created = new Set<string>();
const directories_creating = new Map<string, Promise<unknown>>();

await fs.mkdir(buildOptions.output_static_path, { recursive: true });

/** Returns all directories containing given path. */
function getDirectories(project_dir: string): Set<string> {
	const result = new Set<string>();

	let project_dir_created: string | undefined;
	for (const part of project_dir.split(nodePath.sep)) {
		project_dir_created =
			project_dir_created === undefined
				? part
				: nodePath.join(project_dir_created, part);

		result.add(project_dir_created);
	}

	return result;
}

/** Creates directory and dedupes directory creation requests. */
export function createDirectory(
	project_dir: string,
): unknown | Promise<unknown> {
	if (project_dir === '.') {
		return;
	}

	if (directories_created.has(project_dir)) {
		// console.log(
		// 	`[createDirectory] "${project_dir}" already exists, skipping...`,
		// );
		return;
	}

	if (directories_creating.has(project_dir)) {
		// console.log(
		// 	`[createDirectory] "${project_dir}" is already being created, deduping...`,
		// );
		return directories_creating.get(project_dir)!;
	}

	const project_dir_list = getDirectories(project_dir);

	// console.log(`[createDirectory] creating "${project_dir}"...`);
	const promise = fs.mkdir(
		nodePath.join(buildOptions.output_static_path, project_dir),
		{
			recursive: true,
		},
	);
	for (const dir of project_dir_list) {
		directories_creating.set(dir, promise);
	}

	// eslint-disable-next-line promise/catch-or-return
	promise.then(() => {
		// eslint-disable-next-line promise/always-return
		for (const dir of project_dir_list) {
			directories_created.add(dir);
			directories_creating.delete(dir);

			// console.log(`[createDirectory] [!] created "${dir}"`);
		}
	});

	return promise;
}

/** Clear the dist directory. */
export async function clearDistDirectory(): Promise<void> {
	const entries = await fs.readdir(buildOptions.output_path, {
		withFileTypes: true,
	});
	const promises = [];

	for (const entry of entries) {
		promises.push(
			fs.rm(nodePath.join(buildOptions.output_path, entry.name), {
				recursive: true,
			}),
		);
	}

	await Promise.all(promises);
}
