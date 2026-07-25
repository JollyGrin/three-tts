/**
 * A bag is the third piece concept to land in this batch, and the other two
 * arrived without knowing about it. `die-composition.test.ts` pinned down the
 * die's half of that; this is the bag's.
 *
 * The three axes:
 *  - **bag** is a KIND (a container you draw from),
 *  - **die** is a KIND (a shape you roll),
 *  - **states** is a MODIFIER any image-bearing kind may carry.
 *
 * So: a bag is not cyclable and not rollable, never carries states to the wire
 * or into a file, and holds neither a die nor another bag. A die is not
 * drawable from, and not droppable into a bag — `contents` has no die item, so
 * swallowing one would quietly demote it to a token.
 *
 * The drop composition (#91 deck-drag, #100 snap points, #98 dice) is the other
 * half: an aimed-at bag beats a snap point, and everything the bag refuses must
 * still land somewhere rather than hang at drag height.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { get } from 'svelte/store';
import Ajv from 'ajv';

import { resolveDrop } from '$lib/utils/transforms/drop';
import { commitActiveDrag } from '$lib/drop/commit';
import { dragStart, dragStore } from '$lib/store/dragStore.svelte';
import { gameStore } from '$lib/store/game/gameStore.svelte';
import { gameActions } from '$lib/store/game/actions';
import { parsePackFile, serializePackFile } from '$lib/packs/file';
import { cleanForExport } from '../../routes/create/normalize';
import { saveLibraryPack, getLibraryPack } from '$lib/packs/library';
import { spawnPack } from '$lib/packs/spawn';
import { PIECE_RADIUS, PIECE_REST_Y } from '$lib/utils/constants-pieces';
import type { BagItem, GameDTO } from '$lib/store/game/types';
import type { GamePackDef } from '$lib/packs/types';

const validatePack = new Ajv({ strict: false }).compile(
	JSON.parse(readFileSync(join(__dirname, '../../../static/pack.schema.json'), 'utf-8'))
);

const FACES = [{ face: 'https://x/a.png' }, { face: 'https://x/b.png' }];
const POOL: BagItem[] = [{ kind: 'token', name: 'Ember', color: '#f97316' }];

const BAG = 'piece:me:tile-bag-0';

/** a loaded bag, a die, a token, and a snap point sitting under the bag */
const table = (): Partial<GameDTO> => ({
	cards: {},
	decks: {},
	players: {},
	snapPoints: { 'snap:0': { id: 'snap:0', position: [6, -3], radius: 1, rotation: 90 } },
	pieces: {
		[BAG]: {
			kind: 'bag',
			name: 'Tile Bag',
			contents: [...POOL],
			drawMode: 'lifo',
			radius: PIECE_RADIUS.bag,
			position: [6, PIECE_REST_Y, -3],
			rotation: [0, 0, 0]
		},
		'piece:me:d20-0': {
			kind: 'die',
			name: 'd20',
			sides: 20,
			value: 17,
			rollSeq: 3,
			radius: PIECE_RADIUS.die,
			position: [0, 1.2, 0],
			rotation: [0, 0, 0]
		},
		'piece:me:token-0': {
			kind: 'token',
			name: 'Chit',
			radius: PIECE_RADIUS.token,
			position: [1, 1.2, 1],
			rotation: [0, 0, 0]
		}
	}
});

