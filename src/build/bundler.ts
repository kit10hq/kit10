// oxlint-disable unicorn/no-process-exit

import nodePath from 'node:path';
import type { Loader, Metafile, OnLoadArgs } from 'esbuild';
import * as esbuild from 'esbuild';
import * as options from '../options.js';
import { createId } from '../utils.js';
import * as artifacts from './artifact.js';
import { Artifact } from './artifact.js';
import {
	esbuild_options,
	getAbsolutePathOnResolve,
	jsTsResolver,
} from './bundler/options.js';
import { createWorker, worker_files } from './bundler/worker.js';
import { applyPlugins } from './plugins.js';

const SENTINEL_PATH = `${createId()}.js`;

/** Returns esbuild loader by onLoad args. */
function getLoaderByOnLoadArgs(args: OnLoadArgs): Loader | undefined {
	switch (args.with.type) {
		case 'json':
			return 'json';
		case 'text':
			return 'text';
		case 'bytes':
			return 'binary';
		// no default
	}
}

/** Returns esbuild loader for the given path. */
function getLoaderByFilePath(path: string): Loader | undefined {
	switch (path.split('.').at(-1)) {
		case 'js':
		case 'mjs':
		case 'cjs':
			return 'js';
		case 'ts':
		case 'mts':
		case 'cts':
			return 'ts';
		case 'json':
			return 'json';
		case 'css':
			return 'css';
		case 'txt':
			return 'text';
		// no default
	}

	return 'copy';
}

const esbuildKit10Plugin: esbuild.Plugin = {
	name: 'kit10',
	setup(build) {
		// With "u" flag, we get "filter is not a valid Go regular expression" error
		// eslint-disable-next-line require-unicode-regexp
		build.onResolve({ filter: /.*/ }, async (args) => {
			// console.log(
			// 	'[esbuild]',
			// 	'[onResolve]',
			// 	args,
			// 	// describeImportSpecifier(args.path),
			// );

			if (args.path.startsWith('$workers/')) {
				return {
					path: args.path,
					namespace: 'worker',
				};
			}

			if (args.path.startsWith('$src/')) {
				return {
					path: args.path,
					namespace: 'worker-src',
				};
			}

			const absolute_path = await getAbsolutePathOnResolve(args);
			if (absolute_path === undefined) {
				return;
			}

			const absolute_path_ts = await jsTsResolver(absolute_path);
			return {
				path: absolute_path_ts ?? absolute_path,
				namespace: 'artifact',
			};
		});

		const tempArtifacts = new Set<Artifact>();

		// With "u" flag, we get "filter is not a valid Go regular expression" error
		// eslint-disable-next-line require-unicode-regexp
		build.onLoad({ filter: /.*/, namespace: 'artifact' }, async (args) => {
			const resolveDir = nodePath.dirname(args.path);

			if (args.path.includes(SENTINEL_PATH)) {
				return {
					contents: 'export default null;',
					loader: 'js',
					// resolveDir,
				};
			}

			const artifact = new Artifact(
				args.path.replace(options.source_path, '').slice(1),
			);
			tempArtifacts.add(artifact);

			// if (artifact.project_path.includes('worker')) {
			// 	console.log('[esbuild]', '[onLoad]', artifact.project_path);
			// }

			await applyPlugins([artifact]);

			const loader =
				getLoaderByOnLoadArgs(args)
				?? getLoaderByFilePath(artifact.project_path);
			if (loader === undefined) {
				// oxlint-disable-next-line no-console
				console.error(
					`No plugins given for compiling ".${artifact.ext}" files to bundle with esbuild (found "${args.path}").`,
				);
				process.exit(1);
			}

			return {
				contents: await artifact.text(),
				loader,
				resolveDir,
			};
		});

		// With "u" flag, we get "filter is not a valid Go regular expression" error
		// eslint-disable-next-line require-unicode-regexp
		build.onLoad({ filter: /.*/, namespace: 'worker' }, async (args) => {
			const match = args.path.match(/^\$workers\/(?<name>\+?[-a-z\d_]+)$/iu);
			if (!match) {
				// oxlint-disable-next-line no-console
				console.error(`Invalid worker import: ${args.path}`);
				process.exit(1);
			}

			const worker_name = match.groups!.name!;
			const artifacts_worker = await createWorker(worker_name);
			for (const artifact of artifacts_worker) {
				tempArtifacts.add(artifact);
			}

			return {
				contents: await artifacts_worker[0]!.text(),
				loader: 'ts',
				resolveDir: nodePath.join(options.source_path, '+workers', worker_name),
			};
		});

		// With "u" flag, we get "filter is not a valid Go regular expression" error
		// eslint-disable-next-line require-unicode-regexp
		build.onLoad({ filter: /.*/, namespace: 'worker-src' }, (args) => {
			const contents = worker_files.get(args.path);
			if (contents === undefined) {
				// oxlint-disable-next-line no-console
				console.error(`Invalid worker-src import: ${args.path}`);
				process.exit(1);
			}

			return {
				contents,
				loader: 'ts',
				resolveDir: options.source_path,
			};
		});

		build.onEnd(() => {
			for (const artifact of tempArtifacts) {
				if (!artifacts.collections.bundle.has(artifact)) {
					artifact.delete();
				}
			}
		});
	},
};

