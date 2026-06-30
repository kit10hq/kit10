//#region browser/workers/service-worker/client.d.ts
declare class Kit10ServiceWorkerClient {
  #private;
  readonly name: string;
  readonly id: string;
  constructor(name: string, url: string, fallbackGetter: () => Promise<unknown>, handlers: Record<string, (...args: unknown[]) => unknown>);
  start(): Promise<void>;
  send(method: string, args: unknown[]): Promise<unknown>;
}
//#endregion
export { Kit10ServiceWorkerClient };