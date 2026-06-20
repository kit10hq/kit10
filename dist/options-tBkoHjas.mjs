import nodePath from "node:path";
//#region src/build/options.ts
const is_prod = process.argv[2] === "build";
const config = (await import(nodePath.join(process.cwd(), "kit10.config.js"))).default;
const server_runtime = (is_prod ? config.server?.runtime : null) ?? "hono";
const output_path = nodePath.join(process.cwd(), "dist");
const output_static_path = nodePath.join(output_path, "static");
//#endregion
//#region src/options.ts
const project_path = nodePath.resolve(process.cwd());
const source_path = nodePath.join(process.cwd(), "src");
//#endregion
export { output_path as a, is_prod as i, source_path as n, output_static_path as o, config as r, server_runtime as s, project_path as t };
