/**
 * What the harness checks.
 *
 * Every spec has the same spine, because #102 does: put something new on the
 * table, then confirm that *everything else* still answers the pointer and that
 * nothing new mounts broken. The shared `interactivity()` context (#86) means
 * one entity that throws during raycast takes dispatch down for the whole
 * table — and a Svelte effect that reads state it also writes is worse still,
 * because the runtime teardown stops every later component mounting at all.
 * So "the deck still drags" is the assertion that catches a broken die.
 *
 * Positions matter. Anything the specs click has to draw clear of the HUD
 * panes; `dragBy` fails loudly if it doesn't, because a pane over the target
 * looks identical to a frozen table.
 */

import type { Browser } from 'puppeteer-core';
import { ok, planarDistance } from './assert';
import type { Servers } from './servers';
import { openTable, type Table } from './table';

export type Spec = {
	name: string;
	run: (context: { browser: Browser; servers: Servers }) => Promise<void>;
};

/**
 * A clear lane of felt, left-to-right, below the Settings pane and above the
 * bottom edge. Everything a spec drags lives here and is dragged straight down
 * into empty table.
 */
const LANE = (slot: number): [number, number, number] => [-4 + slot * 4, 0.16, 1];
const DRAG = { dx: 0, dy: 150 };

let lobbySeq = 0;
/** a fresh lobby per spec, so nothing leaks between them through the relay */
function nextLobby(name: string): string {
	return `e2e-${name.replace(/[^a-z0-9]+/gi, '-')}-${process.pid}-${lobbySeq++}`;
}

/**
 * Called with `what just happened`. The runtime-teardown case is named
 * separately because it is the failure #102 actually was, and because its
 * signature — `effect_update_depth_exceeded` — is worth reading in the report
 * rather than being one line of a console dump.
 */
function assertClean(table: Table, when: string): void {
	const problems = table.appProblems();
	const teardown = problems.find((problem) => /effect_update_depth_exceeded/.test(problem.text));
	ok(
		!teardown,
		`the Svelte runtime tore itself down ${when} — every effect on the page is dead, ` +
			`so nothing further mounts and nothing answers the pointer:\n  ${teardown?.text.split('\n').slice(0, 4).join('\n  ')}`
	);
	ok(
		problems.length === 0,
		`console was not clean ${when}:\n${problems.map((p) => `  [${p.kind}] ${p.text}`).join('\n')}`
	);
}

/** the load-bearing check: pick the entity up with a real mouse and see it move */
async function assertDraggable(table: Table, id: string, label: string): Promise<void> {
	const before = await table.positionOf(id);
	ok(before, `${label} (${id}) has no position to start from`);
	const point = await table.locate(id);
	ok(point, `${label} (${id}) never mounted into the scene — nothing to click`);

	// what dispatch would see: the entity has to be the thing under its own
	// pixel, not merely *something*. A table that has stopped updating still
	// answers with felt.
	const hits = await table.hits(point!);
	ok(
		hits.includes(id),
		`the raycaster does not reach ${label} (${id}) at its own screen position — it hits ${
			hits.length ? hits.join(', ') : 'nothing at all'
		}`
	);

	await table.dragBy(id, DRAG.dx, DRAG.dy);
	const after = await table.positionOf(id);
	ok(
		planarDistance(before, after) > 0.5,
		`${label} (${id}) did not move: ${JSON.stringify(before)} → ${JSON.stringify(after)}`
	);
}

/** "renders white" was never a material fault — it was nothing mounting at all */
async function assertRenders(table: Table, id: string, label: string): Promise<void> {
	const shape = await table.describe(id);
	ok(shape, `${label} (${id}) is in the store but has no object in the scene — it never mounted`);
	ok(shape!.meshes > 0, `${label} (${id}) mounted an empty group — no meshes to draw`);
}

async function withTable(
	context: { browser: Browser; servers: Servers },
	name: string,
	body: (table: Table) => Promise<void>
): Promise<void> {
	const table = await openTable(context.browser, context.servers, nextLobby(name));
	try {
		await body(table);
	} finally {
		await table.close();
	}
}

