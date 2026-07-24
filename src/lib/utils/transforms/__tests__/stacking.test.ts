import { describe, it, expect } from 'vitest';
import { resolveStackHeight } from '../stacking';
import {
	CARD_REST_Y,
	CARD_THICKNESS,
	CARD_STACK_RADIUS,
	CARD_STACK_MAX_Y
} from '$lib/utils/constants-cards';

const card = (x: number, y: number, z: number) => ({
	position: [x, y, z] as [number, number, number]
});

describe('resolveStackHeight', () => {
	it('rests at CARD_REST_Y on an empty table', () => {
		expect(resolveStackHeight({}, 'a', 0, 0)).toBe(CARD_REST_Y);
		expect(resolveStackHeight(undefined, 'a', 0, 0)).toBe(CARD_REST_Y);
	});

	it('stacks one thickness above an overlapping card', () => {
		const cards = { b: card(0, CARD_REST_Y, 0) };
		expect(resolveStackHeight(cards, 'a', 0.5, 0.5)).toBe(CARD_REST_Y + CARD_THICKNESS);
	});

	it('stacks above the highest of several overlapping cards', () => {
		const cards = {
			b: card(0, CARD_REST_Y, 0),
			c: card(0.2, CARD_REST_Y + CARD_THICKNESS, 0.2)
		};
		expect(resolveStackHeight(cards, 'a', 0, 0)).toBeCloseTo(CARD_REST_Y + 2 * CARD_THICKNESS);
	});

	it('ignores the dropped card itself', () => {
		const cards = { a: card(0, 5, 0) };
		expect(resolveStackHeight(cards, 'a', 0, 0)).toBe(CARD_REST_Y);
	});

	it('ignores cards outside the stack radius', () => {
		const cards = { b: card(CARD_STACK_RADIUS + 0.1, CARD_REST_Y, 0) };
		expect(resolveStackHeight(cards, 'a', 0, 0)).toBe(CARD_REST_Y);
	});

	it('ignores cards mid-drag above CARD_STACK_MAX_Y', () => {
		const cards = { b: card(0, CARD_STACK_MAX_Y + 0.5, 0) };
		expect(resolveStackHeight(cards, 'a', 0, 0)).toBe(CARD_REST_Y);
	});

	it('ignores cards without a position', () => {
		const cards = { b: {} };
		expect(resolveStackHeight(cards, 'a', 0, 0)).toBe(CARD_REST_Y);
	});
});
