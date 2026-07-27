import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSavedObject } from '../parse';
import { ttsToPack } from '../to-pack';
import { parsePackFile, serializePackFile } from '$lib/packs/file';

// Real the-unmatched.club export committed as a fixture
const fixture = JSON.parse(
	readFileSync(join(__dirname, '../../../../tts-unmatched-greviousdeck.json'), 'utf-8')
);
const parsed = parseSavedObject(fixture);

describe('ttsToPack on a real unmatched.club export', () => {
	const pack = ttsToPack(parsed);

	it('is a player pack (lone deck) with tts provenance', () => {
		expect(pack.scope).toBe('player');
		expect(pack.source).toBe('tts');
		expect(pack.name).toBe('General Grievous');
		expect(pack.id).toBe('imported:general-grievous');
	});

	it('maps the deck and groups loose cards into a face-up pile', () => {
		expect(pack.decks).toHaveLength(2);
		const [main, loose] = pack.decks;
		expect(main.slot).toBe('general-grievous');
		expect(main.cards).toHaveLength(30);
		expect(loose.slot).toBe('loose-cards');
		expect(loose.isFaceUp).toBe(true);
		expect(loose.cards).toHaveLength(parsed.looseCards.length);
	});

	it('keeps card names and emits sheet: refs for sheet cells', () => {
		const first = pack.decks[0].cards[0];
		expect(first.name).toBe('Fear, Surprise, & Intimidation');
		expect(first.face).toMatch(/^sheet:\{/);
		const payload = JSON.parse(first.face.slice('sheet:'.length));
		expect(payload).toMatchObject({ cols: 10, rows: 2, index: 0 });
		expect(payload.url).toMatch(/^https:\/\//);
	});

	it('gives every card a unique code within its deck', () => {
		for (const deck of pack.decks) {
			const codes = deck.cards.map((c) => c.code);
			expect(new Set(codes).size).toBe(codes.length);
		}
	});

	it('carries pieces (tokens, pawns, counters) into the pack', () => {
		expect(pack.pieces?.length).toBe(parsed.pieces.length);
		expect(pack.pieces?.length).toBeGreaterThan(0);
		const counter = pack.pieces?.find((p) => p.kind === 'counter');
		expect(counter?.maxValue).toBeGreaterThan(0);
	});

	it('TTS never leaks into the file: converted pack round-trips as tbpp', () => {
		const roundTripped = parsePackFile(serializePackFile(pack));
		expect(roundTripped).toEqual(pack);
	});
});

describe('ttsToPack on a save containing containers', () => {
	const sheet = {
		FaceURL: 'https://example.com/sheet.png',
		BackURL: 'https://example.com/back.png',
		NumWidth: 2,
		NumHeight: 1
	};
	const save = {
		ObjectStates: [
			{
				Name: 'Infinite_Bag',
				Nickname: 'Ember Supply',
				Transform: { posX: -4, posZ: 6 },
				Bag: { Order: 1 },
				ContainedObjects: [
					{ Name: 'Card', Nickname: 'Omen', CardID: 100, CustomDeck: { '1': sheet } },
					{ Name: 'Card', Nickname: 'Omen', CardID: 101, CustomDeck: { '1': sheet } },
					{
						Name: 'Custom_Tile',
						Nickname: 'Ember',
						CustomImage: { ImageURL: 'https://example.com/ember.png' }
					}
				]
			}
		]
	};
	const pack = ttsToPack(parseSavedObject(save));
	const bag = pack.pieces?.[0];

	it('converts the container into a bag piece with its draw mode', () => {
		expect(bag).toMatchObject({
			kind: 'bag',
			name: 'Ember Supply',
			drawMode: 'lifo',
			infinite: true,
			position: [-4, -6]
		});
	});

	it('turns bag card cells into face refs and keeps the piece item as-is', () => {
		expect(bag?.contents?.map((item) => item.kind)).toEqual(['card', 'card', 'token']);
		const [card] = bag?.contents ?? [];
		if (card.kind !== 'card') throw new Error('expected a card item');
		expect(card.face).toMatch(/^sheet:\{/);
		// the whole-image back degrades to a plain URL, like a deck's back does
		expect(card.back).toBe('https://example.com/back.png');
		// no stray `color: undefined` from the parser's optional fields
		expect(bag?.contents?.[2]).toEqual({
			kind: 'token',
			name: 'Ember',
			imageUrl: 'https://example.com/ember.png',
			radius: 1
		});
	});

	it('gives every bag card a unique code, like a deck does', () => {
		const codes = (bag?.contents ?? [])
			.filter((item) => item.kind === 'card')
			.map((item) => (item.kind === 'card' ? item.code : ''));
		expect(codes).toEqual(['omen', 'omen-1']);
		expect(new Set(codes).size).toBe(codes.length);
	});

	it('round-trips the bag through the tbpp validator', () => {
		expect(parsePackFile(serializePackFile(pack))).toEqual(pack);
	});

	it('a bag full of unsupported children still imports, with the children skipped', () => {
		const parsed = parseSavedObject({
			ObjectStates: [
				{
					Name: 'Bag',
					Nickname: 'Odds and Ends',
					ContainedObjects: [{ Name: 'Custom_Assetbundle', Nickname: 'Fancy' }]
				}
			]
		});
		const converted = ttsToPack(parsed);
		expect(converted.pieces?.[0]).toMatchObject({ kind: 'bag', contents: [] });
		expect(parsed.skipped).toEqual(['Fancy (Custom_Assetbundle in bag)']);
	});
});

describe('SidewaysCard → orientation (tableplace-132)', () => {
	const sheet = {
		FaceURL: 'https://example.com/sheet.png',
		BackURL: 'https://example.com/back.png',
		NumWidth: 2,
		NumHeight: 1
	};

	it('maps a per-card flag, and the deck-level flag as the pile default', () => {
		const parsed = parseSavedObject({
			ObjectStates: [
				{
					Name: 'Deck',
					Nickname: 'Atlas',
					DeckIDs: [100, 101],
					CustomDeck: { '1': sheet },
					ContainedObjects: [
						{ Name: 'Card', Nickname: 'Site', CardID: 100, SidewaysCard: true },
						{ Name: 'Card', Nickname: 'Spell', CardID: 101, SidewaysCard: false }
					]
				},
				{
					Name: 'Deck',
					Nickname: 'All Sideways',
					SidewaysCard: true,
					DeckIDs: [100],
					CustomDeck: { '1': sheet },
					ContainedObjects: [{ Name: 'Card', Nickname: 'Board', CardID: 100 }]
				}
			]
		});
		const pack = ttsToPack(parsed);
		const [atlas, allSideways] = pack.decks;
		expect(atlas.cards[0].orientation).toBe('landscape');
		expect(atlas.cards[1].orientation).toBeUndefined();
		expect(allSideways.cards[0].orientation).toBe('landscape');
	});

	it('maps the flag on a loose card and on a card in a bag', () => {
		const parsed = parseSavedObject({
			ObjectStates: [
				{
					Name: 'Card',
					Nickname: 'Lone Site',
					CardID: 100,
					CustomDeck: { '1': sheet },
					SidewaysCard: true
				},
				{
					Name: 'Bag',
					Nickname: 'Site Bag',
					ContainedObjects: [
						{
							Name: 'Card',
							Nickname: 'Bagged Site',
							CardID: 101,
							CustomDeck: { '1': sheet },
							SidewaysCard: true
						}
					]
				}
			]
		});
		expect(parsed.looseCards[0].sideways).toBe(true);
		const pack = ttsToPack(parsed);
		// loose cards group into the face-up 'loose' pile
		const loose = pack.decks.find((d) => d.slot === 'loose-cards');
		expect(loose?.cards[0].orientation).toBe('landscape');
		const bag = pack.pieces?.find((p) => p.kind === 'bag');
		expect(bag?.contents?.[0]).toMatchObject({ kind: 'card', orientation: 'landscape' });
	});

	it('the mapped pack still round-trips as tbpp', () => {
		const parsed = parseSavedObject({
			ObjectStates: [
				{
					Name: 'Card',
					Nickname: 'Lone Site',
					CardID: 100,
					CustomDeck: { '1': sheet },
					SidewaysCard: true
				}
			]
		});
		const pack = ttsToPack(parsed);
		expect(parsePackFile(serializePackFile(pack))).toEqual(pack);
	});
});
