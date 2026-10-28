import { expect, mock, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import { Hono } from 'hono';

mock.module('../options.js', () => {
	return { server_runtime: 'hono' };
});
const { getRoutes } = await import('./file-tree.js');

const pages = [
	'index+page.html',
	'users/[id]+page.html',
	'optional/[[id]]+page.html',
	'[[lang]]/about+page.html',
	'archive/[[year]]/[[month]]/index+page.html',
	'files/[name].[ext]+page.html',
	'downloads/[name].[[ext]]+page.html',
	'prefix/item-[id]+page.html',
	'literal/v1.0/[id]+page.html',
	'docs/[[...slug]]+page.html',
	'required/[...slug]+page.html',
	'priority/index+page.html',
	'priority/fixed+page.html',
	'priority/[[id]]+page.html',
	'priority/[[...rest]]+page.html',
];

const cases = [
	['/', 'index+page.html'],
	['/users/42', 'users/[id]+page.html'],
	['/optional', 'optional/[[id]]+page.html'],
	['/optional/42', 'optional/[[id]]+page.html'],
	['/about', '[[lang]]/about+page.html'],
	['/en/about', '[[lang]]/about+page.html'],
	['/archive', 'archive/[[year]]/[[month]]/index+page.html'],
	['/archive/2026', 'archive/[[year]]/[[month]]/index+page.html'],
	['/archive/2026/10', 'archive/[[year]]/[[month]]/index+page.html'],
	['/files/readme.md', 'files/[name].[ext]+page.html'],
	['/downloads/readme', 'downloads/[name].[[ext]]+page.html'],
	['/downloads/logo.svg', 'downloads/[name].[[ext]]+page.html'],
	['/prefix/item-42', 'prefix/item-[id]+page.html'],
	['/literal/v1.0/42', 'literal/v1.0/[id]+page.html'],
	['/docs', 'docs/[[...slug]]+page.html'],
	['/docs/api/routes', 'docs/[[...slug]]+page.html'],
	['/required/api/routes', 'required/[...slug]+page.html'],
	['/priority', 'priority/index+page.html'],
	['/priority/fixed', 'priority/fixed+page.html'],
	['/priority/42', 'priority/[[id]]+page.html'],
	['/priority/a/b', 'priority/[[...rest]]+page.html'],
	['/users', null],
	['/users/a/b', null],
	['/optional/a/b', null],
	['/archive/a/b/c', null],
	['/files/readme', null],
	['/prefix/42', null],
	['/literal/v1x0/42', null],
	['/required', null],
] as const;

/** Creates a temporary page tree and returns its root path. */
function createPages(filenames: string[]): string {
	const root = mkdtempSync(nodePath.join(tmpdir(), 'kit10-routes-'));
	for (const filename of filenames) {
		const path = nodePath.join(root, filename);
		mkdirSync(nodePath.dirname(path), { recursive: true });
		writeFileSync(path, filename);
	}

	return root;
}

for (const runtime of ['hono', 'nginx']) {
	test(`${runtime}: required, optional, compound and catch-all routes`, async () => {
		mock.module('../options.js', () => {
			return { server_runtime: runtime };
		});
		const root = createPages(pages);
		try {
			const routes = getRoutes(root);
			expect(new Set(routes.map(({ route }) => route)).size).toBe(
				routes.length,
			);
			const app = new Hono();
			if (runtime === 'hono') {
				for (const { route, file } of routes) {
					app.get(route, (c) =>
						c.json({
							page: nodePath.relative(root, file.absolute_path),
							params: c.req.param(),
						}),
					);
				}
			}

			await Promise.all(
				cases.map(async ([path, expected]) => {
					if (runtime === 'hono') {
						const response = await app.request(path);
						expect(response.status, path).toBe(expected === null ? 404 : 200);
						if (expected === null) {
							return;
						}

						const body = await response.json();
						expect(body.page, path).toBe(expected);
					} else {
						const match = routes.find(({ route }) =>
							new RegExp(`^${route}$`, 'u').test(path),
						);
						expect(
							match ? nodePath.relative(root, match.file.absolute_path) : null,
							path,
						).toBe(expected);
					}
				}),
			);
			if (runtime === 'hono') {
				await Promise.all(
					(
						[
							['/users/42', { id: '42' }],
							['/optional', {}],
							['/optional/42', { id: '42' }],
							['/en/about', { lang: 'en' }],
							['/about', {}],
							['/archive/2026', { year: '2026' }],
						] as const
					).map(async ([path, params]) => {
						const response = await app.request(path);
						const body = await response.json();
						expect(body.params).toEqual(params);
					}),
				);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test(`${runtime}: a root index wins over omitted parameters`, () => {
		mock.module('../options.js', () => {
			return { server_runtime: runtime };
		});
		const root = createPages([
			'index+page.html',
			'[[id]]+page.html',
			'[[...rest]]+page.html',
		]);
		try {
			const routes = getRoutes(root).filter(({ route }) => route === '/');
			expect(routes).toHaveLength(1);
			expect(nodePath.relative(root, routes[0]!.file.absolute_path)).toBe(
				'index+page.html',
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
}
