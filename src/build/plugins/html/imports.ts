import nodePath from 'node:path';
import { HTMLRewriter } from 'html-rewriter-wasm';
import * as buildOptions from '../../../options.js';
import { artifact_collections, createArtifact } from '../../artifact.js';
import type { Plugin } from '../../plugins.js';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const html_inline_threshold =
	buildOptions.config.build?.html_inline_threshold ?? 2000;

export const htmlScanImportsPlugin: Plugin = {
	filter: '*',
	async transform(artifact) {
		const scriptSrcArtifact = artifact.create('', { ext: 'js' });
		scriptSrcArtifact.meta.html_type = 'script';

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

		rewriter.on('script', {
			element(element) {
				const attr_type = element.getAttribute('type');
				if (attr_type === 'module') {
					const attr_src = element.getAttribute('src');
					// inline script
					if (attr_src === null) {
						const scriptArtifact = artifact.create('', { ext: 'js' });
						scriptArtifact.meta.html_type = 'script';

						artifact_collections.bundler.add(scriptArtifact);
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
						const linkArtifact = createArtifact(
							nodePath.join(nodePath.dirname(artifact.path), path),
						);
						linkArtifact.meta.html_type = 'link';

						artifact.dependencies.add(linkArtifact);

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
				element.append(`<!--${scriptSrcArtifact.id}-->`, { html: true });
			},
		});

		rewriter.write(textEncoder.encode(artifact.text()));
		rewriter.end();

		// create virtual file with all imports for HTML page
		const script_src_content = scriptSrcArtifact.text();
		if (script_src_content.length > 0) {
			artifact_collections.bundler.add(scriptSrcArtifact);
		} else {
			result = result.replace(`<!--${scriptSrcArtifact.id}-->`, '');
			scriptSrcArtifact.delete();
		}

		artifact.update(result);

		await Promise.all(promises);
	},
};

export const htmlWriteImportsPlugin: Plugin = {
	filter: '*',
	transform(artifact) {
		let content = artifact.text();
		for (const artifactDependency of artifact.dependencies) {
			switch (artifactDependency.meta.html_type) {
				case 'script': {
					const script_content = artifactDependency.text();

					let html;
					// if file is too large, add import
					if (script_content.length > html_inline_threshold) {
						html = `<script type="module" src="/${artifactDependency.path}"></script>`;
						// artifactDependency.detach();
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
					console.log(
						'link found',
						artifactDependency.id,
						artifactDependency.path,
					);
					content = content.replaceAll(
						artifactDependency.id,
						'/' + artifactDependency.path,
					);
					break;

				// no default
			}
		}

		artifact.update(content);
	},
};
