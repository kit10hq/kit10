import { n as eventTarget, r as parseWorkerMessage, t as createId } from "../../../utils-BNcSbbpj.mjs";
//#region browser/workers/worker/server.ts
var Kit10WorkerServer = class {
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
		console.log(`[WORKER ${this.id}] started.`);
	}
	/** Bind worker addEventListener/postMessage to the event target. */
	bindWorker() {
		eventTarget.on(`->+window`, (event) => {
			globalThis.postMessage({
				type: event.type,
				detail: event.detail
			});
		});
		eventTarget.on(`${this.name}->`, (event) => {
			globalThis.postMessage({
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
	#pingPage() {
		globalThis.postMessage({ type: "ping" });
		setTimeout(() => this.#pingPage(), 1e3);
	}
};
const response_resolvers = /* @__PURE__ */ new Map();
eventTarget.on("+window->", (event) => {
	const { id, value } = event.detail;
	const resolve = response_resolvers.get(id);
	if (resolve) {
		resolve(value);
		response_resolvers.delete(id);
	}
});
const tickPromise = new Promise((resolve) => {
	setTimeout(resolve, 0);
});
/** Send a request to the window. */
async function sendReqeustToWindow(method, args) {
	if (globalThis.constructor.name !== "Window") await tickPromise;
	const id = createId();
	eventTarget.emit("->+window", {
		id,
		method,
		args
	});
	const { promise, resolve } = Promise.withResolvers();
	response_resolvers.set(id, resolve);
	return promise;
}
//#endregion
export { Kit10WorkerServer, sendReqeustToWindow };
