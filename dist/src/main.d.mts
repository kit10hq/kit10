import { inspect } from "node:util";

//#region src/build/artifact.d.ts
type ArtifactContent = ConstructorParameters<typeof Blob>[0][number];
declare class Artifact {
  #private;
  readonly id: string;
  meta: Record<string, unknown>;
  constructor(project_path: string, content?: ArtifactContent | ArtifactContent[]);
  create(relative_path: string): Artifact;
  create(options: {
    ext: string;
    content?: ArtifactContent | ArtifactContent[];
  }): Artifact;
  /** Adds artifact as a dependency of this artifact. */
  link(artifact: Artifact): void;
  /** Removes artifact as a dependency of this artifact. */
  unlink(artifact: Artifact): void;
  get project_path(): string;
  get absolute_path(): string;
  get filename(): string;
  updateFilename(filename: string): void;
  get is_page(): boolean;
  get ext(): string;
  /** Updates the file extension. */
  updateExt(ext: string): void;
  /** Returns read-only copy of the dependencies of this artifact. */
  get dependencies(): Set<Artifact>;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
  bytes(): Promise<Uint8Array>;
  /** Returns the size of the artifact in bytes. */
  size(): Promise<number>;
  /**
   * Returns the size of the artifact in bytes, assuming it has been loaded.
   * @throws {Error} If there is no content in memory (file was not read from disk).
   */
  get sizeUnsafe(): number;
  /** Updates artifact contents, replacing any existing content. */
  update(data: ArtifactContent | ArtifactContent[]): void;
  /** Appends to the artifact contents. */
  append(data: ArtifactContent): void;
  /** Deletes the artifact from build context. */
  delete(): void;
  /** Writes the artifact to disk. */
  flush(): Promise<void>;
  toString(): string;
  [inspect.custom](): string;
}
//#endregion
//#region src/utils.d.ts
type Promisable<T> = T | Promise<T>;
//#endregion
//#region src/build/plugins.d.ts
type Plugin = {
  filter: '*' | RegExp;
  transform: (artifact: Artifact, options: {
    source_path: string;
    is_prod: boolean;
  }) => Promisable<void>;
  end?: () => Promisable<void>;
};
//#endregion
//#region src/build/options.d.ts
type Config = {
  /** List of plugins to use. */plugins?: Plugin[]; /** Build options. */
  build?: {
    /** If script or style size is within this threshold, it will be inlined into page. */inlineTreshold?: number;
  }; /** Server options. */
  server?: {
    /** Config for which server to build. */runtime?: 'hono' | 'nginx'; /** Port to listen on. */
    port?: number;
  };
};
//#endregion
export type { Artifact, Config, Plugin };