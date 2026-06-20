//#region browser/workers/worker/server.d.ts
declare class Kit10WorkerServer {
  #private;
  readonly name: string;
  constructor(name: string, handlers: Record<string, (...args: unknown[]) => unknown>);
  /** Bind worker addEventListener/postMessage to the event target. */
  bindWorker(): void;
}
/** Send a request to the window. */
declare function sendReqeustToWindow(method: string, args: unknown[]): Promise<unknown>;
//#endregion
export { Kit10WorkerServer, sendReqeustToWindow };