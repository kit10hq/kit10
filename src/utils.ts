import { customAlphabet } from 'nanoid';

export const createId: (size?: number) => string = customAlphabet(
	'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
	16,
);
export const createLowercaseId: (size?: number) => string = customAlphabet(
	'0123456789abcdefghijklmnopqrstuvwxyz',
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
