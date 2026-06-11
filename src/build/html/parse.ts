import { HTMLRewriter } from 'html-rewriter-wasm';
import { getRelativeProjectPath, isLocalPath } from '../../utils.js';
import type { Artifact, ArtifactContent } from '../artifact.js';
import * as artifacts from '../artifact.js';
import { HEAD_PLACEHOLDER, PAGE_PLACEHOLDER } from './template.js';

export type HtmlParsed = {
	is_full_page: boolean;
	kit10_head: ArtifactContent[];
	html: ArtifactContent[];
};
export type ScriptMetadata = {
	inline: boolean;
	attributes?: Map<string, string>;
};

/** Parses HTML artifacts to extract metadata and content. */
// oxlint-disable-next-line max-lines-per-function
export async function parseHtml(artifact: Artifact): Promise<HtmlParsed> {
	// const dir = nodePath.dirname(path);
	// const scripts_to_inline: InlineScript[] = [];

	let first_tag_name: string | undefined;
	let is_kit10_head = false;
	const result_kit10_head: ArtifactContent[] = [];
	const result_html: ArtifactContent[] = [];
	const rewriter = new HTMLRewriter((chunk) => {
		if (is_kit10_head) {
			result_kit10_head.push(chunk);
		} else {
			result_html.push(chunk);
		}
	});

	let tag_content: ArtifactContent[] = [];
	rewriter.on('*', {
		element(element) {
			first_tag_name ??= element.tagName.toLowerCase();
			tag_content = [];
		},
		text(node) {
			if (node.text) {
				tag_content.push(node.text);
			}
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

	rewriter.on('kit10\\:page', {
		element(element) {
			element.replace(PAGE_PLACEHOLDER, { html: true });
		},
	});

	let unitedScriptArtifact: Artifact | undefined;
	rewriter.on('script', {
		element(element) {
			const attr_src = element.getAttribute('src');
			// ignore https://
			if (attr_src !== null && !isLocalPath(attr_src)) {
				return;
			}

			const attributes = new Map(element.attributes);
			attributes.delete('kit10:inline');
			attributes.delete('src');

			const project_path =
				attr_src === null
					? null
					: getRelativeProjectPath(artifact.project_path, attr_src);
			const inline =
				attr_src === null || element.getAttribute('kit10:inline') !== null;

			if (inline) {
				let scriptArtifact: Artifact;
				// inlined scripts
				if (attr_src === null) {
					scriptArtifact = artifact.create();
					scriptArtifact.updateExt('js');
					element.onEndTag(() => {
						scriptArtifact.update(tag_content);
					});
				} else {
					scriptArtifact = artifact.create(project_path!);
				}

				element.replace(`<!--${scriptArtifact.id}-->`, { html: true });
				scriptArtifact.meta.script = {
					inline: true,
					attributes,
				} satisfies ScriptMetadata;

				artifacts.collections.js.add(scriptArtifact);
			} else {
				if (unitedScriptArtifact) {
					element.remove();
				} else {
					unitedScriptArtifact = artifact.create();
					unitedScriptArtifact.updateExt('js');
					unitedScriptArtifact.meta.script = {
						inline: false,
						attributes: new Map([['type', 'module']]),
					} satisfies ScriptMetadata;

					element.replace(`<!--${unitedScriptArtifact.id}-->`, { html: true });

					artifacts.collections.js.add(unitedScriptArtifact);
				}

				unitedScriptArtifact.append(`import "${project_path}";\n`);
			}
		},
	});

	// rewriter.on('style', {
	// 	// oxlint-disable-next-line require-await
	// 	element(element) {
	// 		const styleArtifact = artifact.create('', { ext: 'css' });
	// 		styleArtifact.meta.html_type = 'style';

	// 		element.setInnerContent(`/* ${styleArtifact.id} */`);

	// 		element.onEndTag(() => {
	// 			styleArtifact.update(tag_content);
	// 			promises.push(styleArtifact.process());
	// 		});
	// 	},
	// });

	// rewriter.on('link', {
	// 	element(element) {
	// 		if (
	// 			element.getAttribute('rel') === 'stylesheet'
	// 			|| (element.getAttribute('rel') === 'preload'
	// 				&& element.getAttribute('as') === 'style')
	// 		) {
	// 			const path = element.getAttribute('href');
	// 			if (path !== null) {
	// 				const linkArtifact = artifacts.create(
	// 					nodePath.join(nodePath.dirname(artifact.path), path),
	// 				);
	// 				linkArtifact.meta.html_type = 'link';

	// 				artifact.link(linkArtifact);

	// 				promises.push(linkArtifact.load().then(() => linkArtifact.process()));

	// 				element.setAttribute('href', linkArtifact.id);
	// 			}
	// 		}
	// 	},
	// });

	rewriter.on('head', {
		element(element) {
			element.append(HEAD_PLACEHOLDER, { html: true });
		},
	});

	// rewriter.on('img', {
	// 	element(node) {
	// 		const import_path = node.getAttribute('src');
	// 		if (import_path) {
	// 			node.setAttribute('src', absolutePath(dir, import_path));
	// 		}
	// 	},
	// });

	rewriter.write(await artifact.bytes());
	rewriter.end();

	return {
		is_full_page: first_tag_name === 'html',
		kit10_head: result_kit10_head,
		html: result_html,
	};
}
