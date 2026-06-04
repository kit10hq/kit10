import nodePath from "node:path";
import browserslist from "browserslist";
import { browserslistToTargets, transform } from "lightningcss";
//#region src/build/plugins/css.ts
const targets = browserslistToTargets(browserslist(">= 0.25%"));
const cssPlugin = {
	filter: /\.css$/u,
	transform(artifact, options) {
		console.log("cssPlugin", artifact.path);
		if (options.is_prod) artifact.update(transform({
			filename: artifact.path,
			code: artifact.buffer(),
			targets,
			minify: true
		}).code);
	}
};
//#endregion
//#region src/options.ts
const is_prod = process.argv[2] === "build";
const config = (await import(nodePath.join(process.cwd(), "kit10.config.js"))).default;
config.plugins ??= [];
config.plugins.push(cssPlugin);
const source_path = nodePath.join(process.cwd(), "src");
const output_path = nodePath.join(process.cwd(), "dist");
const output_static_path = nodePath.join(output_path, "static");
//#endregion
export { source_path as a, output_static_path as i, is_prod as n, output_path as r, config as t };
