// oxlint-disable unicorn/no-process-exit

import fs from 'node:fs/promises';
import nodePath from 'node:path';
import { build, type Plugin } from 'esbuild';
import * as options from './options.js';
import { getRoutes } from './router/file-tree.js';

const routes = getRoutes(options.source_path);
// console.log(routes);

const hono_app_routes = [];

const promises_cp = [];
for (const route of routes) {
	if (route.file.ext !== 'html') {
		// oxlint-disable-next-line no-console
		console.error(
			`Unsupported file type "${route.file.ext}" for page file ${route.file.path}.`,
		);
		process.exit(1);
	}

	const file_path = nodePath.relative(options.source_path, route.file.path);

	hono_app_routes.push(
		`app.get('${route.route}', (c) => handler(c, '${file_path}'));`,
	);

	promises_cp.push(
		fs.cp(
			route.file.path,
			nodePath.join(options.output_static_path, file_path),
		),
	);
}

const template_path = nodePath.join(
	import.meta.dirname,
	'..',
	'template',
	'hono',
);

promises_cp.push(
	fs.cp(template_path, options.output_path, { recursive: true }),
);

await Promise.all(promises_cp);

{
	const PATH_MAIN = nodePath.join(options.output_path, 'main.js');
	let contents = await fs.readFile(PATH_MAIN, 'utf8');
	contents = contents
		.replace('// MARK: app', hono_app_routes.join('\n'))
		.replace('port: 0,', `port: ${options.config.server?.port ?? 11920},`);
	await fs.writeFile(PATH_MAIN, contents, 'utf8');
}

// const result = await build({
// 	// plugins: [html_plugin],
// 	//
// 	entryPoints: [],
// 	// [nodePath.join(options.source_path, '**', '*.page.html')],
// 	outdir: options.output_path,
// 	//
// 	chunkNames: 'chunks/[name]-[hash]',
// 	//
// 	bundle: true,
// 	format: 'esm',
// 	keepNames: true,
// 	// metafile: true,
// });
// console.log(result);
