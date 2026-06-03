import * as options from '../options.js';
import type { Artifact } from './artifact.js';

type Promisable<T> = T | Promise<T>;
export type Plugin = {
	filter: '*' | RegExp;
	transform: (
		artifact: Artifact,
		options: { is_prod: boolean },
	) => Promisable<void>;
};

/** Applies the plugins from the config. */
export async function applyPlugins(
	artifacts: Artifact[] | Set<Artifact> | IterableIterator<Artifact>,
	plugins?: Plugin[],
): Promise<void> {
	if (!plugins) {
		return;
	}

	const artifacts_set =
		artifacts instanceof Set ? artifacts : new Set(artifacts);

	for (const plugin of plugins) {
		const promises = [];
		for (const artifact of artifacts_set) {
			if (plugin.filter === '*' || plugin.filter.test(artifact.path)) {
				const result = plugin.transform(artifact, {
					is_prod: options.is_prod,
				});
				if (result instanceof Promise) {
					promises.push(result);
				}
			}
		}

		if (promises.length > 0) {
			// oxlint-disable-next-line no-await-in-loop
			await Promise.all(promises);
		}
	}
}
