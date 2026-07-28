/**
 * Driving one table in one tab.
 *
 * Entities are spawned through `gameActions` (the same calls the HUD panes
 * make) but *moved with a real mouse*, because the bug this harness exists for
 * lives in the raycast between the two: dispatch is what breaks, not state. An
 * assertion that only round-tripped the store would have passed on the broken
 * build.
 */

import type { Browser, ConsoleMessage, Page } from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import type { Servers } from './servers';

export type Problem = { kind: 'console' | 'pageerror' | 'requestfailed'; text: string };
export type ScreenPoint = { x: number; y: number };

export type Table = {
	page: Page;
	/** everything the page complained about since it opened */
	problems: Problem[];
	/** the subset that is genuinely the app's fault (see IGNORED) */
	appProblems: () => Problem[];
	spawn: (kind: string, options?: Record<string, unknown>) => Promise<string>;
	/** a standard 52-card deck, procedurally faced — no network */
	seedDeck: () => Promise<string>;
	locate: (id: string) => Promise<ScreenPoint | null>;
	/** what the shared raycaster hits at a screen point — [] means dispatch is dead */
	hits: (point: ScreenPoint) => Promise<string[]>;
	/** the DOM element on top at a screen point — the table canvas, or a HUD pane covering it */
	elementAt: (point: ScreenPoint) => Promise<string>;
	/** how an entity is rendered right now; null if it never mounted */
	describe: (
		id: string
	) => Promise<{ meshes: number; materials: unknown[]; size: [number, number, number] } | null>;
	dragBy: (id: string, dx: number, dy: number) => Promise<void>;
	/**
	 * drag an entity and release it over a table-plane world position;
	 * `alt` holds the Alt key through the whole gesture — the release's
	 * pointerup then carries `altKey`, which is what the app reads for the
	 * no-snap drop (see TableScene's onPointerUp)
	 */
	dragTo: (
		id: string,
		worldX: number,
		worldZ: number,
		options?: { alt?: boolean }
	) => Promise<void>;
	positionOf: (id: string) => Promise<number[] | null>;
	settle: (ms?: number) => Promise<void>;
	/**
	 * Hold the page's main thread for `ms` at a time, freeing it for `everyMs`
	 * in between — the long frame gaps a shared CI runner produces, on demand.
	 * `null` stops it and returns how many stalls were injected, so a spec can
	 * prove the injection was live rather than assume it.
	 */
	stall: (options: { ms: number; everyMs?: number } | null) => Promise<number>;
	/**
	 * capture the page to e2e/screenshots/<name>.png — the visual-polish
	 * train's evidence artifact — failing if the frame is silently blank
	 */
	snap: (name: string) => Promise<string>;
	close: () => Promise<void>;
};

/** gitignored; CI uploads it as the `e2e-screenshots` artifact */
const SCREENSHOT_DIR = fileURLToPath(new URL('./screenshots/', import.meta.url));

/**
 * Noise that is the *environment*, never the app: SwiftShader's warnings, and a
 * favicon a dev server has no answer for. Deliberately short — anything else
 * failing is a real failure, which is the entire point of the harness.
 */
const IGNORED = [
	/GroupMarkerNotSet/i,
	/SwiftShader/i,
	/Automatic fallback to software WebGL/i,
	/favicon/i,
	/\[vite\] connect/i
];

function ignorable(text: string): boolean {
	return IGNORED.some((pattern) => pattern.test(text));
}

