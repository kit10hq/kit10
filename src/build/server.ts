import fs from 'node:fs/promises';
import nodePath from 'node:path';
import * as buildOptions from './options.js';
import { routes } from './router.js';

/** Configures the production server. */
export async function makeServer(): Promise<void> {
	const app_routes_js = [];
	for (const route_data of routes) {
		app_routes_js.push(
			`app.get('${route_data.route}', serveFile('${route_data.file.path.replace(buildOptions.source_path, '')}'));`,
		);
	}

	const PATH_MAIN = nodePath.join(buildOptions.output_path, 'main.js');
	let contents = await fs.readFile(PATH_MAIN, 'utf8');
	contents = contents
		.replace('// MARK: app', app_routes_js.join('\n'))
		.replace('port: 0,', `port: ${buildOptions.config.server?.port ?? 3000},`);

	await fs.writeFile(PATH_MAIN, contents, 'utf8');
}
