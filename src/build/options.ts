import nodePath from 'node:path';
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
		/** Config for which server to build. */
		runtime?: 'hono' | 'nginx';
		/** Port to listen on. */
		port?: number;
	};
};

export const is_prod: boolean = process.argv[2] === 'build';

const configModule = await import(
	nodePath.join(process.cwd(), 'kit10.config.js')
);
export const config = configModule.default as Config;
export const server_runtime =
	(is_prod ? config.server?.runtime : null) ?? ('hono' as const);

export const output_path: string = nodePath.join(process.cwd(), 'dist');
export const output_static_path: string = nodePath.join(output_path, 'static');
