// oxlint-disable unicorn/no-process-exit

import { output_path } from './options.js';

const command = process.argv[2];
if (command === 'dev' || command === 'build') {
	await import('./build.js');

	if (command === 'dev') {
		await import(output_path + '/main.js');
	}
} else {
	// oxlint-disable-next-line no-console
	console.error(`Unknown command "${command}".`);
	process.exit(1);
}
