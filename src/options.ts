import fs from 'node:fs/promises';
import nodePath from 'node:path';
import * as v from 'valibot';

const configModule = await import(
	nodePath.join(process.cwd(), 'kit10.config.js')
);

const configSchema = v.object({
	server: v.optional(
		v.object({
			port: v.optional(v.number()),
		}),
	),
});
export type Config = v.InferOutput<typeof configSchema>;
export const config = v.parse(configSchema, configModule.default);

export const source_path = nodePath.join(process.cwd(), 'src');

export const output_path = nodePath.join(process.cwd(), 'dist');
export const output_static_path = nodePath.join(output_path, 'static');
