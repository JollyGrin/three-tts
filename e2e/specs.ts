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
import { setTimeout as sleep } from 'node:timers/promises';
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
 * Poll a probe until its answer satisfies `holds`, then return that answer —
 * or return the last answer when time runs out, so the caller's own `ok(...)`
 * still reports the real observed state.
 *
 * For spring-animated state the harness can only watch (a tap turning a card,
 * a rotate turning a model): a fixed settle races the CI runner's frame rate,
 * and a shared runner under load has lost that race in two different specs.
 * The assertion is about the FINAL state, so waiting for it — bounded — is
 * what the spec actually means.
 */
async function eventually<T>(
	probe: () => Promise<T>,
	holds: (value: T) => boolean,
	timeoutMs = 8000
): Promise<T> {
	const deadline = Date.now() + timeoutMs;
	let last = await probe();
	while (!holds(last) && Date.now() < deadline) {
		await sleep(300);
		last = await probe();
	}
	return last;
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

				// sideways on the felt: footprint wider (x) than deep (z), once the
				// draw/flip springs finish — polled, not raced (see eventually)
				const drawn = await eventually(
					() => table.describe(cardId),
					(shape) => !!shape && shape.size[0] > shape.size[2]
				);
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
				// portrait card lies down. Polled: a loaded CI runner has caught this
				// mid-turn (a near-square footprint) with a fixed settle.
				await table.page.evaluate((id) => window.__tableplace!.actions.tapCard(false, id), cardId);
				const tapped = await eventually(
					() => table.describe(cardId),
					(shape) => !!shape && shape.size[2] > shape.size[0]
				);
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
		/**
		 * Snap grids (tableplace-134) under a real mouse: a token and a whole
		 * deck released over a 3×3 grid must land on cell centres — the exact
		 * transform the resolver promises — and the rest of the table must
		 * still answer the pointer afterwards (a broken grid entry in the
		 * shared snapPoints record would poison every drop on the table).
		 */
		name: 'snap grid: a token and a deck land on cell centres',
		run: (context) =>
			withTable(context, 'snap-grid', async (table) => {
				const deck = await table.seedDeck();
				const token = await table.spawn('token', { position: LANE(0) });
				// grid centred at [6, 1], pitch 2, 3×3 → cells x ∈ {4,6,8}, z ∈ {-1,1,3}
				await table.page.evaluate(() =>
					window.__tableplace!.actions.addSnapPoint({
						position: [6, 1],
						kind: 'grid',
						pitch: 2,
						cols: 3,
						rows: 3
					})
				);
				await table.settle();

				// released inside the middle cell but off its centre: the landing
				// must be the centre, not the pointer
				await table.dragTo(token, 5.4, 0.6);
				const tokenPos = await table.positionOf(token);
				ok(tokenPos, `the token has no position after the drop`);
				ok(
					Math.abs(tokenPos![0] - 6) < 0.01 && Math.abs(tokenPos![2] - 1) < 0.01,
					`the token did not land on the cell centre [6, 1]: ${JSON.stringify(tokenPos)}`
				);

				// a whole deck snaps too, released nearest the [8, 1] cell
				await table.dragTo(deck, 7.6, 0.8);
				const deckPos = await table.positionOf(deck);
				ok(deckPos, `the deck has no position after the drop`);
				ok(
					Math.abs(deckPos![0] - 8) < 0.01 && Math.abs(deckPos![2] - 1) < 0.01,
					`the deck did not land on the cell centre [8, 1]: ${JSON.stringify(deckPos)}`
				);

				// the grid must not have cost the table its raycast: everything
				// still lifts and drags (single shared interactivity() — #86)
				await assertDraggable(table, deck, 'deck (after grid snapping)');
				await assertDraggable(table, token, 'the token (after grid snapping)');
				assertClean(table, 'after snapping onto a grid');
			})
	},
	{
		/**
		 * tableplace-135: a catalog model (GLB over HTTP) renders, drags, and
		 * rotates VISIBLY — the piece-rotation binding this ticket fixed — while
		 * the deck and a die stay interactive beside it. `requestfailed` is part
		 * of assertClean, so a 404ing manifest or GLB fails here by name. A
		 * second browser then joins the same lobby and must see the same cave:
		 * the ref syncs, the geometry re-resolves.
		 */
		name: 'model: a cave section renders, rotates and syncs beside deck + die',
		run: async (context) => {
			const lobby = nextLobby('model');
			const table = await openTable(context.browser, context.servers, lobby);
			try {
				const deck = await table.seedDeck();
				// room-wide: 5×3 cells → a 10×6.1 world footprint, asymmetric on
				// purpose so a quarter turn is measurable in the rendered bbox
				const model = await table.spawn('model', {
					name: 'room-wide',
					model: 'model:kenney-cave/room-wide',
					radius: 5.86,
					position: [0, 0.16, 0]
				});
				const die = await table.spawn('die', { sides: 20, position: [8, 0.16, 1] });
				await table.settle(3000); // manifest fetch + GLB fetch + parse
				assertClean(table, 'after spawning a cave section from the catalog');
				await assertRenders(table, model, 'the cave section');

				// polled: a slow CI runner can still be showing the placeholder box
				// (untextured) while the GLB fetch+parse finishes
				const flat = await eventually(
					() => table.describe(model),
					(shape) =>
						!!shape &&
						shape.size[0] > shape.size[2] + 2 &&
						shape.materials.some((material) => (material as { hasMap: boolean }).hasMap)
				);
				ok(
					flat!.size[0] > flat!.size[2] + 2,
					`room-wide should be wider (x) than deep (z): ${JSON.stringify(flat!.size)}`
				);
				ok(
					flat!.materials.some((material) => (material as { hasMap: boolean }).hasMap),
					`the section mounted untextured — the atlas did not load: ${JSON.stringify(flat!.materials)}`
				);

				// rotate by the grid step: the synced yaw must become visible geometry
				await table.page.evaluate((id) => window.__tableplace!.actions.rotatePiece(id, 90), model);
				const turned = await eventually(
					() => table.describe(model),
					(shape) => !!shape && shape.size[2] > shape.size[0] + 2
				);
				ok(
					turned!.size[2] > turned!.size[0] + 2,
					`rotating 90° did not turn the rendered section: ${JSON.stringify(turned!.size)}`
				);
				const storedYaw = await table.page.evaluate(
					(id) => window.__tableplace!.state()?.pieces?.[id]?.rotation ?? null,
					model
				);
				ok(storedYaw?.[1] === 90, `the yaw did not sync as degrees: ${JSON.stringify(storedYaw)}`);

				await assertDraggable(table, model, 'the cave section');
				await assertDraggable(table, deck, 'deck (with a cave section on the table)');
				await assertDraggable(table, die, 'the d20 (with a cave section on the table)');
				assertClean(table, 'after dragging with a cave section on the table');

				// the second browser: same lobby, same cave
				const remote = await openTable(context.browser, context.servers, lobby);
				try {
					await remote.settle(3000);
					await assertRenders(remote, model, 'the cave section (remote client)');
					const localPos = await table.positionOf(model);
					const remotePos = await remote.positionOf(model);
					ok(
						!!localPos &&
							!!remotePos &&
							planarDistance(localPos, remotePos) < 0.01 &&
							Math.abs((localPos[1] ?? 0) - (remotePos[1] ?? 0)) < 0.01,
						`the two clients disagree where the section is: ${JSON.stringify(localPos)} vs ${JSON.stringify(remotePos)}`
					);
					assertClean(remote, 'on the second client with the synced cave');
				} finally {
					await remote.close();
				}
			} finally {
				await table.close();
			}
		}
	},
	{
		/**
		 * Surface rest (tableplace-135 §6): a token dropped onto a raised model
		 * tile must rest on its top surface — the injected surfaceYAt raycast —
		 * and settle back EXACTLY to felt rest height when dragged off again
		 * (elevation must never stick to the next drop). No physics: both
		 * heights are computed at the drop and synced as plain positions.
		 *
		 * Each hop asserts the drag ARRIVED (planar) before judging its height,
		 * so a synthetic-pointer grab that slips on a slow CI frame reads as
		 * "the drag never happened", not as a false elevation bug — and slips
		 * are retried via dragToArrives, with generous settles so the height
		 * spring has finished before the next grab aims at the token.
		 */
		name: 'model surface: a token dropped on a raised tile rests on it',
		run: (context) =>
			withTable(context, 'model-surface', async (table) => {
				const PIECE_FELT_REST = 0.335; // TABLE_TOP_Y + half the disc thickness

				/**
				 * dragTo, retried while the token demonstrably did not arrive at the
				 * target XZ. What is being retried is puppeteer's pointer delivery
				 * under SwiftShader — dispatch liveness has its own single-attempt
				 * assertions (assertDraggable) elsewhere; the properties under test
				 * here are the rest HEIGHTS, asserted after arrival.
				 */
				const dragToArrives = async (id: string, x: number, z: number, label: string) => {
					for (let attempt = 0; attempt < 3; attempt++) {
						await table.dragTo(id, x, z);
						await table.settle(900); // springs done before the next locate()
						const position = await table.positionOf(id);
						if (position && Math.hypot(position[0] - x, position[2] - z) < 1.0) return position;
					}
					const stuck = await table.positionOf(id);
					throw new Error(
						`${label} (${id}) never arrived at (${x}, ${z}) after 3 drags: ${JSON.stringify(stuck)}`
					);
				};

				const deck = await table.seedDeck();
				const tile = await table.spawn('model', {
					name: 'raised',
					model: 'model:kenney-cave/template-floor-layer-raised',
					radius: 2.83,
					position: [-4, 0.16, 1]
				});
				const token = await table.spawn('token', { position: [4, 0.16, 1] });
				await table.settle(2500);
				assertClean(table, 'with a raised tile and a token on the table');
				await assertRenders(table, tile, 'the raised tile');

				// on: the drop lands on the tile's surface, well above felt rest
				const onTile = await dragToArrives(token, -4, 1, 'the token (onto the tile)');
				ok(
					(onTile[1] ?? 0) > 0.5,
					`the token sank to felt height instead of resting on the tile: ${JSON.stringify(onTile)}`
				);

				// off: the next drop has no model under it — the effective floor
				// falls back to the felt and the rest height is EXACTLY the token's
				// felt rest, not the carried-over elevation
				const onFelt = await dragToArrives(token, 6, 1, 'the token (off the tile)');
				ok(
					Math.abs((onFelt[1] ?? 9) - PIECE_FELT_REST) < 0.02,
					`the token did not return to felt rest (${PIECE_FELT_REST}) after leaving the tile: ${JSON.stringify(onFelt)}`
				);

				// and back on: the surface answer is repeatable, not a spawn artifact
				const backOn = await dragToArrives(token, -4, 1, 'the token (back onto the tile)');
				ok(
					(backOn[1] ?? 0) > 0.5,
					`the token failed to rest on the tile a second time: ${JSON.stringify(backOn)}`
				);

				await assertDraggable(table, deck, 'deck (with surface rest in play)');
				assertClean(table, 'after resting a token on a model surface');
			})
	},
	{
		/**
		 * Scene sanity (tableplace-135 acceptance): a template-built ~30-tile
		 * cave plus decks and dice stays interactive — thirty clones of one GLB,
		 * one texture, and the shared raycast still answers for everything.
		 */
		name: 'model scene: a 30-tile cave + decks + dice stays interactive',
		run: (context) =>
			withTable(context, 'model-scene', async (table) => {
				const deck = await table.seedDeck();
				const tiles: string[] = [];
				for (let column = 0; column < 6; column++) {
					for (let row = 0; row < 5; row++) {
						tiles.push(
							await table.spawn('model', {
								name: `corridor-${column}-${row}`,
								model: 'model:kenney-cave/corridor',
								radius: 1.42,
								position: [-14 + column * 2, 0.16, -5 + row * 2]
							})
						);
					}
				}
				const die = await table.spawn('die', { sides: 6, position: [4, 0.16, 2] });
				await table.settle(4000);
				assertClean(table, 'with a 30-tile cave, a deck and a die on the table');

				await assertRenders(table, tiles[0], 'the first cave tile');
				await assertRenders(table, tiles[tiles.length - 1], 'the last cave tile');
				await assertDraggable(table, deck, 'deck (in the 30-tile cave scene)');
				await assertDraggable(table, die, 'the d6 (in the 30-tile cave scene)');
				assertClean(table, 'at the end of the 30-tile cave scene');
			})
	},
	{
		/**
		 * tableplace-148: the Cataclysm Arcade lobby creator's zone set
		 * (tableplace-demos/cataclysm-arcade) — a one-card face-up boss pile in
		 * play, the draw deck, a face-up token pile, a counter rail (boss health
		 * full at 17, coins started at 1) and an infinite bag of damage counters —
		 * composed together and interactive. Faces are `gen:` refs so the spec
		 * fetches nothing; the demo's real `sheet:` faces ride the pipeline other
		 * specs already exercise.
		 */
		name: 'cataclysm arcade: boss pile, counter rail and token bag stay interactive',
		run: (context) =>
			withTable(context, 'cataclysm', async (table) => {
				const deck = await table.page.evaluate(() => {
					// the 14-card booster deal, at the layout's own deck spot
					const codes = [
						'AS',
						'2S',
						'3S',
						'4S',
						'5S',
						'6S',
						'7S',
						'8S',
						'9S',
						'10S',
						'JS',
						'QS',
						'KS',
						'AH'
					];
					const cards = codes.map((code) => ({
						id: `card:cade:${code}`,
						faceImageUrl: `gen:std52/${code}`,
						backImageUrl: 'gen:std52/back'
					}));
					return String(window.__tableplace!.actions.addDeck({ cards } as never) ?? '');
				});
				const boss = await table.page.evaluate(() => {
					// the Boss starts in play: a one-card pile dealt face-up
					const cards = [
						{ id: 'card:cade:boss', faceImageUrl: 'gen:std52/KD', backImageUrl: 'gen:std52/back' }
					];
					return String(
						window.__tableplace!.actions.addDeck({
							cards,
							isFaceUp: true,
							position: [-2, 0.4, -2]
						} as never) ?? ''
					);
				});
				const tokens = await table.page.evaluate(() => {
					// five copies of the pack's token card, face-up
					const cards = [1, 2, 3, 4, 5].map((n) => ({
						id: `card:cade:token-${n}`,
						faceImageUrl: 'gen:std52/JC',
						backImageUrl: 'gen:std52/back'
					}));
					return String(
						window.__tableplace!.actions.addDeck({
							cards,
							isFaceUp: true,
							position: [-6, 0.4, -2]
						} as never) ?? ''
					);
				});
				const health = await table.spawn('counter', {
					name: 'Boss health',
					maxValue: 17,
					position: LANE(0)
				});
				const coins = await table.spawn('counter', {
					name: 'Coins',
					maxValue: 20,
					value: 1,
					position: LANE(1)
				});
				const bag = await table.spawn('bag', {
					name: 'Damage counters',
					infinite: true,
					position: LANE(2),
					contents: [{ kind: 'counter', name: 'Damage', color: '#b3372f', maxValue: 99 }]
				});
				await table.settle(1500);
				assertClean(table, 'with the cataclysm arcade zone set on the table');

				for (const [id, label] of [
					[deck, 'the draw deck'],
					[boss, 'the boss pile'],
					[tokens, 'the token pile'],
					[health, 'the boss-health counter'],
					[coins, 'the coin counter'],
					[bag, 'the damage-counter bag']
				] as const) {
					await assertRenders(table, id, `${label} (cataclysm table)`);
				}

				// the counters carry the seeded values: health spawns full, coins at 1
				const values = await table.page.evaluate(
					(a, b) => [
						window.__tableplace!.state()?.pieces?.[a]?.value ?? null,
						window.__tableplace!.state()?.pieces?.[b]?.value ?? null
					],
					health,
					coins
				);
				ok(values[0] === 17, `boss health did not spawn full at 17: ${JSON.stringify(values)}`);
				ok(values[1] === 1, `coins did not start at 1: ${JSON.stringify(values)}`);
				await table.page.evaluate(
					(id) => window.__tableplace!.actions.incrementCounter(id, 1),
					coins
				);
				const bumped = await eventually(
					() =>
						table.page.evaluate(
							(id) => window.__tableplace!.state()?.pieces?.[id]?.value ?? null,
							coins
						),
					(value) => value === 2
				);
				ok(
					bumped === 2,
					`incrementing the coin counter did not land on 2: ${JSON.stringify(bumped)}`
				);

				// play the Boss: draw it off its pile and tap it — a portrait card
				// taps sideways, so the rendered footprint turns wider than deep
				const bossCard = await table.page.evaluate(
					(id) => window.__tableplace!.actions.drawFromTop(id, 1)[0]?.id ?? '',
					boss
				);
				ok(!!bossCard, 'nothing came off the boss pile');
				await table.settle(1500);
				await table.page.evaluate(
					(id) => window.__tableplace!.actions.tapCard(false, id),
					bossCard
				);
				const tapped = await eventually(
					() => table.describe(bossCard),
					(shape) => !!shape && shape.size[0] > shape.size[2]
				);
				ok(
					tapped!.size[0] > tapped!.size[2],
					`tapping did not turn the boss card sideways: footprint ${JSON.stringify(tapped!.size)}`
				);

				// a damage counter comes out of the bag live, and the infinite bag
				// keeps its contents
				const draw = await table.page.evaluate(
					(id) => window.__tableplace!.actions.drawFromBag(id),
					bag
				);
				ok(draw && (draw as { id: string }).id, 'the damage bag drew nothing');
				await table.settle(1000);
				await assertRenders(table, (draw as { id: string }).id, 'the drawn damage counter');
				const left = await table.page.evaluate(
					(id) =>
						(window.__tableplace!.state()?.pieces?.[id] as { contents?: unknown[] } | undefined)
							?.contents?.length ?? 0,
					bag
				);
				ok(left === 1, `the infinite bag lost its contents: ${left} left`);

				await assertDraggable(table, bossCard, 'the boss card (cataclysm table)');
				await assertDraggable(table, deck, 'the draw deck (cataclysm table)');
				await assertDraggable(table, bag, 'the damage-counter bag (cataclysm table)');
				assertClean(table, 'at the end of the cataclysm arcade table');
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
