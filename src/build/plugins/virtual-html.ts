import fs from 'node:fs/promises';
import nodePath from 'node:path';
import type { Plugin } from 'vite';
import * as buildOptions from '../options.js';
import type { RouteData, RouteFile } from '../router/file-tree.js';

type RouteHtml = {
	html: string;
	path: string;
};

const RE_EXTENSION = /\.[^.]+$/u;

export const virtualHtmlFiles: Map<string, string> = new Map<string, string>();

/** Returns the virtual HTML path for a route source file. */
export function getRouteHtmlPath(file: RouteFile): string {
	if (file.ext === 'html') {
		return file.path;
	}

	return file.path.replace(RE_EXTENSION, '.html');
}

/** Returns the dev/build URL for a route HTML file. */
export function getRouteHtmlUrl(path: string): string {
	return '/' + nodePath.relative(buildOptions.source_path, path);
}

/** Loads route HTML, preprocessing non-HTML route files into virtual HTML. */
export async function loadRouteHtml(file: RouteFile): Promise<RouteHtml> {
	if (file.ext === 'html') {
		return {
			html: await fs.readFile(file.path, 'utf8'),
			path: file.path,
		};
	}

	const preprocessor = getHtmlPreprocessor(file.path);
	const path = getRouteHtmlPath(file);
	const html = await preprocessor.transform(file.path);
	virtualHtmlFiles.set(getVirtualHtmlKey(path), html);

	return {
		html,
		path,
	};
}

/** Preprocesses build routes and rewrites non-HTML routes to their virtual HTML files. */
export async function preprocessBuildRoutes(
	routes: RouteData[],
): Promise<void> {
	const route_html_results = await Promise.all(
		routes.map(async (route_data) => {
			if (route_data.file.ext === 'html') {
				return null;
			}

			return {
				route_data,
				route_html: await loadRouteHtml(route_data.file),
			};
		}),
	);

	for (const route_html_result of route_html_results) {
		if (route_html_result === null) {
			continue;
		}

		route_html_result.route_data.file.path = route_html_result.route_html.path;
		route_html_result.route_data.file.ext = 'html';
	}
}

/** Creates a Vite plugin that serves generated virtual HTML files. */
export function virtualHtmlPlugin(): Plugin {
	return {
		name: 'kit10:virtual-html',
		enforce: 'pre',
		resolveId(id) {
			const key = getVirtualHtmlKey(id);
			if (virtualHtmlFiles.has(key)) {
				return key;
			}
		},
		load(id) {
			return virtualHtmlFiles.get(getVirtualHtmlKey(id));
		},
	};
}

/** Returns the single HTML preprocessor matching a source file. */
function getHtmlPreprocessor(path: string): buildOptions.Kit10HtmlPreprocessor {
	const preprocessors = buildOptions.kit10HtmlPreprocessors.filter(
		(preprocessor) => matchesFilter(preprocessor.filter, path),
	);

	if (preprocessors.length === 0) {
		throw new Error(
			`No Kit10 HTML preprocessor matched "${path}". Add a plugin that can transform ".${nodePath.extname(path).slice(1)}" pages to HTML.`,
		);
	}

	if (preprocessors.length > 1) {
		throw new Error(
			`Multiple Kit10 HTML preprocessors matched "${path}". Make plugin filters mutually exclusive.`,
		);
	}

	return preprocessors[0]!;
}

/** Returns whether a regular expression matches without leaking lastIndex state. */
function matchesFilter(filter: RegExp, path: string): boolean {
	filter.lastIndex = 0;
	return filter.test(path);
}

/** Returns a stable key for virtual HTML file lookups. */
function getVirtualHtmlKey(path: string): string {
	return normalizePath(nodePath.resolve(path.replace(/[?#].*$/u, '')));
}

/** Normalizes file paths for Vite/Rollup ids. */
function normalizePath(path: string): string {
	return path.replaceAll(nodePath.win32.sep, '/');
}
