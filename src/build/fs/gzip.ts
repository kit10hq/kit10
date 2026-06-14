import fs from 'node:fs/promises';
import { promisify } from 'node:util';
import zlib from 'node:zlib';

const zlib_gzip = promisify(zlib.gzip);

export const EXT_COMPRESS = new Set([
	'html',
	'css',
	'js',
	'json',
	'svg',
	'xml',
	'txt',
]);

/** Compresses the given content using gzip and writes it to the specified path. */
export async function gzip(content: Uint8Array, path: string): Promise<number> {
	const content_gzipped = await zlib_gzip(content, { level: 9 });
	await fs.writeFile(path, content_gzipped);

	return content_gzipped.byteLength;
}
