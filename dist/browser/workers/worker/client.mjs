import { n as eventTarget, r as parseWorkerMessage, t as createId } from "../../../utils-BNcSbbpj.mjs";
//#region browser/workers/worker/client.ts
const SYMBOL_WORKER_TERMINATED = Symbol("worker-terminated");
var Kit10WorkerClient = class {
	name;
	#url;
	#fallbackGetter;
	#start_promise;
	#termination_promise;
	#response_resolvers = /* @__PURE__ */ new Map();
	constructor(name, url, fallbackGetter, handlers) {
		this.name = name;
		this.#url = url;
		this.#fallbackGetter = fallbackGetter;
		eventTarget.on("->+window", async (event) => {
			const { id, method, args } = event.detail;
			const handler = handlers[method];
			if (handler) {
				const result = await handler(...args);
				eventTarget.emit("+window->", {
					id,
					value: result
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
	start() {
		this.#start_promise ??= this.#start();
		return this.#start_promise;
	}
	/** Tries to start a Worker. */
	async #start() {
		if ("Worker" in globalThis && Worker !== void 0) {
			if (await new Promise((resolve) => {
				try {
					let timeout_id;
					const worker = new Worker(this.#url);
					const offs = [eventTarget.on(`->${this.name}`, (event) => {
						worker.postMessage({
							type: `->${this.name}`,
							detail: event.detail
						});
					}), eventTarget.on("+window->", (event) => {
						worker.postMessage({
							type: "+window->",
							detail: event.detail
						});
					})];
					const { promise: termination_promise, resolve: onWorkerTerminated } = Promise.withResolvers();
					let was_worker_active = false;
					/** Clean up the worker. */
					const cleanup = () => {
						for (const off of offs) off();
						worker.terminate();
						if (was_worker_active) {
							this.#start_promise = void 0;
							onWorkerTerminated(SYMBOL_WORKER_TERMINATED);
						}
					};
					let is_resolved = false;
					function resolveOnce(value) {
						if (!is_resolved) {
							is_resolved = true;
							resolve(value);
							if (!value) cleanup();
						}
					}
					worker.addEventListener("message", (event) => {
						was_worker_active = true;
						this.#termination_promise = termination_promise;
						resolveOnce(true);
						clearTimeout(timeout_id);
						timeout_id = setTimeout(cleanup, 1500);
						const parsed = parseWorkerMessage(event.data);
						if (parsed.success && (parsed.output.type === "->+window" || parsed.output.type === `${this.name}->`)) eventTarget.emit(parsed.output.type, parsed.output.detail);
					});
					worker.addEventListener("error", () => {
						resolveOnce(false);
					});
					setTimeout(() => {
						resolveOnce(false);
					}, 1e4);
				} catch {
					resolve(false);
				}
			})) return;
		}
		this.#termination_promise = new Promise(() => {});
		await this.#fallbackGetter();
	}
	async send(method, args) {
		await this.start();
		const id = createId();
		eventTarget.emit(`->${this.name}`, {
			id,
			method,
			args
		});
		const { promise, resolve } = Promise.withResolvers();
		this.#response_resolvers.set(id, resolve);
		const result = await Promise.race([promise, this.#termination_promise]);
		if (result === SYMBOL_WORKER_TERMINATED) {
			this.#response_resolvers.delete(id);
			return this.send(method, args);
		}
		return result;
	}
};
//#endregion
export { Kit10WorkerClient };
