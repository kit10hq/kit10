// oxlint-disable unicorn/no-process-exit

import fs from 'node:fs/promises';
import nodePath from 'node:path';
import type { BuildOptions, Loader, Metafile, OnLoadArgs } from 'esbuild';
import * as esbuild from 'esbuild';
import { createId } from '../utils.js';
import * as artifacts from './artifact.js';
import { Artifact } from './artifact.js';
import * as buildOptions from './options.js';
import { applyPlugins } from './plugins.js';
import { describeImportSpecifier } from './utils.js';

// make type from BuildOptions that requires properties absWorkingDir and outdir
type Kit10EsbuildOpions = BuildOptions &
	Required<Pick<BuildOptions, 'absWorkingDir' | 'outdir'>> & { metafile: true };

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
}

const esbuildTsJsResolverPlugin: esbuild.Plugin = {
	name: 'ts-js-resolver',
	setup(build) {
		// With "u" flag, we get "filter is not a valid Go regular expression" error
		// eslint-disable-next-line require-unicode-regexp
		build.onResolve({ filter: /^\..*\.js$/ }, async (args) => {
			const tsPath = nodePath.resolve(
				args.resolveDir,
				args.path.replace(/\.js$/u, '.ts'),
			);

			try {
				await fs.access(tsPath);
				return { path: tsPath };
			} catch {
				return null; // let esbuild handle it normally
			}
		});
	},
};

const esbuildKit10Plugin: esbuild.Plugin = {
	name: 'kit10',
	setup(build) {
		// With "u" flag, we get "filter is not a valid Go regular expression" error
		// eslint-disable-next-line require-unicode-regexp
		build.onResolve({ filter: /.*/ }, (args) => {
			// console.log(
			// 	'[esbuild]',
			// 	'[onResolve]',
			// 	args,
			// 	describeImportSpecifier(args.path),
			// );

			// ignore if imported path does not point to a local file
			if (!describeImportSpecifier(args.path).local) {
				return;
			}

			const absolute_path =
				args.importer.length === 0
					? args.path
					: nodePath.join(nodePath.dirname(args.importer), args.path);
			// ignore all files that are not from the source path
			if (!absolute_path.startsWith(buildOptions.source_path)) {
				return;
			}

			// we should not ignore anything else (for example, non-artifact files), because esbuild should support any files we import.
			// in project source directory, any files can exist. we need to compile them with user plugins.
			// outside, all files should be conventional, that esbuild support natively.

			return {
				path: absolute_path,
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
					resolveDir,
				};
			}

			const artifact = new Artifact(
				args.path.replace(buildOptions.source_path, '').slice(1),
			);
			tempArtifacts.add(artifact);

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

	const esbuild_options = {
		absWorkingDir: buildOptions.source_path,
		plugins: [esbuildTsJsResolverPlugin, esbuildKit10Plugin],
		entryPoints: [
			nodePath.join(buildOptions.source_path, SENTINEL_PATH),
			...paths,
		],
		outdir: '/',
		//
		bundle: true,
		chunkNames: 'js/chunks/[hash]',
		format: 'esm',
		metafile: true,
		minify: buildOptions.is_prod,
		splitting: true,
		write: false,
	} satisfies Kit10EsbuildOpions;

	const result = await esbuild.build(esbuild_options);
	if (result.errors.length > 0) {
		// oxlint-disable-next-line no-console
		console.error('esbuild errors:');
		for (const error of result.errors) {
			// oxlint-disable-next-line no-console
			console.error(error.text);
		}

		process.exit(1);
	}

	const metafile = processMetafile(esbuild_options, result.metafile);

	for (const output of result.outputFiles) {
		// console.log('esbuild result', output.path);
		if (output.path.includes(SENTINEL_PATH)) {
			continue;
		}

		const output_project_path = output.path.slice(1);
		// console.log('output path', output.path);
		const meta = metafile.get(output_project_path);
		if (meta === undefined) {
			throw new Error(`No metafile entry found for ${output_project_path}.`);
		}

		// const artifact_path = meta.project_path ?? output_project_path;
		const artifact = new Artifact(meta.project_path ?? output_project_path);
		if (artifact.project_path !== output_project_path) {
			artifact.updateFilename(output_project_path.split(nodePath.sep).at(-1)!);
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
	esbuild_options: Kit10EsbuildOpions,
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

			if (
				nodePath.dirname(output_project_path) !== nodePath.dirname(project_path)
			) {
				throw new Error(
					`Esbuild moved "${project_path}" to "${output_project_path}", which is in another directory. This should not happen.`,
				);
			}
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
