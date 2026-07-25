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
import { setTimeout as sleep } from 'node:timers/promises';
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
	describe: (id: string) => Promise<{ meshes: number; materials: unknown[] } | null>;
	dragBy: (id: string, dx: number, dy: number) => Promise<void>;
	positionOf: (id: string) => Promise<number[] | null>;
	settle: (ms?: number) => Promise<void>;
	close: () => Promise<void>;
};

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
	 */
	const dragBy = async (id: string, dx: number, dy: number) => {
		const from = await locate(id);
		if (!from) throw new Error(`cannot locate ${id} on screen`);
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
		await page.mouse.move(from.x, from.y);
		await sleep(80);
		await page.mouse.down();
		await sleep(80);
		for (let step = 1; step <= 12; step++) {
			await page.mouse.move(from.x + (dx * step) / 12, from.y + (dy * step) / 12);
			await sleep(20);
		}
		await sleep(150);
		await page.mouse.up();
		await sleep(400);
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
		positionOf,
		settle,
		close: () => page.close()
	};
}
