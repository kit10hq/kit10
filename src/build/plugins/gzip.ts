import { promisify } from 'node:util';
import zlib from 'node:zlib';
import type { Plugin } from '../plugins.js';

const gzip = promisify(zlib.gzip);

export const gzipPlugin: Plugin = {
	filter: '*',
	async transform(artifact, options) {
		if (options.is_prod) {
			const buffer = artifact.buffer();
			const buffer_compressed = await gzip(buffer, { level: 9 });

			if (buffer_compressed.length < buffer.length) {
				artifact.create(buffer_compressed, {
					ext: 'gz',
					keep_name: true,
				});
			}
		}
	},
};
