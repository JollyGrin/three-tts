/**
 * A die is a piece and a pack primitive, so it inherits two features that
 * landed beside it and never knew about each other:
 *
 *  - authored snap points (#96/#100) resolve inside `resolveDrop`'s generic
 *    piece branch, so a die snaps for free — but "for free" is exactly the
 *    claim worth pinning down, and a die carries roll state that a landing
 *    must not disturb.
 *  - the local pack library (#93/#97) round-trips a pack through
 *    serialize → parse → localStorage → spawn. `sides` is the newest field on
 *    the newest piece kind, so it is the one most likely to be dropped
 *    somewhere along that chain.
 *  - multi-state pieces (#95/#99) added a second per-piece "which face am I
 *    showing" concept alongside the die's. They must stay orthogonal: a die's
 *    faces are geometry, a state's are images, and nothing should ever hold
 *    both.
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
import { saveLibraryPack, getLibraryPack, PACK_SOURCE_LOCAL } from '$lib/packs/library';
import { spawnPack } from '$lib/packs/spawn';
import { PIECE_RADIUS, PIECE_REST_Y } from '$lib/utils/constants-pieces';
import type { GameDTO } from '$lib/store/game/types';
import type { GamePackDef } from '$lib/packs/types';

const validatePack = new Ajv({ strict: false }).compile(
	JSON.parse(readFileSync(join(__dirname, '../../../static/pack.schema.json'), 'utf-8'))
);

/** a d20 mid-table that has already been rolled a few times */
const die = (x: number, z: number) => ({
	kind: 'die' as const,
	name: 'd20',
	sides: 20 as const,
	value: 17,
	rollSeq: 3,
	radius: PIECE_RADIUS.die,
	position: [x, 1.2, z] as [number, number, number],
	rotation: [0, 0, 0] as [number, number, number]
});

const tableWithSnap = (): Partial<GameDTO> => ({
	cards: {},
	decks: {},
	players: {},
	snapPoints: {
		'snap:0': { id: 'snap:0', position: [4, 2], radius: 1, rotation: 90 }
	},
	pieces: { 'piece:me:d20-0': die(0, 0) }
});

describe('a die drops onto an authored snap point like any other piece', () => {
	it('lands exactly on the point, at piece rest height, with the die footprint', () => {
		const drop = resolveDrop(tableWithSnap(), 'piece:me:d20-0', { x: 3.6, z: 2.2 });
		expect(drop).toMatchObject({
			kind: 'snap',
			position: [4, PIECE_REST_Y, 2],
			// a piece takes the point's yaw in y, not z
			rotation: [0, 90, 0],
			footprint: { shape: 'circle', r: PIECE_RADIUS.die }
		});
	});

	it('is opted out of by Alt, same as a token', () => {
		expect(
			resolveDrop(tableWithSnap(), 'piece:me:d20-0', { x: 4.2, z: 2 }, {}, { noSnap: true })
		).toMatchObject({ kind: 'table', position: [4.2, PIECE_REST_Y, 2] });
	});

	it('does not read as a roll: the landing leaves value and rollSeq alone', () => {
		// the real hazard in this composition. `rollSeq` is the animation
		// trigger, so a drop that wrote it — or that re-sent `value` — would
		// make every client tumble a die that merely got moved.
		gameStore.set(tableWithSnap() as GameDTO);
		dragStart('piece:me:d20-0', 1.2, [0, PIECE_REST_Y, 0]);
		dragStore.update((s) => ({ ...s, intersectionPoint: { x: 3.6, z: 2.2 } as never }));

		commitActiveDrag();

		const landed = get(gameStore).pieces?.['piece:me:d20-0'];
		expect(landed?.position).toEqual([4, PIECE_REST_Y, 2]);
		expect(landed?.value).toBe(17);
		expect(landed?.rollSeq).toBe(3);
	});
});

