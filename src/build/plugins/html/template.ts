import fs from 'node:fs/promises';
import nodePath from 'node:path';
import * as options from '../../../options.js';
import type { Plugin } from '../../plugins.js';

const page_template = await fs.readFile(
	nodePath.join(options.source_path, '+template.html'),
	'utf8',
);

export const htmlTemplatePlugin: Plugin = {
	filter: '*',
	transform(artifact) {
		artifact.update(
			page_template.replace('<kit10:page></kit10:page>', artifact.text()),
		);
	},
};
