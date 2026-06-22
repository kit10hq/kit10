import fs from 'node:fs/promises';
import nodePath from 'node:path';
import { KIT10_DIR } from './sync/options.js';
import { syncWorkers } from './sync/workers.js';
import { clearDir } from './utils.js';

await fs.mkdir(KIT10_DIR, { recursive: true });
await clearDir(KIT10_DIR);

await Promise.all([
	// copy tsconfig to the .kit10 directory
	fs.cp(
		nodePath.join(import.meta.dirname, '../template/tsconfig.template.json'),
		nodePath.join(KIT10_DIR, 'tsconfig.json'),
	),
	syncWorkers(),
]);
