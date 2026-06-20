// @ts-check

/** @type {WebSocket | undefined} */
let ws;

/** Creates a WebSocket connection to the kit10 dev server. */
function createWs() {
	const is_first_time = ws === undefined;
	if (ws) {
		try {
			ws.close();
		} catch {}
	}

	ws = new WebSocket('/.kit10/ws');

	ws.addEventListener(
		'open',
		() => {
			// oxlint-disable-next-line no-console
			console.info(`Connected to kit10 dev server.`);
			if (!is_first_time) {
				location.reload();
			}
		},
		{ once: true },
	);

	ws.addEventListener(
		'close',
		() => {
			createWs();
		},
		{ once: true },
	);
}

createWs();
