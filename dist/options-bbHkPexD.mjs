import nodePath from "node:path";
//#region src/options.ts
const project_path = nodePath.resolve(process.cwd());
const source_path = nodePath.join(process.cwd(), "src");
//#endregion
export { source_path as n, project_path as t };
