import fs from 'node:fs/promises';
import nodePath from 'node:path';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import type { Plugin } from 'vite';
import * as buildOptions from '../options.js';

const gzip = promisify(zlib.gzip);
const filter = /\.(?:html|xml|css|json|js|mjs|svg)$/iu;

/** Creates a Vite plugin that compresses output files. */
export function gzipPlugin(): Plugin {
	return {
		name: 'kit10:gzip-static',
		apply: 'build',
		enforce: 'post',
		async writeBundle() {
			const promises: Promise<void>[] = [];
			for await (const path of walk(buildOptions.output_static_path)) {
				if (!filter.test(path) || path.endsWith('.gz')) {
					continue;
				}

				const buffer = await fs.readFile(path);
				if (buffer.length > 1000) {
					const compressed = await gzip(buffer, { level: 9 });

					if (compressed.length < buffer.length) {
						promises.push(fs.writeFile(`${path}.gz`, compressed));
					}
				}
			}

			await Promise.all(promises);
		},
	};
}

/**
 * Walks through a directory and yields the paths of all files.
 * @param dir The directory to walk through.
 */
async function* walk(dir: string): AsyncGenerator<string> {
	for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
		const path = nodePath.join(dir, entry.name);

		if (entry.isDirectory()) {
			yield* walk(path);
		} else if (entry.isFile()) {
			yield path;
		}
	}
}
