import { escapeRegExp } from 'es-toolkit/string';
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
type SegmentPart = string | { name: string };

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
 * Converts a file or directory name into runtime-specific route segments.
 * Optional parameters expand into present and omitted variants; an optional
 * extension also omits its preceding dot. Each variant retains the original
 * parameter specificity so explicit routes take precedence over fallbacks.
 */
export function parseFilename(name: string): FSEntryRoute[] {
	if (name.length === 0) {
		throw new Error('File name can not be just +page.<ext>.');
	}

	// Optional catch-all uses double brackets [[...slug]]
	const match_optional_catch_all = RE_OPTIONAL_CATCH_ALL.exec(name);
	if (match_optional_catch_all) {
		// An empty segment represents the parent route without a trailing slash.
		return [
			{
				route_part: '',
				specificity: {
					type: WalkSpecificityType.CATCH_ALL,
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

	let variants: SegmentPart[][] = [[]];
	let cursor = 0;
	let type = WalkSpecificityType.STATIC;
	for (const match of name.matchAll(
		/\[\[(?<optional>[a-z_][\da-z_]*)\]\]|\[(?<required>[a-z_][\da-z_]*)\]/giu,
	)) {
		const literal = name.slice(cursor, match.index);
		const { optional } = match.groups!;
		const parameter = { name: optional ?? match.groups!.required! };
		if (optional === undefined) {
			type = Math.max(type, WalkSpecificityType.PARAMETER);
			variants = variants.map((parts) => [...parts, literal, parameter]);
		} else {
			type = WalkSpecificityType.PARAMETER_OPTIONAL;
			variants = variants.flatMap((parts) => [
				[...parts, literal, parameter],
				[...parts, literal.endsWith('.') ? literal.slice(0, -1) : literal],
			]);
		}

		cursor = match.index + match[0].length;
	}

	return variants.map((parts) => {
		parts.push(name.slice(cursor));
		const literals = parts.filter((part) => typeof part === 'string');
		if (literals.some((part) => /[[\]]/u.test(part))) {
			throw new Error(`Invalid filename "${name}".`);
		}

		return {
			route_part: getSegmentRoutePart(parts),
			specificity: { type, static_length: literals.join('').length },
		};
	});
}

/** Compiles a complete segment, including literal text around parameters. */
function getSegmentRoutePart(parts: SegmentPart[]): string {
	const parameters = parts.filter((part) => typeof part !== 'string');
	const pattern = parts
		.map((part) => (typeof part === 'string' ? escapeRegExp(part) : '[^/]+'))
		.join('');
	if (buildOptions.server_runtime === 'nginx') {
		return pattern;
	}

	if (buildOptions.server_runtime === 'hono') {
		if (parameters.length === 0) {
			return parts.join('');
		}

		if (parameters.length === 1 && pattern === '[^/]+') {
			return `:${parameters[0]!.name}`;
		}

		// Hono captures custom patterns as a whole segment, not separate fields.
		const name = parameters.map((parameter) => parameter.name).join('_');
		return `:__kit10_${name}{${pattern}}`;
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
