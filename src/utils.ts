import nodePath from 'node:path';
import { customAlphabet } from 'nanoid';

export const createId: (size?: number) => string = customAlphabet(
	'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
	16,
);
export const createLowercaseId: (size?: number) => string = customAlphabet(
	'0123456789abcdefghijklmnopqrstuvwxyz',
	16,
);

// export const textEncoder: InstanceType<typeof TextEncoder> = new TextEncoder();
// export const textDecoder: InstanceType<typeof TextDecoder> = new TextDecoder();

/** Checks if path points to a file in the project. */
export function isLocalPath(path: string): boolean {
	if (path.startsWith('//')) {
		return false;
	}

	if (new URL(path, 'file://').protocol !== 'file:') {
		return false;
	}

	return true;
}

/** Returns the path to a file imported from another file. */
export function getRelativeProjectPath(
	project_path: string,
	relative_path: string,
): string {
	if (!isLocalPath(relative_path)) {
		throw new Error(`Can not resolve non-local path: ${relative_path}`);
	}

	return relative_path.startsWith('/')
		? relative_path.slice(1)
		: nodePath.join(nodePath.dirname(project_path), relative_path);
}

/** Returns a safe value for an HTML attribute. */
export function escapeAttributeValue(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}
