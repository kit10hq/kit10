import nodePath from 'node:path';
// import { cssPlugin } from './build/plugins/css.js';
import type { Plugin } from './plugins.js';

export type Config = {
	/** List of plugins to use. */
	plugins?: Plugin[];
	/** Build options. */
	build?: {
		/** If script or style size is within this threshold, it will be inlined into page. */
		inlineTreshold?: number;
	};
	/** Server options. */
	server?: {
		/** Port to listen on. */
		port?: number;
	};
};

export const is_prod: boolean = process.argv[2] === 'build';

export const project_path: string = nodePath.resolve(process.cwd());

const configModule = await import(
	nodePath.join(process.cwd(), 'kit10.config.js')
);
export const config = configModule.default as Config;

export const source_path: string = nodePath.join(process.cwd(), 'src');

export const output_path: string = nodePath.join(process.cwd(), 'dist');
export const output_static_path: string = nodePath.join(output_path, 'static');
