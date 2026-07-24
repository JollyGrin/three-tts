import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSavedObject, normalizeAssetUrl, decodeCardId, extractCounterMax } from '../parse';

// Real the-unmatched.club exports committed as fixtures
const fixture = JSON.parse(
	readFileSync(join(__dirname, '../../../../tts-unmatched-greviousdeck.json'), 'utf-8')
);
const cloneFixture = JSON.parse(
	readFileSync(join(__dirname, '../../../../tts-clonetroopers.json'), 'utf-8')
);

describe('normalizeAssetUrl', () => {
	it('rewrites the dead Steam host', () => {
		expect(normalizeAssetUrl('http://cloud-3.steamusercontent.com/ugc/123/ABC/')).toBe(
			'https://steamusercontent-a.akamaihd.net/ugc/123/ABC/'
		);
	});

	it('forces https and leaves modern URLs alone', () => {
		expect(normalizeAssetUrl('http://example.com/x.png')).toBe('https://example.com/x.png');
		expect(normalizeAssetUrl('https://a.r2.dev/x.png?v=1')).toBe('https://a.r2.dev/x.png?v=1');
	});
});

describe('decodeCardId', () => {
	it('splits sheet key and cell index', () => {
		expect(decodeCardId(200)).toEqual({ sheetKey: '2', index: 0 });
		expect(decodeCardId(214)).toEqual({ sheetKey: '2', index: 14 });
		expect(decodeCardId(40007)).toEqual({ sheetKey: '400', index: 7 });
	});
});

describe('parseSavedObject on a real unmatched.club export', () => {
	const parsed = parseSavedObject(fixture);

	it('finds the 30-card General Grievous deck', () => {
		expect(parsed.decks).toHaveLength(1);
		expect(parsed.decks[0].name).toBe('General Grievous');
		expect(parsed.decks[0].cards).toHaveLength(30);
	});

	it('preserves card names from ContainedObjects', () => {
		expect(parsed.decks[0].cards[0].name).toBe('Fear, Surprise, & Intimidation');
	});

	it('maps CardIDs onto the 10x2 action-card sheet', () => {
		const card = parsed.decks[0].cards[0];
		expect(card.face.cols).toBe(10);
		expect(card.face.rows).toBe(2);
		expect(card.face.index).toBe(0);
		expect(card.face.url).toMatch(/^https:\/\//);
	});

	it('collects loose cards (hero + special)', () => {
		expect(parsed.looseCards.length).toBeGreaterThan(0);
	});

	it('extracts tiles as tokens, pawns, and health dials as counters', () => {
		const kinds = parsed.pieces.map((p) => p.kind);
		expect(kinds).toContain('token');
		expect(kinds).toContain('pawn');
		expect(kinds).toContain('counter');
		const tokens = parsed.pieces.filter((p) => p.kind === 'token');
		expect(tokens.every((t) => t.imageUrl?.startsWith('https://'))).toBe(true);
	});

	it('handles empty/garbage input without throwing', () => {
		expect(parseSavedObject({})).toEqual({ decks: [], looseCards: [], pieces: [], skipped: [] });
		expect(parseSavedObject(null)).toEqual({ decks: [], looseCards: [], pieces: [], skipped: [] });
	});
});

describe('pieces on the Clone Troopers export', () => {
	const parsed = parseSavedObject(cloneFixture);

	it('finds the hero pawn with its faction color', () => {
		const pawn = parsed.pieces.find((p) => p.kind === 'pawn');
		expect(pawn?.name).toBe('Clone Troopers');
		expect(pawn?.color).toMatch(/^#/);
	});

	it('turns the health-dial Custom_Model into a counter with HP from Lua', () => {
		const counter = parsed.pieces.find((p) => p.kind === 'counter');
		expect(counter?.maxValue).toBe(2);
	});
});

describe('extractCounterMax', () => {
	it('parses MAX_VALUE from TTS counter Lua', () => {
		expect(extractCounterMax('CONFIG = {\r\n MIN_VALUE = 0,\r\n MAX_VALUE = 18,')).toBe(18);
		expect(extractCounterMax('no counter here')).toBeNull();
		expect(extractCounterMax(undefined)).toBeNull();
	});
});
