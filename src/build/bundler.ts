// oxlint-disable unicorn/no-process-exit

import * as esbuild from 'esbuild';
import { createId, isLocalPath } from '../utils.js';
import * as artifacts from './artifact.js';
import { Artifact } from './artifact.js';
import * as options from './options.js';
import { applyPlugins } from './plugins.js';

const SENTINEL_PATH = `${createId()}.js`;
const JS_EXTS = new Set(['mjs', 'cjs', 'ts', 'mts', 'cts']);
const KNOWN_EXTS = new Set(['js', ...JS_EXTS, 'json']);

const esbuildPlugin: esbuild.Plugin = {
	name: 'kit10',
	setup(build) {
		// With "u" flag, we get "filter is not a valid Go regular expression" error
		// eslint-disable-next-line require-unicode-regexp
		build.onResolve({ filter: /.*/ }, (args) => {
			if (isLocalPath(args.path)) {
				return {
					path: args.path,
					namespace: 'artifact',
				};
			}
		});

		const bundleArtifacts = new Set<Artifact>();

		// With "u" flag, we get "filter is not a valid Go regular expression" error
		// eslint-disable-next-line require-unicode-regexp
		build.onLoad({ filter: /.*/, namespace: 'artifact' }, async (args) => {
			let contents: string;
			if (args.path === SENTINEL_PATH) {
				contents = 'export default null;';
			} else {
				const artifact = new Artifact(
					args.path.startsWith('./') ? args.path.slice(2) : args.path,
				);
				bundleArtifacts.add(artifact);

				if (
					!KNOWN_EXTS.has(artifact.ext)
					&& isLocalPath(args.path)
					&& args.path.startsWith(options.source_path)
				) {
					await applyPlugins([artifact]);

					if (!KNOWN_EXTS.has(artifact.ext)) {
						// oxlint-disable-next-line no-console
						console.error(
							`No plugins given for compiling ".${artifact.ext}" files to bundle JavaScript/TypeScript (found "${args.path}").`,
						);
						process.exit(1);
					}
				}

				contents = await artifact.text();

				if (JS_EXTS.has(artifact.ext)) {
					artifact.updateExt('js');
				}
			}

			return {
				contents,
				loader: 'ts',
			};
		});

		build.onEnd(() => {
			for (const artifact of bundleArtifacts) {
				if (!artifacts.collections.js.has(artifact)) {
					artifact.delete();
				}
			}
		});
	},
};

/** Runs JS/TS bundling */
export async function bundle(): Promise<void> {
	const paths = [];
	for (const artifact of artifacts.collections.js) {
		paths.push(artifact.project_path);
	}

	const result = await esbuild.build({
		absWorkingDir: options.source_path,
		plugins: [esbuildPlugin],
		entryPoints: [SENTINEL_PATH, ...paths],
		outdir: '/',
		//
		bundle: true,
		chunkNames: 'js/chunks/[hash]',
		format: 'esm',
		minify: options.is_prod,
		splitting: true,
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

	for (const output of result.outputFiles) {
		const static_path = output.path.slice(1);
		if (static_path !== SENTINEL_PATH) {
			const artifact = new Artifact(static_path);
			artifact.update(output.contents);

			artifacts.collections.js.add(artifact);
		}
	}

	// FIXME: add artifacts as dependencies to each other
}
