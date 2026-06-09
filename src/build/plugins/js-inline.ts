import nodePath from 'node:path';
import { HTMLRewriter } from 'html-rewriter-wasm';
import type { Plugin } from 'vite';
import {
	isAbsoluteOrSpecialPath,
	textDecoder,
	textEncoder,
} from '../../utils.js';
import * as buildOptions from '../options.js';

type BundleAsset = {
	fileName: string;
	source: string | Uint8Array;
	type: 'asset';
};
type BundleChunk = {
	code: string;
	dynamicImports: string[];
	fileName: string;
	imports: string[];
	type: 'chunk';
};
type BundleItem = BundleAsset | BundleChunk;
type Bundle = Record<string, BundleItem>;

const RE_HTML = /\.html$/iu;
const RE_IMPORT_META = /\bimport\.meta\b/u;
const RE_RELATIVE_SPECIFIER = /^\.{1,2}\//u;
const RE_DYNAMIC_IMPORT =
	/\bimport\s*\(\s*(?<quote>["'])(?<specifier>\.{1,2}\/[^"']+)\k<quote>\s*\)/gu;
const RE_FROM_SPECIFIER =
	/\bfrom\s*(?<quote>["'])(?<specifier>\.{1,2}\/[^"']+)\k<quote>/gu;
const RE_SIDE_EFFECT_IMPORT =
	/\bimport\s*(?<quote>["'])(?<specifier>\.{1,2}\/[^"']+)\k<quote>/gu;

/** Creates a Vite plugin that inlines single-owner JavaScript assets into HTML. */
export function jsInlinePlugin(): Plugin {
	return {
		name: 'kit10:js-inline',
		apply: 'build',
		enforce: 'post',
		generateBundle(_options, bundle_raw) {
			const threshold = buildOptions.config.build?.jsInlineTreshold ?? 3000;
			if (threshold <= 0) {
				return;
			}

			const bundle = bundle_raw as Bundle;
			const html_assets = getHtmlAssets(bundle);
			const html_importers = getHtmlImporters(bundle, html_assets);
			const js_importers = getJsImporters(bundle);
			const candidates = getInlineCandidates(
				bundle,
				html_importers,
				js_importers,
				threshold,
			);

			if (candidates.size === 0) {
				return;
			}

			rewriteHtmlAssets(bundle, html_assets, candidates);

			for (const file_name of candidates.keys()) {
				Reflect.deleteProperty(bundle, file_name);
			}
		},
	};
}

/** Returns emitted HTML assets. */
function getHtmlAssets(bundle: Bundle): BundleAsset[] {
	return Object.values(bundle).filter(
		(item): item is BundleAsset =>
			item.type === 'asset' && RE_HTML.test(item.fileName),
	);
}

/** Returns which HTML files import each JavaScript asset directly. */
function getHtmlImporters(
	bundle: Bundle,
	html_assets: BundleAsset[],
): Map<string, Set<string>> {
	const importers = new Map<string, Set<string>>();

	for (const html_asset of html_assets) {
		for (const file_name of getHtmlModuleScripts(html_asset)) {
			if (!isChunk(bundle[file_name])) {
				continue;
			}

			if (!importers.has(file_name)) {
				importers.set(file_name, new Set<string>());
			}

			importers.get(file_name)!.add(html_asset.fileName);
		}
	}

	return importers;
}

/** Returns module script asset file names imported by an HTML asset. */
function getHtmlModuleScripts(html_asset: BundleAsset): Set<string> {
	const file_names = new Set<string>();
	let ignored_output = '';
	const rewriter = new HTMLRewriter((chunk) => {
		ignored_output += textDecoder.decode(chunk);
	});

	rewriter.on('script', {
		element(element) {
			const type = element.getAttribute('type');
			if (type !== 'module') {
				return;
			}

			const src = element.getAttribute('src');
			if (!src) {
				return;
			}

			const file_name = resolveHtmlUrl(html_asset.fileName, src);
			if (file_name) {
				file_names.add(file_name);
			}
		},
	});

	rewriter.write(textEncoder.encode(assetToString(html_asset)));
	rewriter.end();
	ignored_output = '';

	return file_names;
}

/** Returns which JavaScript chunks import each JavaScript chunk. */
function getJsImporters(bundle: Bundle): Map<string, Set<string>> {
	const importers = new Map<string, Set<string>>();

	for (const item of Object.values(bundle)) {
		if (!isChunk(item)) {
			continue;
		}

		for (const file_name of [...item.imports, ...item.dynamicImports]) {
			if (!importers.has(file_name)) {
				importers.set(file_name, new Set<string>());
			}

			importers.get(file_name)!.add(item.fileName);
		}
	}

	return importers;
}

/** Returns all JavaScript assets that can be inlined into their sole HTML owner. */
function getInlineCandidates(
	bundle: Bundle,
	html_importers: Map<string, Set<string>>,
	js_importers: Map<string, Set<string>>,
	threshold: number,
): Map<string, BundleChunk> {
	const candidates = new Map<string, BundleChunk>();

	for (const [file_name, html_owners] of html_importers) {
		if (
			html_owners.size !== 1
			|| (js_importers.get(file_name)?.size ?? 0) > 0
		) {
			continue;
		}

		const item = bundle[file_name];
		if (!isChunk(item)) {
			continue;
		}

		if (
			RE_IMPORT_META.test(item.code)
			|| textEncoder.encode(item.code).length > threshold
		) {
			continue;
		}

		candidates.set(file_name, item);
	}

	return candidates;
}

/** Rewrites HTML assets, inlining candidate JavaScript chunks. */
function rewriteHtmlAssets(
	bundle: Bundle,
	html_assets: BundleAsset[],
	candidates: Map<string, BundleChunk>,
): void {
	for (const html_asset of html_assets) {
		let result = '';
		const rewriter = new HTMLRewriter((chunk) => {
			result += textDecoder.decode(chunk);
		});

		rewriter.on('script', {
			element(element) {
				const type = element.getAttribute('type');
				const src = element.getAttribute('src');
				if (type !== 'module' || !src) {
					return;
				}

				const file_name = resolveHtmlUrl(html_asset.fileName, src);
				const chunk = file_name ? candidates.get(file_name) : undefined;
				if (!file_name || !chunk) {
					return;
				}

				element.replace(createInlineScriptHtml(element.attributes, chunk), {
					html: true,
				});
			},
		});

		rewriter.on('link', {
			element(element) {
				const rel = element.getAttribute('rel');
				const href = element.getAttribute('href');
				if (!rel || !href || !hasRel(rel, 'modulepreload')) {
					return;
				}

				const file_name = resolveHtmlUrl(html_asset.fileName, href);
				if (file_name && candidates.has(file_name)) {
					element.remove();
				}
			},
		});

		rewriter.write(textEncoder.encode(assetToString(html_asset)));
		rewriter.end();

		html_asset.source = result;
	}
}

/** Creates inline script HTML from a JavaScript chunk. */
function createInlineScriptHtml(
	attributes: Iterable<[string, string]>,
	chunk: BundleChunk,
): string {
	let html = '<script';

	for (const [name, value] of attributes) {
		if (name === 'src' || name === 'crossorigin' || name === 'integrity') {
			continue;
		}

		html += ` ${name}="${escapeAttribute(value)}"`;
	}

	const code = escapeScriptContent(
		rewriteRelativeImports(chunk.code, chunk.fileName),
	);

	return `${html}>${code}</script>`;
}

/** Rewrites relative JavaScript import specifiers to root-absolute URLs. */
function rewriteRelativeImports(code: string, file_name: string): string {
	return code
		.replace(RE_DYNAMIC_IMPORT, (...args: unknown[]) =>
			replaceImportSpecifier(args, file_name),
		)
		.replace(RE_FROM_SPECIFIER, (...args: unknown[]) =>
			replaceImportSpecifier(args, file_name),
		)
		.replace(RE_SIDE_EFFECT_IMPORT, (...args: unknown[]) =>
			replaceImportSpecifier(args, file_name),
		);
}

/** Replaces a regex-matched import specifier. */
function replaceImportSpecifier(args: unknown[], file_name: string): string {
	const match = args.at(-1);
	if (!isGroupsMatch(match)) {
		return String(args[0]);
	}

	const { quote, specifier } = match;
	const rewritten_specifier = toRootAbsoluteSpecifier(file_name, specifier);

	return String(args[0]).replace(
		`${quote}${specifier}${quote}`,
		`${quote}${rewritten_specifier}${quote}`,
	);
}

/** Converts a chunk-relative import specifier to a root-absolute URL. */
function toRootAbsoluteSpecifier(file_name: string, specifier: string): string {
	if (!RE_RELATIVE_SPECIFIER.test(specifier)) {
		return specifier;
	}

	return (
		'/'
		+ nodePath.posix.normalize(
			nodePath.posix.join(nodePath.posix.dirname(file_name), specifier),
		)
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

/** Returns whether an emitted item is a JavaScript chunk. */
function isChunk(item: BundleItem | undefined): item is BundleChunk {
	return item?.type === 'chunk';
}

/** Returns whether an HTML rel attribute contains a token. */
function hasRel(rel: string, token: string): boolean {
	return rel
		.split(/\s+/u)
		.some((rel_token) => rel_token.toLowerCase() === token);
}

/** Returns a safe value for an HTML attribute. */
function escapeAttribute(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

/** Escapes JavaScript text for embedding in a script tag. */
function escapeScriptContent(value: string): string {
	return value
		.replaceAll('</script', '<\\/script')
		.replaceAll('<!--', '<\\!--');
}

/** Returns whether a regex replacement match contains named groups. */
function isGroupsMatch(value: unknown): value is {
	quote: string;
	specifier: string;
} {
	return (
		typeof value === 'object'
		&& value !== null
		&& 'quote' in value
		&& 'specifier' in value
		&& typeof value.quote === 'string'
		&& typeof value.specifier === 'string'
	);
}
