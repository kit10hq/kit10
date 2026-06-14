import nodePath from "node:path";
//#region src/build/options.ts
const is_prod = process.argv[2] === "build";
const project_path = nodePath.resolve(process.cwd());
const config = (await import(nodePath.join(process.cwd(), "kit10.config.js"))).default;
const server_runtime = (is_prod ? config.server?.runtime : null) ?? "hono";
const source_path = nodePath.join(process.cwd(), "src");
const output_path = nodePath.join(process.cwd(), "dist");
const output_static_path = nodePath.join(output_path, "static");
//#endregion
export { project_path as a, output_static_path as i, is_prod as n, server_runtime as o, output_path as r, source_path as s, config as t };
