import { r as output_path } from "./options-Hr4G0kDO.mjs";
//#region src/main.ts
const command = process.argv[2];
if (command === "dev" || command === "build") {
	await import("./build-U3-ynPC7.mjs");
	if (command === "dev") await import(output_path + "/main.js");
} else {
	console.error(`Unknown command "${command}".`);
	process.exit(1);
}
//#endregion
export {};
