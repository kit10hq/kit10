import type { Plugin as VitePlugin } from 'vite';
import * as buildOptions from '../options.js';

/** Configures the Vite plugin that updates Vite config. */
export function configPlugin(): VitePlugin {
	return {
		name: 'kit10:config',
		config() {
			return {
				css: {
					preprocessorOptions: buildOptions.config.build?.css_preprocessors,
				},
			};
		},
	};
}
