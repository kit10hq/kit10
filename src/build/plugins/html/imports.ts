// import { randomUUID } from 'node:crypto';
// import fs from 'node:fs/promises';
// import nodePath from 'node:path';
import { HTMLRewriter } from 'html-rewriter-wasm';
// import * as options from '../../../options.js';
// import { createArtifact } from '../../artifact.js';
import * as bundler from '../../bundler.js';
import type { Plugin } from '../../plugins.js';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const htmlScanImportsPlugin: Plugin = {
	filter: '*',
	transform(artifact) {
		const scriptSrcArtifact = artifact.create('js', '');

		let result = '';
		const rewriter = new HTMLRewriter((chunk) => {
			result += textDecoder.decode(chunk);
		});

		let tag_content = '';
		rewriter.on('script', {
			element(element) {
				tag_content = '';
				const attr_type = element.getAttribute('type');
				if (attr_type === 'module') {
					const attr_src = element.getAttribute('src');
					// inline script
					if (attr_src === null) {
						const scriptArtifact = artifact.create('js', '');

						bundler.paths.add(scriptArtifact.path);
						element.replace(`<!--${scriptArtifact.id}-->`, { html: true });

						// wait for content to be collected
						element.onEndTag(() => {
							// treat content as separate script
							scriptArtifact.update(tag_content);
						});
					}
					// script by url
					else {
						scriptSrcArtifact.append(`import '${attr_src}';\n`);
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
				element.append(`<!--${scriptSrcArtifact.id}-->`, { html: true });
			},
		});

		rewriter.write(textEncoder.encode(artifact.text()));
		rewriter.end();

		// create virtual file with all imports for HTML page
		const script_src_content = scriptSrcArtifact.text();
		if (script_src_content.length > 0) {
			bundler.paths.add(scriptSrcArtifact.path);
		} else {
			result = result.replace(`<!--${scriptSrcArtifact.id}-->`, '');
			scriptSrcArtifact.delete();
		}

		artifact.update(result);
	},
};

export const htmlWriteImportsPlugin: Plugin = {
	filter: '*',
	transform(artifact) {
		let content = artifact.text();
		for (const artifactDependency of artifact.dependencies) {
			const script_content = artifactDependency.text();

			let html;
			// if file is too large, add import
			if (script_content.length > 2000) {
				html = `<script type="module" src="/${artifactDependency.path}"></script>`;
				artifactDependency.detach();
			} else {
				html = `<script type="module">\n${script_content}</script>`;
				artifactDependency.delete();
			}

			content = content.replace(`<!--${artifactDependency.id}-->`, html);
		}

		artifact.update(content);
	},
};
