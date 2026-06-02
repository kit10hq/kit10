// oxlint-disable unicorn/no-process-exit

import fs from 'node:fs/promises';
import nodePath from 'node:path';
import * as env from '../env.js';
import * as options from '../options.js';
import { getRoutes } from './router/file-tree.js';
import { TempFile } from './temp-file.js';

export const app_routes: string[] = [];

/**
 * Returns a list of TempFile instances for the app entrypoints.
 * @returns -
 */
export function getEntrypoints(): Promise<TempFile[]> {
	const routes_data = getRoutes(options.source_path);
	// console.log(routes);

	const tempFile_promises = [];
	for (const route_data of routes_data) {
		if (route_data.file.ext !== 'html') {
			// oxlint-disable-next-line no-console
			console.error(
				`Unsupported file type "${route_data.file.ext}" for page file ${route_data.file.path}.`,
			);
			process.exit(1);
		}

		const static_path = nodePath.relative(
			options.source_path,
			route_data.file.path,
		);

		app_routes.push(
			`app.get('${route_data.route}', (c) => handler(c, '${static_path}'));`,
		);

		tempFile_promises.push(TempFile.load(static_path));
	}

	return Promise.all(tempFile_promises);
}

/** Writes router files to the output directory. */
export async function writeRouter() {
	// copy template directory as dist
	await fs.cp(env.kit10_template_path, options.output_path, {
		recursive: true,
	});

	// update main.js with app routes
	{
		const PATH_MAIN = nodePath.join(options.output_path, 'main.js');
		let contents = await fs.readFile(PATH_MAIN, 'utf8');
		contents = contents
			.replace('// MARK: app', app_routes.join('\n'))
			.replace('port: 0,', `port: ${options.config.server?.port ?? 3000},`);
		await fs.writeFile(PATH_MAIN, contents, 'utf8');
	}
}
