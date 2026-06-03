// oxlint-disable unicorn/no-process-exit

import {
	artifact_collections,
	flushArtifacts,
	logArtifacts,
} from './build/artifact.js';
import { bundle } from './build/bundler.js';
import {
	htmlScanImportsPlugin,
	htmlWriteImportsPlugin,
} from './build/plugins/html/imports.js';
import { htmlTemplatePlugin } from './build/plugins/html/template.js';
import { applyPlugins } from './build/plugins.js';
import { flushRouter, parseEntrypoints } from './build/router.js';
import * as options from './options.js';

// find all entrypoint files, build routes
await parseEntrypoints();

// compile all artifacts to HTML by plugins
await applyPlugins(artifact_collections.pre_html, options.config.plugins);

// check all entrypoint artifacts have been compiled to HTML
for (const artifact of artifact_collections.pre_html) {
	if (artifact.ext !== 'html') {
		// oxlint-disable-next-line no-console
		console.error(
			`No plugin found for ".${artifact.ext}" pages (for "${artifact.path}").`,
		);
		process.exit(1);
	}

	artifact_collections.html.add(artifact);
}

artifact_collections.pre_html.clear();

await applyPlugins(artifact_collections.html.values(), [
	htmlTemplatePlugin,
	htmlScanImportsPlugin,
]);

await bundle();

await applyPlugins(artifact_collections.html.values(), [
	htmlWriteImportsPlugin,
]);

logArtifacts();

await flushRouter();
await flushArtifacts();
