import { UserConfig } from "vite";

//#region src/build/options.d.ts
type Promisable<T> = T | Promise<T>;
type CssPreprocessors = Exclude<UserConfig["css"], undefined>["preprocessorOptions"];
type VitePlugin = Exclude<UserConfig["plugins"], undefined>[number];
type Kit10HtmlPreprocessor = {
  filter: RegExp;
  transform: (path: string) => Promisable<string>;
};
type Kit10Plugin = {
  kit10: true;
  htmlPreprocessor?: Kit10HtmlPreprocessor;
  vitePlugins?: VitePlugin[];
};
type Config = {
  /** List of plugins to use. */plugins?: (Kit10Plugin | VitePlugin)[]; /** Build options. */
  build?: {
    /** If JavaScript asset size is within this threshold, it will be inlined into page. */jsInlineTreshold?: number;
    css_preprocessors?: CssPreprocessors;
  }; /** Server options. */
  server?: {
    /** Port to listen on. */port?: number;
  };
};
//#endregion
export type { Config, Kit10Plugin };