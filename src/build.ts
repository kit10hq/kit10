// oxlint-disable unicorn/no-process-exit

// import { gzipPlugin } from './build/plugins/gzip.js';
// import {
// 	htmlScanImportsPlugin,
// 	htmlWriteImportsPlugin,
// } from './build/plugins/html/imports.js';
// import { minifyHtmlPlugin } from './build/plugins/html/minify.js';
// import { htmlTemplatePlugin } from './build/plugins/html/template.js';
// import { applyPlugins } from './build/plugins.js';
import * as artifacts from './build/artifact.js';
import { bundle } from './build/bundler.js';
import { formatOutput } from './build/formatter.js';
import { templateArtifact } from './build/html/template.js';
import { compileToHtml, finalizeHtml, processHtml } from './build/html.js';
import * as buildOptions from './build/options.js';
import { flushRouter, processEntrypoints } from './build/router.js';

const start = process.hrtime.bigint();

// find all entrypoint files, build routes
processEntrypoints();

// compile all artifacts to HTML by plugins
await compileToHtml();

// find dependencies, wrap pages into +template.html, ...
await processHtml();

console.log('script artifacts:');
for (const artifact of artifacts.collections.js) {
	console.log('----------', '[', artifact.project_path, ']', '----------');
	// oxlint-disable-next-line no-await-in-loop
	console.log(await artifact.text());
}

console.log('----------');

await bundle();

// TODO: apply plugins on non-js/css artifacts

await finalizeHtml();
templateArtifact.delete();
// TODO: minify html

// TODO: gzip

// artifacts.print();

await flushRouter();
await artifacts.flush();

if (!buildOptions.is_prod) {
	await formatOutput();
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
