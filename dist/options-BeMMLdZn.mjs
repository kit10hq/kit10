import nodePath from "node:path";
//#region src/build/options.ts
const is_prod = process.argv[2] === "build";
nodePath.resolve(process.cwd());
const config = (await import(nodePath.join(process.cwd(), "kit10.config.js"))).default;
const source_path = nodePath.join(process.cwd(), "src");
const output_path = nodePath.join(process.cwd(), "dist");
const output_static_path = nodePath.join(output_path, "static");
//#endregion
export { source_path as a, output_static_path as i, is_prod as n, output_path as r, config as t };
