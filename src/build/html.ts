import nodePath from 'node:path';
import * as esbuild from 'esbuild';
import { type Element, HTMLRewriter } from 'html-rewriter-wasm';
import { isAbsoluteOrSpecialPath, textDecoder, textEncoder } from '../utils.js';
import * as buildOptions from './options.js';

export type HtmlContent = {
	is_full_page: boolean;
	kit10_head: string;
	html: string;
};

export const KIT10_INLINE_STYLE_ATTR = 'data-kit10-inline-style';

type InlineScript = {
	attributes: [string, string][];
	contents: Promise<string>;
	path: string;
	placeholder: string;
};

const inlined = new Map<string, string>();
const inlined_promises = new Map<string, Promise<string>>();
const inline_style_sources = new Map<string, Set<string>>();

/** Returns stylesheets marked as inline while rewriting an HTML file. */
export function getInlineStyleSources(path: string): Set<string> {
	return new Set(inline_style_sources.get(path));
}

/** Returns a safe value for an HTML attribute. */
function escapeAttribute(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

/** Does actual bundling of JS/TS file into one. */
async function bundleDo(path: string): Promise<string> {
	const result = await esbuild.build({
		absWorkingDir: buildOptions.source_path,
		entryPoints: ['.' + path],
		outdir: '/',
		//
		bundle: true,
		format: 'esm',
		minify: buildOptions.is_prod,
		write: false,
	});

	const [output] = result.outputFiles;
	if (!output) {
		throw new Error('No output file');
	}

	const contents = textDecoder.decode(output.contents);
	if (buildOptions.is_prod) {
		inlined.set(path, contents);
	}

	return contents;
}

/** Bundles JS/TS file into one. */
async function bundle(path: string): Promise<string> {
	if (!path.startsWith('/')) {
		throw new Error('Path for bundle must be absolute.');
	}

	if (inlined.has(path)) {
		return inlined.get(path)!;
	}

	if (inlined_promises.has(path)) {
		return inlined_promises.get(path)!;
	}

	const promise = bundleDo(path);
	inlined_promises.set(path, promise);

	const contents = await promise;
	inlined_promises.delete(path);

	return contents;
}

/**
 * Rewrites html.
 * @param path - The absolute file path of the html file.
 * @param contents - The html to rewrite.
 * @returns -
 */
export async function rewriteHtml(
	path: string,
	contents: string,
): Promise<HtmlContent> {
	const dir = nodePath.dirname(path);
	const scripts_to_inline: InlineScript[] = [];

	let result = '';
	let first_tag_name;
	let is_kit10_head = false;
	let kit10_head = '';
	const rewriter = new HTMLRewriter((chunk) => {
		const chunk_string = textDecoder.decode(chunk);
		if (is_kit10_head) {
			kit10_head += chunk_string;
		} else {
			result += chunk_string;
		}
	});

	rewriter.on('*', {
		element(element) {
			first_tag_name ??= element.tagName.toLowerCase();
		},
	});

	rewriter.on('kit10\\:head', {
		element(element) {
			is_kit10_head = true;
			element.removeAndKeepContent();
			element.onEndTag(() => {
				is_kit10_head = false;
			});
		},
	});

	rewriter.on('img', {
		element(node) {
			const import_path = node.getAttribute('src');
			if (import_path) {
				node.setAttribute('src', absolutePath(dir, import_path));
			}
		},
	});

	registerScriptHandler(rewriter, dir, scripts_to_inline);
	registerLinkHandler(rewriter, dir, path);

	rewriter.write(textEncoder.encode(contents));
	rewriter.end();

	const html = await replaceInlineScripts(result, scripts_to_inline);

	return {
		is_full_page: first_tag_name === 'html',
		kit10_head,
		html,
	};
}

/** Registers script URL rewriting and kit10:inline script bundling. */
function registerScriptHandler(
	rewriter: HTMLRewriter,
	dir: string,
	scripts_to_inline: InlineScript[],
): void {
	let inline_script_index = 0;
	rewriter.on('script', {
		element(element) {
			const import_path = element.getAttribute('src');
			if (!import_path) {
				return;
			}

			element.setAttribute('src', absolutePath(dir, import_path));

			if (element.getAttribute('kit10:inline') === null) {
				return;
			}

			const import_path_absolute = absolutePath(dir, import_path);
			const inline_contents = bundle(import_path_absolute);
			const placeholder = `kit10:inline-script:${inline_script_index++}`;

			element.replace(`<!--${placeholder}-->`, { html: true });
			scripts_to_inline.push({
				attributes: getInlineScriptAttributes(element),
				contents: inline_contents,
				path: import_path_absolute,
				placeholder,
			});
		},
	});
}

/** Registers link URL rewriting and kit10:inline stylesheet markers. */
function registerLinkHandler(
	rewriter: HTMLRewriter,
	dir: string,
	html_path: string,
): void {
	rewriter.on('link', {
		element(element) {
			const import_path = element.getAttribute('href');
			if (!import_path) {
				return;
			}

			const import_path_absolute = absolutePath(dir, import_path);
			element.setAttribute('href', import_path_absolute);

			if (
				element.getAttribute('kit10:inline') !== null
				&& isInlineStyleLink(element)
			) {
				addInlineStyleSource(html_path, import_path_absolute);
				element.removeAttribute('kit10:inline');
				element.setAttribute(KIT10_INLINE_STYLE_ATTR, import_path_absolute);

				if (isPreloadStyleLink(element)) {
					element.setAttribute('rel', 'stylesheet');
					element.removeAttribute('as');
				}
			}
		},
	});
}

/** Registers a stylesheet that should be inlined after Vite processes it. */
function addInlineStyleSource(html_path: string, path: string): void {
	if (!inline_style_sources.has(html_path)) {
		inline_style_sources.set(html_path, new Set<string>());
	}

	inline_style_sources.get(html_path)!.add(path.replace(/[?#].*$/u, ''));
}

/** Replaces script placeholders with their bundled contents. */
async function replaceInlineScripts(
	html: string,
	scripts_to_inline: InlineScript[],
): Promise<string> {
	const replacements = await Promise.all(
		scripts_to_inline.map(async (script) => {
			return {
				html: await createInlineScriptHtml(script),
				placeholder: script.placeholder,
			};
		}),
	);

	let result = html;
	for (const replacement of replacements) {
		result = result.replace(
			`<!--${replacement.placeholder}-->`,
			replacement.html,
		);
	}

	return result;
}

/** Creates inline script HTML. */
async function createInlineScriptHtml(script: InlineScript): Promise<string> {
	const inlined_contents = await script.contents;
	let html = `<script data-src="${escapeAttribute(script.path)}" vite-ignore`;

	for (const [key, value] of script.attributes) {
		html += ` ${key}="${escapeAttribute(value)}"`;
	}

	return `${html}>${escapeScriptContent(inlined_contents)}</script>`;
}

/** Returns script attributes that should survive inlining. */
function getInlineScriptAttributes(element: Element): [string, string][] {
	return [...element.attributes].filter(
		([key]) =>
			key !== 'src'
			&& key !== 'kit10:inline'
			&& key !== 'vite-ignore'
			&& key !== 'data-src',
	);
}

/**
 * Converts a relative path to absolute.
 * @param dir - The directory of the file.
 * @param path - The relative path to convert.
 * @returns -
 */
function absolutePath(dir: string, path: string): string {
	if (isAbsoluteOrSpecialPath(path)) {
		return path;
	}

	return nodePath
		.normalize(nodePath.join(dir, path))
		.replace(buildOptions.source_path, '');
}

/** Escapes JavaScript text for embedding in a script tag. */
function escapeScriptContent(value: string): string {
	return value
		.replaceAll('</script', '<\\/script')
		.replaceAll('<!--', '<\\!--');
}

/** Returns whether a rel attribute contains a token. */
function hasRel(rel: string | null, token: string): boolean {
	return (
		rel?.split(/\s+/u).some((rel_token) => rel_token.toLowerCase() === token)
		?? false
	);
}

/** Returns whether a link points to a stylesheet that should be inlined. */
function isInlineStyleLink(element: {
	getAttribute(name: string): string | null;
}): boolean {
	return (
		hasRel(element.getAttribute('rel'), 'stylesheet')
		|| isPreloadStyleLink(element)
	);
}

/** Returns whether a link preloads a stylesheet. */
function isPreloadStyleLink(element: {
	getAttribute(name: string): string | null;
}): boolean {
	return (
		hasRel(element.getAttribute('rel'), 'preload')
		&& element.getAttribute('as')?.toLowerCase() === 'style'
	);
}
