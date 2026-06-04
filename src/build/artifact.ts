import fs from 'node:fs/promises';
import nodePath from 'node:path';
import * as buildOptions from '../options.js';
import { createId } from '../utils.js';
import { applyPlugins } from './plugins.js';

type ArtifactContent = string | Uint8Array;
type ArtifactOptions = {
	ext: string;
	keep_name?: boolean;
};

export const artifacts: Map<string, Artifact> = new Map<string, Artifact>();
export const artifact_collections: {
	pre_html: Set<Artifact>;
	html: Set<Artifact>;
	bundler: Set<Artifact>;
} = {
	pre_html: new Set<Artifact>(),
	html: new Set<Artifact>(),
	bundler: new Set<Artifact>(),
};
const directories = new Set<string>();
const mkdir_promises: Promise<unknown>[] = [];
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const SYMBOL: unique symbol = Symbol('Artifact');

export class Artifact {
	readonly id: string = createId();
	#path: string;
	#content: ArtifactContent | null = null;
	#parentArtifact: Artifact | undefined;
	dependencies: Set<Artifact> = new Set<Artifact>();
	readonly meta: Record<string, unknown> = {};

	constructor(
		symbol: symbol,
		arg0: string | Artifact,
		options?: ArtifactOptions,
	) {
		if (symbol !== SYMBOL) {
			throw new Error(
				'Artifact constructor is private, use createArtifact() instead.',
			);
		}

		if (typeof arg0 === 'string') {
			let path = arg0;
			if (path.startsWith('/') || path.startsWith('.')) {
				path = nodePath.relative(buildOptions.source_path, path);
				if (path.startsWith('.')) {
					throw new Error(`Invalid path for artifact: "${path}".`);
				}
			}

			this.#path = path;
		} else {
			this.#parentArtifact = arg0;
			this.#parentArtifact.dependencies.add(this);

			if (options!.keep_name) {
				this.#path = arg0.path + '.' + options!.ext;
			} else {
				this.#path = arg0.path.includes(nodePath.sep)
					? nodePath.dirname(arg0.path) + '/'
					: '';
				this.#path += `${this.id}.${options!.ext}`;
			}
		}

		artifacts.set(this.#path, this);

		const dir = nodePath.dirname(
			nodePath.join(buildOptions.output_static_path, this.#path),
		);
		if (!directories.has(dir)) {
			directories.add(dir);
			mkdir_promises.push(fs.mkdir(dir, { recursive: true }));
		}
	}

	get path(): string {
		return this.#path;
	}

	get is_page(): boolean {
		return this.#path.match(/\+page\.[^.]+$/u) !== null;
	}

	get ext(): string {
		return this.#path.split('.').pop() ?? '';
	}

	/** Updates the file extension. */
	updateExt(ext: string): void {
		artifacts.delete(this.#path);
		this.#path = this.#path.replace(/\.[^.]+$/u, `.${ext}`);
		artifacts.set(this.#path, this);
	}

	get is_dependency(): boolean {
		// return artifacts_dependencies.has(this);
		return this.#parentArtifact !== undefined;
	}

	get is_loaded(): boolean {
		return this.#content !== null;
	}

	/** Loads the file content from the source. */
	async load(): Promise<void> {
		if (typeof this.#content === 'string') {
			// oxlint-disable-next-line unicorn/prefer-type-error
			throw new Error(
				`Artifact "${this.path}" already has content, but source was requested. This can lead to incorrect behavior.`,
			);
		}

		this.#content = await fs.readFile(
			nodePath.join(buildOptions.source_path, this.path),
			'utf8',
		);
	}

	/** Returns content type. */
	get type(): 'binary' | 'text' | 'unknown' {
		if (this.#content instanceof Uint8Array) {
			return 'binary';
		}

		if (typeof this.#content === 'string') {
			return 'text';
		}

		return 'unknown';
	}

	/** Returns the file content as a string. */
	text(): string {
		if (typeof this.#content === 'string') {
			return this.#content;
		}

		if (this.#content instanceof Uint8Array) {
			return textDecoder.decode(this.#content);
		}

		throw new Error(`Artifact "${this.path}" not loaded.`);
	}

	/** Returns the file content as a buffer. */
	buffer(): Uint8Array {
		if (this.#content instanceof Uint8Array) {
			return this.#content;
		}

		if (typeof this.#content === 'string') {
			return textEncoder.encode(this.#content);
		}

		throw new Error(`Artifact "${this.path}" not loaded.`);
	}

	/** Updates temporary file content. */
	update(content: ArtifactContent): void {
		this.#content = content;
	}

	/** Appends content to the temporary file. */
	append(content: string): void {
		if (typeof this.#content !== 'string') {
			throw new TypeError(
				`Cannot append to artifact "${this.path}" with buffer content inside.`,
			);
		}

		this.#content = (this.#content ?? '') + content;
	}

	/** Deletes the temporary file. */
	delete(): void {
		this.#content = null;
		artifacts.delete(this.path);

		if (this.#parentArtifact !== undefined) {
			this.#parentArtifact.dependencies.delete(this);
		}

		for (const artifact of this.dependencies) {
			artifact.delete();
		}
	}

	/** Creates dependency artifact. */
	create(content: ArtifactContent, options: ArtifactOptions): Artifact {
		const artifact = new Artifact(SYMBOL, this, options);
		artifact.update(content);

		return artifact;
	}

	/** Processes the artifact. */
	async process(): Promise<void> {
		await applyPlugins([this], buildOptions.config.plugins);
	}

	/** Makes artifact independent. */
	detach(): void {
		if (this.#parentArtifact !== undefined) {
			this.#parentArtifact.dependencies.delete(this);
			this.#parentArtifact = undefined;
		}
	}
}

/**
 * Returns whether the given path has a temporary content.
 * @param path - The path to check.
 */
export function isArtifactAt(path: string): boolean {
	return typeof artifacts.get(path)?.text() === 'string';
}

/**
 * Creates or retrieves an Artifact for the given path.
 * @param path - The path of the artifact.
 * @returns -
 */
export function createArtifact(path: string): Artifact {
	let artifact = artifacts.get(path);
	if (artifact === undefined) {
		artifact = new Artifact(SYMBOL, path);
	}

	return artifact;
}

/** Logs artifacts. */
export function printArtifacts(): void {
	// oxlint-disable-next-line no-console
	console.log(`${artifacts.size} artifacts:`);

	const info = [];
	for (const artifact of artifacts.values()) {
		// console.info(info);
		info.push({
			filename: artifact.path,
			size: String(
				artifact.type === 'text'
					? artifact.text().length
					: artifact.type === 'binary'
						? artifact.buffer().length
						: '?',
			).padStart(6),
			// dependency: artifact.is_dependency ? '✓' : '',
		});
	}

	// oxlint-disable-next-line no-console
	console.table(info.toSorted((a, b) => a.filename.localeCompare(b.filename)));
}

/** Writes all temporary files to disk. */
export async function flushArtifacts(): Promise<void> {
	await Promise.all(mkdir_promises);

	const promises = [];
	for (const artifact of artifacts.values()) {
		const output_file_path = nodePath.join(
			buildOptions.output_static_path,
			artifact.path,
		);

		let promise;
		if (artifact.is_loaded) {
			promise = fs.writeFile(output_file_path, artifact.buffer());
		} else {
			const source_file_path = nodePath.join(
				buildOptions.source_path,
				artifact.path,
			);
			promise = fs.cp(source_file_path, output_file_path);
		}

		promises.push(promise);
	}

	await Promise.all(promises);
}
