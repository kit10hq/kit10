import { createId } from '../../utils.js';
import { Artifact, type ArtifactContent } from '../artifact.js';
import { type HtmlParsed, parseHtml } from './parse.js';

export const HEAD_PLACEHOLDER = `<!--${createId(36)}-->`;
export const PAGE_PLACEHOLDER = `<!--${createId(36)}-->`;

const artifact = new Artifact('+template.html');

export { artifact as templateArtifact };

/** Prepares the +template.html file by parsing it and splitting into parts to easy wrapping. */
async function prepareTemplate(): Promise<[string, string, string]> {
	const htmlParsed = await parseHtml(artifact);

	const blob = new Blob(htmlParsed.html);
	const template_string = await blob.text();

	let parts = template_string.split(HEAD_PLACEHOLDER);
	const part_0 = parts[0]!;

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
