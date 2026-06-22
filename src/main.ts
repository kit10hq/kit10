#!/usr/bin/env node

// oxlint-disable unicorn/no-process-exit

import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import { output_path } from './build/options.js';
import { source_path } from './options.js';

let child: ChildProcess | undefined;
/** Runs the build in separate process. */
function runBuild() {
	if (child) {
		child.kill();
	}

	child = spawn(process.argv[0]!, [...process.argv.slice(1), '--no-watch'], {
		stdio: 'inherit',
		env: {
			NODE_ENV: 'development',
		},
	});
}

const command = process.argv[2];
switch (command) {
	case 'dev':
		if (process.argv.includes('--no-watch')) {
			await import('./sync.js');
			await import('./build.js');
			await import(output_path + '/main.js');
		} else {
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
		}

		break;

	case 'build':
		await import('./sync.js');
		await import('./build.js');
		break;

	case 'sync':
		await import('./sync.js');
		break;

	default:
		// oxlint-disable-next-line no-console
		console.error(`Unknown command "${command}".`);
		process.exit(1);
}

export type { Artifact } from './build/artifact.js';
export type { Config } from './build/options.js';
export type { Plugin } from './build/plugins.js';
