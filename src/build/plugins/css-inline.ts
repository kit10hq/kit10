import nodePath from 'node:path';
import { type Element, HTMLRewriter } from 'html-rewriter-wasm';
import type { Plugin, ViteDevServer } from 'vite';
import {
	isAbsoluteOrSpecialPath,
	textDecoder,
	textEncoder,
} from '../../utils.js';
import { getInlineStyleSources, KIT10_INLINE_STYLE_ATTR } from '../html.js';
import * as buildOptions from '../options.js';

type BundleAsset = {
	fileName: string;
	originalFileNames?: string[];
	source: string | Uint8Array;
	type: 'asset';
};
type BundleChunk = {
	facadeModuleId?: string | null;
	fileName: string;
	moduleIds?: string[];
	type: 'chunk';
	viteMetadata?: {
		importedCss?: Iterable<string>;
	};
};
type BundleItem = BundleAsset | BundleChunk | { type: string };
type Bundle = Record<string, BundleItem>;

type InlineStyle = {
	attributes: [string, string][];
	href: string;
	placeholder: string;
	source: string;
};
type InlineStyleCandidate = {
	href: string;
	source: string;
};

const RE_HTML = /\.html$/iu;
const RE_CSS = /\.css$/iu;
const RE_EXTERNAL_URL = /^(?:[a-z][a-z\d+.-]*:|\/\/)/iu;

/** Creates a Vite plugin that inlines marked stylesheet links into HTML. */
export function cssInlinePlugin(): Plugin {
	return {
		name: 'kit10:css-inline',
		apply: 'build',
		enforce: 'post',
		generateBundle(_options, bundle_raw) {
			const bundle = bundle_raw as Bundle;
			const css_sources = getCssSources(bundle);

			for (const html_asset of getHtmlAssets(bundle)) {
				html_asset.source = inlineBuildStyles(bundle, html_asset, css_sources);
			}
		},
	};
}

/** Inlines marked stylesheet links in dev HTML using the running Vite server. */
export async function inlineDevStyles(
	html: string,
	server: ViteDevServer,
): Promise<string> {
	const { html: rewritten_html, styles } = extractInlineStyles(
		html,
		getMarkedInlineStyle,
	);
	let result = rewritten_html;

	await Promise.all(
		styles.map(async (style) => {
			const css = await loadDevCss(style.href, server);
			result = result.replace(
				`<!--${style.placeholder}-->`,
				createInlineStyleHtml(style.attributes, css, style.source),
			);
		}),
	);

	return result;
}

/** Inlines marked stylesheet links in an emitted HTML asset. */
function inlineBuildStyles(
	bundle: Bundle,
	html_asset: BundleAsset,
	css_sources: Map<string, string>,
): string {
	const inline_sources = getBuildInlineSources(html_asset.fileName);
	const { html, styles } = extractInlineStyles(
		assetToString(html_asset),
		(element) =>
			getBuildInlineStyle(
				element,
				html_asset.fileName,
				inline_sources,
				css_sources,
			),
	);
	let result = html;

	for (const style of styles) {
		const file_name = resolveHtmlUrl(html_asset.fileName, style.href);
		const css_asset = file_name ? bundle[file_name] : undefined;

		if (!file_name || !isCssAsset(css_asset)) {
			throw new Error(
				`Can not inline stylesheet "${style.href}" from "${html_asset.fileName}".`,
			);
		}

		result = result.replace(
			`<!--${style.placeholder}-->`,
			createInlineStyleHtml(
				style.attributes,
				assetToString(css_asset),
				style.source,
			),
		);
	}

	return result;
}

