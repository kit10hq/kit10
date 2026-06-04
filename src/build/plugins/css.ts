import browserslist from 'browserslist';
import { browserslistToTargets, transform } from 'lightningcss';
import type { Plugin } from '../plugins.js';

const targets = browserslistToTargets(browserslist('>= 0.25%'));

export const cssPlugin: Plugin = {
	filter: /\.css$/u,
	transform(artifact, options) {
		console.log('cssPlugin', artifact.path);

		if (options.is_prod) {
			artifact.update(
				transform({
					filename: artifact.path,
					code: artifact.buffer(),
					targets,
					minify: true,
				}).code,
			);
		}
	},
};
