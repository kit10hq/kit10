#!/usr/bin/env node
import { r as output_path } from "../options-D2oYgwiy.mjs";
import { n as source_path } from "../options-bbHkPexD.mjs";
import { spawn } from "node:child_process";
import fs from "node:fs";
//#region src/main.ts
let child;
/** Runs the build in separate process. */
function runBuild() {
	if (child) child.kill();
	child = spawn(process.argv[0], [...process.argv.slice(1), "--no-watch"], {
		stdio: "inherit",
		env: { NODE_ENV: "development" }
	});
}
const command = process.argv[2];
switch (command) {
	case "dev":
		if (process.argv.includes("--no-watch")) {
			await import("../sync-Dv6g5XwJ.mjs");
			await import("../build-DDPt-DU-.mjs");
			await import(output_path + "/main.js");
		} else {
			runBuild();
			fs.watch(source_path, { recursive: true }, () => {
				console.info("Rebuilding...");
				runBuild();
			});
		}
		break;
	case "build":
		await import("../sync-Dv6g5XwJ.mjs");
		await import("../build-DDPt-DU-.mjs");
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
