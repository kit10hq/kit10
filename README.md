# kit10

[![npm version](https://img.shields.io/npm/v/kit10.svg)](https://www.npmjs.com/package/kit10)
[![license](https://img.shields.io/npm/l/kit10.svg?color=blue)](https://github.com/kit10hq/kit10/blob/main/LICENSE)

A small kit(ten) for creating websites from almost anything. It builds HTML pages, bundles scripts, styles, and other assets, and outputs static files that can be served by anything.

## Features

- **File-based routing** - Specify path parameters right in the file names, no separate server configuration required.
- **Pages template** - Share layout, head markup, navigation, and global assets through template HTML file.
- **Asset-aware HTML** - Local scripts, stylesheets, images, and even inline blocks are processed by bundler and linked from the final HTML.
- **Plugin pipeline** - Support more file extensions or just transform files with simple plugins.
- **Runtime selection** - You can serve your site using Node.js runtime or Nginx. (More to come.)

## Quick start

### 1. Install Kit10:

```bash
pnpm add kit10
# or
bun add kit10
# or
npm install kit10
```

> Kit10 expects Node.js `>=22.16`.

### 2. Create a project structure

Kit10 reads source files from `src` in the project directory and writes output to `dist`. Let's create a website from a single HTML file:

```text
my-site/
├-- kit10.config.js
├-- package.json
└-- src/
    └-- index+page.html
```

Create a file at `src/index+page.html`:

```html
<!DOCTYPE html>
<html>
	<head>
		<meta charset="utf-8">
	</head>
	<body>
		<nav>
			<a href="/">Home</a>
			<a href="/about">About</a>
		</nav>

		<h1>Hello from kit10</h1>
	</body>
</html>
```

Run `npm run kit10 dev` to start the simple development server, open `http://localhost:3000` in your browser. That's it!

### 3. Add scripts and styles

Use `<script>`, `<style>` and `<link rel="stylesheet">` tags in the `<head>` section of your HTML as usual. Kit10 will transform and optimize them — even inlined ones.

For example, let's add an inlined `<style>` tag:

```html
<!DOCTYPE html>
<html>
	<head>
		<meta charset="utf-8">
		<style>
			h1 {
				user-select: none;
			}
		</style>
	</head>
	<body>
		<nav>
			<a href="/">Home</a>
			<a href="/about">About</a>
		</nav>

		<h1>Hello from kit10</h1>
	</body>
</html>
```

Kit10 will use `lightningcss` to transform and optimize the `<style>` tag and will produce a file like this:

```html
<!DOCTYPE html>
<html>
	<head>
		<meta charset="utf-8">
		<style>
			h1 {
				-webkit-user-select: none;
				user-select: none;
			}
		</style>
	</head>
	<body>
		<nav>
			<a href="/">Home</a>
			<a href="/about">About</a>
		</nav>

		<h1>Hello from kit10</h1>
	</body>
</html>
```

----------------------------------------------------------------------------------
----------------------------------------------------------------------------------
----------------------------------------------------------------------------------
----------------------------------------------------------------------------------
----------------------------------------------------------------------------------
----------------------------------------------------------------------------------
----------------------------------------------------------------------------------
----------------------------------------------------------------------------------
----------------------------------------------------------------------------------
----------------------------------------------------------------------------------

Create your first page at `src/index+page.html`:

```html
<kit10:head>
	<title>Home</title>
</kit10:head>

<h1>Hello from kit10</h1>
<script type="module" src="./js/app.ts"></script>
```

`<kit10:page>` marks where page content is inserted into the template. `<kit10:head>` lets a page add markup to the template `<head>`.

### 2. Configure kit10

Create `kit10.config.js` in the project root:

```js
// @ts-check

/** @type {import('kit10').Config} */
export default {
	plugins: [],
	build: {
		inlineTreshold: 2000,
	},
	server: {
		runtime: 'hono',
		port: 3000,
	},
};
```

Register plugins when you use plugin-backed formats:

```js
// @ts-check

import { ejsPlugin } from '@kit10/plugin-ejs';
import { scssPlugin } from '@kit10/plugin-scss';
import { tailwindPlugin } from '@kit10/plugin-tailwind';
import { vuePlugin, vueStylePlugin } from '@kit10/plugin-vue';

/** @type {import('kit10').Config} */
export default {
	plugins: [
		ejsPlugin,
		vuePlugin,
		scssPlugin(),
		tailwindPlugin,
		vueStylePlugin,
	],
};
```

### 3. Add scripts

```json
{
	"scripts": {
		"dev": "bunx --bun kit10 dev",
		"build": "bunx --bun kit10 build",
		"serve": "bun run dist/main.js"
	}
}
```

### 4. Run the site

```bash
bun run dev
```

The dev command builds the project, starts the generated Hono server, watches `src`, and rebuilds on changes. The default dev port is `3000`.

## Creating Pages

kit10 creates routes from files under `src` whose names end with `+page.<ext>`.

| File | Route |
| - | - |
| `src/index+page.html` | `/` |
| `src/about+page.html` | `/about` |
| `src/blog/index+page.html` | `/blog` |
| `src/blog/post+page.html` | `/blog/post` |
| `src/blog/post+page.ejs` | `/blog/post` |
| `src/profile/user+page.vue` | `/profile/user` |

The file extension decides which plugin, if any, must compile the page to HTML. HTML pages work without an extra plugin. EJS, Vue, and other page formats need their plugins in `kit10.config.js`.

### Index Pages

Use `index+page.<ext>` for the current directory route.

| File | Route |
| - | - |
| `src/index+page.html` | `/` |
| `src/docs/index+page.html` | `/docs` |

Do not create a file named only `+page.<ext>`; every page file needs a route name before `+page`.

### Route Parameters

Wrap a route segment with `[]` to make it dynamic.

| File | Matched routes |
| - | - |
| `src/users/[id]+page.html` | `/users/123`, `/users/alice` |
| `src/files/[name].[ext]+page.html` | `/files/logo.svg`, `/files/readme.md` |

### Optional Parameters

Use double brackets for optional parameters.

| File | Matched routes |
| - | - |
| `src/users/[[id]]+page.html` | `/users`, `/users/123` |
| `src/files/[name].[[ext]]+page.html` | `/files/readme`, `/files/logo.svg` |

### Catch-all Parameters

Use `[...name]` to match the rest of a path, or `[[...name]]` to also match the route with no remaining path.

| File | Matched routes |
| - | - |
| `src/docs/[...path]+page.html` | `/docs/getting-started`, `/docs/api/routes` |
| `src/docs/[[...path]]+page.html` | `/docs`, `/docs/getting-started`, `/docs/api/routes` |

Catch-all parameters are supported in page file names. Optional catch-all parameters are not supported as directory names because they expand to more than one route.

### Page Head Content

Put page-specific head markup inside `<kit10:head>`.

```html
<kit10:head>
	<title>User profile</title>
	<meta name="description" content="Profile page">
</kit10:head>

<h1>User profile</h1>
```

kit10 removes the `<kit10:head>` wrapper and inserts its contents into the template `<head>`.

### Scripts, Styles, And Assets

Local HTML references are processed by kit10:

```html
<script type="module" src="./js/app.ts"></script>
<script type="module" src="./js/inline.ts" kit10:inline></script>
<style>
	.hero {
		color: rebeccapurple;
	}
</style>
<link rel="stylesheet" href="./main.css">
<link rel="preload" as="style" href="./main.scss" onload="this.rel='stylesheet'">
<img src="./logo.svg" alt="Logo">
```

Remote URLs, such as `https://example.com/file.js`, are left alone. Add `kit10:inline` to a local script or stylesheet link when you want the final HTML to inline it.

## Running Builds

Use `kit10 dev` during development:

```bash
bunx --bun kit10 dev
```

`dev` runs a development build, starts the generated server, watches `src`, and rebuilds when files change.

Use `kit10 build` for production output:

```bash
bunx --bun kit10 build
```

`build` clears and recreates `dist`, minifies supported output, writes compressed assets, and removes the development WebSocket code from the Hono server.

Run the generated Hono server after a production build:

```bash
bun run dist/main.js
```

The default production runtime is Hono. To build nginx config instead, set `server.runtime`:

```js
/** @type {import('kit10').Config} */
export default {
	server: {
		runtime: 'nginx',
		port: 3000,
	},
};
```

When `server.runtime` is `nginx`, kit10 writes nginx config files into `dist` instead of a Hono `main.js`.

## Defining Workers

Workers live in `src/+workers`. Each worker has its own directory and a `+worker.ts` file:

```text
src/
|-- +workers/
|   `-- search/
|       |-- +worker.ts
|       `-- index.ts
`-- js/
    `-- page.ts
```

Export named functions from `+worker.ts`. Those functions become callable from browser code through `$workers/<name>`.

```ts
// src/+workers/search/+worker.ts
export async function findMatches(query: string, items: string[]) {
	return items.filter((item) => item.includes(query));
}
```

Import the worker from page or component code:

```ts
// src/js/page.ts
import { findMatches } from '$workers/search';

const results = await findMatches('kit', ['kit10', 'other']);
console.log(results);
```

The imported functions return promises because calls cross the window/worker boundary.

Workers can also call named functions that run in the window. Import them with `$src/`, using a path relative to `src`:

```ts
// src/js/browser-api.ts
export function readLocation() {
	return location.href;
}
```

```ts
// src/+workers/search/+worker.ts
import { readLocation } from '$src/js/browser-api.ts';

export async function currentPageMatches(query: string) {
	const url = await readLocation();
	return url.includes(query);
}
```

Only named value imports from `$src/` are proxied. Type-only imports are ignored, and default imports are not used for worker-window calls.

Worker directory names should use letters, numbers, dashes, and underscores. For example, `$workers/search-index` maps to `src/+workers/search-index/+worker.ts`.

## Configuration

`kit10.config.js` must default-export a config object.

```ts
export type Config = {
	plugins?: Plugin[];
	build?: {
		inlineTreshold?: number;
	};
	server?: {
		runtime?: 'hono' | 'nginx';
		port?: number;
	};
};
```

### `plugins`

Plugins transform artifacts during the build. kit10 includes built-in handling for HTML, CSS, JavaScript, TypeScript, and common assets. Add external plugins for extra source formats.

### `build.inlineTreshold`

Controls the size threshold, in bytes, for automatically inlining small script artifacts. The default is `2000`.

### `server.runtime`

Controls production runtime output. Use `hono` for a generated Node server or `nginx` for generated nginx config. Development always uses Hono.

### `server.port`

Sets the production server port. Development uses port `3000`.

## Contributing

Issues and pull requests are welcome at the [kit10 GitHub repository](https://github.com/kit10hq/kit10).
