export type WorkerClientHandlers = Record<
	string,
	[
		// first value: getter of module like () => import('./foo.js')
		() => Promise<Record<string, unknown>>,
		// second value: name of the function to call on the module
		string,
	]
>;
