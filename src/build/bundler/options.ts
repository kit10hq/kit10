import fs from 'node:fs/promises';
import nodePath from 'node:path';
import type { BuildOptions, OnResolveArgs, Plugin } from 'esbuild';
import * as options from '../../options.js';
import * as buildOptions from '../options.js';
import { describeImportSpecifier, matchPath } from '../utils.js';

export const esbuild_options = {
	absWorkingDir: options.source_path,
	outdir: '/',
	//
	bundle: true,
	chunkNames: 'js/chunks/[hash]',
	format: 'esm',
	metafile: true,
	minify: buildOptions.is_prod,
	write: false,
} satisfies BuildOptions;

/** Checks if the given path exists and returns the corresponding TypeScript path if it does. */
export async function jsTsResolver(path: string): Promise<string | undefined> {
	const path_ts = path.replace(/\.js$/u, '.ts');

	try {
		await fs.access(path_ts);
		return path_ts;
	} catch {
		// let esbuild handle it normally
	}
}

export const esbuildTsJsResolverPlugin: Plugin = {
	name: 'ts-js-resolver',
	setup(build) {
		// With "u" flag, we get "filter is not a valid Go regular expression" error
		// eslint-disable-next-line require-unicode-regexp
		build.onResolve({ filter: /\.js$/ }, async (args) => {
			if (!describeImportSpecifier(args.path).local) {
				return;
			}

			const path_ts = await jsTsResolver(
				nodePath.resolve(args.resolveDir, args.path),
			);
			if (path_ts !== undefined) {
				return { path: path_ts };
			}
		});
	},
};

/** Resolves import to a file, if it points to source file. */
export async function getAbsolutePathOnResolve(args: OnResolveArgs) {
	const importSpecifier = describeImportSpecifier(args.path);
	// ignore if imported path does not point to a local file (like "vue", "@vue/reactivity")
	if (!importSpecifier.local) {
		return;
	}

	let absolute_path: string;
	if (importSpecifier.type === 'alias') {
		// console.log('[esbuild]', '[onResolve]', 'alias', args.path);
		const match = matchPath!(args.path);
		if (match.length !== 1) {
			throw new Error(
				`Kit10 does not support multiple matches for TypeScript aliases (found for "${args.path}").`,
			);
		}

		if (match[0] === undefined) {
			return;
		}

		const absolute_path_ts = await jsTsResolver(match[0]);
		absolute_path = absolute_path_ts ?? match[0];
	} else {
		// absolute_path =
		// 	args.importer.length === 0
		// 		? args.path
		// 		: nodePath.join(nodePath.dirname(args.importer), args.path);
		absolute_path =
			args.resolveDir.length === 0 || args.path.startsWith('/')
				? args.path
				: nodePath.join(args.resolveDir, args.path);
	}

	// ignore all files that are not from the source path (like "vue" resolved to actual file, which is in "node_modules", not "src")
	if (!absolute_path.startsWith(options.source_path)) {
		return;
	}

	// console.log('[esbuild]', '[onResolve]', args.path);

	// we should not ignore anything else (for example, non-artifact files), because esbuild should support any files we import.
	// in project source directory, any files can exist. we need to compile them with user plugins.
	// outside, all files should be conventional, that esbuild support natively.

	return absolute_path;
}
