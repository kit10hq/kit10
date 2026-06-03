import { customAlphabet } from 'nanoid';

export const createId = customAlphabet(
	'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
	16,
);
export const createLowercaseId = customAlphabet(
	'0123456789abcdefghijklmnopqrstuvwxyz',
	16,
);
