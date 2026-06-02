import fs from 'node:fs/promises';
import nodePath from 'node:path';
import * as options from '../options.js';

const files = new Map<string, string | null>();
const directories = new Set<string>();
const mkdir_promises: Promise<unknown>[] = [];

export class TempFile {
	constructor(public readonly path: string) {
		if (path.startsWith('/') || path.startsWith('.')) {
			throw new Error(`TempFile path must be relative, received "${path}".`);
		}

		if (!files.has(path)) {
			files.set(path, null);
		}

		const dir = nodePath.dirname(
			nodePath.join(options.output_static_path, path),
		);
		if (!directories.has(dir)) {
			directories.add(dir);
			mkdir_promises.push(fs.mkdir(dir, { recursive: true }));
		}
	}

	/** Loads the file content from the source. */
	async load(): Promise<void> {
		if (typeof files.get(this.path) === 'string') {
			// oxlint-disable-next-line unicorn/prefer-type-error
			throw new Error(
				`TempFile "${this.path}" already has content, but source was requested. This can lead to incorrect behavior.`,
			);
		}

		const content = await fs.readFile(
			nodePath.join(options.source_path, this.path),
			'utf8',
		);

		files.set(this.path, content);
	}

	/** Returns the file content. */
	text(): string {
		const content = files.get(this.path);
		if (content === undefined || content === null) {
			throw new Error(`TempFile not loaded: ${this.path}`);
		}

		return content;
	}

	/** Updates temporary file content. */
	update(content: string) {
		files.set(this.path, content);
	}

	/** Deletes the temporary file. */
	delete() {
		files.delete(this.path);
	}

	/**
	 * Creates TempFile and loads it from disk.
	 * @param path -
	 */
	static async load(path: string): Promise<TempFile> {
		const temp_file = new TempFile(path);
		await temp_file.load();
		return temp_file;
	}

	/**
	 * Returns whether the given path has a temporary content.
	 * @param path - The path to check.
	 */
	static exists(path: string): boolean {
		return typeof files.get(path) === 'string';
	}
}

/** Writes all temporary files to disk. */
export async function writeTempFiles(): Promise<void> {
	await Promise.all(mkdir_promises);

	console.log(files);

	const promises = [];
	for (const [path, content] of files.entries()) {
		const output_file_path = nodePath.join(options.output_static_path, path);
		let promise;
		if (content === null) {
			const source_file_path = nodePath.join(options.source_path, path);
			promise = fs.cp(source_file_path, output_file_path);
		} else {
			promise = fs.writeFile(output_file_path, content);
		}

		promises.push(promise);
	}

	await Promise.all(promises);
}
