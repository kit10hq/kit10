/** Creates and ID for request. */
export function createId(): string {
	return `${Date.now()}.${Math.random().toString(36).slice(2)}`;
}
