import { NeoEventTarget } from "neoevents";
import * as v from "valibot";
//#region browser/workers/events.ts
const workerRequestSchema = v.object({
	id: v.string(),
	method: v.string(),
	args: v.array(v.unknown())
});
const workerResponseSchema = v.object({
	id: v.string(),
	value: v.unknown()
});
const eventTarget = new NeoEventTarget();
const parseWorkerMessage = v.safeParser(v.variant("type", [v.object({
	type: v.pipe(v.string(), v.startsWith("->"), v.transform((value) => value)),
	detail: workerRequestSchema
}), v.object({
	type: v.pipe(v.string(), v.endsWith("->"), v.transform((value) => value)),
	detail: workerResponseSchema
})]));
//#endregion
//#region browser/workers/utils.ts
/** Creates and ID for request. */
function createId() {
	return `${Date.now()}.${Math.random().toString(36).slice(2)}`;
}
//#endregion
export { eventTarget as n, parseWorkerMessage as r, createId as t };
