// @ts-check
/* eslint-disable jsdoc/no-types, n/no-unpublished-import */

/** @import { Handler } from '../../src/reexports/hono.js'; */

import nodePath from 'node:path';
import {
	Hono,
	serve,
	serveStatic,
	// MARK: devserver
	upgradeWebSocket,
	// MARK: devserver end
} from '../../src/reexports/hono.js';
// MARK: devserver
import { WebSocketServer } from '../../src/reexports/ws.js';

// MARK: devserver end

const STATIC_DIR = nodePath.join(import.meta.dirname, 'static');
/** @type {Record<string, string>} */
const LINK_HEADERS = {};

const staticServer = serveStatic({
	root: STATIC_DIR,
	precompressed: true,
	onFound(path, c) {
		if (path.startsWith(STATIC_DIR)) {
			const static_path = path.slice(STATIC_DIR.length + 1);
			const link_header = LINK_HEADERS[static_path];
			if (link_header !== undefined) {
				c.header('Link', link_header);
			}
		}

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

// MARK: devserver
app.get(
	'/.kit10/ws',
	upgradeWebSocket(() => {
		return {};
	}),
);
// MARK: devserver end

app.notFound((c) => c.body(null, 404));

const server = serve({
	fetch: app.fetch,
	// MARK: devserver
	websocket: {
		server: new WebSocketServer({ noServer: true }),
	},
	// MARK: devserver end
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
