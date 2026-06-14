import * as buildOptions from '../options.js';
import { type WalkSpecificity, WalkSpecificityType } from './file-tree.js';

// oxlint-disable-next-line typescript/no-inferrable-types
export const RE_ENTRYPOINT: RegExp = /^(?<name>.+)\+page\.(?<ext>[a-z]+)$/iu;
const RE_OPTIONAL_CATCH_ALL = /^\[\[\.\.\.(?<key>[a-z_][\da-z_]*)\]\]$/iu;
const RE_CATCH_ALL = /^\[\.\.\.(?<key>[a-z_][\da-z_]*)\]$/iu;

type FSEntryRoute = {
	route_part: string;
	specificity: WalkSpecificity;
};

/**
 * Checks if file is an entrypoint file (i.e. ends with `+page.html`).
 * Returns the filename without the `.page.html` extension, or `null` if not found.
 */
export function getEntrypointName(name: string): {
	name: string;
	ext: string;
} | null {
	const match = RE_ENTRYPOINT.exec(name);
	if (!match) {
		return null;
	}

	return {
		name: match.groups!.name!,
		ext: match.groups!.ext!,
	};
}

/**
 * Returns specificity for route.
 *
 * Values:
 * - 0: static route (e.g. `/foo`)
 * - 1: route with parameter (e.g. `/foo-:id`)
 * - 2: route with optional parameter (e.g. `/foo-:id?`)
 * - 3: route with greedy parameter (e.g. `/foo-:id+`)
 * - 4: (NOT USED) route with wildcard (e.g. `/*`)
 * @param name -
 * @returns -
 */
export function parseFilename(name: string): FSEntryRoute[] {
	if (name.length === 0) {
		throw new Error('File name can not be just +page.<ext>.');
	}

	// Optional catch-all uses double brackets [[...slug]]
	const match_optional_catch_all = RE_OPTIONAL_CATCH_ALL.exec(name);
	if (match_optional_catch_all) {
		// We return a sentinel; caller will produce both '/base' and '/base/:slug+'
		return [
			{
				route_part: '',
				specificity: {
					type: WalkSpecificityType.STATIC,
					static_length: 0,
				},
			},
			{
				route_part: getCatchAllRoutePart(match_optional_catch_all.groups!.key!),
				specificity: {
					type: WalkSpecificityType.CATCH_ALL,
					static_length: 0,
				},
			},
		];
	}

	// Greedy: [...slug] -> :slug+
	const match_catch_all = RE_CATCH_ALL.exec(name);
	if (match_catch_all) {
		return [
			{
				route_part: getCatchAllRoutePart(match_catch_all.groups!.key!),
				specificity: {
					type: WalkSpecificityType.CATCH_ALL,
					static_length: 0,
				},
			},
		];
	}

	let has_optional = false;
	let static_length = name.length;
	// const route_part = name.replaceAll(
	// 	// eslint-disable-next-line prefer-named-capture-group
	// 	/(\[([a-z_][\da-z_]*)\]|\[\[([a-z_][\da-z_]*)\]\])([^\da-z_]|$)/giu,
	// 	(...args) => {
	// 		static_length -= args[1].length;

	// 		if (args[3] !== undefined) {
	// 			has_optional = true;
	// 			return `:${args[3]}?${args[4]}`;
	// 		}

	// 		return `:${args[2]}${args[4]}`;
	// 	},
	// );
	const route_part = name
		.replaceAll(
			/\[\[(?<parameter_name>[a-z_][a-z_\d]*)\]\](?<next_char>[^\da-z_]|$)/giu,
			(substring, parameter_name, next_char) => {
				static_length -= substring.length - next_char.length;

				has_optional = true;
				return `:${getParameterRoutePart(parameter_name!, true)}${next_char}`;
			},
		)
		.replaceAll(
			/\[(?<parameter_name>[a-z_][a-z_\d]*)\](?<next_char>[^\da-z_]|$)/giu,
			(substring, parameter_name, next_char) => {
				static_length -= substring.length - next_char.length;

				return `:${getParameterRoutePart(parameter_name!, false)}${next_char}`;
			},
		);

	// something was replaced
	if (name !== route_part) {
		return [
			{
				route_part,
				specificity: {
					type: has_optional
						? WalkSpecificityType.PARAMETER_OPTIONAL
						: WalkSpecificityType.PARAMETER,
					static_length,
				},
			},
		];
	}

	if (name.includes('[') !== true) {
		return [
			{
				route_part,
				specificity: {
					type: WalkSpecificityType.STATIC,
					static_length: 0,
				},
			},
		];
	}

	throw new Error(`Invalid filename "${name}".`);
}

/** Return route part for parameter. */
function getParameterRoutePart(name: string, optional: boolean): string {
	if (buildOptions.server_runtime === 'hono') {
		return `:${name}${optional ? '?' : ''}`;
	}

	if (buildOptions.server_runtime === 'nginx') {
		return optional ? '(?:[^/]+)?' : '[^/]+';
	}

	throw new Error(
		`Unsupported server runtime "${buildOptions.server_runtime}".`,
	);
}

/** Return route part for catch-all parameter. */
function getCatchAllRoutePart(name: string): string {
	if (buildOptions.server_runtime === 'hono') {
		return `:${name}{.+}`;
	}

	if (buildOptions.server_runtime === 'nginx') {
		return `.+`;
	}

	throw new Error(
		`Unsupported server runtime "${buildOptions.server_runtime}".`,
	);
}
