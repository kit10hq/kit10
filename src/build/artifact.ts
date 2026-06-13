import fs from 'node:fs/promises';
import nodePath from 'node:path';
import { inspect } from 'node:util';
import { createId } from '../utils.js';
import { createDirectory } from './fs/directory.js';
import * as buildOptions from './options.js';
import { resolveProjectPath } from './utils.js';

export type ArtifactContent = ConstructorParameters<typeof Blob>[0][number];

const all: Map<string, Artifact> = new Map<string, Artifact>();
export const collections = {
	pre_html: new Set<Artifact>(),
	html: new Set<Artifact>(),
	bundle: new Set<Artifact>(),
};

const dependencies: Map<Artifact, Set<Artifact>> = new Map<
	Artifact,
	Set<Artifact>
>();
const dependents: Map<Artifact, Set<Artifact>> = new Map<
	Artifact,
	Set<Artifact>
>();

const flushed_table: Record<string, unknown>[] = [];

// const SYMBOL: unique symbol = Symbol('Artifact');

export class Artifact {
	readonly id: string = createId(36);
	#project_path: string;
	#content: ArtifactContent[] | null = null;
	meta: Record<string, unknown> = {};

	constructor(
		project_path: string,
		content?: ArtifactContent | ArtifactContent[],
	) {
		if (
			project_path.startsWith('/')
			|| project_path.startsWith('./')
			|| project_path.startsWith('../')
			|| project_path.startsWith('#')
		) {
			throw new Error(`Invalid path for artifact: "${project_path}".`);
		}

		this.#project_path = project_path;

		if (all.has(this.#project_path)) {
			// oxlint-disable-next-line no-constructor-return
			return all.get(project_path)!;
		}

		all.set(this.#project_path, this);

		if (content !== undefined) {
			this.#content = Array.isArray(content) ? content : [content];
		}
	}

	create(relative_path: string): Artifact;
	create(options: {
		ext: string;
		content?: ArtifactContent | ArtifactContent[];
	}): Artifact;
	create(
		arg0:
			| string
			| {
					ext: string;
					content?: ArtifactContent | ArtifactContent[];
			  },
	): Artifact {
		let relative_path: string;
		let content: ArtifactContent | ArtifactContent[] | undefined;
		if (typeof arg0 === 'string') {
			relative_path = arg0;
		} else {
			relative_path = this.filename.replace(
				/\.[^.]+$/u,
				`-${createId()}.${arg0.ext}`,
			);
			content = arg0.content ?? [];
		}

		const project_path = resolveProjectPath(
			this.#project_path,
			'./' + relative_path,
		);

		const newArtifact = new Artifact(project_path, content);
		this.link(newArtifact);
		return newArtifact;
	}

	/** Adds artifact as a dependency of this artifact. */
	link(artifact: Artifact): void {
		if (!dependencies.has(this)) {
			dependencies.set(this, new Set<Artifact>());
		}

		dependencies.get(this)!.add(artifact);

		if (!dependents.has(artifact)) {
			dependents.set(artifact, new Set<Artifact>());
		}

		dependents.get(artifact)!.add(this);
	}

	/** Removes artifact as a dependency of this artifact. */
	unlink(artifact: Artifact): void {
		dependencies.get(this)?.delete(artifact);

		const childArtifact_dependents = dependents.get(artifact);
		childArtifact_dependents?.delete(this);
		if (!childArtifact_dependents || childArtifact_dependents.size === 0) {
			artifact.delete();
		}
	}

	get project_path(): string {
		return this.#project_path;
	}

	get absolute_path(): string {
		return nodePath.join(buildOptions.source_path, this.#project_path);
	}

	get filename(): string {
		return this.#project_path.split(nodePath.sep).at(-1)!;
	}

	updateFilename(filename: string): void {
		if (filename.includes(nodePath.sep)) {
			throw new Error(`filename must not include path separators: ${filename}`);
		}

		all.delete(this.#project_path);
		this.#project_path = this.#project_path.replace(
			/\/[^/]+$/u,
			`/${filename}`,
		);
		all.set(this.#project_path, this);
	}

	get is_page(): boolean {
		return this.#project_path.match(/\+page\.[^.]+$/u) !== null;
	}

	get ext(): string {
		return this.#project_path.split('/').at(-1)!.split('.').at(-1)!;
	}

	/** Updates the file extension. */
	updateExt(ext: string): void {
		all.delete(this.#project_path);
		this.#project_path = this.#project_path.replace(/\.[^.]+$/u, `.${ext}`);
		all.set(this.#project_path, this);
	}

	/** Returns read-only copy of the dependencies of this artifact. */
	get dependencies(): Set<Artifact> {
		return new Set(dependencies.get(this));
	}

	#load() {
		if (this.#content === null) {
			return (
				fs
					.readFile(this.absolute_path)
					// eslint-disable-next-line promise/always-return
					.then((content) => {
						this.#content = [content];
					})
			);
		}
	}

	#blob_cache: Blob | undefined;

	get #blob(): Blob {
		if (this.#content === null) {
			throw new Error(`Content not loaded for ${this.#project_path}.`);
		}

		if (this.#blob_cache === undefined) {
			this.#blob_cache = new Blob(this.#content);
		}

		return this.#blob_cache;
	}

	async text(): Promise<string> {
		await this.#load();
		return this.#blob.text();
	}

	async arrayBuffer(): Promise<ArrayBuffer> {
		await this.#load();
		return this.#blob.arrayBuffer();
	}

	async bytes(): Promise<Uint8Array> {
		await this.#load();
		return this.#blob.bytes();
	}

	/** Returns the size of the artifact in bytes. */
	async size(): Promise<number> {
		await this.#load();
		return this.#blob.size;
	}

	/**
	 * Returns the size of the artifact in bytes, assuming it has been loaded.
	 * @throws {Error} If there is no content in memory (file was not read from disk).
	 */
	get sizeUnsafe(): number {
		return this.#blob.size;
	}

	/** Updates artifact contents, replacing any existing content. */
	update(data: ArtifactContent | ArtifactContent[]): void {
		this.#content = Array.isArray(data) ? data : [data];
		this.#blob_cache = undefined;
	}

	/** Appends to the artifact contents. */
	append(data: ArtifactContent): void {
		if (this.#content === null) {
			throw new Error(`Content not loaded for ${this.#project_path}.`);
		}

		this.#content.push(data);
		this.#blob_cache = undefined;
	}

	/** Deletes the artifact from build context. */
	delete(): void {
		all.delete(this.#project_path);

		const thisArtifact_dependents = dependents.get(this);
		if (thisArtifact_dependents) {
			for (const dependentArtifact of thisArtifact_dependents) {
				dependencies.get(dependentArtifact)?.delete(this);
			}
		}

		const thisAartifact_dependencies = dependencies.get(this);
		if (thisAartifact_dependencies) {
			for (const dependencyArtifact of thisAartifact_dependencies) {
				this.unlink(dependencyArtifact);
			}
		}

		dependents.delete(this);
		dependencies.delete(this);

		for (const collection of Object.values(collections)) {
			collection.delete(this);
		}
	}

	#is_flushed = false;

	/** Writes the artifact to disk. */
	async flush(): Promise<void> {
		if (this.#is_flushed) {
			// console.log('[Artifact#flush] already flushed', this.project_path);
			return;
		}

		// console.log('[Artifact#flush] flushing', this.project_path, '...');

		this.#is_flushed = true;

		const output_path = nodePath.join(
			buildOptions.output_static_path,
			this.#project_path,
		);

		if (this.#content === null) {
			await fs.cp(this.absolute_path, output_path);
		} else {
			const contents = await this.bytes();
			await fs.writeFile(output_path, contents);
		}

		flushed_table.push({
			filename: this.#project_path,
			size: String(this.sizeUnsafe).padStart(6),
		});
	}

	toString(): string {
		return [
			`Artifact(${this.#project_path}) {`,
			`  id: ${this.id}`,
			`  content: <${this.#content ? `${this.#blob.size} bytes` : 'not loaded'}>`,
			`}`,
		].join('\n');
	}

	[inspect.custom](): string {
		return this.toString();
	}
}

/** Returns whether an artifact exists for the given project path. */
export function exists(project_path: string): boolean {
	return all.has(project_path);
}

/** Writes a single artifact to disk. */
async function flushOne(artifact: Artifact) {
	await createDirectory(nodePath.dirname(artifact.project_path));

	const promises = [artifact.flush()];
	for (const dependencyArtifact of artifact.dependencies) {
		promises.push(flushOne(dependencyArtifact));
	}

	await Promise.all(promises);
}

/** Writes all artifacts to disk. */
export async function flush(): Promise<void> {
	const promises = [];
	// for (const artifact of all.values()) {
	for (const artifact of collections.html.values()) {
		promises.push(flushOne(artifact));
	}

	await Promise.all(promises);

	// oxlint-disable-next-line no-console
	console.table(flushed_table);
}
