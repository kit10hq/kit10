// @ts-check
/* eslint-disable jsdoc/no-types */

/** @import { Handler } from 'hono'; */

import nodePath from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono/tiny';

const STATIC_DIR = nodePath.join(import.meta.dirname, 'static');

const staticServer = serveStatic({
	root: STATIC_DIR,
	precompressed: true,
	onFound(_path, c) {
		c.header('Vary', 'Accept-Encoding');
	},
});

/**
 * Creates a handler that serves a single file.
 * @param {string} path
 * @returns {Handler} -
 */
// oxlint-disable-next-line no-unused-vars
function serveFile(path) {
	return (c) => app.fetch(new Request(new URL(path, c.req.url)));
}

const app = new Hono();
app.get('*', staticServer);
// MARK: app
app.notFound((c) => c.body(null, 404));

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
