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
