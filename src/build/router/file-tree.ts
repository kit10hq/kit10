import { readdirSync } from 'node:fs';
import nodePath from 'node:path';
import { getEntrypointName, parseFilename } from './filename.js';

export enum WalkSpecificityType {
	STATIC = 0,
	PARAMETER = 1,
	PARAMETER_OPTIONAL = 2,
	CATCH_ALL = 3,
}
type RouteFile = {
	absolute_path: string;
	ext: string;
};
export type WalkSpecificity = {
	type: WalkSpecificityType;
	static_length: number;
};
type WalkStateDir = {
	file?: RouteFile;
	route: string;
	specificity: WalkSpecificity;
	children: WalkState[];
};
type WalkStateFile = {
	file: RouteFile;
	route: string;
	specificity: WalkSpecificity;
};
type WalkState = WalkStateDir | WalkStateFile;
type RouteData = {
	route: string;
	file: RouteFile;
};

/**
 * Returns the routes for the given path.
 * @param path The path to read files from.
 * @returns The routes for the given path.
 */
// oxlint-disable-next-line max-lines-per-function
export function getRoutes(path: string): RouteData[] {
	const seen = new Set<string>();
	return flatState(walk(path)).filter(({ route }) => {
		if (seen.has(route)) {
			return false;
		}

		seen.add(route);
		return true;
	});
}

/**
 * Walks the file tree at the given path and populates the walk state with the routes.
 * @param path The path to walk.
 * @param state The walk state to populate.
 */
function walk(path: string, state?: WalkStateDir): WalkStateDir {
	state ??= {
		file: undefined,
		route: '/',
		specificity: {
			type: WalkSpecificityType.STATIC,
			static_length: 0,
		},
		children: [],
	};

	const entries = readdirSync(path, {
		withFileTypes: true,
	});

	// shuffle response if we are running tests
	// different filesystems may have different ordering in response
	if (process.env.NODE_ENV === 'test') {
		for (let i = entries.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1)); // random index from 0 to i
			[entries[i], entries[j]] = [entries[j]!, entries[i]!]; // swap elements
		}
	}

	for (const entry of entries) {
		const entry_path = nodePath.join(entry.parentPath, entry.name);

		if (entry.isFile()) {
			const entrypoint = getEntrypointName(entry.name);
			// console.log('entrypoint', entrypoint);
			if (entrypoint === null) {
				continue;
			}

			if (entrypoint.name.length === 0) {
				throw new Error(
					`File name can not be just +page.<ext>, got ${entry_path}.`,
				);
			}

			const route_defs = parseFilename(entrypoint.name);
			// console.log('route_defs', route_defs);
			for (const route_def of route_defs) {
				if (entrypoint.name === 'index') {
					state.file = {
						absolute_path: entry_path,
						ext: entrypoint.ext,
					};
				} else {
					state.children.push({
						route: appendRoutePart(state.route, route_def.route_part),
						file: {
							absolute_path: entry_path,
							ext: entrypoint.ext,
						},
						specificity: route_def.specificity,
					} satisfies WalkStateFile);
				}
			}
		} else if (entry.isDirectory()) {
			const route_defs = parseFilename(entry.name);
			if (
				route_defs.length > 1
				&& route_defs.some(
					(route_def) =>
						route_def.specificity.type === WalkSpecificityType.CATCH_ALL,
				)
			) {
				throw new Error(
					`Invalid directory name "${entry.name}" at "${entry_path}".`,
				);
			}

			for (const route_def of route_defs) {
				const walk_state_child: WalkStateDir = {
					file: undefined,
					route: appendRoutePart(state.route, route_def.route_part),
					specificity: route_def.specificity,
					children: [],
				};
				state.children.push(walk_state_child);
				walk(entry_path, walk_state_child);
			}
		}
	}

	sortRoutes(state);

	return state;
}

/** Appends a URL segment, keeping the parent path for an omitted parameter. */
function appendRoutePart(parent: string, part: string): string {
	return part.length === 0 ? parent : `${parent === '/' ? '' : parent}/${part}`;
}

/**
 * Flattens the state into a list of routes.
 * @param state The state to flatten.
 */
function flatState(
	state: WalkState,
	routes_data: RouteData[] = [],
): RouteData[] {
	if (state.file !== undefined) {
		routes_data.push({
			route: state.route,
			file: state.file,
		});
	}

	if ('children' in state) {
		for (const child of state.children) {
			flatState(child, routes_data);
		}
	}

	return routes_data;
}

/**
 * Sorts the routes in the given result.
 * @param result The result to sort.
 */
function sortRoutes(result: WalkStateDir) {
	result.children.sort((a, b) => {
		if (a.specificity.type !== b.specificity.type) {
			return a.specificity.type - b.specificity.type;
		}

		if (a.specificity.static_length !== b.specificity.static_length) {
			return b.specificity.static_length - a.specificity.static_length;
		}

		return 0;
	});
}
