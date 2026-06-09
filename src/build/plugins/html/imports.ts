// oxlint-disable max-lines-per-function

import nodePath from 'node:path';
import { HTMLRewriter } from 'html-rewriter-wasm';
import * as buildOptions from '../../../options.js';
import { createId } from '../../../utils.js';
import type { Artifact } from '../../artifact.js';
import * as artifacts from '../../artifact.js';
import { applyPlugins, type Plugin } from '../../plugins.js';

const HEAD_PLACEHOLDER = `<!--${createId()}-->`;
const PAGE_PLACEHOLDER = `<!--${createId()}-->`;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const html_inline_threshold =
	buildOptions.config.build?.html_inline_threshold ?? 2000;

// oxlint-disable-next-line prefer-const
let template_html_start: string | undefined;
// oxlint-disable-next-line prefer-const
let template_html_end: string | undefined;

export const htmlScanImportsPlugin: Plugin = {
	filter: '*',
	async transform(artifact) {
		const scriptSrcArtifact = artifact.create('', { ext: 'js' });
		scriptSrcArtifact.meta.html_type = 'head';

		let result = '';
		const rewriter = new HTMLRewriter((chunk) => {
			result += textDecoder.decode(chunk);
		});

		const promises: Promise<void>[] = [];

		let tag_content = '';
		rewriter.on('*', {
			element() {
				tag_content = '';
			},
			text(node) {
				if (node.text) {
					tag_content += node.text;
				}
			},
		});

		rewriter.on('kit10\\:page', {
			element(element) {
				element.replace(PAGE_PLACEHOLDER, { html: true });
			},
		});

		rewriter.on('script', {
			element(element) {
				const attr_type = element.getAttribute('type');
				if (attr_type === 'module') {
					const attr_src = element.getAttribute('src');
					// inline script
					if (attr_src === null) {
						const scriptArtifact = artifact.create('', { ext: 'js' });
						scriptArtifact.meta.html_type = 'script';

						artifacts.collections.bundler.add(scriptArtifact);
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
				} else {
					throw new Error(
						'Only script with type="module" is supported for now.',
					);
				}
			},
		});

		rewriter.on('style', {
			// oxlint-disable-next-line require-await
			element(element) {
				const styleArtifact = artifact.create('', { ext: 'css' });
				styleArtifact.meta.html_type = 'style';

				element.setInnerContent(`/* ${styleArtifact.id} */`);

				element.onEndTag(() => {
					styleArtifact.update(tag_content);
					promises.push(styleArtifact.process());
				});
			},
		});

		rewriter.on('link', {
			element(element) {
				if (
					element.getAttribute('rel') === 'stylesheet'
					|| (element.getAttribute('rel') === 'preload'
						&& element.getAttribute('as') === 'style')
				) {
					const path = element.getAttribute('href');
					if (path !== null) {
						const linkArtifact = artifacts.create(
							nodePath.join(nodePath.dirname(artifact.path), path),
						);
						linkArtifact.meta.html_type = 'link';

						artifact.link(linkArtifact);

						promises.push(
							linkArtifact.load().then(() => linkArtifact.process()),
						);

						element.setAttribute('href', linkArtifact.id);
					}
				}
			},
		});

		rewriter.on('head', {
			element(element) {
				console.log('head element', artifact.path);
				element.append(HEAD_PLACEHOLDER, { html: true });
			},
		});

		rewriter.write(textEncoder.encode(artifact.text()));
		rewriter.end();

		// create virtual file with all imports for HTML page
		const script_src_content = scriptSrcArtifact.text();
		if (script_src_content.length > 0) {
			artifacts.collections.bundler.add(scriptSrcArtifact);
		} else {
			scriptSrcArtifact.delete();
		}

		// console.log(artifact.path, result);

		artifact.update(
			(template_html_start ?? '') + result + (template_html_end ?? ''),
		);

		if (artifact.is_page) {
			for (const artifactDependency of artifacts.dependencies.get(
				templateArtifact,
			) ?? []) {
				artifact.link(artifactDependency);
			}
		}

		await Promise.all(promises);
	},
};

export const htmlWriteImportsPlugin: Plugin = {
	filter: '*',
	transform(artifact) {
		let content = artifact.text();
		let head_content = '';

		for (const artifactDependency of artifacts.dependencies.get(artifact)
			?? []) {
			switch (artifactDependency.meta.html_type) {
				case 'head': {
					const script_content = artifactDependency.text();

					let html;
					// if file is too large, add import
					if (script_content.length > html_inline_threshold) {
						html = `<script type="module" src="/${artifactDependency.path}"></script>`;
					} else {
						html = `<script type="module">\n${script_content}</script>`;
						artifactDependency.delete();
					}

					head_content += html + '\n';
					break;
				}

				case 'script': {
					const script_content = artifactDependency.text();

					let html;
					// if file is too large, add import
					if (script_content.length > html_inline_threshold) {
						html = `<script type="module" src="/${artifactDependency.path}"></script>`;
					} else {
						html = `<script type="module">\n${script_content}</script>`;
						artifactDependency.delete();
					}

					content = content.replaceAll(`<!--${artifactDependency.id}-->`, html);
					break;
				}

				case 'style':
					content = content.replaceAll(
						`/* ${artifactDependency.id} */`,
						artifactDependency.text(),
					);
					artifactDependency.delete();
					break;

				case 'link':
					content = content.replaceAll(
						artifactDependency.id,
						'/' + artifactDependency.path,
					);
					break;

				// no default
			}
		}

		content = content.replaceAll(HEAD_PLACEHOLDER, head_content);

		artifact.update(content);
	},
};

const templateArtifact: Artifact = artifacts.create('+template.html');
templateArtifact.meta.noout = true;
await templateArtifact.load();
await applyPlugins([templateArtifact], [htmlScanImportsPlugin]);
[template_html_start, template_html_end] = templateArtifact
	.text()
	.split(PAGE_PLACEHOLDER);
