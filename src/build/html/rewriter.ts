import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import nodePath from 'node:path';
import { HTMLRewriter } from 'html-rewriter-wasm';
import * as options from '../../options.js';
import * as esbuild from '../esbuild.js';
import { TempFile } from '../temp-file.js';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
// const transpiler = new Bun.Transpiler();

const page_template = await fs.readFile(
	nodePath.join(options.source_path, '+template.html'),
	'utf8',
);

const global_html_inlines = new WeakMap<TempFile, Map<string, string>>();

/**
 * Rewrites the HTML content.
 * @param tempFile -
 */
export function initHtml(tempFile: TempFile) {
	const page = tempFile.text();
	const html = page_template.replace('<kit10:page></kit10:page>', page);
	// console.log(tempFile.path, html);

	const html_inlines = new Map<string, string>();
	const uuid_inline_script = randomUUID();

	let result = '';
	const rewriter = new HTMLRewriter((chunk) => {
		result += textDecoder.decode(chunk);
	});

	const html_script_imports: string[] = [];

	let tag_content = '';
	rewriter.on('script', {
		element(element) {
			tag_content = '';
			const attr_type = element.getAttribute('type');
			if (attr_type === 'module') {
				const attr_src = element.getAttribute('src');
				// inline script
				if (attr_src === null) {
					// usable only for import tree
					// // wait for content to be collected
					// element.onEndTag(() => {
					// 	// transpile collected content
					// 	const { imports } = transpiler.scan(tag_content);
					// 	// console.info('imports', imports);
					// });
				}
				// script by url
				else {
					html_script_imports.push(`import '${attr_src}';`);
					element.remove();
				}
			}
		},
		text(node) {
			if (node.text) {
				tag_content += node.text;
			}
		},
	});
	rewriter.on('head', {
		element(element) {
			element.append(`<!--${uuid_inline_script}-->`, { html: true });
		},
	});

	rewriter.write(textEncoder.encode(html));
	rewriter.end();

	// create virtual file with all imports for HTML page
	if (html_script_imports.length > 0) {
		const html_script_path = tempFile.path.replace(/\.html$/u, '.js');

		const tempFileScript = new TempFile(html_script_path);
		tempFileScript.update(html_script_imports.join('\n'));

		esbuild.entrypoints.add(html_script_path);

		html_inlines.set(uuid_inline_script, html_script_path);
	} else {
		result = result.replace(`<!--${uuid_inline_script}-->`, '');
	}

	tempFile.update(result);

	global_html_inlines.set(tempFile, html_inlines);
}

/**
 * Inlines resources into inited HTML file.
 * @param tempFile - The temp file to process.
 */
export function htmlPostprocess(tempFile: TempFile): void {
	const inlines = global_html_inlines.get(tempFile);
	if (!inlines) {
		return;
	}

	let result = tempFile.text();
	for (const [uuid, static_path] of inlines) {
		const tempFileScript = new TempFile(static_path);
		const script_content = tempFileScript.text();

		let html;
		// if file is too large, add import
		if (script_content.length > 2000) {
			html = `<script type="module" src="/${static_path}"></script>`;
		} else {
			html = `<script type="module">${script_content}</script>`;
			tempFileScript.delete();
		}

		result = result.replace(`<!--${uuid}-->`, html);
	}

	tempFile.update(result);
}
