// oxlint-disable unicorn/no-process-exit

import nodePath from 'node:path';
import { build, type Plugin } from 'esbuild';
import * as options from '../options.js';
import { TempFile } from './temp-file.js';

const SENTINEL_PATH = '.sentinel.js';
export const entrypoints = new Set<string>();

const tempFilePlugin: Plugin = {
	name: 'temp-file',
	setup(build) {
		// With "u" flag, we get "filter is not a valid Go regular expression" error
		// eslint-disable-next-line require-unicode-regexp
		build.onResolve({ filter: /.*/ }, (args) => {
			if (args.path === SENTINEL_PATH || TempFile.exists(args.path)) {
				return {
					path: args.path,
					namespace: 'temp-file',
				};
			}
		});

		// With "u" flag, we get "filter is not a valid Go regular expression" error
		// eslint-disable-next-line require-unicode-regexp
		build.onLoad({ filter: /.*/, namespace: 'temp-file' }, (args) => {
			return {
				contents:
					args.path === SENTINEL_PATH
						? 'export default null;'
						: new TempFile(args.path).text(),
				loader: 'ts',
				resolveDir: nodePath.dirname(args.path),
			};
		});
	},
};

/** Runs JS/TS bundling */
export async function esbuild() {
	const result = await build({
		absWorkingDir: options.source_path,
		plugins: [tempFilePlugin],
		entryPoints: [SENTINEL_PATH, ...entrypoints],
		bundle: true,
		outdir: '/',
		chunkNames: 'chunks/[name]-[hash]',
		format: 'esm',
		write: false,
	});
	if (result.errors.length > 0) {
		// oxlint-disable-next-line no-console
		console.error('esbuild errors:');
		for (const error of result.errors) {
			// oxlint-disable-next-line no-console
			console.error(error.text);
		}

		process.exit(1);
	}

	// console.log('esbuild', result);

	for (const artifact of result.outputFiles) {
		const static_path = artifact.path.slice(1);
		if (static_path !== SENTINEL_PATH) {
			new TempFile(static_path).update(artifact.text);
		}
	}
}
