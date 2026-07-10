import nodePath from 'node:path';
import { parseSync } from 'oxc-parser';

/** Scans JavaScript code and absolutifies import paths. */
export function rewriteImports(project_path: string, code: string): string {
	// console.log('project_path', project_path);
	const dirname = nodePath.dirname('/' + project_path);
	// console.log('dirname', dirname);
	const ast = parseSync(project_path, code);

	let position_delta = 0;

	for (const import_ of ast.module.staticImports) {
		const { value: path, start, end } = import_.moduleRequest;
		// console.log('[static] path', path);

		const absolute_path = nodePath.normalize(nodePath.join(dirname, path));
		// console.log('[static] absolute_path', absolute_path);

		const substring = JSON.stringify(absolute_path);

		code =
			code.slice(0, start + position_delta)
			+ substring
			+ code.slice(end + position_delta);
		position_delta += substring.length - (end - start);
	}

	for (const import_ of ast.module.dynamicImports) {
		const { start, end } = import_.moduleRequest;
		// extract path without quotes
		const path = code.slice(
			start + 1 + position_delta,
			end - 1 + position_delta,
		);
		// console.log('[dynamic] path', path);

		const absolute_path = nodePath.normalize(nodePath.join(dirname, path));
		// console.log('[static] absolute_path', absolute_path);

		const substring = JSON.stringify(absolute_path);

		code =
			code.slice(0, start + position_delta)
			+ substring
			+ code.slice(end + position_delta);
		position_delta += substring.length - (end - start);
	}

	return code;
}
