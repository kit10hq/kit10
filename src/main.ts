#!/usr/bin/env node

// oxlint-disable unicorn/no-process-exit

import { type ChildProcess, spawn } from 'node:child_process';
// import fs from 'node:fs';
import chokidar from 'chokidar';
import { debounce } from 'es-toolkit';
import { output_path } from './build/options.js';
import { source_path } from './options.js';

let child: ChildProcess | undefined;
/** Runs the build in separate process. */
const runBuild = debounce(() => {
	// oxlint-disable-next-line no-console
	console.info('Rebuilding...');

	if (child) {
		child.kill();
	}

	child = spawn(process.argv[0]!, [...process.argv.slice(1), '--no-watch'], {
		stdio: 'inherit',
		env: {
			NODE_ENV: 'development',
		},
	});
}, 100);

const command = process.argv[2];
switch (command) {
	case 'dev':
		if (process.argv.includes('--no-watch')) {
			await import('./sync.js');
			await import('./build.js');
			await import(output_path + '/main.js');
		} else {
			runBuild();

			let is_ready = false;
			const watcher = chokidar.watch(source_path, {
				ignoreInitial: true,
				// Handles editor/temp-file atomic writes.
				atomic: true,
				// Waits until files are stable before emitting events.
				awaitWriteFinish: {
					stabilityThreshold: 100,
					pollInterval: 20,
				},
				ignored: ['**/.DS_Store', '**/node_modules/**', '**/.git/**'],
			});

			watcher.on('ready', () => {
				is_ready = true;
			});
			watcher.on('all', () => {
				if (!is_ready) {
					return;
				}

				runBuild();
			});
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
