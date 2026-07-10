// oxlint-disable unicorn/no-process-exit

import fs from 'node:fs';
import nodePath from 'node:path';
import * as artifacts from './build/artifact.js';
import { bundle } from './build/bundler.js';
import { formatOutput } from './build/formatter.js';
import { clearDistDirectory } from './build/fs/directory.js';
import { templateArtifact } from './build/html/template.js';
import { compileToHtml, finalizeHtml, processHtml } from './build/html.js';
import * as buildOptions from './build/options.js';
import { flushRouter, processEntrypoints } from './build/router.js';
import * as options from './options.js';

const start = process.hrtime.bigint();

// Clear dist directory
await clearDistDirectory();

// find all entrypoint files, build routes
processEntrypoints();

// compile all artifacts to HTML by plugins
await compileToHtml();

// find dependencies, wrap pages into +template.html, ...
await processHtml();

// use esbuild to bundle js/css and other files
await bundle();

await finalizeHtml();
templateArtifact.delete();

await artifacts.flush();
await flushRouter();

if (!buildOptions.is_prod) {
	await formatOutput();
}

{
	const assets_path = nodePath.join(options.source_path, '+assets');
	if (fs.existsSync(assets_path)) {
		fs.cpSync(
			assets_path,
			nodePath.join(buildOptions.output_static_path, '+assets'),
			{
				recursive: true,
			},
		);
	}
}

/**
 * Format nanoseconds as a human-readable string.
 * @param nanoseconds - The number of nanoseconds to format.
 * @returns The formatted string.
 */
function formatNanoseconds(nanoseconds: number): string {
	const units = [
		{ unit: 's', factor: 1e9 },
		{ unit: 'ms', factor: 1e6 },
		{ unit: 'µs', factor: 1e3 },
		{ unit: 'ns', factor: 1 },
	];

	for (const { unit, factor } of units) {
		const value = nanoseconds / factor;

		if (value >= 1 || unit === 'ns') {
			const strValue = value.toPrecision(3);
			return `${Number.parseFloat(strValue)} ${unit}`;
		}
	}

	return '0 ns';
}

// oxlint-disable-next-line no-console
console.log(
	`Complete in ${formatNanoseconds(Number(process.hrtime.bigint() - start))}.`,
);