const SUITS = ['S', 'H', 'D', 'C'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export async function openTable(browser: Browser, servers: Servers, lobby: string): Promise<Table> {
	const page = await browser.newPage();
	const problems: Problem[] = [];

	page.on('console', (message: ConsoleMessage) => {
		if (message.type() === 'error') problems.push({ kind: 'console', text: message.text() });
	});
	page.on('pageerror', (error) => {
		const failure = error as Error;
		problems.push({ kind: 'pageerror', text: `${failure.message}\n${failure.stack ?? ''}` });
	});
	page.on('requestfailed', (request) => {
		problems.push({
			kind: 'requestfailed',
			text: `${request.url()} — ${request.failure()?.errorText ?? 'failed'}`
		});
	});

	// before ANY script runs: the module-level fallback in connection.ts reads
	// localStorage at import time, and it defaults to the PUBLIC relay
	await page.evaluateOnNewDocument((relay: string) => {
		localStorage.setItem('serverurl', relay);
	}, servers.relay);

	const url =
		`${servers.web}/play?lobby=${encodeURIComponent(lobby)}` +
		`&server=${encodeURIComponent(servers.relay)}`;
	await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 });

	// the bridge mounts inside the Canvas, which mounts only once the socket is
	// open — so waiting on it is also the connection assertion
	await page.waitForFunction('window.__tableplace?.ready === true', { timeout: 60_000 });

	const settle = (ms = 700) => sleep(ms);
	await settle(600);

	const spawn = (kind: string, options: Record<string, unknown> = {}) =>
		page.evaluate(
			(k, o) => window.__tableplace!.actions.addPiece(k as never, o as never),
			kind,
			options
		) as Promise<string>;

	/**
	 * A standard 52-card deck. The card list is built here rather than imported
	 * so the harness only ever leans on the app's public action surface — and
	 * `gen:` faces are canvas-drawn, so seeding one fetches nothing.
	 */
	const seedDeck = () =>
		page.evaluate(
			(suits, ranks) => {
				const cards = suits.flatMap((suit) =>
					ranks.map((rank) => ({
						id: `card:std:${rank}${suit}`,
						faceImageUrl: `gen:std52/${rank}${suit}`,
						backImageUrl: 'gen:std52/back'
					}))
				);
				return String(window.__tableplace!.actions.addDeck({ cards } as never) ?? '');
			},
			SUITS,
			RANKS
		);

	const locate = (id: string) =>
		page.evaluate((entityId) => window.__tableplace!.locate(entityId), id);

	const hits = (point: ScreenPoint) =>
		page.evaluate((screen) => window.__tableplace!.hits(screen), point);

	const elementAt = (point: ScreenPoint) =>
		page.evaluate((screen) => {
			const element = document.elementFromPoint(screen.x, screen.y);
			return element ? `${element.tagName.toLowerCase()}.${element.className}`.trim() : 'nothing';
		}, point);

	const describe = (id: string) =>
		page.evaluate((entityId) => window.__tableplace!.describe(entityId), id);

	const stall = (options: { ms: number; everyMs?: number } | null) =>
		page.evaluate((injection) => window.__tableplace!.stall(injection), options);

	const positionOf = (id: string) =>
		page.evaluate((entityId) => {
			const state = window.__tableplace!.state();
			const entity =
				state?.pieces?.[entityId] ?? state?.decks?.[entityId] ?? state?.cards?.[entityId];
			return (entity as { position?: number[] } | undefined)?.position ?? null;
		}, id);

	/**
	 * A real press–move–release. The intermediate moves matter twice over: a
	 * clickable piece only lifts once the pointer has travelled past
	 * DRAG_THRESHOLD_PX, and the position the drop commits comes from the
	 * interactivity context's raycast on the last move.
	 *
	 * `hold` keeps the pointer pressed and still before travelling — since
	 * tableplace-103 a deck only moves after a long press has armed it
	 * (DECK_MOVE_HOLD_MS, 400ms; travel without the hold draws the top card
	 * into the drag instead). The hold waits for the ARM CUE (the amber
	 * footprint mounts, so the deck's mesh count grows) rather than a fixed
	 * sleep: on a choked SwiftShader main thread, wall-clock time and page
	 * event-loop time drift apart, and a fixed hold can release the moves into
	 * the queue before the page has processed the press — or, worse, travel
	 * before the arm timer has fired and draw a card instead of moving the
	 * pile. Bounded: if the cue never mounts (the grab slipped entirely), the
	 * drag proceeds and the caller's own movement assertion reports it.
	 */
	/** press on the entity, walk the pointer to a screen point, release there */
	const dragFromTo = async (
		id: string,
		from: ScreenPoint,
		to: ScreenPoint,
		options: { alt?: boolean; hold?: boolean } = {}
	) => {
		// A HUD pane over the entity swallows the press, and the failure looks
		// exactly like a dead table — which cost an hour of chasing a bag that was
		// never broken. Fail on the real reason instead: put the entity somewhere
		// the panes don't cover.
		const cover = await elementAt(from);
		if (!cover.startsWith('canvas')) {
			throw new Error(
				`${id} draws at (${Math.round(from.x)}, ${Math.round(from.y)}), where the HUD covers the table (${cover}) — move it clear of the panes`
			);
		}
		const meshesAtRest = options.hold ? ((await describe(id))?.meshes ?? 0) : 0;
		// held for the whole gesture: puppeteer stamps keyboard modifiers onto
		// every mouse event it dispatches, so the release's pointerup carries
		// altKey exactly like a user holding Alt
		if (options.alt) await page.keyboard.down('Alt');
		try {
			await page.mouse.move(from.x, from.y);
			await sleep(80);
			await page.mouse.down();
			if (options.hold) {
				const deadline = Date.now() + 4000;
				while (Date.now() < deadline) {
					await sleep(100);
					if (((await describe(id))?.meshes ?? 0) > meshesAtRest) break;
				}
			} else {
				await sleep(80);
			}
			for (let step = 1; step <= 12; step++) {
				await page.mouse.move(
					from.x + ((to.x - from.x) * step) / 12,
					from.y + ((to.y - from.y) * step) / 12
				);
				await sleep(20);
			}
			await sleep(150);
			await page.mouse.up();
		} finally {
			if (options.alt) await page.keyboard.up('Alt');
		}
		await sleep(400);
	};

	/** decks arm-for-move on a long press; everything else lifts immediately */
	const holdFor = (id: string) => id.startsWith('deck:');

	const dragBy = async (id: string, dx: number, dy: number) => {
		const from = await locate(id);
		if (!from) throw new Error(`cannot locate ${id} on screen`);
		await dragFromTo(id, from, { x: from.x + dx, y: from.y + dy }, { hold: holdFor(id) });
	};

	/**
	 * Release over a table-plane world position: the drop commits wherever the
	 * pointer's raycast hits the table, so the target pixel is the projection
	 * of that spot on the felt — where a snap grid can then pull it from.
	 */
	const dragTo = async (
		id: string,
		worldX: number,
		worldZ: number,
		options: { alt?: boolean } = {}
	) => {
		const from = await locate(id);
		if (!from) throw new Error(`cannot locate ${id} on screen`);
		const to = await page.evaluate(
			(x, z) => window.__tableplace!.project([x, 0.26, z]),
			worldX,
			worldZ
		);
		if (!to) throw new Error(`world (${worldX}, ${worldZ}) projects off-screen`);
		await dragFromTo(id, from, to, { ...options, hold: holdFor(id) });
	};

	/**
	 * One PNG per spec, written after a settle so the springs are done posing.
	 *
	 * The flat-color guard exists because SwiftShader's failure mode is not an
	 * error but an empty frame: the harness's structural assertions (mesh
	 * counts, raycasts) all keep passing while the canvas draws nothing. So the
	 * check reads pixels back from the PNG that was actually written — not from
	 * the live canvas, whose drawing buffer may not even be preserved — by
	 * loading it into the page and sampling a grid of points inside the table
	 * canvas's own box. Points the HUD panes cover are skipped: a pane's chrome
	 * would count as "variation" over a canvas that rendered nothing at all.
	 */
	const snap = async (name: string) => {
		await settle();
		mkdirSync(SCREENSHOT_DIR, { recursive: true });
		const file = join(SCREENSHOT_DIR, `${name}.png`);
		const png = new Uint8Array(await page.screenshot({ type: 'png' }));
		await writeFile(file, png);

		const sampled = await page.evaluate(
			async (dataUrl) => {
				const image = new Image();
				await new Promise<void>((resolve, reject) => {
					image.onload = () => resolve();
					image.onerror = () => reject(new Error('the captured PNG did not decode'));
					image.src = dataUrl;
				});
				const surface = document.createElement('canvas');
				surface.width = image.width;
				surface.height = image.height;
				const context = surface.getContext('2d');
				if (!context) return { points: 0, spread: 0 };
				context.drawImage(image, 0, 0);

				// the WebGL table is the biggest canvas on the page — the HUD's
				// Tweakpane panes each carry small canvases of their own
				const table = [...document.querySelectorAll('canvas')].sort(
					(a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight
				)[0];
				const box = table?.getBoundingClientRect();
				if (!table || !box || !box.width || !box.height) return { points: 0, spread: 0 };
				// the screenshot is in device pixels; the box is in CSS pixels
				const scaleX = image.width / window.innerWidth;
				const scaleY = image.height / window.innerHeight;

				const low = [255, 255, 255];
				const high = [0, 0, 0];
				let points = 0;
				const STEPS = 8;
				for (let row = 1; row < STEPS; row++) {
					for (let column = 1; column < STEPS; column++) {
						const cssX = box.left + (box.width * column) / STEPS;
						const cssY = box.top + (box.height * row) / STEPS;
						if (document.elementFromPoint(cssX, cssY) !== table) continue;
						const pixel = context.getImageData(
							Math.round(cssX * scaleX),
							Math.round(cssY * scaleY),
							1,
							1
						).data;
						points++;
						for (const channel of [0, 1, 2]) {
							low[channel] = Math.min(low[channel]!, pixel[channel]!);
							high[channel] = Math.max(high[channel]!, pixel[channel]!);
						}
					}
				}
				// how far apart the sampled pixels are, on the widest RGB channel.
				// A blank canvas shows the page background through: measured ≤5
				// even with a HUD pane's drop shadow grazing a sample, while the
				// felt's own shading alone spans ≥29 — so 16 splits them cleanly
				// without caring what color anything is.
				const spread = Math.max(high[0]! - low[0]!, high[1]! - low[1]!, high[2]! - low[2]!);
				return { points, spread };
			},
			`data:image/png;base64,${Buffer.from(png).toString('base64')}`
		);

		if (sampled.points === 0) {
			throw new Error(`screenshot ${name}.png: found no table canvas pixels to sample`);
		}
		if (sampled.spread < 16) {
			throw new Error(
				`screenshot ${name}.png is one flat color across ${sampled.points} sampled canvas ` +
					`points (RGB spread ${sampled.spread}) — SwiftShader rendered a blank frame. ` +
					`The PNG is at ${file}.`
			);
		}
		return file;
	};

	return {
		page,
		problems,
		appProblems: () => problems.filter((problem) => !ignorable(problem.text)),
		spawn,
		seedDeck,
		locate,
		hits,
		elementAt,
		describe,
		dragBy,
		dragTo,
		positionOf,
		settle,
		stall,
		snap,
		close: () => page.close()
	};
}
