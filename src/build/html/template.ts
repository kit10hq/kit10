import fs from 'node:fs/promises';
import nodePath from 'node:path';
import { createId } from '../../utils.js';
import { Artifact, type ArtifactContent } from '../artifact.js';
import * as buildOptions from '../options.js';
import { type HtmlParsed, parseHtml } from './parse.js';

export const HEAD_PLACEHOLDER = `<!--${createId(36)}-->`;
export const PAGE_PLACEHOLDER = `<!--${createId(36)}-->`;

const artifact = new Artifact('+template.html');

export { artifact as templateArtifact };

const kit10_devserver_client_contents = await fs.readFile(
	nodePath.join(import.meta.dirname, '../client/main.js'),
	'utf8',
);

/** Prepares the +template.html file by parsing it and splitting into parts to easy wrapping. */
async function prepareTemplate(): Promise<[string, string, string]> {
	const htmlParsed = await parseHtml(artifact);

	const blob = new Blob(htmlParsed.html);
	const template_string = await blob.text();

	let parts = template_string.split(HEAD_PLACEHOLDER);
	let part_0 = parts[0]!;
	if (!buildOptions.is_prod) {
		part_0 += `<script type="module">${kit10_devserver_client_contents}</script>`;
	}

	parts = parts[1]!.split(PAGE_PLACEHOLDER);
	const part_1 = parts[0]!;
	const part_2 = parts[1]!;

	return [part_0, part_1, part_2];
}

const template_parts = await prepareTemplate();

/** Wraps page HTML in the template HTML. */
export function wrapInTemplate(pageHtmlParsed: HtmlParsed): ArtifactContent[] {
	return [
		template_parts[0],
		...pageHtmlParsed.kit10_head,
		template_parts[1],
		...pageHtmlParsed.html,
		template_parts[2],
	];
}
