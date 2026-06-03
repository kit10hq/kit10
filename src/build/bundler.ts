// oxlint-disable unicorn/no-process-exit

import nodePath from 'node:path';
import type { BunPlugin } from 'bun';
import * as options from '../options.js';
import { createId } from '../utils.js';
import { type Artifact, createArtifact, isArtifactAt } from './artifact.js';
import { applyPlugins } from './plugins.js';

const SENTINEL_PATH = `${createId()}.js`;
export const paths = new Set<string>();

const bundlerPlugin: BunPlugin = {
	name: 'kit10',
	setup(build) {
		// With "u" flag, we get "filter is not a valid Go regular expression" error
		// eslint-disable-next-line require-unicode-regexp
		build.onResolve({ filter: /.*/ }, (args) => {
			console.log('bundler onResolve', args);
			if (args.path === SENTINEL_PATH || isArtifactAt(args.path)) {
				return {
					path: args.path,
					namespace: 'artifact',
				};
			} else if (args.path.startsWith('.')) {
				console.log(
					nodePath.join(
						nodePath.dirname(nodePath.join(options.source_path, args.importer)),
						args.path,
					),
				);
				return {
					path: nodePath.join(
						nodePath.dirname(nodePath.join(options.source_path, args.importer)),
						args.path,
					),
				};
			}
		});

		// With "u" flag, we get "filter is not a valid Go regular expression" error
		// eslint-disable-next-line require-unicode-regexp
		build.onLoad({ filter: /.*/, namespace: 'artifact' }, (args) => {
			return {
				contents:
					args.path === SENTINEL_PATH
						? 'export default null;'
						: createArtifact(args.path).text(),
				loader: 'ts',
				resolveDir: nodePath.dirname(args.path),
			};
		});

		const known_exts = new Set([
			'js',
			'mjs',
			'cjs',
			'ts',
			'mts',
			'cts',
			'json',
		]);
		const tempArtifacts = new Set<Artifact>();

		// With "u" flag, we get "filter is not a valid Go regular expression" error
		// eslint-disable-next-line require-unicode-regexp
		build.onLoad({ filter: /.*/ }, async (args) => {
			console.log('bundler onLoad', args);
			const ext = args.path.slice(args.path.lastIndexOf('.'));
			if (!known_exts.has(ext) && args.path.startsWith(options.source_path)) {
				// console.log('bundler onLoad', args);
				const artifact = createArtifact(args.path);
				if (args.namespace !== 'artifact') {
					tempArtifacts.add(artifact);
				}

				if (!artifact.is_loaded) {
					await artifact.load();
				}

				await applyPlugins([artifact], options.config.plugins);

				if (!known_exts.has(artifact.ext)) {
					// oxlint-disable-next-line no-console
					console.error(
						`No plugins given for compiling ".${artifact.ext}" files to bundle JavaScript/TypeScript (found "${args.path}").`,
					);
					process.exit(1);
				}

				return {
					contents: artifact.text(),
					loader: 'ts',
					resolveDir: nodePath.dirname(args.path),
				};
			}
		});

		build.onEnd(() => {
			for (const artifact of tempArtifacts) {
				artifact.delete();
			}
		});
	},
};

/** Runs JS/TS bundling */
export async function bundle() {
	const result = await Bun.build({
		// root: options.source_path,
		plugins: [bundlerPlugin],
		entrypoints: [SENTINEL_PATH, ...paths],
		//
		format: 'esm',
		minify: options.is_prod,
		naming: {
			chunk: 'js/chunks/[hash].js',
		},
		splitting: true,
	});

	for (const output of result.outputs) {
		const static_path = nodePath.resolve('/', output.path).slice(1);
		if (static_path !== SENTINEL_PATH) {
			createArtifact(static_path).update(await output.text());
		}
	}
}
