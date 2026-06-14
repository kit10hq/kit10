#!/usr/bin/env node

// oxlint-disable unicorn/no-process-exit

import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import { output_path, source_path } from './build/options.js';

let child: ChildProcess | undefined;
/** Runs the build in separate process. */
function runBuild() {
	if (child) {
		child.kill();
	}

	child = spawn(
		process.argv[0]!,
		process.argv.slice(1).filter((arg) => arg !== '--watch'),
		{
			stdio: 'inherit',
			env: {
				NODE_ENV: 'development',
			},
		},
	);
}

const command = process.argv[2];
if (command === 'dev') {
	if (process.argv.includes('--watch')) {
		runBuild();

		fs.watch(
			source_path,
			{
				recursive: true,
			},
			() => {
				// oxlint-disable-next-line no-console
				console.info('Rebuilding...');
				runBuild();
			},
		);
	} else {
		await import('./build.js');
		await import(output_path + '/main.js');
	}
} else if (command === 'build') {
	await import('./build.js');
} else {
	// oxlint-disable-next-line no-console
	console.error(`Unknown command "${command}".`);
	process.exit(1);
}

export type { Artifact } from './build/artifact.js';
export type { Config } from './build/options.js';
export type { Plugin } from './build/plugins.js';
