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
