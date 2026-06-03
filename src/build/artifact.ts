import fs from 'node:fs/promises';
import nodePath from 'node:path';
import * as options from '../options.js';
import { createId } from '../utils.js';

const artifacts = new Map<string, Artifact>();
const artifacts_dependencies = new WeakSet<Artifact>();
export const artifact_collections = {
	pre_html: new Set<Artifact>(),
	html: new Set<Artifact>(),
};
const directories = new Set<string>();
const mkdir_promises: Promise<unknown>[] = [];

const SYMBOL = Symbol('Artifact');

export class Artifact {
	readonly id: string = createId();
	#path: string;
	#content: string | null = null;
	#parentArtifact: Artifact | undefined;
	dependencies = new Set<Artifact>();
	readonly meta: Record<string, unknown> = {};

	constructor(symbol: typeof SYMBOL, arg0: string | Artifact, ext?: string) {
		if (symbol !== SYMBOL) {
			throw new Error(
				'Artifact constructor is private, use createArtifact() instead.',
			);
		}

		if (typeof arg0 === 'string') {
			let path = arg0;
			if (path.startsWith('/') || path.startsWith('.')) {
				path = nodePath.relative(options.source_path, path);
				if (path.startsWith('.')) {
					throw new Error(`Invalid path for artifact: "${path}".`);
				}
			}

			this.#path = path;
		} else {
			this.#parentArtifact = arg0;
			this.#parentArtifact.dependencies.add(this);
			this.#path = `${arg0.path.includes('/') ? arg0.path.slice(0, arg0.path.lastIndexOf('/') + 1) : ''}${this.id}.${ext}`;

			artifacts_dependencies.add(this);
		}

		artifacts.set(this.#path, this);

		const dir = nodePath.dirname(
			nodePath.join(options.output_static_path, this.#path),
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
			nodePath.join(options.source_path, this.path),
			'utf8',
		);
	}

	/** Returns the file content. */
	text(): string {
		if (this.#content === undefined || this.#content === null) {
			throw new Error(`Artifact "${this.path}" not loaded.`);
		}

		return this.#content;
	}

	/** Updates temporary file content. */
	update(content: string): void {
		this.#content = content;
	}

	/** Appends content to the temporary file. */
	append(content: string): void {
		this.#content = (this.#content ?? '') + content;
	}

	/** Deletes the temporary file. */
	delete(): void {
		this.#content = null;
		artifacts.delete(this.path);

		if (this.#parentArtifact !== undefined) {
			this.#parentArtifact.dependencies.delete(this);
		}
	}

	/** Creates dependency artifact. */
	create(ext: string, content: string): Artifact {
		const artifact = new Artifact(SYMBOL, this, ext);
		artifact.update(content);

		return artifact;
	}

	/** Makes artifact independent. */
	detach(): void {
		if (this.#parentArtifact !== undefined) {
			this.#parentArtifact.dependencies.delete(this);
			artifacts_dependencies.delete(this);
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
export function logArtifacts(): void {
	console.log([...artifacts.keys()]);
	console.log(
		'artifacts',
		new Map(
			[...artifacts.values()].map((artifact) => [
				artifact.path,
				artifact.text(),
			]),
		),
	);
}

/** Writes all temporary files to disk. */
export async function flushArtifacts(): Promise<void> {
	await Promise.all(mkdir_promises);

	const promises = [];
	for (const artifact of artifacts.values()) {
		if (artifacts_dependencies.has(artifact)) {
			continue;
		}

		const output_file_path = nodePath.join(
			options.output_static_path,
			artifact.path,
		);
		const content = artifact.text();

		let promise;
		if (content === null) {
			const source_file_path = nodePath.join(
				options.source_path,
				artifact.path,
			);
			promise = fs.cp(source_file_path, output_file_path);
		} else {
			promise = fs.writeFile(output_file_path, content);
		}

		promises.push(promise);
	}

	await Promise.all(promises);
}
