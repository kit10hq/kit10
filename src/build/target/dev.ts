import { createServer } from 'vite';
import * as buildOptions from '../options.js';
import { configPlugin } from '../plugins/config.js';
import { devRoutePlugin } from '../plugins/dev-route.js';
import { templatePlugin } from '../plugins/template.js';
import { virtualHtmlPlugin } from '../plugins/virtual-html.js';

const server = await createServer({
	root: buildOptions.source_path,
	configFile: false,
	appType: 'custom',
	plugins: [
		configPlugin(),
		virtualHtmlPlugin(),
		templatePlugin(),
		devRoutePlugin(),
		...buildOptions.vitePlugins,
	],
});

await server.listen();
server.printUrls();