describe('a die survives the local pack library round-trip', () => {
	const authored = (): GamePackDef => ({
		id: 'dice-set',
		name: 'Dice Set',
		scope: 'player',
		decks: [],
		pieces: [
			{ kind: 'die', name: 'd20', sides: 20, color: '#c8c4b8', position: [1, 2] },
			// no `sides`: must still be a die, defaulted at spawn
			{ kind: 'die', name: 'house die', position: [-1, 2] }
		]
	});

	beforeEach(() => {
		localStorage.clear();
		gameStore.set({ players: {}, cards: {}, decks: {}, pieces: {} });
	});

	it('exports a die that validates against the published schema', () => {
		const text = serializePackFile(authored());
		const parsed = JSON.parse(text);
		expect(validatePack(parsed)).toBe(true);
		expect(parsed.pieces[0]).toMatchObject({ kind: 'die', sides: 20 });
	});

	it('keeps `sides` through serialize → parse → library → spawn', () => {
		// the /create export path, then the import path, then the library
		const reparsed = parsePackFile(serializePackFile(authored()));
		saveLibraryPack(reparsed);

		expect(getLibraryPack('dice-set')?.pack.pieces?.[0]).toMatchObject({
			kind: 'die',
			sides: 20
		});

		spawnPack(getLibraryPack('dice-set')!.pack, { ownerId: 'seat0' });
		const pieces = get(gameStore).pieces ?? {};

		const d20 = pieces['piece:seat0:d20-0'];
		expect(d20).toMatchObject({ kind: 'die', sides: 20, value: 1, rollSeq: 0 });
		// and it re-resolves from the library, so a scenario referencing this
		// pack finds it again without the pack being hosted anywhere
		expect(d20?.packOrigin).toMatchObject({ pack: 'dice-set', source: PACK_SOURCE_LOCAL });

		// a pack die that never declared `sides` still spawns rollable
		const house = pieces['piece:seat0:house-die-0'];
		expect(house).toMatchObject({ kind: 'die', sides: 6, rollSeq: 0 });
	});

	it('rolls a spawned pack die within its own shape', () => {
		saveLibraryPack(parsePackFile(serializePackFile(authored())));
		spawnPack(getLibraryPack('dice-set')!.pack, { ownerId: 'seat0' });

		gameActions.rollDie('piece:seat0:d20-0');
		const rolled = get(gameStore).pieces?.['piece:seat0:d20-0'];
		expect(rolled?.rollSeq).toBe(1);
		expect(rolled?.value).toBeGreaterThanOrEqual(1);
		expect(rolled?.value).toBeLessThanOrEqual(20);
	});
});

/**
 * `kind` and `states` are different axes and neither verb may reach across.
 * Enforced in three places, because a die that picked up a state menu — or a
 * state token that picked up a tumble — would be wrong in a way no type
 * catches: both are just `PieceDTO`.
 */
describe('a die and a multi-state piece are orthogonal', () => {
	beforeEach(() => {
		gameStore.set({ players: {}, cards: {}, decks: {}, pieces: {} });
	});

	const FACES = [{ face: 'https://x/a.png' }, { face: 'https://x/b.png' }];

	it('drops states off a die at spawn, so it never reaches the wire with them', () => {
		const id = gameActions.addPiece('die', { ownerId: 'seat0', sides: 20, states: FACES });
		const die = get(gameStore).pieces?.[id];
		expect(die).toMatchObject({ kind: 'die', sides: 20 });
		expect(die?.states).toBeUndefined();
		expect(die?.state).toBeUndefined();
	});

	it('keeps states on every other kind', () => {
		const id = gameActions.addPiece('token', { ownerId: 'seat0', states: FACES });
		expect(get(gameStore).pieces?.[id]?.states).toHaveLength(2);
	});

	it('will not cycle a die, however it got its states', () => {
		gameStore.set({
			pieces: {
				'piece:a:d6-0': { kind: 'die', sides: 6, value: 4, rollSeq: 2, states: FACES, state: 0 }
			}
		});
		gameActions.cyclePieceState('piece:a:d6-0');
		gameActions.setPieceState('piece:a:d6-0', 1);
		// a die shows a face because of how it is lying, not because of an index
		expect(get(gameStore).pieces?.['piece:a:d6-0']?.state).toBe(0);
	});

	it('will not roll a multi-state token', () => {
		const id = gameActions.addPiece('token', { ownerId: 'seat0', states: FACES });
		gameActions.rollDie(id);
		const token = get(gameStore).pieces?.[id];
		expect(token?.rollSeq).toBeUndefined();
		expect(token?.value).toBeUndefined();
	});

	it('never exports states on a die, so the two never meet in a pack file', () => {
		const cleaned = cleanForExport({
			id: 'p',
			name: 'P',
			scope: 'player',
			decks: [],
			pieces: [
				{ kind: 'die', name: 'd6', sides: 6, states: FACES, position: [0, 0] },
				{ kind: 'token', name: 'tile', states: FACES, position: [1, 0] }
			]
		});
		expect(cleaned.pieces?.[0]).toMatchObject({ kind: 'die', sides: 6 });
		expect(cleaned.pieces?.[0]).not.toHaveProperty('states');
		// …and states[0] still mirrors onto imageUrl for the piece that has them
		expect(cleaned.pieces?.[1]).toMatchObject({
			states: FACES,
			imageUrl: 'https://x/a.png'
		});
	});
});
