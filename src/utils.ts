import fs from 'node:fs/promises';
import nodePath from 'node:path';
import { customAlphabet } from 'nanoid';

export type Promisable<T> = T | Promise<T>;

export const createId: (size?: number) => string = customAlphabet(
	'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
	16,
);
export const createLowercaseId: (size?: number) => string = customAlphabet(
	'0123456789abcdefghijklmnopqrstuvwxyz',
	16,
);
export const createLetterId: (size?: number) => string = customAlphabet(
	'abcdefghijklmnopqrstuvwxyz',
	16,
);

/** Returns a safe value for an HTML attribute. */
export function escapeAttributeValue(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

/** Removes all files and subdirectories from a directory, but not the directory itself. */
export async function clearDir(dir: string): Promise<void> {
	const files = await fs.readdir(dir);
	await Promise.all(
		files.map((file) => fs.rm(nodePath.join(dir, file), { recursive: true })),
	);
}
