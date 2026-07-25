/**
 * TTS `States` → multi-state pieces (tableplace-95).
 *
 * The load-bearing rule is that TTS stores only the INACTIVE states in the
 * dict and keeps the active one as the object itself — so the current state
 * is the number missing from the 1..N key sequence. Nothing in a save says so
 * explicitly, which is exactly why it is pinned here.
 */

import { describe, it, expect } from 'vitest';
import { parseSavedObject, statesOrder } from '../parse';
import { ttsToPack } from '../to-pack';
import { parsePackFile, serializePackFile } from '$lib/packs/file';

const tile = (url: string, nickname: string) => ({
	Name: 'Custom_Tile',
	Nickname: nickname,
	CustomImage: { ImageURL: url },
	Transform: { posX: 3, posZ: -2, scaleX: 1 }
});

/** a brazier saved in state 2: the dict holds 1 and 3, the object IS state 2 */
const brazier = {
	...tile('http://x.test/embers.png', 'Embers'),
	States: {
		'1': tile('http://x.test/lit.png', 'Lit'),
		'3': tile('http://x.test/out.png', 'Out')
	}
};

describe('statesOrder — the missing-index rule', () => {
	it('gives the object the slot missing from 1..N', () => {
		// dict has 1 and 3, so the object is state 2 (index 1)
		expect(statesOrder(['1', '3'])).toEqual({ order: ['1', null, '3'], current: 1 });
	});

	it('reads an object saved in state 1 (dict starts at 2)', () => {
		expect(statesOrder(['2', '3'])).toEqual({ order: [null, '2', '3'], current: 0 });
	});

	it('reads an object saved in the last state', () => {
		expect(statesOrder(['1', '2'])).toEqual({ order: ['1', '2', null], current: 2 });
	});

	it('sorts numerically, not lexically — 10 comes after 9', () => {
		const keys = ['2', '3', '4', '5', '6', '7', '8', '9', '10'];
		expect(statesOrder(keys).order).toEqual([null, ...keys]);
		expect(statesOrder(keys).current).toBe(0);
	});

	it('degrades on sparse keys instead of throwing: smallest gap wins', () => {
		expect(statesOrder(['2', '5'])).toEqual({ order: [null, '2', '5'], current: 0 });
	});

	it('treats a lone state as a two-state object', () => {
		expect(statesOrder(['2'])).toEqual({ order: [null, '2'], current: 0 });
	});
});

describe('parseSavedObject on a States object', () => {
	const parsed = parseSavedObject({ ObjectStates: [brazier] });
	const piece = parsed.pieces[0];

	it('maps it to one piece carrying every face in state order', () => {
		expect(parsed.pieces).toHaveLength(1);
		expect(piece.kind).toBe('token');
		expect(piece.states?.map((s) => s.name)).toEqual(['Lit', 'Embers', 'Out']);
	});

	it('recovers the state the object was saved in', () => {
		expect(piece.state).toBe(1); // 'Embers', the missing index
	});

	it('normalizes state art like any other asset url', () => {
		expect(piece.states?.[0].face.url).toBe('https://x.test/lit.png');
	});
});

describe('ttsToPack maps States onto pack piece states', () => {
	const pack = ttsToPack(parseSavedObject({ ObjectStates: [brazier] }));
	const piece = pack.pieces?.[0];

	it('writes one face ref per state, in state order', () => {
		expect(piece?.states).toEqual([
			{ face: 'https://x.test/lit.png', name: 'Lit' },
			{ face: 'https://x.test/embers.png', name: 'Embers' },
			{ face: 'https://x.test/out.png', name: 'Out' }
		]);
	});

	it('carries the saved state as the pack default', () => {
		expect(piece?.state).toBe(1);
	});

	it('mirrors imageUrl onto the base face, for consumers ignoring states', () => {
		expect(piece?.imageUrl).toBe('https://x.test/lit.png');
	});

	it('round-trips through the tbpp parser', () => {
		expect(parsePackFile(serializePackFile(pack))).toEqual(pack);
	});
});

describe('states of an unsupported object class degrade, never fail', () => {
	const mixed = {
		...tile('http://x.test/base.png', 'Base'),
		States: {
			'2': { Name: 'Custom_Model', Nickname: 'A model', LuaScript: '' },
			'3': tile('http://x.test/third.png', 'Third')
		}
	};
	const parsed = parseSavedObject({ ObjectStates: [mixed] });

	it('keeps the image-bearing states only', () => {
		expect(parsed.pieces[0].states?.map((s) => s.name)).toEqual(['Base', 'Third']);
	});

	it('notes the dropped state instead of throwing', () => {
		expect(parsed.skipped.some((s) => s.includes('A model'))).toBe(true);
	});

	it('keeps the current index pointing at the same face after the drop', () => {
		expect(parsed.pieces[0].state).toBe(0); // 'Base' was state 1, still index 0
	});

	it('emits no states at all when fewer than two faces survive', () => {
		const lonely = {
			...tile('http://x.test/base.png', 'Base'),
			States: { '2': { Name: 'Custom_Model', Nickname: 'A model' } }
		};
		const only = parseSavedObject({ ObjectStates: [lonely] }).pieces[0];
		expect(only.states).toBeUndefined();
		expect(only.imageUrl).toBe('https://x.test/base.png');
	});
});

describe('a Card state maps through the sprite-sheet path', () => {
	const sheet = {
		FaceURL: 'https://x.test/sheet.png',
		BackURL: 'https://x.test/back.png',
		NumWidth: 2,
		NumHeight: 1
	};
	const parsed = parseSavedObject({
		ObjectStates: [
			{
				...tile('https://x.test/front.png', 'Front'),
				States: {
					'2': {
						Name: 'CardCustom',
						Nickname: 'As a card',
						CardID: 101,
						CustomDeck: { '1': sheet }
					}
				}
			}
		]
	});

	it('slices the state out of the sheet as a sheet: ref', () => {
		const pack = ttsToPack(parsed);
		const [base, card] = pack.pieces?.[0].states ?? [];
		expect(base.face).toBe('https://x.test/front.png');
		expect(card.face).toMatch(/^sheet:\{/);
		expect(JSON.parse(card.face.slice('sheet:'.length))).toMatchObject({
			url: 'https://x.test/sheet.png',
			cols: 2,
			rows: 1,
			index: 1
		});
	});
});

describe('single-state objects are untouched', () => {
	it('leaves a plain tile with no states', () => {
		const piece = parseSavedObject({ ObjectStates: [tile('https://x.test/a.png', 'A')] }).pieces[0];
		expect(piece.states).toBeUndefined();
		expect(piece.state).toBeUndefined();
	});
});
