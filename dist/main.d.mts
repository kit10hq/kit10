//#region src/build/artifact.d.ts
type ArtifactContent = string | Uint8Array;
type ArtifactOptions = {
  ext: string;
  keep_name?: boolean;
};
declare class Artifact {
  #private;
  readonly id: string;
  dependencies: Set<Artifact>;
  readonly meta: Record<string, unknown>;
  constructor(symbol: symbol, arg0: string | Artifact, options?: ArtifactOptions);
  get path(): string;
  get is_page(): boolean;
  get ext(): string;
  /** Updates the file extension. */
  updateExt(ext: string): void;
  get is_dependency(): boolean;
  get is_loaded(): boolean;
  /** Loads the file content from the source. */
  load(): Promise<void>;
  /** Returns content type. */
  get type(): "binary" | "text" | "unknown";
  /** Returns the file content as a string. */
  text(): string;
  /** Returns the file content as a buffer. */
  buffer(): Uint8Array;
  /** Updates temporary file content. */
  update(content: ArtifactContent): void;
  /** Appends content to the temporary file. */
  append(content: string): void;
  /** Deletes the temporary file. */
  delete(): void;
  /** Creates dependency artifact. */
  create(content: ArtifactContent, options: ArtifactOptions): Artifact;
  /** Processes the artifact. */
  process(): Promise<void>;
  /** Makes artifact independent. */
  detach(): void;
}
//#endregion
//#region src/build/plugins.d.ts
type Promisable<T> = T | Promise<T>;
type Plugin = {
  filter: "*" | RegExp;
  transform: (artifact: Artifact, options: {
    is_prod: boolean;
  }) => Promisable<void>;
};
//#endregion
//#region src/options.d.ts
type Config = {
  /** List of plugins to use. */plugins?: Plugin[]; /** Build options. */
  build?: {
    /** If file size is within this threshold, it will be inlined into page. */html_inline_threshold?: number;
  }; /** Server options. */
  server?: {
    /** Port to listen on. */port?: number;
  };
};
//#endregion
export type { Artifact, Config, Plugin };