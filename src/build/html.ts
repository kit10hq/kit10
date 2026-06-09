import nodePath from 'node:path';
import * as esbuild from 'esbuild';
import { HTMLRewriter } from 'html-rewriter-wasm';
import { isAbsoluteOrSpecialPath, textDecoder, textEncoder } from '../utils.js';
import * as buildOptions from './options.js';

export type HtmlContent = {
	is_full_page: boolean;
	kit10_head: string;
	html: string;
};

const inlined = new Map<string, string>();
const inlined_promises = new Map<string, Promise<string>>();

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

	const promises: Promise<unknown>[] = [];

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

	const scripts_to_inline = new Map<
		string,
		{ attributes: [string, string][] }
	>();
	rewriter.on('script', {
		element(element) {
			const import_path = element.getAttribute('src');
			if (import_path) {
				element.setAttribute('src', absolutePath(dir, import_path));

				if (element.getAttribute('kit10:inline') !== null) {
					const import_path_absolute = absolutePath(dir, import_path);
					promises.push(bundle(import_path_absolute));

					element.replace(`<!--script:${import_path_absolute}-->`, {
						html: true,
					});

					scripts_to_inline.set(import_path_absolute, {
						attributes: [...element.attributes].filter(
							([key]) => key !== 'src' && key !== 'kit10:inline',
						),
					});
				}
			}
		},
	});

	rewriter.on('link', {
		element(element) {
			const import_path = element.getAttribute('href');
			if (import_path) {
				element.setAttribute('href', absolutePath(dir, import_path));
			}
		},
	});

	rewriter.write(textEncoder.encode(contents));
	rewriter.end();

	await Promise.all(promises);

	for (const [inlined_path, inlined_options] of scripts_to_inline) {
		const inlined_contents = inlined.get(inlined_path)!;

		let script_html = `<script data-src="${inlined_path}"`;
		for (const [key, value] of inlined_options.attributes) {
			script_html += ` ${key}="${escapeAttribute(value)}"`;
		}

		script_html += `>${inlined_contents}</script>`;

		result = result.replace(`<!--script:${inlined_path}-->`, script_html);
	}

	return {
		is_full_page: first_tag_name === 'html',
		kit10_head,
		html: result,
	};
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
