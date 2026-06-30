import { serve, upgradeWebSocket } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Handler, Hono } from "hono";
export { type Handler, Hono, serve, serveStatic, upgradeWebSocket };