// oxlint-disable unicorn/no-process-exit

import fs from 'node:fs/promises';
import nodePath from 'node:path';
import * as env from '../env.js';
import * as options from '../options.js';
import {
	type Artifact,
	artifact_collections,
	createArtifact,
} from './artifact.js';
import {
	htmlScanImportsPlugin,
	htmlWriteImportsPlugin,
} from './plugins/html/imports.js';
import { htmlTemplatePlugin } from './plugins/html/template.js';
import { applyPlugins } from './plugins.js';
import { getRoutes } from './router/file-tree.js';

/** A map of routes to their corresponding Artifact instances. */
export const app_routes = new Map<string, Artifact>();

/**
 * Returns a list of TempFile instances for the app entrypoints.
 * @returns -
 */
export async function parseEntrypoints(): Promise<void> {
	const routes_data = getRoutes(options.source_path);
	// console.log(routes);

	const promises = [];
	for (const route_data of routes_data) {
		const static_path = nodePath.relative(
			options.source_path,
			route_data.file.path,
		);
		const artifact = createArtifact(static_path);
		if (artifact.ext === 'html') {
			artifact_collections.html.add(artifact);
		} else {
			artifact_collections.pre_html.add(artifact);
		}

		app_routes.set(route_data.route, artifact);

		promises.push(artifact.load());
	}

	await Promise.all(promises);
}

/** Writes router files to the output directory. */
export async function flushRouter() {
	// copy template directory as dist
	await fs.cp(env.kit10_template_path, options.output_path, {
		recursive: true,
	});

	// update main.js with app routes
	{
		const app_routes_js = [];
		for (const [route, artifact] of app_routes.entries()) {
			app_routes_js.push(
				`app.get('${route}', (c) => handler(c, '${artifact.path}'));`,
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
