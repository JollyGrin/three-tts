import { describe, it, expect } from 'vitest';
import { parsePackFile, serializePackFile, packFileName, PACK_SCHEMA_URL } from '../file';
import { STANDARD_52 } from '../standard52';
import type { GamePackDef } from '../types';

describe('tbpp round-trip', () => {
	it('export → parse returns the same pack', () => {
		const text = serializePackFile(STANDARD_52);
		expect(parsePackFile(text)).toEqual(STANDARD_52);
	});

	it('writes the discriminator and $schema line', () => {
		const file = JSON.parse(serializePackFile(STANDARD_52));
		expect(file.tbpp).toBe(1);
		expect(file.$schema).toBe(PACK_SCHEMA_URL);
	});

	it('round-trips pieces, overlays, and provenance', () => {
		const pack: GamePackDef = {
			id: 'test',
			name: 'Test',
			scope: 'table',
			decks: [],
			pieces: [
				{ kind: 'counter', name: 'HP', color: '#ff0000', maxValue: 20, position: [1, -2] },
				{ kind: 'token', name: 'Tile', imageUrl: 'https://x/y.png', radius: 1.5, position: [0, 0] }
			],
			overlays: [{ imageUrl: 'https://x/map.webp', ratio: 1.6, scale: 10 }],
			source: 'tts'
		};
		expect(parsePackFile(serializePackFile(pack))).toEqual(pack);
	});

	it('round-trips a multi-state piece, mixed face-ref schemes and all', () => {
		const pack: GamePackDef = {
			id: 'test',
			name: 'Test',
			scope: 'table',
			decks: [],
			pieces: [
				{
					kind: 'token',
					name: 'Brazier',
					imageUrl: 'https://x/lit.png',
					states: [
						{ face: 'https://x/lit.png', name: 'Lit' },
						{ face: 'gen:std52/AS' },
						{ face: 'sheet:{"url":"https://x/s.png","cols":2,"rows":1,"index":1}', name: 'Out' }
					],
					state: 2,
					position: [0, 0]
				}
			]
		};
		expect(parsePackFile(serializePackFile(pack))).toEqual(pack);
	});

	it('names files <name>.tbpp.json', () => {
		expect(packFileName(STANDARD_52)).toBe('Standard Playing Cards.tbpp.json');
	});
});

describe('parsePackFile errors', () => {
	const valid = () => JSON.parse(serializePackFile(STANDARD_52));

	it('rejects non-JSON', () => {
		expect(() => parsePackFile('not json')).toThrow(/valid JSON/);
	});

	it('rejects files without the tbpp marker', () => {
		const file = valid();
		delete file.tbpp;
		expect(() => parsePackFile(JSON.stringify(file))).toThrow(/"tbpp": 1/);
	});

	it('rejects unknown versions', () => {
		const file = { ...valid(), tbpp: 2 };
		expect(() => parsePackFile(JSON.stringify(file))).toThrow(/version 2/);
	});

	it('points at the offending field', () => {
		const file = valid();
		delete file.decks[0].cards[3].face;
		expect(() => parsePackFile(JSON.stringify(file))).toThrow('decks[0].cards[3].face');
	});

	it('rejects bad scope', () => {
		const file = { ...valid(), scope: 'global' };
		expect(() => parsePackFile(JSON.stringify(file))).toThrow(/scope/);
	});

	it('rejects malformed pieces', () => {
		const file = { ...valid(), pieces: [{ kind: 'meeple', name: 'x', position: [0, 0] }] };
		expect(() => parsePackFile(JSON.stringify(file))).toThrow('pieces[0].kind');
	});

	const withStates = (states: unknown, extra: Record<string, unknown> = {}) => ({
		...valid(),
		pieces: [{ kind: 'token', name: 'x', position: [0, 0], states, ...extra }]
	});

	it('points at the offending state face', () => {
		const file = withStates([{ face: 'https://x/a.png' }, { name: 'no face' }]);
		expect(() => parsePackFile(JSON.stringify(file))).toThrow('pieces[0].states[1].face');
	});

	it('rejects a states list that is not an array', () => {
		expect(() => parsePackFile(JSON.stringify(withStates({ '0': {} })))).toThrow(
			'pieces[0].states'
		);
	});

	it('rejects a spawn state that is not a state index', () => {
		const file = withStates([{ face: 'https://x/a.png' }], { state: -1 });
		expect(() => parsePackFile(JSON.stringify(file))).toThrow('pieces[0].state');
	});

	it('rejects a die with a shape we have no geometry for', () => {
		const file = { ...valid(), pieces: [{ kind: 'die', name: 'd7', sides: 7, position: [0, 0] }] };
		expect(() => parsePackFile(JSON.stringify(file))).toThrow('pieces[0].sides');
	});

	it('round-trips a die piece', () => {
		const file = {
			...valid(),
			pieces: [{ kind: 'die', name: 'd20', sides: 20, position: [1, 2] }]
		};
		expect(parsePackFile(JSON.stringify(file)).pieces?.[0]).toMatchObject({
			kind: 'die',
			sides: 20
		});
	});
});
