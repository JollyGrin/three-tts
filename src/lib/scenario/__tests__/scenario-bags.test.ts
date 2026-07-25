/**
 * A bag has to survive the /setup pipeline the same way any other piece does:
 * spawn from an imported pack → position it → save → export → import → load,
 * with the pool coming back from the pack rather than being copied into the
 * scenario file (which would both restate the pack and publish what the format
 * calls hidden — see docs/packs.md).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { gameStore } from '$lib/store/game/gameStore.svelte';
import { gameActions } from '$lib/store/game/actions';
import { parsePackFile, serializePackFile } from '$lib/packs/file';
import { spawnPack } from '$lib/packs/spawn';
import { PIECE_REST_Y } from '$lib/utils/constants-pieces';
import type { GamePackDef } from '$lib/packs/types';
import {
	applyScenario,
	claimSeat,
	ensureSeatPlaceholder,
	getScenario,
	importScenarioFromText,
	saveScenario,
	seatPlaceholderId
} from '../scenario';

const BAG_PACK: GamePackDef = {
	id: 'tile-game',
	name: 'Tile Game',
	scope: 'table',
	decks: [],
	pieces: [
		{
			kind: 'bag',
			name: 'Tile Bag',
			color: '#7c2d12',
			drawMode: 'lifo',
			contents: [
				{ kind: 'token', name: 'Ember', color: '#f97316' },
				{ kind: 'card', code: 'omen', face: 'https://example.com/omen.png' }
			],
			position: [-9, 4]
		}
	]
};

const BAG_ID = 'piece:seat0:tile-bag-0';
/** where the scenario's pack ref re-resolves from (stubbed below) */
const PACK_URL = 'https://example.com/packs/tile-game.tbpp.json';

const emptyTable = () =>
	gameStore.set({ players: {}, cards: {}, decks: {}, pieces: {}, overlays: {} });

/** /setup: import the pack onto seat 0, then drag the bag somewhere else */
function authorBagTable() {
	emptyTable();
	ensureSeatPlaceholder(0);
	// the pack goes through the real import path first, so the file's own
	// validator is what the scenario is built on
	const pack = parsePackFile(serializePackFile(BAG_PACK));
	spawnPack(pack, { ownerId: seatPlaceholderId(0), source: PACK_URL });
	gameActions.movePiece(BAG_ID, [12, PIECE_REST_Y, -6]);
}

describe('bags through the scenario pipeline', () => {
	beforeEach(() => {
		localStorage.clear();
		// a load re-fetches the pack rather than re-reading the scenario: that is
		// exactly the property under test
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				if (url !== PACK_URL) throw new Error(`unexpected fetch: ${url}`);
				return { ok: true, status: 200, text: async () => serializePackFile(BAG_PACK) };
			})
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('places a bag from an imported pack, loaded and positioned', () => {
		authorBagTable();
		const bag = get(gameStore).pieces?.[BAG_ID];

		expect(bag).toMatchObject({ kind: 'bag', name: 'Tile Bag', drawMode: 'lifo' });
		expect(bag?.contents).toHaveLength(2);
		expect(bag?.position).toEqual([12, PIECE_REST_Y, -6]);
		expect(bag?.packOrigin).toMatchObject({ pack: 'tile-game', content: '0' });
	});

	it('exports the bag as a piece placement, with the pool left in the pack', () => {
		authorBagTable();
		const scenario = saveScenario('bag-setup');

		expect(scenario.packs).toEqual([{ id: 'tile-game', source: PACK_URL }]);
		expect(scenario.placements).toEqual([
			{
				kind: 'piece',
				pack: 'tile-game',
				content: '0',
				seat: 0,
				position: [12, PIECE_REST_Y, -6],
				rotation: [0, 0, 0]
			}
		]);
		// neither the contents nor the bag body are copied into the file
		expect(scenario.state.pieces).toEqual({});
		expect(JSON.stringify(scenario)).not.toContain('omen');
	});

	it('round-trips through a .tbps.json file and comes back loaded and in place', async () => {
		authorBagTable();
		const exported = JSON.stringify(saveScenario('bag-file'), null, '\t');

		emptyTable();
		const report = await applyScenario(importScenarioFromText(exported));

		expect(report).toMatchObject({ version: 2, placed: 1, failedPacks: [] });
		const bag = get(gameStore).pieces?.[BAG_ID];
		expect(bag?.position).toEqual([12, PIECE_REST_Y, -6]);
		expect(bag).toMatchObject({ kind: 'bag', drawMode: 'lifo' });
		// the pool is restored from the pack, so the bag is drawable again
		expect(bag?.contents).toHaveLength(2);
		expect(gameActions.drawFromBag(BAG_ID)?.item).toMatchObject({ kind: 'card', code: 'omen' });
	});

	it('follows the player who claims the seat, pool and all', async () => {
		authorBagTable();
		saveScenario('bag-claim');

		emptyTable();
		localStorage.setItem('myPlayerId', 'player9');
		gameActions.addPlayer('player9');
		await applyScenario(getScenario('bag-claim')!);
		expect(claimSeat(0)).toBe(true);

		const claimed = get(gameStore).pieces?.['piece:player9:tile-bag-0'];
		expect(get(gameStore).pieces?.[BAG_ID]).toBeUndefined();
		expect(claimed?.contents).toHaveLength(2);
		// and the draw spawns for the new owner, not the placeholder
		expect(gameActions.drawFromBag('piece:player9:tile-bag-0')?.id).toContain(':player9:');
	});

	it('keeps a hand-spawned bag (no pack behind it) in the raw state snapshot', () => {
		emptyTable();
		ensureSeatPlaceholder(0);
		const id = gameActions.addPiece('bag', {
			ownerId: seatPlaceholderId(0),
			name: 'Ad Hoc',
			infinite: true,
			contents: [{ kind: 'token', name: 'Chit' }]
		});

		const scenario = saveScenario('bag-adhoc');

		expect(scenario.placements).toBeUndefined();
		expect(scenario.state.pieces?.[id]).toMatchObject({
			kind: 'bag',
			infinite: true,
			contents: [{ kind: 'token', name: 'Chit' }]
		});
	});
});
