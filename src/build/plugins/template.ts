import nodePath from 'node:path';
import type { Plugin } from 'vite';
import { rewriteHtml } from '../html.js';
import * as buildOptions from '../options.js';
import { getRoutes, type RouteData } from '../router/file-tree.js';
import { routes } from '../router.js';
import {
	readTemplate,
	splitTemplate,
	TEMPLATE_PATH_ABSOLUTE,
	type TemplateParts,
	wrapInTemplate,
} from '../template.js';
import { getRouteHtmlPath } from './virtual-html.js';

/**
 * Returns a set of all routed paths.
 */
function getRoutedPaths(routes_: RouteData[]): Set<string> {
	return new Set(
		routes_.map((route_data) =>
			nodePath.resolve(getRouteHtmlPath(route_data.file)),
		),
	);
}

/** Creates a Vite plugin that wraps route HTML fragments with +template.html. */
export function templatePlugin(): Plugin {
	let routed_paths = getRoutedPaths(routes);
	let templateParts: TemplateParts | null = null;

	return {
		name: 'kit10:template',
		enforce: 'pre',
		transformIndexHtml: {
			order: 'pre',
			async handler(html, context) {
				if (!buildOptions.is_prod) {
					routed_paths = getRoutedPaths(getRoutes());
				}

				if (!routed_paths.has(context.filename)) {
					return;
				}

				const htmlContent = await rewriteHtml(context.filename, html);
				html = htmlContent.html;
				if (htmlContent.is_full_page) {
					return html;
				}

				if (!templateParts || !buildOptions.is_prod) {
					let template_html = await readTemplate();
					if (template_html === null) {
						throw new Error(
							`Requested template, but ${TEMPLATE_PATH_ABSOLUTE} not found.`,
						);
					}

					const templateHtmlContent = await rewriteHtml(
						TEMPLATE_PATH_ABSOLUTE,
						template_html,
					);
					template_html = templateHtmlContent.html;

					// eslint-disable-next-line require-atomic-updates
					templateParts = splitTemplate(template_html);
				}

				return wrapInTemplate(templateParts, htmlContent);
			},
		},
	};
}
