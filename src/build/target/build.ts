import fs from 'node:fs/promises';
import nodePath from 'node:path';
import { build } from 'vite';
import * as buildOptions from '../options.js';
import { configPlugin } from '../plugins/config.js';
import { gzipPlugin } from '../plugins/gzip.js';
import { htmlMinifyPlugin } from '../plugins/html-minify.js';
import { jsInlinePlugin } from '../plugins/js-inline.js';
import { templatePlugin } from '../plugins/template.js';
import {
	preprocessBuildRoutes,
	virtualHtmlPlugin,
} from '../plugins/virtual-html.js';
import { routes } from '../router.js';
import { makeServer } from '../server.js';

await fs.rm(buildOptions.output_path, { recursive: true, force: true });
await fs.cp(
	nodePath.join(import.meta.dirname, '..', 'template', 'hono'),
	buildOptions.output_path,
	{ recursive: true },
);

await preprocessBuildRoutes(routes);

const input: Record<string, string> = {};
for (const route_data of routes) {
	const name = nodePath
		.relative(buildOptions.source_path, route_data.file.path)
		.replace(/\+page\.[a-z\d]+/u, '')
		.replaceAll('/', '_')
		.replaceAll('[', '(')
		.replaceAll(']', ')');
	input[name] = route_data.file.path;
}

await build({
	root: buildOptions.source_path,
	configFile: false,
	appType: 'custom',
	plugins: [
		configPlugin(),
		virtualHtmlPlugin(),
		templatePlugin(),
		...buildOptions.vitePlugins,
		jsInlinePlugin(),
		htmlMinifyPlugin(),
		gzipPlugin(),
	],
	build: {
		outDir: buildOptions.output_static_path,
		emptyOutDir: true,
		manifest: true,
		rolldownOptions: {
			input,
			output: {
				assetFileNames: 'assets/[name]-[hash][extname]',
				chunkFileNames: 'assets/chunks/[name]-[hash].js',
				entryFileNames: 'assets/[name]-[hash].js',
			},
		},
	},
});

await makeServer();
