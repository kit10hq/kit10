#!/usr/bin/env node

// oxlint-disable unicorn/no-process-exit

const command: string | undefined = process.argv[2];
if (command === 'dev') {
	await import('./build/target/dev.js');
} else if (command === 'build') {
	await import('./build/target/build.js');
} else {
	// oxlint-disable-next-line no-console
	console.error(`Unknown command "${command ?? ''}".`);
	process.exit(1);
}

export type { Config, Kit10Plugin } from './build/options.js';