describe('a bag against the drop rules that landed beside it', () => {
	const hover = { bagId: BAG };

	it('swallows a token dropped on it even though a snap point shares the spot', () => {
		const drop = resolveDrop(table(), 'piece:me:token-0', { x: 6, z: -3 }, hover);
		expect(drop?.kind).toBe('bag');
		expect(drop?.targetId).toBe(BAG);
		// an aimed-at container, not a proximity pull: no snap in the result
		expect(drop?.snap).toBeUndefined();
	});

	it('still snaps the same token when no bag is under the pointer', () => {
		const drop = resolveDrop(table(), 'piece:me:token-0', { x: 6.3, z: -2.8 });
		expect(drop).toMatchObject({
			kind: 'snap',
			position: [6, PIECE_REST_Y, -3],
			// a piece takes the authored yaw in DEGREES on rotation[1]; only a deck
			// converts to radians (see applySnapRotation)
			rotation: [0, 90, 0],
			snap: { id: 'snap:0' }
		});
	});

	it('leaves a bag it is dragging in degrees too, when a point catches it', () => {
		const drop = resolveDrop(table(), BAG, { x: 6.2, z: -3 });
		expect(drop?.kind).toBe('snap');
		expect(drop?.rotation).toEqual([0, 90, 0]);
	});

	it('never swallows a die: it snaps instead, roll state untouched', () => {
		const drop = resolveDrop(table(), 'piece:me:d20-0', { x: 6, z: -3 }, hover);
		expect(drop?.kind).toBe('snap');

		gameStore.set(table() as GameDTO);
		dragStart('piece:me:d20-0', 1.2, [0, PIECE_REST_Y, 0]);
		dragStore.update((s) => ({
			...s,
			isBagHovered: BAG,
			intersectionPoint: { x: 6, z: -3 } as never
		}));

		commitActiveDrag();

		const die = get(gameStore).pieces?.['piece:me:d20-0'];
		expect(die?.position).toEqual([6, PIECE_REST_Y, -3]);
		// the die is still on the table, still holding its roll
		expect(die).toMatchObject({ kind: 'die', sides: 20, value: 17, rollSeq: 3 });
		expect(get(gameStore).pieces?.[BAG]?.contents).toEqual(POOL);
	});

	it('commits a token drop into the bag, off the table and into the pool', () => {
		gameStore.set(table() as GameDTO);
		dragStart('piece:me:token-0', 1.2, [1, PIECE_REST_Y, 1]);
		dragStore.update((s) => ({
			...s,
			isBagHovered: BAG,
			intersectionPoint: { x: 6, z: -3 } as never
		}));

		commitActiveDrag();

		expect(get(gameStore).pieces?.['piece:me:token-0']).toBeUndefined();
		expect(get(gameStore).pieces?.[BAG]?.contents).toHaveLength(2);
	});

	it('lands the piece anyway when the bag refuses mid-drag', () => {
		// the bag is gone by the time the pointer comes up — another client
		// removed it. The token must settle, not hang at drag height.
		gameStore.set(table() as GameDTO);
		dragStart('piece:me:token-0', 1.2, [1, PIECE_REST_Y, 1]);
		dragStore.update((s) => ({
			...s,
			isBagHovered: BAG,
			intersectionPoint: { x: 2, z: 2 } as never
		}));
		gameStore.updateState({ pieces: { [BAG]: null } });

		commitActiveDrag();

		const token = get(gameStore).pieces?.['piece:me:token-0'];
		expect(token).toBeDefined();
		expect(token?.position?.[1]).toBe(PIECE_REST_Y);
	});
});

describe('a bag, a die and a multi-state piece are three separate things', () => {
	beforeEach(() => {
		gameStore.set({ players: {}, cards: {}, decks: {}, pieces: {} });
	});

	it('drops states off a bag at spawn, so it never reaches the wire with them', () => {
		const id = gameActions.addPiece('bag', { ownerId: 'seat0', contents: POOL, states: FACES });
		const bag = get(gameStore).pieces?.[id];
		expect(bag).toMatchObject({ kind: 'bag', contents: POOL });
		expect(bag?.states).toBeUndefined();
		expect(bag?.state).toBeUndefined();
	});

	it('will not cycle or re-state a bag, however it got its states', () => {
		gameStore.set({
			pieces: { 'piece:a:bag-0': { kind: 'bag', contents: [], states: FACES, state: 0 } }
		});
		gameActions.cyclePieceState('piece:a:bag-0');
		gameActions.setPieceState('piece:a:bag-0', 1);
		// what a bag shows is a count, not a face index
		expect(get(gameStore).pieces?.['piece:a:bag-0']?.state).toBe(0);
	});

	it('will not roll a bag, and will not draw from a die', () => {
		const bag = gameActions.addPiece('bag', { ownerId: 'seat0', contents: POOL });
		const die = gameActions.addPiece('die', { ownerId: 'seat0', sides: 20 });

		gameActions.rollDie(bag);
		expect(get(gameStore).pieces?.[bag]?.rollSeq).toBeUndefined();
		expect(get(gameStore).pieces?.[bag]?.value).toBeUndefined();
		// and the bag still has everything it started with
		expect(get(gameStore).pieces?.[bag]?.contents).toEqual(POOL);

		expect(gameActions.drawFromBag(die)).toBeNull();
		expect(get(gameStore).pieces?.[die]).toMatchObject({ kind: 'die', sides: 20 });
	});

	it('refuses to swallow a die or another bag, so neither becomes an item', () => {
		const bag = gameActions.addPiece('bag', { ownerId: 'seat0' });
		const die = gameActions.addPiece('die', { ownerId: 'seat0', sides: 6 });
		const other = gameActions.addPiece('bag', { ownerId: 'seat0', name: 'Other' });
		const token = gameActions.addPiece('token', { ownerId: 'seat0', name: 'Chit' });

		expect(gameActions.returnToBag(bag, die)).toBe(false);
		expect(gameActions.returnToBag(bag, other)).toBe(false);
		expect(gameActions.returnToBag(bag, token)).toBe(true);

		expect(get(gameStore).pieces?.[bag]?.contents).toEqual([
			{ kind: 'token', name: 'Chit', radius: PIECE_RADIUS.token }
		]);
		// both refusals left their piece on the table
		expect(get(gameStore).pieces?.[die]).toBeDefined();
		expect(get(gameStore).pieces?.[other]).toBeDefined();
	});

	it('never exports states on a bag, and never bag fields on anything else', () => {
		const cleaned = cleanForExport({
			id: 'p',
			name: 'P',
			scope: 'player',
			decks: [],
			pieces: [
				{ kind: 'bag', name: 'Bag', states: FACES, contents: [], position: [0, 0] },
				{ kind: 'die', name: 'd6', sides: 6, position: [1, 0] },
				{ kind: 'token', name: 'tile', states: FACES, position: [2, 0] }
			]
		});

		expect(cleaned.pieces?.[0]).toMatchObject({ kind: 'bag', drawMode: 'random' });
		expect(cleaned.pieces?.[0]).not.toHaveProperty('states');
		// the die keeps its shape and gains nothing of the bag's
		expect(cleaned.pieces?.[1]).toMatchObject({ kind: 'die', sides: 6 });
		expect(cleaned.pieces?.[1]).not.toHaveProperty('contents');
		// …and states still work on the kind that has them
		expect(cleaned.pieces?.[2]).toMatchObject({ states: FACES, imageUrl: 'https://x/a.png' });
		expect(cleaned.pieces?.[2]).not.toHaveProperty('contents');
	});

	it('rejects a die or a bag inside a bag at the format boundary', () => {
		const withItem = (item: unknown) =>
			JSON.stringify({
				tbpp: 1,
				id: 'p',
				name: 'P',
				scope: 'player',
				decks: [],
				pieces: [{ kind: 'bag', name: 'Bag', position: [0, 0], contents: [item] }]
			});

		expect(() => parsePackFile(withItem({ kind: 'die', name: 'd6', sides: 6 }))).toThrow(
			'contents[0].kind'
		);
		expect(() => parsePackFile(withItem({ kind: 'bag', name: 'Inner' }))).toThrow(
			'contents[0].kind'
		);
	});
});

