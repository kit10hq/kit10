import { eventTarget, parseWorkerMessage } from '../events.js';
import { createId } from '../utils.js';

export class Kit10WorkerServer {
	constructor(
		readonly name: string,
		handlers: Record<string, (...args: unknown[]) => unknown>,
	) {
		eventTarget.on(`->${name}`, async (event) => {
			const { id, method, args } = event.detail;
			const handler = handlers[method];
			if (handler) {
				const result = await handler(...args);
				eventTarget.emit(`${name}->`, {
					id,
					value: result,
				});
			}
		});
	}

	/** Bind worker addEventListener/postMessage to the event target. */
	bindWorker() {
		// message sent from the worker to the window
		eventTarget.on(`->+window`, (event) => {
			globalThis.postMessage({
				type: event.type,
				detail: event.detail,
				// oxlint-disable-next-line unicorn/require-post-message-target-origin
			});
		});

		// worker responds to window request
		eventTarget.on(`${this.name}->`, (event) => {
			globalThis.postMessage({
				type: event.type,
				detail: event.detail,
				// oxlint-disable-next-line unicorn/require-post-message-target-origin
			});
		});

		globalThis.addEventListener('message', (event) => {
			const parsed = parseWorkerMessage(event.data);
			if (
				parsed.success
				&& (parsed.output.type === `->${this.name}`
					|| parsed.output.type === `+window->`)
			) {
				eventTarget.emit(parsed.output.type, parsed.output.detail);
			}
		});

		this.#pingPage();
	}

	#pingPage() {
		globalThis.postMessage(
			// oxlint-disable-next-line unicorn/require-post-message-target-origin
			{ type: 'ping' },
		);

		setTimeout(() => this.#pingPage(), 1000);
	}
}

// we do not include listener on "+window->" in every Kit10WorkerServer as event the same on the same event target
// we can create a single listener for all workers to reuse by all workers running in the window.
// if code is running in a worker, this will not make difference.
const response_resolvers = new Map<string, (value: unknown) => void>();

eventTarget.on('+window->', (event) => {
	const { id, value } = event.detail;
	const resolve = response_resolvers.get(id);
	if (resolve) {
		resolve(value);
		response_resolvers.delete(id);
	}
});

const tickPromise = new Promise<void>((resolve) => {
	setTimeout(resolve, 0);
});

/** Send a request to the window. */
export async function sendReqeustToWindow(
	method: string,
	args: unknown[],
): Promise<unknown> {
	// in workers, we import files first and only then run .bindWorker()
	// and request can be sent as side-effect in imported modules,
	// therefore, it will be lost.
	// so, we need to wait for the next tick before sending the request,
	// waiting for worker code to be loaded and executed at top level.
	if (globalThis.constructor.name !== 'Window') {
		await tickPromise;
	}

	const id = createId();
	eventTarget.emit('->+window', {
		id,
		method,
		args,
	});

	const { promise, resolve } = Promise.withResolvers<unknown>();
	response_resolvers.set(id, resolve);
	return promise;
}
