#!/usr/bin/env node
import { r as output_path } from "../options-D2oYgwiy.mjs";
import { n as source_path } from "../options-bbHkPexD.mjs";
import { spawn } from "node:child_process";
import chokidar from "chokidar";
import { debounce } from "es-toolkit";
//#region src/main.ts
let child;
/** Runs the build in separate process. */
const runBuild = debounce(() => {
	console.info("Rebuilding...");
	if (child) child.kill();
	child = spawn(process.argv[0], [...process.argv.slice(1), "--no-watch"], {
		stdio: "inherit",
		env: { NODE_ENV: "development" }
	});
}, 100);
const command = process.argv[2];
switch (command) {
	case "dev":
		if (process.argv.includes("--no-watch")) {
			await import("../sync-Dv6g5XwJ.mjs");
			await import("../build-D4OO3ymT.mjs");
			await import(output_path + "/main.js");
		} else {
			runBuild();
			let is_ready = false;
			const watcher = chokidar.watch(source_path, {
				ignoreInitial: true,
				atomic: true,
				awaitWriteFinish: {
					stabilityThreshold: 100,
					pollInterval: 20
				},
				ignored: [
					"**/.DS_Store",
					"**/node_modules/**",
					"**/.git/**"
				]
			});
			watcher.on("ready", () => {
				is_ready = true;
			});
			watcher.on("all", () => {
				if (!is_ready) return;
				runBuild();
			});
		}
		break;
	case "build":
		await import("../sync-Dv6g5XwJ.mjs");
		await import("../build-D4OO3ymT.mjs");
		break;
	case "sync":
		await import("../sync-Dv6g5XwJ.mjs");
		break;
	default:
		console.error(`Unknown command "${command}".`);
		process.exit(1);
}
//#endregion
export {};
