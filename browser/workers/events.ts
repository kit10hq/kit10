import { type NeoEvent, NeoEventTarget } from 'neoevents';
import * as v from 'valibot';

const workerRequestSchema = v.object({
	id: v.string(),
	method: v.string(),
	args: v.array(v.unknown()),
});
type WorkerRequest = v.InferOutput<typeof workerRequestSchema>;
const workerResponseSchema = v.object({
	id: v.string(),
	value: v.unknown(),
});
type WorkerResponse = v.InferOutput<typeof workerResponseSchema>;

export const eventTarget = new NeoEventTarget<
	Record<`->${string}`, NeoEvent<WorkerRequest>> &
		Record<`${string}->`, NeoEvent<WorkerResponse>>
>();

export const parseWorkerMessage = v.safeParser(
	v.variant('type', [
		v.object({
			type: v.pipe(
				v.string(),
				v.startsWith('->'),
				v.transform((value) => value as `->${string}`),
			),
			detail: workerRequestSchema,
		}),
		v.object({
			type: v.pipe(
				v.string(),
				v.endsWith('->'),
				v.transform((value) => value as `${string}->`),
			),
			detail: workerResponseSchema,
		}),
	]),
);
