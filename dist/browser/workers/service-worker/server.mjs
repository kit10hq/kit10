import { n as eventTarget, r as parseWorkerMessage, t as createId } from "../../../utils-BNcSbbpj.mjs";
//#region browser/workers/service-worker/server.ts
const { promise: readyPromise, resolve: onServiceWorkerReady } = Promise.withResolvers();
var Kit10ServiceWorkerServer = class {
	name;
	id = createId();
	constructor(name, handlers) {
		this.name = name;
		eventTarget.on(`->${name}`, async (event) => {
			const { id, method, args } = event.detail;
			const handler = handlers[method];
			if (handler) {
				const result = await handler(...args);
				eventTarget.emit(`${name}->`, {
					id,
					value: result
				});
			}
		});
	}
	/** Bind worker addEventListener/postMessage to the event target. */
	bindWorker() {
		globalThis.addEventListener("install", () => {
			globalThis.skipWaiting();
		});
		globalThis.addEventListener("activate", (event) => {
			event.waitUntil((async () => {
				await globalThis.clients.claim();
				onServiceWorkerReady();
			})().catch(console.error));
		});
		eventTarget.on(`->+window`, (event) => {
			this.#broadcast({
				type: event.type,
				detail: event.detail
			});
		});
		eventTarget.on(`${this.name}->`, (event) => {
			this.#broadcast({
				type: event.type,
				detail: event.detail
			});
		});
		globalThis.addEventListener("message", (event) => {
			const parsed = parseWorkerMessage(event.data);
			if (parsed.success && (parsed.output.type === `->${this.name}` || parsed.output.type === `+window->`)) eventTarget.emit(parsed.output.type, parsed.output.detail);
		});
		this.#pingPage();
	}
	async #pingPage() {
		await this.#broadcast({ type: "ping" });
		setTimeout(() => this.#pingPage(), 1e3);
	}
	async #broadcast(message) {
		const window_clients = await globalThis.clients.matchAll();
		for (const window_client of window_clients) window_client.postMessage(structuredClone(message));
	}
};
/** Broadcast a message to all windows. As it is a broadcast, response is not expected. */
async function broadcastToWindows(method, args) {
	if (globalThis.constructor.name !== "Window") await readyPromise;
	const id = createId();
	eventTarget.emit("->+window", {
		id,
		method,
		args
	});
}
//#endregion
export { Kit10ServiceWorkerServer, broadcastToWindows };