/** Extracts marked stylesheet links and leaves placeholders behind. */
function extractInlineStyles(
	html: string,
	getInlineStyle: (element: Element) => InlineStyleCandidate | null,
): {
	html: string;
	styles: InlineStyle[];
} {
	const styles: InlineStyle[] = [];
	let result = '';
	let inline_style_index = 0;
	const rewriter = new HTMLRewriter((chunk) => {
		result += textDecoder.decode(chunk);
	});

	rewriter.on('link', {
		element(element) {
			const inline_style = getInlineStyle(element);
			if (inline_style === null) {
				return;
			}

			const placeholder = `kit10:inline-style:${inline_style_index++}`;
			styles.push({
				attributes: [...element.attributes],
				href: inline_style.href,
				placeholder,
				source: inline_style.source,
			});
			element.replace(`<!--${placeholder}-->`, { html: true });
		},
	});

	rewriter.write(textEncoder.encode(html));
	rewriter.end();

	return { html: result, styles };
}

/** Returns a marked inline stylesheet candidate, if present. */
function getMarkedInlineStyle(element: Element): InlineStyleCandidate | null {
	const source = element.getAttribute(KIT10_INLINE_STYLE_ATTR);
	if (source === null) {
		return null;
	}

	const href = element.getAttribute('href');
	if (!href) {
		throw new Error(`Can not inline stylesheet without "href" attribute.`);
	}

	return { href, source };
}

/** Returns a build inline stylesheet candidate, if present. */
function getBuildInlineStyle(
	element: Element,
	html_file_name: string,
	inline_sources: Set<string>,
	css_sources: Map<string, string>,
): InlineStyleCandidate | null {
	const marked_style = getMarkedInlineStyle(element);
	if (marked_style) {
		return marked_style;
	}

	const href = element.getAttribute('href');
	if (!href) {
		return null;
	}

	const file_name = resolveHtmlUrl(html_file_name, href);
	const source = file_name ? css_sources.get(file_name) : undefined;
	if (!source || !inline_sources.has(source)) {
		return null;
	}

	return { href, source };
}

/** Returns stylesheet source URLs requested inline for an HTML output file. */
function getBuildInlineSources(html_file_name: string): Set<string> {
	const html_path = nodePath.join(buildOptions.source_path, html_file_name);
	const template_path = nodePath.join(
		buildOptions.source_path,
		'+template.html',
	);

	return new Set([
		...getInlineStyleSources(template_path),
		...getInlineStyleSources(html_path),
	]);
}

/** Returns a map from emitted CSS file name to root-absolute source URL. */
function getCssSources(bundle: Bundle): Map<string, string> {
	const css_sources = new Map<string, string>();

	for (const item of Object.values(bundle)) {
		if (isChunk(item)) {
			addChunkCssSources(css_sources, item);
		} else if (isCssAsset(item)) {
			addAssetCssSources(css_sources, item);
		}
	}

	return css_sources;
}

/** Adds CSS sources found through Vite chunk metadata. */
function addChunkCssSources(
	css_sources: Map<string, string>,
	chunk: BundleChunk,
): void {
	const css_file_names = chunk.viteMetadata?.importedCss;
	if (!css_file_names) {
		return;
	}

	for (const source of getChunkSourceUrls(chunk)) {
		for (const css_file_name of css_file_names) {
			css_sources.set(css_file_name, source);
		}
	}
}

/** Adds CSS sources found directly on CSS assets. */
function addAssetCssSources(
	css_sources: Map<string, string>,
	asset: BundleAsset,
): void {
	for (const source of asset.originalFileNames ?? []) {
		const source_url = toSourceUrl(source);
		if (source_url) {
			css_sources.set(asset.fileName, source_url);
		}
	}
}

/** Returns source URLs that produced a chunk. */
function getChunkSourceUrls(chunk: BundleChunk): Set<string> {
	const sources = new Set<string>();

	for (const source of [chunk.facadeModuleId, ...(chunk.moduleIds ?? [])]) {
		const source_url = source ? toSourceUrl(source) : null;
		if (source_url) {
			sources.add(source_url);
		}
	}

	return sources;
}

