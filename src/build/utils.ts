import fs from 'node:fs/promises';
import nodePath from 'node:path';
import { createPathsMatcher, getTsconfig } from 'get-tsconfig';
import * as buildOptions from './options.js';

const tsconfig = getTsconfig(buildOptions.project_path);
const matchPath = tsconfig ? createPathsMatcher(tsconfig) : undefined;

/** Checks if path points to a file in the project. */
export function isFileImportSpecifier(specifier: string): boolean {
	// Relative/absolute paths
	if (
		specifier.startsWith('./')
		|| specifier.startsWith('../')
		|| specifier.startsWith('/')
		|| /^[a-z]:[\\/]/iu.test(specifier)
	) {
		return true;
	}

	// file: URLs
	if (specifier.startsWith('file:')) {
		return true;
	}

	// Other URL schemes
	if (/^[a-z][a-z\d+.-]*:/iu.test(specifier)) {
		return false;
	}

	// Import-map/internal specifiers
	if (specifier.startsWith('#')) {
		return false;
	}

	// TS path aliases
	if (matchPath?.(specifier)?.length) {
		return true;
	}

	// Bare package specifier
	return false;
}

/** Returns the path to a file imported from another file. */
export function getRelativeProjectPath(
	project_path: string,
	relative_path: string,
): string {
	if (!isFileImportSpecifier(relative_path)) {
		throw new Error(`Can not resolve non-local path: ${relative_path}`);
	}

	return relative_path.startsWith('/')
		? relative_path.slice(1)
		: nodePath.join(nodePath.dirname(project_path), relative_path);
}
