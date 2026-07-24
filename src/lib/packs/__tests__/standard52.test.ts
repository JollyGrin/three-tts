import { describe, it, expect } from 'vitest';
import { STANDARD_52, STANDARD_52_CARDS, SUITS, RANKS } from '../standard52';
import { resolveCardImage } from '../resolve';

describe('STANDARD_52 pack', () => {
	it('contains exactly 52 unique cards', () => {
		expect(STANDARD_52_CARDS).toHaveLength(52);
		const codes = new Set(STANDARD_52_CARDS.map((c) => c.code));
		expect(codes.size).toBe(52);
	});

	it('covers 13 ranks in all 4 suits', () => {
		for (const suit of SUITS) {
			const inSuit = STANDARD_52_CARDS.filter((c) => c.code.endsWith(suit));
			expect(inSuit).toHaveLength(13);
		}
		for (const rank of RANKS) {
			const ofRank = STANDARD_52_CARDS.filter((c) => c.code.slice(0, -1) === rank);
			expect(ofRank).toHaveLength(4);
		}
	});

	it('uses gen: face refs and a gen: back', () => {
		expect(STANDARD_52_CARDS.every((c) => c.face.startsWith('gen:std52/'))).toBe(true);
		expect(STANDARD_52.decks[0].back).toBe('gen:std52/back');
	});

	it('has human-readable names', () => {
		const ace = STANDARD_52_CARDS.find((c) => c.code === 'AS');
		expect(ace?.name).toBe('Ace of Spades');
	});
});

describe('resolveCardImage', () => {
	it('passes plain URLs through untouched', () => {
		expect(resolveCardImage('https://example.com/card.png')).toBe('https://example.com/card.png');
		expect(resolveCardImage('/local.jpg')).toBe('/local.jpg');
	});

	it('handles empty refs', () => {
		expect(resolveCardImage('')).toBe('');
		expect(resolveCardImage(undefined)).toBe('');
		expect(resolveCardImage(null)).toBe('');
	});

	it('never throws on gen: refs without a real canvas (jsdom/SSR)', () => {
		// jsdom has no 2d context by default — resolver must degrade to passthrough
		const result = resolveCardImage('gen:std52/AS');
		expect(typeof result).toBe('string');
		expect(result.length).toBeGreaterThan(0);
	});
});
