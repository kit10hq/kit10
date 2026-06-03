//#region src/build/artifact.d.ts
declare const SYMBOL: unique symbol;
declare class Artifact {
  #private;
  readonly id: string;
  dependencies: Set<Artifact>;
  readonly meta: Record<string, unknown>;
  constructor(symbol: typeof SYMBOL, arg0: string | Artifact, ext?: string);
  get path(): string;
  get is_page(): boolean;
  get ext(): string;
  /** Updates the file extension. */
  updateExt(ext: string): void;
  get is_loaded(): boolean;
  /** Loads the file content from the source. */
  load(): Promise<void>;
  /** Returns the file content. */
  text(): string;
  /** Updates temporary file content. */
  update(content: string): void;
  /** Appends content to the temporary file. */
  append(content: string): void;
  /** Deletes the temporary file. */
  delete(): void;
  /** Creates dependency artifact. */
  create(ext: string, content: string): Artifact;
  /** Makes artifact independent. */
  detach(): void;
}
//#endregion
//#region src/build/plugins.d.ts
type Promisable<T> = T | Promise<T>;
type Plugin = {
  filter: '*' | RegExp;
  transform: (artifact: Artifact, options: {
    is_prod: boolean;
  }) => Promisable<void>;
};
//#endregion
//#region src/options.d.ts
type Config = {
  server?: {
    port?: number;
  };
  plugins?: Plugin[];
};
//#endregion
export type { Config, Plugin };