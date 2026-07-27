/**
 * `kind: 'model'` through the pack layer (tableplace-135): the file parser
 * accepts the kind, its ref and the new `rotation`, and composition carries
 * both onto the spawned piece DTO.
 */
import { describe, expect, it } from 'vitest';
import { parsePackFile, serializePackFile } from '../file';
import { composePackPiece } from '../../compose/pack';
import { composePiece } from '../../compose/piece';
import type { GamePackDef } from '../types';

const cavePack: GamePackDef = {
	id: 'cave-demo',
	name: 'Cave Demo',
	scope: 'table',
	decks: [],
	pieces: [
		{
			kind: 'model',
			name: 'Large Room',
			model: 'model:kenney-cave/room-large',
			radius: 7.07,
			position: [4, -2],
			rotation: 90
		}
	]
};

describe('parsePackFile with model pieces', () => {
	it('round-trips a model piece with its ref and rotation', () => {
		const parsed = parsePackFile(serializePackFile(cavePack));
		expect(parsed.pieces?.[0]).toEqual(cavePack.pieces![0]);
	});

	it('names the field when the ref is not a string', () => {
		const broken = JSON.parse(serializePackFile(cavePack));
		broken.pieces[0].model = 7;
		expect(() => parsePackFile(JSON.stringify(broken))).toThrow(
			/pieces\[0\]\.model must be a non-empty string/
		);
	});

	it('names the field when rotation is not a number', () => {
		const broken = JSON.parse(serializePackFile(cavePack));
		broken.pieces[0].rotation = 'east';
		expect(() => parsePackFile(JSON.stringify(broken))).toThrow(
			/pieces\[0\]\.rotation must be a number/
		);
	});

	it("lists 'model' among the accepted kinds in the error for an unknown one", () => {
		const broken = JSON.parse(serializePackFile(cavePack));
		broken.pieces[0].kind = 'hologram';
		expect(() => parsePackFile(JSON.stringify(broken))).toThrow(/model/);
	});
});

describe('composing a model piece', () => {
	it('carries the ref onto the DTO and puts the pack yaw in rotation[1] (degrees)', () => {
		const composed = composePackPiece(cavePack, 0, { ownerId: 'seat0' })!;
		expect(composed.piece).toMatchObject({
			kind: 'model',
			model: 'model:kenney-cave/room-large',
			rotation: [0, 90, 0]
		});
		// authored for seat 0: position passes through unmirrored
		expect(composed.piece.position?.[0]).toBe(4);
		expect(composed.piece.position?.[2]).toBe(-2);
	});

	it('mirrors the position and adds a half turn for a far-side seat', () => {
		const composed = composePackPiece(cavePack, 0, { ownerId: 'seat1' })!;
		expect(composed.piece.position?.[0]).toBe(-4);
		expect(composed.piece.position?.[2]).toBe(2);
		expect(composed.piece.rotation).toEqual([0, 270, 0]);
	});

	it('drops a model ref supplied to any other kind', () => {
		const { piece } = composePiece('token', {
			ownerId: 'p1',
			position: [0, 0.335, 0],
			model: 'model:kenney-cave/room-large'
		});
		expect(piece.model).toBeUndefined();
	});
});
