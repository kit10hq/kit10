import fs from 'node:fs/promises';
import nodePath from 'node:path';
import * as artifacts from './artifact.js';
// import * as env from '../env.js';
import { Artifact } from './artifact.js';
import * as options from './options.js';
import { getRoutes } from './router/file-tree.js';

/** A map of routes to their corresponding Artifact instances. */
export const app_routes: Map<string, Artifact> = new Map<string, Artifact>();

/**
 * Returns a list of TempFile instances for the app entrypoints.
 */
export function processEntrypoints(): void {
	const routes_data = getRoutes(options.source_path);
	// console.log('routes_data', routes_data);

	for (const route_data of routes_data) {
		const artifact = new Artifact(
			nodePath.relative(options.source_path, route_data.file.absolute_path),
		);

		app_routes.set(route_data.route, artifact);

		if (artifact.ext === 'html') {
			artifacts.collections.html.add(artifact);
		} else {
			artifacts.collections.pre_html.add(artifact);
		}
	}

	// console.log('app_routes', app_routes);
}

/** Writes router files to the output directory. */
export async function flushRouter(): Promise<void> {
	// copy template directory as dist
	await fs.cp(
		nodePath.join(import.meta.dirname, '../template/hono'),
		options.output_path,
		{
			recursive: true,
		},
	);

	// update main.js with app routes
	{
		const app_routes_js = [];
		for (const [route, artifact] of app_routes.entries()) {
			app_routes_js.push(
				`app.get('${route}', serveFile('/${artifact.project_path}'));`,
			);
		}

		const PATH_MAIN = nodePath.join(options.output_path, 'main.js');
		let contents = await fs.readFile(PATH_MAIN, 'utf8');
		contents = contents
			.replace('// MARK: app', app_routes_js.join('\n'))
			.replace('port: 0,', `port: ${options.config.server?.port ?? 3000},`);
		await fs.writeFile(PATH_MAIN, contents, 'utf8');
	}
}
