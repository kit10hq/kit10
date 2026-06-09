import minifyHtml from '@minify-html/node';
import type { Plugin as VitePlugin } from 'vite';

type Options = Parameters<(typeof minifyHtml)['minify']>[1];

const MINIFY_HTML_OPTIONS: Options = {
	allow_noncompliant_unquoted_attribute_values: false,
	allow_optimal_entities: false,
	allow_removing_spaces_between_attributes: false,
	keep_closing_tags: false,
	keep_comments: false,
	keep_html_and_head_opening_tags: true,
	keep_input_type_text_attr: true,
	keep_ssi_comments: false,
	minify_css: false,
	minify_doctype: false,
	minify_js: false,
	preserve_brace_template_syntax: false,
	preserve_chevron_percent_template_syntax: false,
	remove_bangs: true,
	remove_processing_instructions: true,
};

/**
 * A Vite plugin that minifies HTML.
 * @param options - The minification options to pass to `@minify-html/node`.
 */
export function htmlMinifyPlugin(
	options: Options = MINIFY_HTML_OPTIONS,
): VitePlugin {
	return {
		name: 'kit10:html-minify',
		transformIndexHtml: {
			order: 'post',
			handler(html) {
				return minifyHtml.minify(Buffer.from(html), options).toString('utf8');
			},
		},
	};
}
