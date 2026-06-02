import nodePath from 'node:path';
import { program } from '@commander-js/extra-typings';
import * as v from 'valibot';

program
	.argument('<source>')
	.requiredOption(
		'-d, --out-dir <value>',
		'output directory for the generated client',
	);
// .requiredOption('--type <value>', 'client type (http, tasq)')
// .option('--topic <value>', 'Tasq topic to use (when type = tasq)')
// .requiredOption('--name <value>', 'generated package name');
// .option(
// 	'--version-suffix [value]',
// 	'generated package version suffix, e.g. beta',
// );

program.parse();

export const options = v.parse(
	v.intersect([
		v.object({
			outDir: v.string(),
			// name: v.string(),
			// versionSuffix: v.optional(v.string()),
		}),
		// v.variant('type', [
		// 	v.pipe(
		// 		v.object({
		// 			type: v.literal('tasq'),
		// 			topic: v.string(),
		// 		}),
		// 		v.transform((value) => {
		// 			return {
		// 				type: 'tasq' as const,
		// 				tasq: {
		// 					topic: value.topic,
		// 				},
		// 			};
		// 		}),
		// 	),
		// 	v.pipe(
		// 		v.object({
		// 			type: v.literal('http'),
		// 		}),
		// 		v.transform(() => {
		// 			return {
		// 				type: 'http' as const,
		// 				http: {},
		// 			};
		// 		}),
		// 	),
		// ]),
	]),
	program.opts(),
);

if (!program.args[0]) {
	throw new Error('source file is required.');
}

export const source_path = nodePath.join(process.cwd(), program.args[0]);

export const output_path = nodePath.join(process.cwd(), options.outDir);
// export const output_src_path = nodePath.join(output_path, 'src');
