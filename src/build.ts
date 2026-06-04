// oxlint-disable unicorn/no-process-exit

import * as artifacts from './build/artifact.js';
import { bundle } from './build/bundler.js';
import { gzipPlugin } from './build/plugins/gzip.js';
import {
	htmlScanImportsPlugin,
	htmlWriteImportsPlugin,
} from './build/plugins/html/imports.js';
import { minifyHtmlPlugin } from './build/plugins/html/minify.js';
// import { htmlTemplatePlugin } from './build/plugins/html/template.js';
import { applyPlugins } from './build/plugins.js';
import { flushRouter, parseEntrypoints } from './build/router.js';
import * as buildOptions from './options.js';

const start = process.hrtime.bigint();

// find all entrypoint files, build routes
await parseEntrypoints();

// compile all artifacts to HTML by plugins
await applyPlugins(artifacts.collections.pre_html, buildOptions.config.plugins);

// check all entrypoint artifacts have been compiled to HTML
for (const artifact of artifacts.collections.pre_html) {
	if (artifact.ext !== 'html') {
		// oxlint-disable-next-line no-console
		console.error(
			`No plugin found for ".${artifact.ext}" pages (for "${artifact.path}").`,
		);
		process.exit(1);
	}

	artifacts.collections.html.add(artifact);
}

artifacts.collections.pre_html.clear();

await applyPlugins(artifacts.collections.html.values(), [
	// htmlTemplatePlugin,
	htmlScanImportsPlugin,
]);

await bundle();

await applyPlugins(
	artifacts.collections.bundler.values(),
	buildOptions.config.plugins,
);

await applyPlugins(artifacts.collections.html.values(), [
	htmlWriteImportsPlugin,
	minifyHtmlPlugin,
]);

await applyPlugins(artifacts.all.values(), [gzipPlugin]);

artifacts.print();

await flushRouter();
await artifacts.flush();

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
