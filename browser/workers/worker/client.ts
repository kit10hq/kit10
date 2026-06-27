import { eventTarget, parseWorkerMessage } from '../events.js';
import { createId } from '../utils.js';

const SYMBOL_WORKER_TERMINATED = Symbol('worker-terminated');

export class Kit10WorkerClient {
	readonly id = createId();
	#url: string;
	#fallbackGetter: () => Promise<unknown>;
	#start_promise: Promise<void> | undefined;
	#termination_promise: Promise<typeof SYMBOL_WORKER_TERMINATED> | undefined;
	#response_resolvers = new Map<string, (value: unknown) => void>();

	constructor(
		readonly name: string,
		url: string,
		fallbackGetter: () => Promise<unknown>,
		handlers: Record<string, (...args: unknown[]) => unknown>,
	) {
		this.#url = url;
		this.#fallbackGetter = fallbackGetter;

		eventTarget.on('->+window', async (event) => {
			const { id, method, args } = event.detail;
			const handler = handlers[method];
			if (handler) {
				const result = await handler(...args);
				eventTarget.emit('+window->', {
					id,
					value: result,
				});
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
		if ('Worker' in globalThis && Worker !== undefined) {
			const is_worker_started = await new Promise<boolean>((resolve) => {
				try {
					let timeout_id: ReturnType<typeof setTimeout> | undefined;
					const worker = new Worker(this.#url);

					const offs = [
						eventTarget.on(`->${this.name}`, (event) => {
							worker.postMessage({
								type: `->${this.name}`,
								detail: event.detail,
								// oxlint-disable-next-line unicorn/require-post-message-target-origin
							});
						}),
						eventTarget.on('+window->', (event) => {
							worker.postMessage({
								type: '+window->',
								detail: event.detail,
								// oxlint-disable-next-line unicorn/require-post-message-target-origin
							});
						}),
					];

					const { promise: termination_promise, resolve: onWorkerTerminated } =
						// oxlint-disable-next-line typescript/no-invalid-void-type
						Promise.withResolvers<typeof SYMBOL_WORKER_TERMINATED>();

					let was_worker_active = false;
					/** Clean up the worker. */
					// oxlint-disable-next-line no-inner-declarations
					const cleanup = () => {
						for (const off of offs) {
							off();
						}

						worker.terminate();

						if (was_worker_active) {
							this.#start_promise = undefined;
							onWorkerTerminated(SYMBOL_WORKER_TERMINATED);
						}
					};

					let is_resolved = false;
					// eslint-disable-next-line jsdoc/require-jsdoc, no-inner-declarations
					function resolveOnce(value: boolean) {
						if (!is_resolved) {
							is_resolved = true;

							resolve(value);

							if (!value) {
								cleanup();
							}
						}
					}

					worker.addEventListener('message', (event) => {
						was_worker_active = true;
						this.#termination_promise = termination_promise;

						resolveOnce(true);

						clearTimeout(timeout_id);
						timeout_id = setTimeout(cleanup, 1500);

						const parsed = parseWorkerMessage(event.data);
						if (
							parsed.success
							&& (parsed.output.type === '->+window'
								|| parsed.output.type === `${this.name}->`)
						) {
							eventTarget.emit(parsed.output.type, parsed.output.detail);
						}
					});

					worker.addEventListener('error', () => {
						resolveOnce(false);
					});

					setTimeout(() => {
						resolveOnce(false);
					}, 10_000);
				} catch {
					resolve(false);
				}
			});

			if (is_worker_started) {
				return;
			}
		}

		// as we dont have real worker, it will never be terminated
		this.#termination_promise = new Promise(() => {
			// do nothing
		});

		// load in-window module for worker emulation
		await this.#fallbackGetter();
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
		const result = await Promise.race([promise, this.#termination_promise]);
		if (result === SYMBOL_WORKER_TERMINATED) {
			this.#response_resolvers.delete(id);
			return this.send(method, args);
		}

		return result;
	}
}
