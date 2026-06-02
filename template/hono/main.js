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
 * Retrieves a file from the filesystem and returns its contents and MIME type.
 * @param {Context} c - The path to the file to retrieve.
 * @param {string} [path] - The path to the file to retrieve.
 * @returns - The file contents and MIME type, or null if the file could not be read.
 */
async function handler(c, path) {
	path ??= new URL(c.req.url).pathname;

	try {
		const file_path = nodePath.join(STATIC_DIR, path);
		if (!file_path.startsWith(STATIC_DIR)) {
			c.status(400);
			return c.body('');
		}

		const contents = await fs.readFile(file_path);
		const ext = path.split('.').pop();
		const mime =
			(ext ? CONTENT_TYPE[ext] : undefined) ?? 'application/octet-stream';

		c.status(200);
		c.header('Content-Type', mime);
		return c.body(contents);
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
			return c.notFound();
		}

		c.status(500);
		return c.body('');
	}
}

const app = new Hono();
// MARK: app
app.get('*', (c) => handler(c));

const server = serve({
	fetch: app.fetch,
	port: 8787,
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
