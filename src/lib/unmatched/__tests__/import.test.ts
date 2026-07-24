import { describe, it, expect } from 'vitest';
import { extractDeckCode } from '../import';

describe('extractDeckCode', () => {
	it('passes bare codes through', () => {
		expect(extractDeckCode('72Dz')).toBe('72Dz');
		expect(extractDeckCode('  72Dz  ')).toBe('72Dz');
	});

	it('extracts from unmatched.cards URLs', () => {
		expect(extractDeckCode('https://unmatched.cards/decks/72Dz')).toBe('72Dz');
		expect(extractDeckCode('https://unmatched.cards/decks/72Dz?ref=x')).toBe('72Dz');
	});

	it('extracts from the-unmatched.club style URLs', () => {
		expect(extractDeckCode('https://www.the-unmatched.club/decks/abc123/view')).toBe('abc123');
	});
});
