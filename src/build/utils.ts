import nodePath from 'node:path';
import { createPathsMatcher, getTsconfig } from 'get-tsconfig';
import * as buildOptions from './options.js';

const tsconfig = getTsconfig(buildOptions.project_path);
const matchPath = tsconfig ? createPathsMatcher(tsconfig) : undefined;

/** Checks if path points to a file in the project. */
export function describeImportSpecifier(
	specifier: string,
	mode: 'ts' | 'html' = 'ts',
): {
	local: boolean;
	type:
		| 'path'
		| 'path-slashless'
		| 'url'
		| 'url-file'
		| 'shebang'
		| 'alias'
		| 'package';
} {
	// Relative/absolute paths
	if (
		specifier.startsWith('./')
		|| specifier.startsWith('../')
		|| specifier.startsWith('/')
		// || /^[a-z]:[\\/]/iu.test(specifier)
	) {
		return {
			local: true,
			type: 'path',
		};
	}

	if (specifier.startsWith('file:')) {
		return {
			local: true,
			type: 'url-file',
		};
	}

	// URL schemes
	if (/^[a-z][a-z\d+.-]*:/iu.test(specifier)) {
		return {
			local: false,
			type: 'url',
		};
	}

	// if this path was imported in ts/js, we have separate rules
	// for example, we treat "js/file.js" as a package import, not the same as "./js/file.js"
	if (mode === 'ts') {
		// Import-map/internal specifiers
		if (specifier.startsWith('#')) {
			throw new Error(`Shebang paths are not supported: "${specifier}".`);
			// return {
			// 	local: false,
			// 	type: 'shebang',
			// };
		}

		// TS path aliases
		if (matchPath?.(specifier)?.length) {
			throw new Error(`Alias paths are not supported: "${specifier}".`);
			// return {
			// 	local: true,
			// 	type: 'alias',
			// };
		}

		// Bare package specifier
		return {
			local: false,
			type: 'package',
		};
	}

	// if mode is html, we treat "js/file.js" as a local file import
	return {
		local: true,
		type: 'path-slashless',
	};
}

/** Returns the path to a file imported from another file. */
export function resolveProjectPath(
	base_project_path: string,
	relative_path: string,
	// mode: 'ts' | 'html' = 'ts',
): string {
	// if (!isLocalFileImport(relative_path, mode)) {
	// 	throw new Error(`Can not resolve non-local path: ${relative_path}`);
	// }
	// const { local } = describeImportSpecifier(relative_path, mode);
	// if (!local) {
	// 	throw new Error(`Can not resolve non-local path: ${relative_path}`);
	// }

	return relative_path.startsWith('/')
		? relative_path.slice(1)
		: nodePath.join(nodePath.dirname(base_project_path), relative_path);
}
