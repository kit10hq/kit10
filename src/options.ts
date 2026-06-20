import nodePath from 'node:path';

export const project_path: string = nodePath.resolve(process.cwd());
export const source_path: string = nodePath.join(process.cwd(), 'src');
