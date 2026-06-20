//#region browser/workers/worker/client.d.ts
declare class Kit10WorkerClient {
  #private;
  readonly name: string;
  constructor(name: string, url: string, fallbackGetter: () => Promise<unknown>, handlers: Record<string, (...args: unknown[]) => unknown>);
  start(): Promise<void>;
  send(method: string, args: unknown[]): Promise<unknown>;
}
//#endregion
export { Kit10WorkerClient };