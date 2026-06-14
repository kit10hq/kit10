import { minify } from '@minify-html/node';

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

/** Minifies HTML artifact. */
export function minifyHtml(content: string): Buffer<ArrayBufferLike> {
	return minify(Buffer.from(content), MINIFY_HTML_OPTIONS);
}
