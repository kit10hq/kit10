import { n as eventTarget, r as parseWorkerMessage, t as createId } from "../../../utils-BNcSbbpj.mjs";
//#region browser/workers/service-worker/client.ts
const IS_SERVICE_WORKER_SUPPORTED = "serviceWorker" in navigator && globalThis.localStorage?.getItem("swdr_disable_sw") !== "1";
const { promise: is_page_controllable_promise, resolve: setPageControllable } = Promise.withResolvers();
if (!IS_SERVICE_WORKER_SUPPORTED) setPageControllable(false);
let is_created = false;
var Kit10ServiceWorkerClient = class {
	name;
	id = createId();
	#url;
	#fallbackGetter;
	#start_promise;
	#response_resolvers = /* @__PURE__ */ new Map();
	constructor(name, url, fallbackGetter, handlers) {
		this.name = name;
		if (is_created) throw new Error("Kit10ServiceWorkerClient was already created.");
		is_created = true;
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
		if (IS_SERVICE_WORKER_SUPPORTED) {
			navigator.serviceWorker.addEventListener("controllerchange", () => {
				this.#processController();
			});
			try {
				if ((await navigator.serviceWorker.register(this.#url, {
					scope: "/",
					updateViaCache: "none"
				})).active?.state === "activated") this.#processController();
			} catch (error) {
				console.error(error);
				setPageControllable(false);
			}
		} else setPageControllable(false);
		if (await is_page_controllable_promise) {
			navigator.serviceWorker.addEventListener("message", (event) => {
				const parsed = parseWorkerMessage(event.data);
				if (parsed.success && (parsed.output.type === "->+window" || parsed.output.type === `${this.name}->`)) eventTarget.emit(parsed.output.type, parsed.output.detail);
			});
			eventTarget.on(`->${this.name}`, (event) => {
				this.#sendToWorker({
					type: `->${this.name}`,
					detail: event.detail
				});
			});
		} else await this.#fallbackGetter();
	}
	#activeSwController;
	#processController() {
		const { controller } = navigator.serviceWorker;
		if (controller) {
			setPageControllable(true);
			this.#activeSwController = controller;
		} else if (this.#activeSwController) {
			console.error("This tab lost its Service Worker Controller. Kit10 can not operate in this conditions, so tab will be reloaded.");
			location.reload();
		} else setPageControllable(false);
	}
	async #sendToWorker(payload) {
		if (this.#activeSwController) this.#activeSwController.postMessage(payload);
		else {
			await Promise.race([new Promise((_resolve, reject) => {
				setTimeout(() => reject(/* @__PURE__ */ new Error("Request timeout.")), 5e3);
			}), new Promise((resolve) => {
				navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true });
			})]);
			return this.#sendToWorker(payload);
		}
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
		return promise;
	}
};
//#endregion
export { Kit10ServiceWorkerClient };
