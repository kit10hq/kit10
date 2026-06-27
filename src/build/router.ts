import fs from 'node:fs/promises';
import nodePath from 'node:path';
import * as options from '../options.js';
import * as artifacts from './artifact.js';
import { Artifact } from './artifact.js';
import * as buildOptions from './options.js';
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
		nodePath.join(
			import.meta.dirname,
			'../template/server',
			buildOptions.server_runtime,
		),
		buildOptions.output_path,
		{
			recursive: true,
		},
	);

	const server_port =
		(buildOptions.is_prod ? buildOptions.config.server?.port : null) ?? 3000;

	// update main.js with app routes
	if (buildOptions.server_runtime === 'hono') {
		const app_routes_js = [];
		for (const [route, artifact] of app_routes.entries()) {
			app_routes_js.push(
				`app.get('${route}', serveFile('/${artifact.project_path}'));`,
			);
		}

		const PATH_MAIN = nodePath.join(buildOptions.output_path, 'main.js');
		let contents = await fs.readFile(PATH_MAIN, 'utf8');
		contents = contents
			.replaceAll(
				/[/.]+\/src\/reexports\/(?<name>[a-z]+)\.js/gu,
				'kit10/$<name>',
			)
			.replace(
				'const LINK_HEADERS = {};',
				`const LINK_HEADERS = ${JSON.stringify(artifacts.link_headers)};`,
			)
			.replace('// MARK: app', app_routes_js.join('\n'))
			.replace('port: 0,', `port: ${server_port},`);

		if (buildOptions.is_prod) {
			while (true) {
				const index_ws_start = contents.indexOf('// MARK: devserver\n');
				if (index_ws_start === -1) {
					break;
				}

				const index_ws_end = contents.indexOf('// MARK: devserver end\n');
				contents =
					contents.slice(0, index_ws_start) + contents.slice(index_ws_end + 22);
			}
		}

		await fs.writeFile(PATH_MAIN, contents, 'utf8');
	} else if (buildOptions.server_runtime === 'nginx') {
		const app_routes_map = [];
		for (const [route, artifact] of app_routes.entries()) {
			const nginx_path = `/${artifact.project_path}`;
			if (
				`${route}+page.html` === nginx_path
				|| `${route}/index+page.html` === nginx_path
			) {
				continue;
			}

			app_routes_map.push(`~^${route}$ ${nginx_path};`);
		}

		const config_http_path = nodePath.join(
			buildOptions.output_path,
			'http.conf',
		);
		const config_server_path = nodePath.join(
			buildOptions.output_path,
			'server.conf',
		);

		let [contents_http, contents_server] = await Promise.all([
			fs.readFile(config_http_path, 'utf8'),
			fs.readFile(config_server_path, 'utf8'),
		]);

		contents_http = contents_http
			.replace(
				'# MARK: link headers',
				Object.entries(artifacts.link_headers)
					.map(
						([file, link_header]) => `/${file} ${JSON.stringify(link_header)};`,
					)
					.join('\n\t'),
			)
			.replace('# MARK: routes', app_routes_map.join('\n\t'));

		contents_server = contents_server.replace(
			'listen 3000;',
			`listen ${server_port};`,
		);

		await Promise.all([
			fs.writeFile(config_http_path, contents_http, 'utf8'),
			fs.writeFile(config_server_path, contents_server, 'utf8'),
		]);
	}
}