/** Converts a source file name to a root-absolute source URL. */
function toSourceUrl(file_name: string): string | null {
	const path = nodePath.isAbsolute(file_name)
		? file_name
		: nodePath.join(buildOptions.source_path, file_name);
	const relative_path = nodePath.relative(buildOptions.source_path, path);
	if (relative_path.startsWith('..') || nodePath.isAbsolute(relative_path)) {
		return null;
	}

	return '/' + relative_path.split(nodePath.sep).join('/');
}

/** Loads transformed direct CSS from the dev server. */
async function loadDevCss(
	href: string,
	server: ViteDevServer,
): Promise<string> {
	const url = toDirectCssUrl(href);
	const result = await server.transformRequest(url);
	if (!result) {
		throw new Error(`Can not inline stylesheet "${href}".`);
	}

	return result.code;
}

/** Converts a stylesheet href to Vite's direct CSS request URL. */
function toDirectCssUrl(href: string): string {
	const clean_href = href.replace(/#.*$/u, '');
	if (RE_EXTERNAL_URL.test(clean_href)) {
		throw new Error(`Can not inline external stylesheet "${href}".`);
	}

	return clean_href + (clean_href.includes('?') ? '&' : '?') + 'direct';
}

/** Creates inline style HTML from transformed CSS. */
function createInlineStyleHtml(
	attributes: Iterable<[string, string]>,
	css: string,
	source: string,
): string {
	let html = `<style data-src="${escapeAttribute(source)}" vite-ignore`;

	for (const [name, value] of attributes) {
		if (isRemovedLinkAttribute(name)) {
			continue;
		}

		html += ` ${name}="${escapeAttribute(value)}"`;
	}

	return `${html}>${escapeStyleContent(css)}</style>`;
}

/** Returns emitted HTML assets. */
function getHtmlAssets(bundle: Bundle): BundleAsset[] {
	return Object.values(bundle).filter(
		(item): item is BundleAsset => isAsset(item) && RE_HTML.test(item.fileName),
	);
}

/** Resolves an HTML URL to an emitted bundle file name. */
function resolveHtmlUrl(html_file_name: string, url: string): string | null {
	const clean_url = url.replace(/[?#].*$/u, '');
	if (isAbsoluteOrSpecialPath(clean_url)) {
		if (!clean_url.startsWith('/') || clean_url.startsWith('//')) {
			return null;
		}

		return clean_url.slice(1);
	}

	return nodePath.posix.normalize(
		nodePath.posix.join(nodePath.posix.dirname(html_file_name), clean_url),
	);
}

/** Returns an asset source as a string. */
function assetToString(asset: BundleAsset): string {
	return typeof asset.source === 'string'
		? asset.source
		: textDecoder.decode(asset.source);
}

/** Returns whether an emitted item is a CSS asset. */
function isCssAsset(item: BundleItem | undefined): item is BundleAsset {
	return isAsset(item) && RE_CSS.test(item.fileName);
}

/** Returns whether an emitted item is a JavaScript chunk. */
function isChunk(item: BundleItem | undefined): item is BundleChunk {
	return item?.type === 'chunk' && 'fileName' in item;
}

/** Returns whether an emitted item is an asset. */
function isAsset(item: BundleItem | undefined): item is BundleAsset {
	return item?.type === 'asset' && 'fileName' in item && 'source' in item;
}

/** Returns whether a link attribute should be removed from the style tag. */
function isRemovedLinkAttribute(name: string): boolean {
	return (
		name === 'href'
		|| name === 'rel'
		|| name === 'as'
		|| name === 'crossorigin'
		|| name === 'integrity'
		|| name === 'kit10:inline'
		|| name === KIT10_INLINE_STYLE_ATTR
		|| name === 'vite-ignore'
		|| name === 'data-src'
	);
}

/** Returns a safe value for an HTML attribute. */
function escapeAttribute(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

/** Escapes CSS text for embedding in a style tag. */
function escapeStyleContent(value: string): string {
	return value.replaceAll('</style', '<\\/style').replaceAll('<!--', '<\\!--');
}
