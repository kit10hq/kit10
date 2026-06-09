import { _ as vitePlugins, a as virtualHtmlPlugin, c as rewriteHtml, f as configPlugin, g as source_path, n as getRouteHtmlUrl, r as loadRouteHtml, s as getRoutes, t as templatePlugin } from "./template-Bzai6c8v.mjs";
import { createServer } from "vite";
import { Hono } from "hono/tiny";
//#region src/build/plugins/dev-route.ts
/** Creates a Vite plugin that serves the application's routes using Hono. */
function devRoutePlugin() {
	return {
		name: "kit10:routes",
		configureServer(server) {
			const routes = getRoutes();
			const app = new Hono();
			for (const route_data of routes) app.get(route_data.route, async (context) => {
				const url_pathname = new URL(context.req.url).pathname;
				const route_html = await loadRouteHtml(route_data.file);
				let { html } = route_html;
				html = await server.transformIndexHtml(getRouteHtmlUrl(route_html.path), html, url_pathname);
				html = (await rewriteHtml(route_html.path, html)).html;
				return htmlResponse(html);
			});
			return () => {
				server.middlewares.use(async (request, response, next) => {
					try {
						if (request.method !== "GET" && request.method !== "HEAD") {
							next();
							return;
						}
						const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "kit10.local"}`);
						const hono_response = await app.fetch(new Request(url, {
							headers: convertHeaders(request.headers),
							method: request.method
						}));
						if (hono_response.status === 404) {
							next();
							return;
						}
						response.statusCode = hono_response.status;
						for (const [name, value] of hono_response.headers) response.setHeader(name, value);
						if (request.method === "HEAD") response.end();
						else response.end(new Uint8Array(await hono_response.arrayBuffer()));
					} catch (error) {
						server.ssrFixStacktrace(error);
						next(error);
					}
				});
			};
		}
	};
}
/**
* Creates HTML response.
* @param contents -
* @returns -
*/
function htmlResponse(contents) {
	return new Response(contents, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
/**
* Converts Node request headers to WebAPI's Headers.
* @param headers_node -
* @returns -
*/
function convertHeaders(headers_node) {
	const headers = new Headers();
	for (const [name, value] of Object.entries(headers_node)) {
		if (value === void 0) continue;
		if (Array.isArray(value)) for (const item of value) headers.append(name, item);
		else if (typeof value === "string") headers.set(name, value);
		else headers.set(name, String(value));
	}
	return headers;
}
//#endregion
//#region src/build/target/dev.ts
const server = await createServer({
	root: source_path,
	configFile: false,
	appType: "custom",
	plugins: [
		configPlugin(),
		virtualHtmlPlugin(),
		templatePlugin(),
		devRoutePlugin(),
		...vitePlugins
	]
});
await server.listen();
server.printUrls();
//#endregion
export {};
