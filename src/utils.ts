export const textEncoder: InstanceType<typeof TextEncoder> = new TextEncoder();
export const textDecoder: InstanceType<typeof TextDecoder> = new TextDecoder();

/**
 * Returns whether a path already has non-relative behavior.
 * @param path -
 * @returns -
 */
export function isAbsoluteOrSpecialPath(path: string): boolean {
	return (
		path.startsWith('/')
		|| path.startsWith('#')
		|| path.startsWith('//')
		|| /^[a-z][a-z\d+.-]*:/iu.test(path)
	);
}