/** Runs JS/TS bundling */
export async function bundle(): Promise<void> {
	const paths = [];
	for (const artifact of artifacts.collections.bundle) {
		paths.push(artifact.absolute_path);
	}

	const result = await esbuild.build({
		...esbuild_options,
		plugins: [esbuildKit10Plugin],
		entryPoints: [nodePath.join(options.source_path, SENTINEL_PATH), ...paths],
		splitting: true,
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

	const metafile = processMetafile(result.metafile);

	for (const output of result.outputFiles) {
		if (output.path.includes(SENTINEL_PATH)) {
			continue;
		}

		const output_project_path = output.path.slice(1);
		const meta = metafile.get(output_project_path);
		if (meta === undefined) {
			throw new Error(`No metafile entry found for ${output_project_path}.`);
		}

		let artifact: Artifact;
		if (
			meta.project_path !== undefined
			&& artifacts.exists(meta.project_path)
		) {
			artifact = new Artifact(meta.project_path);
			artifact.updateFilename(output_project_path.split(nodePath.sep).at(-1)!);
		} else {
			artifact = new Artifact(output_project_path);
		}

		artifact.update(output.contents);

		artifacts.collections.bundle.add(artifact);
	}

	for (const [project_path, { imports }] of metafile) {
		const artifact = new Artifact(project_path);

		for (const imported_project_path of imports) {
			const importedArtifact = new Artifact(imported_project_path);
			artifact.link(importedArtifact);
		}
	}
}

type BundleOutputMetadata = {
	project_path?: string;
	imports: string[];
};

/** Processes the esbuild metafile. */
function processMetafile(
	metafile: Metafile,
): Map<string, BundleOutputMetadata> {
	const result = new Map<string, BundleOutputMetadata>();
	const output_prefix =
		nodePath.relative(esbuild_options.absWorkingDir, esbuild_options.outdir)
		+ '/';
	const output_entrypoint_prefix = `artifact:${esbuild_options.absWorkingDir}/`;

	for (const [output_path, output] of Object.entries(metafile.outputs)) {
		if (
			output_path.includes(SENTINEL_PATH)
			|| output_path.startsWith('data:')
		) {
			continue;
		}

		if (!output_path.startsWith(output_prefix)) {
			throw new Error(
				`Esbuild output "${output_path}" does not start with "${output_prefix}".`,
			);
		}

		const output_project_path = output_path.slice(output_prefix.length);

		// oxlint-disable-next-line no-unassigned-vars
		let project_path: string | undefined;
		if (output.entryPoint !== undefined) {
			if (output.entryPoint.startsWith(output_entrypoint_prefix) !== true) {
				throw new Error(
					`Esbuild entrypoint "${output.entryPoint}" does not start with "${output_entrypoint_prefix}": ${output.entryPoint}`,
				);
			}

			project_path = output.entryPoint.slice(output_entrypoint_prefix.length);

			// if (
			// 	nodePath.dirname(output_project_path) !== nodePath.dirname(project_path)
			// ) {
			// 	throw new Error(
			// 		`Esbuild moved "${project_path}" to "${output_project_path}", which is in another directory. This should not happen.`,
			// 	);
			// }
		}

		result.set(output_project_path, {
			project_path,
			imports: output.imports
				.filter((import_) => !import_.path.startsWith('data:'))
				.map((import_) => {
					if (!import_.path.startsWith(output_prefix)) {
						throw new Error(
							`Esbuild output import "${import_.path}" does not start with "${output_prefix}".`,
						);
					}

					return import_.path.slice(output_prefix.length);
				}),
		});
	}

	return result;
}
