import nodePath from 'node:path';
import type { UserConfig } from 'vite';

type Promisable<T> = T | Promise<T>;
type CssPreprocessors = Exclude<
	UserConfig['css'],
	undefined
>['preprocessorOptions'];
type VitePlugin = Exclude<UserConfig['plugins'], undefined>[number];
export type Kit10HtmlPreprocessor = {
	filter: RegExp;
	transform: (path: string) => Promisable<string>;
};
export type Kit10Plugin = {
	kit10: true;
	htmlPreprocessor?: Kit10HtmlPreprocessor;
	vitePlugins?: VitePlugin[];
};

export const is_prod: boolean = process.argv[2] === 'build';

const configModule = await import(
	nodePath.join(process.cwd(), 'kit10.config.js')
);

export type Config = {
	/** List of plugins to use. */
	plugins?: (Kit10Plugin | VitePlugin)[];
	/** Build options. */
	build?: {
		/** If JavaScript asset size is within this threshold, it will be inlined into page. */
		jsInlineTreshold?: number;
		css_preprocessors?: CssPreprocessors;
	};
	/** Server options. */
	server?: {
		/** Port to listen on. */
		port?: number;
	};
};
export const config = configModule.default as Config;

export const vitePlugins: VitePlugin[] = [];
export const kit10HtmlPreprocessors: Kit10HtmlPreprocessor[] = [];
if (config.plugins) {
	for (const plugin of config.plugins) {
		if (plugin && 'kit10' in plugin) {
			if (plugin.htmlPreprocessor) {
				kit10HtmlPreprocessors.push(plugin.htmlPreprocessor);
			}

			if (plugin.vitePlugins) {
				vitePlugins.push(...plugin.vitePlugins);
			}
		} else {
			vitePlugins.push(plugin);
		}
	}
}

export const source_path: string = nodePath.join(process.cwd(), 'src');

export const output_path: string = nodePath.join(process.cwd(), 'dist');
export const output_static_path: string = nodePath.join(output_path, 'static');
