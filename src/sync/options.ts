import nodePath from 'node:path';
import * as options from '../options.js';

export const KIT10_DIR = nodePath.join(options.project_path, '.kit10');
export const KIT10_TYPES_DIR = nodePath.join(
	options.project_path,
	'.kit10',
	'types',
);
