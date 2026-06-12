import browserslist from 'browserslist';
import { browserslistToTargets, transform } from 'lightningcss';
import type { Plugin } from '../plugins.js';

const targets = browserslistToTargets(browserslist('>= 0.25%'));

export const cssPlugin: Plugin = {
	filter: /\.css$/u,
	async transform(artifact, options) {
		if (options.is_prod) {
			console.log('>>>>>> [CSS PLUGIN]', artifact.project_path);
			const code = await artifact.bytes();
			artifact.update(
				transform({
					filename: artifact.absolute_path,
					code,
					targets,
					minify: true,
				}).code,
			);
		}
	},
};
