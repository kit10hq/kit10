// @ts-check
/* eslint-disable jsdoc/no-types */

/** @import { Context } from 'hono'; */

import fs from 'node:fs/promises';
import nodePath from 'node:path';
import { serve } from '@hono/node-server';
import { Hono } from 'hono/tiny';

const CONTENT_TYPE = JSON.parse(
	await fs.readFile(nodePath.join(import.meta.dirname, 'mime.json'), 'utf8'),
);
const STATIC_DIR = nodePath.join(import.meta.dirname, 'static');

/**
 *
 * @param {string} path
 * @returns {Promise<400 | 404 | 500 | { mime: string; contents: NonSharedBuffer }>}
 */
async function getFile(path) {
	try {
		const file_path = nodePath.join(STATIC_DIR, path);
		if (!file_path.startsWith(STATIC_DIR)) {
			return 400;
		}

		const contents = await fs.readFile(file_path);
		const ext = path.split('.').pop();
		const mime =
			(ext ? CONTENT_TYPE[ext] : undefined) ?? 'application/octet-stream';

		return { mime, contents };
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
			return 404;
		}

		return 500;
	}
}

/**
 * Retrieves a file from the filesystem and returns its contents and MIME type.
 * @param {Context} c - The path to the file to retrieve.
 * @param {string} [route_path] - The path to the file to retrieve.
 * @returns - The file contents and MIME type, or null if the file could not be read.
 */
async function handler(c, route_path) {
	const url_path = new URL(c.req.url).pathname;
	// console.log('> [request]', url_path);
	// if we hit a route, check if url matches a static file
	if (route_path) {
		const static_file = await getFile(url_path);
		if (typeof static_file !== 'number') {
			// console.log('< [response]', url_path);
			c.status(200);
			c.header('Content-Type', static_file.mime);
			return c.body(static_file.contents);
		}
	}

	const path = route_path ?? url_path;
	// console.log('< [response]', path);

	const file = await getFile(path);
	if (typeof file === 'number') {
		c.status(file);
		return c.body('');
	}

	c.status(200);
	c.header('Content-Type', file.mime);
	return c.body(file.contents);
}

const app = new Hono();
// MARK: app
app.get('*', (c) => handler(c));

const server = serve({
	fetch: app.fetch,
	port: 0,
});

// graceful shutdown
process.on('SIGINT', () => {
	server.close();
	process.exit(0);
});
process.on('SIGTERM', () => {
	server.close((error) => {
		if (error) {
			// oxlint-disable-next-line no-console
			console.error(error);
			process.exit(1);
		}

		process.exit(0);
	});
});
