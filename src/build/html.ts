// oxlint-disable unicorn/no-process-exit

import { escapeAttributeValue } from '../utils.js';
import type { Artifact } from './artifact.js';
import * as artifacts from './artifact.js';
import { type ElementMetadata, parseHtml } from './html/parse.js';
import { templateArtifact, wrapInTemplate } from './html/template.js';
import * as buildOptions from './options.js';
import { applyPlugins } from './plugins.js';

/** Compiles non-HTML artifacts to HTML using plugins. */
export async function compileToHtml() {
	// compile all artifacts to HTML by plugins
	await applyPlugins(artifacts.collections.pre_html);

	// check all entrypoint artifacts have been compiled to HTML
	for (const artifact of artifacts.collections.pre_html) {
		if (artifact.ext !== 'html') {
			// oxlint-disable-next-line no-console
			console.error(
				`No plugin found for ".${artifact.ext}" pages (for "${artifact.project_path}").`,
			);
			process.exit(1);
		}

		artifacts.collections.html.add(artifact);
	}

	artifacts.collections.pre_html.clear();
}

/** Processes single HTML file. */
async function processOneHtml(artifact: Artifact) {
	const htmlParsed = await parseHtml(artifact);
	artifact.update(wrapInTemplate(htmlParsed));

	for (const dependencyArtifact of templateArtifact.dependencies) {
		artifact.link(dependencyArtifact);
	}
}

/** Extracts resources (script, style, link, etc) from HTML, wraps HTML content with a common template... */
export async function processHtml() {
	const promises = [];
	for (const artifact of artifacts.collections.html) {
		promises.push(processOneHtml(artifact));
	}

	await Promise.all(promises);
}

const INLINE_TRESHOLD = buildOptions.config.build?.inlineTreshold ?? 2000;

/** Puts back resources into the HTML page. */
// oxlint-disable-next-line max-statements
async function finalizeHtmlOne(artifact: Artifact) {
	let contents = await artifact.text();

	for (const dependencyArtifact of artifact.dependencies) {
		const script_metadata = dependencyArtifact.meta.script as
			| ElementMetadata
			| undefined;
		if (script_metadata) {
			let script_contents: string | undefined;
			if (
				script_metadata.inline
				|| dependencyArtifact.sizeUnsafe <= INLINE_TRESHOLD
			) {
				// oxlint-disable-next-line no-await-in-loop
				script_contents = await dependencyArtifact.text();
				artifact.unlink(dependencyArtifact);
			}

			let tag = '<script';
			if (script_contents === undefined) {
				tag += ` src="/${dependencyArtifact.project_path}"`;
			}

			if (script_metadata.attributes) {
				for (const [key, value] of script_metadata.attributes) {
					tag += ` ${key}="${escapeAttributeValue(value)}"`;
				}
			}

			tag += '>';

			if (script_contents !== undefined) {
				tag += script_contents;
			}

			tag += '</script>';

			contents = contents.replaceAll(`<!--${dependencyArtifact.id}-->`, tag);

			continue;
		}

		const style_metadata = dependencyArtifact.meta.style as
			| ElementMetadata
			| undefined;
		if (style_metadata) {
			let script_contents: string | undefined;
			if (
				style_metadata.inline
				|| dependencyArtifact.sizeUnsafe <= INLINE_TRESHOLD
			) {
				// oxlint-disable-next-line no-await-in-loop
				script_contents = await dependencyArtifact.text();
				artifact.unlink(dependencyArtifact);
			}

			let tag: string;
			if (script_contents === undefined) {
				tag = `<link href="/${dependencyArtifact.project_path}"`;

				for (const [key, value] of new Map([
					['rel', 'stylesheet'],
					...(style_metadata.attributes ?? []),
				])) {
					tag += ` ${key}="${escapeAttributeValue(value)}"`;
				}

				tag += '>';
			} else {
				tag = `<style>${script_contents}</style>`;
			}

			contents = contents.replaceAll(`<!--${dependencyArtifact.id}-->`, tag);

			continue;
		}
	}

	artifact.update(contents);

	// console.log('----------', '[', artifact.project_path, ']', '----------');
	// console.log(contents);
}

/** Puts back resources into the HTML pages. */
export async function finalizeHtml() {
	const promises = [];
	for (const artifact of artifacts.collections.html) {
		promises.push(finalizeHtmlOne(artifact));
	}

	await Promise.all(promises);
}
