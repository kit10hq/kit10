export const IS_WINDOW = globalThis.constructor.name === 'Window';
export const IS_SERVICE_WORKER =
	globalThis.constructor.name === 'ServiceWorkerGlobalScope';

export const IS_SERVICE_WORKER_SUPPORTED =
	IS_WINDOW && 'serviceWorker' in navigator;

// /**
//  * Checks if the current environment is a Service Worker.
//  * @param _self -
//  * @returns -
//  */
// export function isServiceWorker(
// 	_self: unknown,
// ): _self is ServiceWorkerGlobalScope & typeof globalThis {
// 	return IS_SERVICE_WORKER;
// }
