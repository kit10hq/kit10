#!/usr/bin/env node
import { r as output_path, s as source_path } from "./options-Do8UdpP0.mjs";
import { spawn } from "node:child_process";
import fs from "node:fs";
//#region src/main.ts
let child;
/** Runs the build in separate process. */
function runBuild() {
	if (child) child.kill();
	child = spawn(process.argv[0], process.argv.slice(1).filter((arg) => arg !== "--watch"), {
		stdio: "inherit",
		env: { NODE_ENV: "development" }
	});
}
const command = process.argv[2];
if (command === "dev") if (process.argv.includes("--watch")) {
	runBuild();
	fs.watch(source_path, { recursive: true }, () => {
		console.info("Rebuilding...");
		runBuild();
	});
} else {
	await import("./build-BHKFBQwq.mjs");
	await import(output_path + "/main.js");
}
else if (command === "build") await import("./build-BHKFBQwq.mjs");
else {
	console.error(`Unknown command "${command}".`);
	process.exit(1);
}
//#endregion
export {};
