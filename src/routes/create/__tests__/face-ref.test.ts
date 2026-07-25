import { describe, it, expect } from 'vitest';
import { buildFaceRef, parseFaceRef } from '../face-ref';

const roundtrip = (ref: string) => buildFaceRef(parseFaceRef(ref));

describe('parseFaceRef', () => {
	it('reads a generated ref back as its card code', () => {
		expect(parseFaceRef('gen:std52/AS')).toMatchObject({ scheme: 'gen', genCode: 'AS' });
	});

	it('reads a plain image url', () => {
		expect(parseFaceRef('https://example.test/ace.png')).toMatchObject({
			scheme: 'url',
			url: 'https://example.test/ace.png'
		});
	});

	it('reads a sheet ref back into its cells', () => {
		const ref = 'sheet:{"url":"https://example.test/sheet.png","cols":10,"rows":7,"index":3}';
		expect(parseFaceRef(ref)).toMatchObject({
			scheme: 'sheet',
			sheetUrl: 'https://example.test/sheet.png',
			sheetCols: 10,
			sheetRows: 7,
			sheetIndex: 3
		});
	});

	it('keeps a sheet payload the editor has no control for', () => {
		const ref =
			'sheet:{"url":"https://example.test/s.png","cols":2,"rows":2,"index":1,"name":"Ace"}';
		expect(parseFaceRef(ref).sheetExtra).toEqual({ name: 'Ace' });
		expect(roundtrip(ref)).toContain('"name":"Ace"');
	});

	it('leaves an unparseable sheet ref alone rather than blanking the card', () => {
		expect(parseFaceRef('sheet:not json')).toMatchObject({
			scheme: 'url',
			url: 'sheet:not json'
		});
	});

	it('starts empty for a card with no face yet', () => {
		expect(parseFaceRef('')).toMatchObject({ scheme: 'url', url: '' });
		expect(buildFaceRef(parseFaceRef(''))).toBe('');
	});
});

describe('buildFaceRef', () => {
	it('round-trips every scheme, so the inline editor never rewrites a ref it just read', () => {
		for (const ref of [
			'gen:std52/AS',
			'gen:std52/back',
			'https://example.test/ace.png',
			'sheet:{"url":"https://example.test/sheet.png","cols":10,"rows":7,"index":3}'
		]) {
			expect(roundtrip(ref)).toBe(ref);
		}
	});

	it('builds a sheet ref from whole, in-range cells', () => {
		const draft = parseFaceRef('');
		expect(
			buildFaceRef({
				...draft,
				scheme: 'sheet',
				sheetUrl: ' https://example.test/s.png ',
				sheetCols: 4.4,
				sheetRows: 0,
				sheetIndex: -2
			})
		).toBe('sheet:{"url":"https://example.test/s.png","cols":4,"rows":1,"index":0}');
	});

	it('is empty rather than half-built when the inputs are', () => {
		const draft = parseFaceRef('');
		expect(buildFaceRef({ ...draft, scheme: 'sheet' })).toBe('');
		expect(buildFaceRef({ ...draft, scheme: 'gen', genCode: '  ' })).toBe('');
	});
});
