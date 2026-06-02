import { esbuild } from './build/esbuild.js';
import { htmlPostprocess, initHtml } from './build/html/rewriter.js';
import { getEntrypoints, writeRouter } from './build/router.js';
import { writeTempFiles } from './build/temp-file.js';

const tempFiles = await getEntrypoints();
for (const tempFile of tempFiles) {
	initHtml(tempFile);
}

await esbuild();

for (const tempFile of tempFiles) {
	htmlPostprocess(tempFile);
}

await writeRouter();
await writeTempFiles();