export const SPECS: Spec[] = [
	{
		// the control. If this fails, the harness is broken, not the app.
		name: 'deck alone: drags, console clean',
		run: (context) =>
			withTable(context, 'deck-alone', async (table) => {
				const deck = await table.seedDeck();
				await table.settle();
				await assertRenders(table, deck, 'deck');
				await assertDraggable(table, deck, 'deck');
				assertClean(table, 'with a deck alone on the table');
			})
	},
	{
		name: 'freeze: a die does not break the deck',
		run: (context) =>
			withTable(context, 'die', async (table) => {
				const deck = await table.seedDeck();
				const die = await table.spawn('die', { sides: 20, position: LANE(0) });
				await table.settle(1200);
				assertClean(table, 'immediately after spawning a d20');
				await assertRenders(table, die, 'the d20');
				await assertDraggable(table, deck, 'deck (with a d20 on the table)');
				await assertDraggable(table, die, 'the d20 itself');
				assertClean(table, 'after dragging with a d20 on the table');
			})
	},
	{
		name: 'freeze: every die shape is harmless',
		run: (context) =>
			withTable(context, 'die-shapes', async (table) => {
				const deck = await table.seedDeck();
				const shapes = [4, 6, 8, 10, 12, 20];
				const dice: string[] = [];
				for (const [index, sides] of shapes.entries()) {
					dice.push(await table.spawn('die', { sides, position: [-9 + index * 3, 0.16, -3] }));
				}
				await table.settle(1500);
				assertClean(table, 'with one die of every shape on the table');
				for (const [index, id] of dice.entries()) {
					await assertRenders(table, id, `the d${shapes[index]}`);
				}
				await assertDraggable(table, deck, 'deck (with d4…d20 on the table)');
			})
	},
	{
		name: 'freeze: a bag does not break the deck',
		run: (context) =>
			withTable(context, 'bag', async (table) => {
				const deck = await table.seedDeck();
				const bag = await table.spawn('bag', { position: LANE(0) });
				await table.settle(1200);
				assertClean(table, 'immediately after spawning a bag');
				await assertRenders(table, bag, 'the bag');
				await assertDraggable(table, deck, 'deck (with a bag on the table)');
				await assertDraggable(table, bag, 'the bag itself');
				assertClean(table, 'after dragging with a bag on the table');
			})
	},
	{
		/**
		 * The reported "spawn a pack, it's just white". It was never a material
		 * fault: the die had already torn the runtime down, so the deck landed in
		 * the store and no component ever mounted for it. Spawning the pack
		 * *after* the die is what makes this spec name the symptom.
		 */
		name: 'white pack: a deck spawned after a die still mounts and textures',
		run: (context) =>
			withTable(context, 'white-pack', async (table) => {
				const die = await table.spawn('die', { sides: 6, position: LANE(0) });
				await table.settle(1200);
				assertClean(table, 'after spawning a d6 on an empty table');

				const deck = await table.seedDeck();
				await table.settle(1500);
				await assertRenders(table, deck, 'a deck spawned after a die');

				const shape = await table.describe(deck);
				ok(
					shape!.materials.some((material) => (material as { hasMap: boolean }).hasMap),
					`the deck mounted but every material is untextured — this is what "renders white" looks like: ${JSON.stringify(shape!.materials)}`
				);
				await assertDraggable(table, deck, 'a deck spawned after a die');
				await assertRenders(table, die, 'the d6');
				assertClean(table, 'with a pack spawned after a die');
			})
	},
	{
		/**
		 * tableplace-132: a landscape card's quarter turn is applied by the
		 * renderer alone. The store cannot answer "which way does it draw", so
		 * this reads the rendered bounding box — wider than deep means sideways —
		 * and checks the synced rotation stayed orientation-relative underneath.
		 */
		name: 'landscape card: draws sideways, taps upright, still drags',
		run: (context) =>
			withTable(context, 'landscape', async (table) => {
				// a two-card all-landscape deck, positioned clear of the HUD panes
				const deck = await table.page.evaluate(() => {
					const cards = ['AS', 'KH'].map((code) => ({
						id: `card:std:site-${code}`,
						faceImageUrl: `gen:std52/${code}`,
						backImageUrl: 'gen:std52/back',
						orientation: 'landscape'
					}));
					return String(
						window.__tableplace!.actions.addDeck({ cards, position: [-2, 0.4, -2] } as never) ?? ''
					);
				});
				await table.settle(1000);

				const cardId = await table.page.evaluate(
					(id) => window.__tableplace!.actions.drawFromTop(id, 1)[0]?.id ?? '',
					deck
				);
				ok(!!cardId, 'nothing came off the top of the deck');
				await table.settle(1500); // let the draw/flip springs finish
				await assertRenders(table, cardId, 'the landscape card');

				// sideways on the felt: footprint wider (x) than deep (z)
				const drawn = await table.describe(cardId);
				ok(
					drawn!.size[0] > drawn!.size[2],
					`the landscape card draws portrait: footprint ${JSON.stringify(drawn!.size)}`
				);
				// …and the quarter turn never leaked into the synced rotation
				const stored = await table.page.evaluate(
					(id) => window.__tableplace!.state()?.cards?.[id]?.rotation ?? null,
					cardId
				);
				ok(
					Math.abs(stored?.[2] ?? NaN) % 180 === 0,
					`the 90° was baked into synced state: rotation ${JSON.stringify(stored)}`
				);

				// tap stands it upright — orientation-relative, exactly like a
				// portrait card lies down
				await table.page.evaluate((id) => window.__tableplace!.actions.tapCard(false, id), cardId);
				await table.settle(1500);
				const tapped = await table.describe(cardId);
				ok(
					tapped!.size[2] > tapped!.size[0],
					`tapping did not stand the landscape card upright: footprint ${JSON.stringify(tapped!.size)}`
				);

				await assertDraggable(table, cardId, 'the landscape card');
				await assertDraggable(table, deck, 'deck (with a landscape card out)');
				assertClean(table, 'with a landscape card on the table');
			})
	},
	{
		// acceptance criterion 4: one table carrying all four at once
		name: 'mixed table: deck + die + bag + multi-state piece',
		run: (context) =>
			withTable(context, 'mixed', async (table) => {
				const deck = await table.seedDeck();
				const die = await table.spawn('die', { sides: 10, position: LANE(0) });
				const bag = await table.spawn('bag', { position: LANE(1) });
				const token = await table.spawn('token', {
					position: LANE(2),
					states: [
						{ face: 'gen:std52/AS', name: 'front' },
						{ face: 'gen:std52/KH', name: 'back' }
					]
				});
				await table.settle(1500);
				assertClean(table, 'with a deck, a d10, a bag and a two-state token on the table');

				const entities = [
					[deck, 'deck'],
					[die, 'd10'],
					[bag, 'bag'],
					[token, 'two-state token']
				] as const;
				for (const [id, label] of entities) {
					await assertRenders(table, id, `${label} (mixed table)`);
					await assertDraggable(table, id, `${label} (mixed table)`);
				}

				// the state menu is what a multi-state piece exists for; cycling it
				// must not disturb dispatch either
				await table.page.evaluate(
					(id) => window.__tableplace!.actions.cyclePieceState(id, 1),
					token
				);
				await table.settle();
				await assertDraggable(table, deck, 'deck (after cycling a piece state)');
				assertClean(table, 'at the end of the mixed table');
			})
	}
];
