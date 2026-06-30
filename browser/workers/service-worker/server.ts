/// <reference types="@types/serviceworker" />

import { eventTarget, parseWorkerMessage } from '../events.js';
import { createId } from '../utils.js';

const { promise: readyPromise, resolve: onServiceWorkerReady } =
	// oxlint-disable-next-line typescript/no-invalid-void-type
	Promise.withResolvers<void>();

export class Kit10ServiceWorkerServer {
	readonly id = createId();

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

		// console.log(`[SERVICE WORKER ${this.id}] started.`);
	}

	/** Bind worker addEventListener/postMessage to the event target. */
	bindWorker() {
		globalThis.addEventListener('install', (/* event: ExtendableEvent */) => {
			// console.log(`[SERVICE WORKER ${this.id}] installing...`);

			globalThis.skipWaiting();
		});

		globalThis.addEventListener('activate', (event: ExtendableEvent) => {
			// console.log(`[SERVICE WORKER ${this.id}] activated.`);

			event.waitUntil(
				(async () => {
					await globalThis.clients.claim();

					onServiceWorkerReady();
					globalThis.dispatchEvent(new CustomEvent('kit10.claimed'));
					// oxlint-disable-next-line no-console
				})().catch(console.error),
			);
		});

		// message sent from the worker to the window
		eventTarget.on(`->+window`, (event) => {
			this.#broadcast({
				type: event.type,
				detail: event.detail,
			});
		});

		// worker responds to window request
		eventTarget.on(`${this.name}->`, (event) => {
			this.#broadcast({
				type: event.type,
				detail: event.detail,
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

	async #pingPage() {
		await this.#broadcast({ type: 'ping' });

		setTimeout(() => this.#pingPage(), 1000);
	}

	// oxlint-disable-next-line class-methods-use-this
	async #broadcast(message: unknown) {
		const window_clients = await globalThis.clients.matchAll();
		for (const window_client of window_clients) {
			window_client.postMessage(
				// oxlint-disable-next-line unicorn/require-post-message-target-origin
				structuredClone(message),
			);
		}
	}
}

// In service workers, window can not "respond" to messages because service worker broadcasts a message to all windows.

/** Broadcast a message to all windows. As it is a broadcast, response is not expected. */
export async function broadcastToWindows(
	method: string,
	args: unknown[],
): Promise<void> {
	// in workers, we import files first and only then run .bindWorker()
	// and request can be sent as side-effect in imported modules,
	// therefore, it will be lost.
	// so, we need to wait for the next tick before sending the request,
	// waiting for worker code to be loaded and executed at top level.
	if (globalThis.constructor.name !== 'Window') {
		await readyPromise;
	}

	const id = createId();
	eventTarget.emit('->+window', {
		id,
		method,
		args,
	});
}
