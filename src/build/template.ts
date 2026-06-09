import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import nodePath from 'node:path';
import { HTMLRewriter } from 'html-rewriter-wasm';
import { textDecoder, textEncoder } from '../utils.js';
import type { HtmlContent } from './html.js';
import * as buildOptions from './options.js';

export type TemplateParts = {
	before_head: string;
	before_page: string;
	after_page: string;
};

export const TEMPLATE_PATH = '+template.html';
export const TEMPLATE_PATH_ABSOLUTE: string = nodePath.join(
	buildOptions.source_path,
	TEMPLATE_PATH,
);

/**
 * Reads the +template.html file from the source path, if it exists.
 * @returns - The contents of the template file, or `undefined` if it does not exist.
 */
export async function readTemplate(): Promise<string | null> {
	try {
		await fs.access(TEMPLATE_PATH_ABSOLUTE);
		return fs.readFile(TEMPLATE_PATH_ABSOLUTE, 'utf8');
	} catch {
		return null;
	}
}

/**
 * Splits +template.html file into parts to place page contents in between.
 * @returns -
 */
export function splitTemplate(html: string): TemplateParts {
	const placeholder_head = `<!--${randomUUID()}-->`;
	const placeholder_page = `<!--${randomUUID()}-->`;
	let result = '';
	const rewriter = new HTMLRewriter((chunk) => {
		result += textDecoder.decode(chunk);
	});

	rewriter.on('head', {
		element(element) {
			element.append(placeholder_head, { html: true });
		},
	});

	rewriter.on('kit10\\:page', {
		element(element) {
			element.replace(placeholder_page, { html: true });
		},
	});

	rewriter.write(textEncoder.encode(html));
	rewriter.end();

	const parts_by_head = result.split(placeholder_head);
	if (parts_by_head.length !== 2) {
		throw new Error(
			`Internal error: can not split ${TEMPLATE_PATH} by head comment.`,
		);
	}

	const before_head = parts_by_head[0]!;
	const after_head = parts_by_head[1]!;

	const parts_by_page = after_head.split(placeholder_page);
	if (parts_by_page.length !== 2) {
		throw new Error(
			`${TEMPLATE_PATH} must contain exactly one <kit10:page> tag.`,
		);
	}

	return {
		before_head,
		before_page: parts_by_page[0]!,
		after_page: parts_by_page[1]!,
	};
}

/**
 * Wraps the HTML content in the template parts.
 * @param templateParts - The template parts to wrap the HTML content in.
 * @param htmlContent - The HTML content to wrap.
 * @returns The wrapped HTML content.
 */
export function wrapInTemplate(
	templateParts: TemplateParts,
	htmlContent: HtmlContent,
): string {
	return (
		templateParts.before_head
		+ htmlContent.kit10_head
		+ templateParts.before_page
		+ htmlContent.html
		+ templateParts.after_page
	);
}
