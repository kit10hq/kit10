import { HTMLRewriter } from 'html-rewriter-wasm';
import type { Artifact, ArtifactContent } from '../artifact.js';
import * as artifacts from '../artifact.js';
import { describeImportSpecifier } from '../utils.js';
import { HEAD_PLACEHOLDER, PAGE_PLACEHOLDER } from './template.js';

export type HtmlParsed = {
	is_full_page: boolean;
	kit10_head: ArtifactContent[];
	html: ArtifactContent[];
};
export type ElementMetadata = {
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
			// ignore https:// etc.
			if (
				attr_src !== null
				&& describeImportSpecifier(attr_src, 'html').local !== true
			) {
				return;
			}

			const attributes = new Map(element.attributes);
			attributes.delete('kit10:inline');
			attributes.delete('src');

			const inline =
				attr_src === null || element.getAttribute('kit10:inline') !== null;

			if (inline) {
				let scriptArtifact: Artifact;
				// inlined scripts
				if (attr_src === null) {
					scriptArtifact = artifact.create({ ext: 'js' });
					element.onEndTag(() => {
						scriptArtifact.update(tag_content);
					});
				} else {
					scriptArtifact = artifact.create(attr_src);
				}

				element.replace(`<!--${scriptArtifact.id}-->`, { html: true });
				scriptArtifact.meta.script = {
					inline: true,
					attributes,
				} satisfies ElementMetadata;

				artifacts.collections.bundle.add(scriptArtifact);
			} else {
				if (unitedScriptArtifact) {
					element.remove();
				} else {
					unitedScriptArtifact = artifact.create({
						ext: 'united.js',
					});
					unitedScriptArtifact.meta.script = {
						inline: false,
						attributes: new Map([['type', 'module']]),
					} satisfies ElementMetadata;

					element.replace(`<!--${unitedScriptArtifact.id}-->`, { html: true });

					artifacts.collections.bundle.add(unitedScriptArtifact);
				}

				unitedScriptArtifact.append(`import "./${attr_src}";\n`);
			}
		},
	});

	rewriter.on('style', {
		element(element) {
			const attributes = new Map(element.attributes);

			const styleArtifact = artifact.create({ ext: 'css' });
			styleArtifact.meta.style = {
				inline: true,
				attributes,
			} satisfies ElementMetadata;

			element.replace(`<!--${styleArtifact.id}-->`, { html: true });
			element.onEndTag(() => {
				styleArtifact.update(tag_content);
			});

			artifacts.collections.bundle.add(styleArtifact);
		},
	});

	rewriter.on('link', {
		element(element) {
			const attr_href = element.getAttribute('href');
			if (attr_href === null) {
				return;
			}

			// ignore https:// etc.
			if (describeImportSpecifier(attr_href, 'html').local !== true) {
				return;
			}

			const attributes = new Map(element.attributes);
			attributes.delete('kit10:inline');
			attributes.delete('href');

			if (
				element.getAttribute('rel') === 'stylesheet'
				|| (element.getAttribute('rel') === 'preload'
					&& element.getAttribute('as') === 'style')
			) {
				const linkArtifact = artifact.create(attr_href);

				element.replace(`<!--${linkArtifact.id}-->`, { html: true });
				linkArtifact.meta.style = {
					inline: element.getAttribute('kit10:inline') !== null,
					attributes,
				} satisfies ElementMetadata;

				artifacts.collections.bundle.add(linkArtifact);
			}
		},
	});

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
