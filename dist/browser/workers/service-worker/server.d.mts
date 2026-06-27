//#region browser/workers/service-worker/server.d.ts
declare class Kit10ServiceWorkerServer {
  #private;
  readonly name: string;
  readonly id: string;
  constructor(name: string, handlers: Record<string, (...args: unknown[]) => unknown>);
  /** Bind worker addEventListener/postMessage to the event target. */
  bindWorker(): void;
}
/** Broadcast a message to all windows. As it is a broadcast, response is not expected. */
declare function broadcastToWindows(method: string, args: unknown[]): Promise<void>;
//#endregion
export { Kit10ServiceWorkerServer, broadcastToWindows };