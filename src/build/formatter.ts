import fs from 'node:fs/promises';
import nodePath from 'node:path';
import * as buildOptions from './options.js';

/** Formats output files. Useful for development builds. */
export async function formatOutput() {
	const biome_config_string = await fs.readFile(
		nodePath.join(import.meta.dirname, '..', 'biome.json'),
		'utf8',
	);
	const biome_config = JSON.parse(biome_config_string);

	delete biome_config.vcs;
	biome_config.files.includes = ['**'];

	const config_path = nodePath.join(buildOptions.output_path, 'biome.json');
	await fs.writeFile(config_path, JSON.stringify(biome_config));

	const { execSync } = await import('node:child_process');
	execSync('biome format --write', {
		cwd: buildOptions.output_path,
		// stdio: 'inherit',
	});

	await fs.rm(config_path);
}