describe('a bag survives the local pack library round-trip beside the others', () => {
	const authored = (): GamePackDef => ({
		id: 'mixed-set',
		name: 'Mixed Set',
		scope: 'player',
		decks: [],
		pieces: [
			{
				kind: 'bag',
				name: 'Tile Bag',
				drawMode: 'lifo',
				infinite: true,
				contents: [
					{ kind: 'token', name: 'Ember', color: '#f97316' },
					{ kind: 'card', code: 'omen', face: 'https://example.com/omen.png' }
				],
				position: [1, 2]
			},
			{ kind: 'die', name: 'd20', sides: 20, position: [-1, 2] },
			{
				kind: 'token',
				name: 'Brazier',
				imageUrl: 'https://x/a.png',
				states: FACES,
				position: [0, 3]
			}
		]
	});

	beforeEach(() => {
		localStorage.clear();
		gameStore.set({ players: {}, cards: {}, decks: {}, pieces: {} });
	});

	it('exports all three kinds into one pack the published schema accepts', () => {
		const file = JSON.parse(serializePackFile(authored()));
		expect(validatePack(file)).toBe(true);
		expect(validatePack.errors ?? []).toEqual([]);
	});

	it('keeps contents, sides and states apart through library → spawn', () => {
		saveLibraryPack(parsePackFile(serializePackFile(authored())));
		spawnPack(getLibraryPack('mixed-set')!.pack, { ownerId: 'seat0' });
		const pieces = get(gameStore).pieces ?? {};

		const bag = pieces['piece:seat0:tile-bag-0'];
		expect(bag).toMatchObject({ kind: 'bag', drawMode: 'lifo', infinite: true });
		expect(bag?.contents).toHaveLength(2);
		expect(bag?.sides).toBeUndefined();
		expect(bag?.states).toBeUndefined();

		expect(pieces['piece:seat0:d20-0']).toMatchObject({ kind: 'die', sides: 20 });
		expect(pieces['piece:seat0:d20-0']?.contents).toBeUndefined();

		expect(pieces['piece:seat0:brazier-0']?.states).toHaveLength(2);
		expect(pieces['piece:seat0:brazier-0']?.contents).toBeUndefined();

		// and the spawned bag is drawable: lifo hands back the card that went last
		expect(gameActions.drawFromBag('piece:seat0:tile-bag-0')?.item).toMatchObject({
			kind: 'card',
			code: 'omen'
		});
	});
});
