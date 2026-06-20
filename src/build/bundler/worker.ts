// oxlint-disable unicorn/no-process-exit

import nodePath from 'node:path';
import * as esbuild from 'esbuild';
import { workers_data, workers_imports } from '../../lib/workers.js';
import * as options from '../../options.js';
import { createLetterId } from '../../utils.js';
import * as artifacts from '../artifact.js';
import { Artifact } from '../artifact.js';
import {
	esbuild_options,
	esbuildTsJsResolverPlugin,
	getAbsolutePathOnResolve,
} from './options.js';

export const worker_files = new Map<string, string>();

/** Builds worker. */
export async function createWorker(worker_name: string) {
	const worker_client_path = `+workers/${worker_name}/+worker.client.js`;
	const worker_window_path = `+workers/${worker_name}/+worker.window.js`;

	// console.log(`[createWorker] creating ${name}`);

	const worker_data = workers_data.get(worker_name)!;

	const in_window_worker_client_lines: string[] = [];
	const in_window_handler_parts: string[] = [];

	// add imports for window modules and methods that worker calls
	for (const [path, specifiers] of worker_data.imports) {
		const id = createLetterId();

		const in_window_imports: string[] = [];
		for (const specifier of specifiers) {
			const specifier_imported = `${id}_${specifier}`;
			in_window_imports.push(`${specifier} as ${specifier_imported}`);

			in_window_handler_parts.push(
				`\t\t${JSON.stringify(`${path}:${specifier}`)}: ${specifier_imported},`,
			);
		}

		in_window_worker_client_lines.push(
			`import { ${in_window_imports.join(', ')} } from '../../${path}';`,
		);

		buildDollarSrcModule(path);
	}

	in_window_worker_client_lines.push(
		// add import for kit10 worker communication event target
		`import { Kit10WorkerClient } from 'kit10/worker/client';`,
		// create event target
		`const kit10WorkerClient = new Kit10WorkerClient(`,
		`\t${JSON.stringify(worker_name)},`,
		`\t${JSON.stringify(`/+workers/${worker_name}/+worker.worker.js`)},`,
		`\t() => import(${JSON.stringify(`./+worker.window.js`)}),`,
		`\t{`,
		...in_window_handler_parts,
		`\t},`,
		`);`,
	);

	// export a function for each method that window uses from worker, emit to event target
	for (const specifier of worker_data.exports) {
		in_window_worker_client_lines.push(
			`export function ${specifier}(...args) {`,
			`\treturn kit10WorkerClient.send(${JSON.stringify(specifier)}, args);`,
			`}`,
		);
	}

	createWorkerEntrypointFiles(worker_name);

	worker_files.set(
		worker_client_path,
		in_window_worker_client_lines.join('\n'),
	);

	// console.log(`[createWorker] worker_files`, worker_files);

	await bundleWorker(worker_name);

	return [
		new Artifact(worker_client_path, worker_files.get(worker_client_path)),
		new Artifact(worker_window_path, worker_files.get(worker_window_path)),
	];
}

/** Build a file that worker will use to send requests to the window. */
function buildDollarSrcModule(path: string) {
	const src_path = `$src/${path}`;
	if (worker_files.has(src_path)) {
		return;
	}

	const specifiers = workers_imports.get(path);
	if (!specifiers) {
		throw new Error(`No imports found for module "${src_path}".`);
	}

	const lines: string[] = [
		`import { sendReqeustToWindow } from "kit10/worker/server"`,
	];
	for (const specifier of specifiers) {
		lines.push(
			`export function ${specifier}(...args) {`,
			`\treturn sendReqeustToWindow(${JSON.stringify(`${path}:${specifier}`)}, args);`,
			`}`,
		);
	}

	worker_files.set(src_path, lines.join('\n'));
}

/** Creates entrypoint file for worker, which will be used as "+worker.window.js". */
function createWorkerEntrypointFiles(worker_name: string) {
	const lines: string[] = [
		`import * as handlers from "./+worker.js";`,
		`import { Kit10WorkerServer } from "kit10/worker/server";`,
		`const kit10WorkerServer = new Kit10WorkerServer(${JSON.stringify(worker_name)}, handlers);`,
	];

	// const _artifact = new Artifact(
	// 	`+workers/${worker_name}/+worker.window.js`,
	// 	lines,
	// );
	worker_files.set(
		`+workers/${worker_name}/+worker.window.js`,
		lines.join('\n'),
	);

	// for +worker.worker.js, i.e. the code that runs actually in the worker
	// we should bind worker server to worker addEventListener/postMessage

	lines.push(`kit10WorkerServer.bindWorker();`);

	worker_files.set(
		`+workers/${worker_name}/+worker.worker.js`,
		lines.join('\n'),
	);
}

const esbuildKit10WorkerPlugin: esbuild.Plugin = {
	name: 'kit10-worker',
	setup(build) {
		// eslint-disable-next-line require-unicode-regexp
		build.onResolve({ filter: /.*/ }, async (args) => {
			// console.log('[bundleWorker]', 'onResolve', args);

			if (worker_files.has(args.path)) {
				return {
					path: args.path,
					namespace: 'worker',
				};
			}

			const absolute_path = await getAbsolutePathOnResolve(args);
			if (absolute_path === undefined) {
				return;
			}

			return { path: absolute_path };
		});

		// eslint-disable-next-line require-unicode-regexp
		build.onLoad({ filter: /.*/, namespace: 'worker' }, (args) => {
			// console.log('[bundleWorker]', 'onLoad', args);

			if (worker_files.has(args.path) !== true) {
				// oxlint-disable-next-line no-console
				console.error(`Unknown worker file: ${args.path}`);
				process.exit(1);
				return;
			}

			let resolve_dir = options.source_path;
			if (args.path.endsWith('/+worker.worker.js')) {
				const match = args.path.match(/^\+workers\/(?<name>[-a-z\d_]+)\//iu);
				if (!match) {
					// oxlint-disable-next-line no-console
					console.error(`Invalid worker entrypoint file: ${args.path}`);
					process.exit(1);
					return;
				}

				resolve_dir = nodePath.join(
					options.source_path,
					`+workers/${match.groups!.name}`,
				);
			}

			return {
				contents: worker_files.get(args.path),
				loader: 'ts',
				resolveDir: resolve_dir,
			};
		});
	},
};

/** Bundles worker code into single file. */
async function bundleWorker(worker_name: string) {
	const project_path = `+workers/${worker_name}/+worker.worker.js`;
	const result = await esbuild.build({
		...esbuild_options,
		plugins: [esbuildTsJsResolverPlugin, esbuildKit10WorkerPlugin],
		entryPoints: [project_path],
		splitting: false,
	});

	if (result.outputFiles?.length !== 1) {
		// oxlint-disable-next-line no-console
		console.error(
			`Expected 1 output file, got ${result.outputFiles?.length} (bundleWorker ${worker_name})`,
		);
		process.exit(1);
		return;
	}

	const artifact = new Artifact(project_path, result.outputFiles![0]!.contents);
	artifacts.collections.entrypoints.add(artifact);
}
