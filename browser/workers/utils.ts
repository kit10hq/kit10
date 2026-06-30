/** Creates and ID for request. */
export function createId(): string {
	return `${Date.now()}.${Math.random().toString(36).slice(2)}`;
}

/** Returns whether the value is a function. */
export function isFunction(
	value: unknown,
): value is (...args: unknown[]) => unknown {
	return typeof value === 'function';
}
