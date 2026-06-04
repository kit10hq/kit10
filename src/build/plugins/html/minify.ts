import { minify } from '@minify-html/node';
import type { Plugin } from '../../plugins.js';

const MINIFY_HTML_OPTIONS: Parameters<typeof minify>[1] = {
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

export const minifyHtmlPlugin: Plugin = {
	filter: '*',
	transform(artifact, options) {
		if (options.is_prod) {
			const html = artifact.text();
			const html_minified = minify(
				Buffer.from(html),
				MINIFY_HTML_OPTIONS,
			).toString('utf8');

			artifact.update(html_minified);
		}
	},
};
