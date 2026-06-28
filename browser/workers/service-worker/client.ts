// oxlint-disable unicorn/no-abusive-eslint-disable
/* eslint-disable n/no-unsupported-features/node-builtins */

import { eventTarget, parseWorkerMessage } from '../events.js';
import { createId } from '../utils.js';

const IS_SERVICE_WORKER_SUPPORTED =
	'serviceWorker' in navigator
	&& globalThis.localStorage?.getItem('swdr_disable_sw') !== '1';
// const SYMBOL_WORKER_TERMINATED = Symbol('worker-terminated');
// This promise resolves to boolean indicating whether the page is controllable by Service Worker (when controller first becomes available).
// Some pages can not be controlled by Service Worker, e.g. pages served over HTTP or pages reloaded with hard cache reset (Ctrl+Shift+R, Ctrl+F5).
// On this pages, Service Worker is available as feature and maybe Service Worker is already running but page wouldn't be able to connect to it.
const { promise: is_page_controllable_promise, resolve: setPageControllable } =
	Promise.withResolvers<boolean>();
if (!IS_SERVICE_WORKER_SUPPORTED) {
	setPageControllable(false);
}

let is_created = false;
export class Kit10ServiceWorkerClient {
	readonly id = createId();
	#url: string;
	#fallbackGetter: () => Promise<unknown>;
	#start_promise: Promise<void> | undefined;
	// #termination_promise: Promise<typeof SYMBOL_WORKER_TERMINATED> | undefined;
	#response_resolvers = new Map<string, (value: unknown) => void>();

	constructor(
		readonly name: string,
		url: string,
		fallbackGetter: () => Promise<unknown>,
		handlers: Record<string, (...args: unknown[]) => unknown>, // WorkerClientHandlers,
	) {
		if (is_created) {
			throw new Error('Kit10ServiceWorkerClient was already created.');
		}

		is_created = true;

		this.#url = url;
		this.#fallbackGetter = fallbackGetter;

		eventTarget.on('->+window', async (event) => {
			const { id, method, args } = event.detail;
			const handler = handlers[method];
			if (handler) {
				const result = await handler(...args);
				eventTarget.emit('+window->', { id, value: result });

				// for dynamically imported handlers
				// const module_ = await handler[0]();
				// const fn = module_[handler[1]];
				// if (isFunction(fn)) {
				// 	const result = await fn(...args);
				// 	eventTarget.emit('+window->', {
				// 		id,
				// 		value: result,
				// 	});
				// }
			}
		});

		eventTarget.on(`${name}->`, (event) => {
			const { id, value } = event.detail;
			const resolve = this.#response_resolvers.get(id);
			if (resolve) {
				resolve(value);
				this.#response_resolvers.delete(id);
			}
		});
	}

	start(): Promise<void> {
		this.#start_promise ??= this.#start();
		return this.#start_promise;
	}

	/** Tries to start a Worker. */
	async #start(): Promise<void> {
		if (IS_SERVICE_WORKER_SUPPORTED) {
			navigator.serviceWorker.addEventListener('controllerchange', () => {
				this.#processController();
			});

			try {
				const registration = await navigator.serviceWorker.register(this.#url, {
					// type: 'module', // Firefox does not support ES modules in Service Workers
					scope: '/',
					updateViaCache: 'none',
				});
				// console.log('[Kit10ServiceWorkerClient] registration', registration, registration?.active, registration?.active?.state);
				// if true, SW is already loaded.
				// when registering new SW, "registration.active" will be null, because the SW is not loaded/installed/activated yet.
				if (registration.active?.state === 'activated') {
					// console.log('SW is already activated');
					this.#processController();
				}

				// We should not add a listener that sends message to a worker there as we dont know yet if the page is controllable by worker.
				// With Ctrl+F5, the service worker creation does not throw, so we can only wait for "is_page_controllable_promise".
			} catch (error) {
				// oxlint-disable-next-line no-console
				console.error(error);
				setPageControllable(false);
			}
		} else {
			setPageControllable(false);
		}

		const is_page_controllable = await is_page_controllable_promise;
		// If we can connect to the Service Worker, bind event target to it
		if (is_page_controllable) {
			navigator.serviceWorker.addEventListener('message', (event) => {
				const parsed = parseWorkerMessage(event.data);
				if (
					parsed.success
					&& (parsed.output.type === '->+window'
						|| parsed.output.type === `${this.name}->`)
				) {
					eventTarget.emit(parsed.output.type, parsed.output.detail);
				}
			});

			eventTarget.on(`->${this.name}`, (event) => {
				this.#sendToWorker({
					type: `->${this.name}`,
					detail: event.detail,
				});
			});

			// As Window can not respond to Service Worker broadcasts, we do not support "+window->" event.
		}
		// if page can not be controlled by Service Worker, start fallback module
		else {
			// // as we dont have real worker, it will never be terminated
			// this.#termination_promise = new Promise(() => {
			// 	// do nothing
			// });

			// load in-window module for worker emulation
			await this.#fallbackGetter();
		}
	}

	#activeSwController: ServiceWorker | undefined;

	#processController() {
		const { controller } = navigator.serviceWorker;

		if (controller) {
			setPageControllable(true);
			this.#activeSwController = controller;

			// console.info('[Kit10ServiceWorkerClient] bound to the controller');
		}
		// if there WAS a controller, but now there isn't, reload page immediately.
		else if (this.#activeSwController) {
			// oxlint-disable-next-line no-console
			console.error(
				'This tab lost its Service Worker Controller. Kit10 can not operate in this conditions, so tab will be reloaded.',
			);
			location.reload();
		}
		// is there is no controller and never was, we know that this page is not controllable by worker.
		else {
			setPageControllable(false);
		}
	}

	async #sendToWorker(payload: unknown): Promise<void> {
		if (this.#activeSwController) {
			this.#activeSwController.postMessage(
				// oxlint-disable-next-line unicorn/require-post-message-target-origin
				payload,
			);
		} else {
			await Promise.race([
				new Promise((_resolve, reject) => {
					setTimeout(() => reject(new Error('Request timeout.')), 5000);
				}),
				new Promise((resolve) => {
					navigator.serviceWorker.addEventListener(
						'controllerchange',
						resolve,
						{ once: true },
					);
				}),
			]);

			return this.#sendToWorker(payload);
		}
	}

	async send(method: string, args: unknown[]): Promise<unknown> {
		// start worker, maybe it is dead or not started at all
		await this.start();

		// when worker started, send request...
		const id = createId();
		eventTarget.emit(`->${this.name}`, {
			id,
			method,
			args,
		});

		// and race it against termination promise
		// if real worker is dead (does not send ping), "termination" promise will resolve
		// in this case, we just call this function again

		const { promise, resolve } = Promise.withResolvers<unknown>();
		this.#response_resolvers.set(id, resolve);
		// FIXME: Unlike Worker, we assume that Service Worker never disappears completely, so we don't need termination promise.
		// *****: Like, it can be replaced with new Service Worker but never just be gone to be replaced with fallback.
		// *****: In Safari we can press Cmd+Shift+E to clear cache and Service Worker will disappear from page, but we reload tab in this case.
		// *****: Maybe we need to support worker termination like Safari cache reset and fall back to in-page worker code instead of reloading page?
		// const result = await Promise.race([promise, this.#termination_promise]);
		// if (result === SYMBOL_WORKER_TERMINATED) {
		// 	this.#response_resolvers.delete(id);
		// 	return this.send(method, args);
		// }

		return promise;
	}
}
