#!/usr/bin/env node
import { r as output_path } from "./options-CUPAJ8kq.mjs";
//#region src/main.ts
const command = process.argv[2];
if (command === "dev" || command === "build") {
	await import("./build-BnkBZi6f.mjs");
	if (command === "dev") await import(output_path + "/main.js");
} else {
	console.error(`Unknown command "${command}".`);
	process.exit(1);
}
//#endregion
export {};
