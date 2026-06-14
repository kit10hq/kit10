// oxlint-disable unicorn/no-process-exit

import { escapeAttributeValue, type Promisable } from '../utils.js';
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

/** Puts back resources into the HTML pages. */
export async function finalizeHtml() {
	const promises = [];
	for (const artifact of artifacts.collections.html) {
		promises.push(finalizeHtmlOne(artifact));
	}

	await Promise.all(promises);
}

type Replacement = [string, string];

/** Puts back resources into the HTML page. */
async function finalizeHtmlOne(artifact: Artifact) {
	let contents = await artifact.text();

	const promises: Promisable<Replacement>[] = [];
	for (const dependencyArtifact of artifact.dependencies) {
		const script_metadata = dependencyArtifact.meta.script as
			| ElementMetadata
			| undefined;
		if (script_metadata) {
			promises.push(computeReplacementScript(artifact, dependencyArtifact));
			continue;
		}

		const style_metadata = dependencyArtifact.meta.style as
			| ElementMetadata
			| undefined;
		if (style_metadata) {
			promises.push(computeReplacementStyle(artifact, dependencyArtifact));
			continue;
		}

		const element_metadata = dependencyArtifact.meta.element as
			| ElementMetadata
			| undefined;
		if (element_metadata) {
			promises.push(computeReplacementElement(artifact, dependencyArtifact));
			continue;
		}
	}

	const replacements = await Promise.all(promises);
	for (const [search, replace] of replacements) {
		contents = contents.replaceAll(search, replace);
	}

	artifact.update(contents);
}

/** Returns the replacement script tag for the given dependency artifact. */
async function computeReplacementScript(
	artifact: Artifact,
	dependencyArtifact: Artifact,
): Promise<Replacement> {
	const script_metadata = dependencyArtifact.meta.script as ElementMetadata;

	let script_contents: string | undefined;
	if (
		script_metadata.inline
		|| dependencyArtifact.sizeUnsafe <= INLINE_TRESHOLD
	) {
		// oxlint-disable-next-line no-await-in-loop
		script_contents = await dependencyArtifact.text();

		for (const artifact_ of dependencyArtifact.dependencies) {
			artifact.link(artifact_);
		}

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

	return [`<!--${dependencyArtifact.id}-->`, tag];
}

const LINK_ATTRS_REMOVE_ON_STYLE = new Set(['rel', 'as', 'onload']);

/** Returns the replacement style tag for the given dependency artifact. */
async function computeReplacementStyle(
	artifact: Artifact,
	dependencyArtifact: Artifact,
): Promise<Replacement> {
	const style_metadata = dependencyArtifact.meta.style as ElementMetadata;

	let script_contents: string | undefined;
	if (
		style_metadata.inline
		// || dependencyArtifact.sizeUnsafe <= INLINE_TRESHOLD
	) {
		// oxlint-disable-next-line no-await-in-loop
		script_contents = await dependencyArtifact.text();

		for (const artifact_ of dependencyArtifact.dependencies) {
			artifact.link(artifact_);
		}

		artifact.unlink(dependencyArtifact);
	}

	let tag = '';
	if (script_contents === undefined) {
		tag += `<link href="/${dependencyArtifact.project_path}"`;

		for (const [key, value] of new Map([
			['rel', 'stylesheet'],
			...(style_metadata.attributes ?? []),
		])) {
			tag += ` ${key}="${escapeAttributeValue(value)}"`;
		}

		tag += '>';
	} else {
		tag += `<style`;

		if (style_metadata.attributes) {
			for (const [key, value] of style_metadata.attributes) {
				if (!LINK_ATTRS_REMOVE_ON_STYLE.has(tag)) {
					tag += ` ${key}="${escapeAttributeValue(value)}"`;
				}
			}
		}

		tag += `>${script_contents}</style>`;
	}

	return [`<!--${dependencyArtifact.id}-->`, tag];
}

/** Returns the replacement style tag for the given dependency artifact. */
function computeReplacementElement(
	artifact: Artifact,
	dependencyArtifact: Artifact,
): Replacement {
	const metadata = dependencyArtifact.meta.element as ElementMetadata;

	let tag = '';
	tag += `<${metadata.element} src="/${dependencyArtifact.project_path}"`;

	if (metadata.attributes) {
		for (const [key, value] of metadata.attributes) {
			tag += ` ${key}="${escapeAttributeValue(value)}"`;
		}
	}

	tag += '>';

	return [`<!--${dependencyArtifact.id}-->`, tag];
}
