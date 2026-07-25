import { describe, it, expect } from 'vitest';
import { collectStackGroup, orderForDeck, resolveStack, resolveStackHeight } from '../stacking';
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

describe('resolveStack — square-up', () => {
	it('keeps the drop point when nothing is under it', () => {
		expect(resolveStack({}, 'a', 3, -4)).toEqual({ restY: CARD_REST_Y, x: 3, z: -4, count: 0 });
	});

	it('snaps to the base card XZ when landing on a stack', () => {
		const cards = { b: card(1, CARD_REST_Y, -2) };
		const stack = resolveStack(cards, 'a', 1.4, -1.6);
		expect(stack.count).toBe(1);
		expect(stack.x).toBe(1);
		expect(stack.z).toBe(-2);
	});

	it('squares up to the BOTTOM card of a pile, not the top one', () => {
		const cards = {
			b: card(1, CARD_REST_Y, -2),
			c: card(1.3, CARD_REST_Y + CARD_THICKNESS, -1.8)
		};
		const stack = resolveStack(cards, 'a', 1.5, -1.5);
		expect([stack.x, stack.z]).toEqual([1, -2]);
		expect(stack.restY).toBeCloseTo(CARD_REST_Y + 2 * CARD_THICKNESS);
		expect(stack.count).toBe(2);
	});

	it('breaks base ties on id so every client squares up to the same spot', () => {
		const cards = { z: card(2, CARD_REST_Y, 2), a: card(2.4, CARD_REST_Y, 2.4) };
		expect(resolveStack(cards, 'x', 2.2, 2.2).x).toBe(2.4); // card 'a' wins
	});
});

describe('collectStackGroup', () => {
	it('returns null for a card that is not on the table', () => {
		expect(collectStackGroup({}, 'a')).toBeNull();
		expect(collectStackGroup(undefined, 'a')).toBeNull();
		expect(collectStackGroup({ a: {} }, 'a')).toBeNull();
	});

	it('groups a lone card — a 1-card deck is a valid pile', () => {
		const group = collectStackGroup({ a: card(2, CARD_REST_Y, 3) }, 'a');
		expect(group).toEqual({ ids: ['a'], position: [2, CARD_REST_Y, 3], topId: 'a' });
	});

	it('orders members bottom → top so the visual top stays the top', () => {
		const cards = {
			top: card(0.2, CARD_REST_Y + 2 * CARD_THICKNESS, 0.2),
			bottom: card(0, CARD_REST_Y, 0),
			middle: card(0.1, CARD_REST_Y + CARD_THICKNESS, 0.1)
		};
		const group = collectStackGroup(cards, 'top');
		expect(group?.ids).toEqual(['bottom', 'middle', 'top']);
		expect(group?.topId).toBe('top');
		// the deck lands at the base card's XZ
		expect(group?.position).toEqual([0, CARD_REST_Y, 0]);
	});

	it('groups from any member of the pile, not just the top card', () => {
		const cards = {
			bottom: card(0, CARD_REST_Y, 0),
			top: card(0.2, CARD_REST_Y + CARD_THICKNESS, 0.2)
		};
		expect(collectStackGroup(cards, 'bottom')?.ids).toEqual(['bottom', 'top']);
	});

	it('leaves cards outside the stack radius out of the group', () => {
		const cards = {
			a: card(0, CARD_REST_Y, 0),
			far: card(CARD_STACK_RADIUS + 0.1, CARD_REST_Y, 0)
		};
		expect(collectStackGroup(cards, 'a')?.ids).toEqual(['a']);
	});

	it('leaves out cards that are mid-drag above the table', () => {
		const cards = {
			a: card(0, CARD_REST_Y, 0),
			held: card(0.2, CARD_STACK_MAX_Y + 0.5, 0.2)
		};
		expect(collectStackGroup(cards, 'a')?.ids).toEqual(['a']);
	});

	it('refuses to group around a card that is itself in the air', () => {
		const cards = { a: card(0, CARD_STACK_MAX_Y + 0.5, 0) };
		expect(collectStackGroup(cards, 'a')).toBeNull();
	});

	it('breaks y ties on id so both clients build the same deck order', () => {
		const cards = { b: card(0, CARD_REST_Y, 0), a: card(0.1, CARD_REST_Y, 0.1) };
		expect(collectStackGroup(cards, 'a')?.ids).toEqual(['a', 'b']);
	});
});

describe('orderForDeck', () => {
	it('keeps bottom → top for a facedown deck (top card drawn from the end)', () => {
		expect(orderForDeck(['bottom', 'middle', 'top'], false)).toEqual(['bottom', 'middle', 'top']);
	});

	it('reverses for a face-up pile (top card drawn from the front)', () => {
		expect(orderForDeck(['bottom', 'middle', 'top'], true)).toEqual(['top', 'middle', 'bottom']);
	});

	it('does not mutate the input', () => {
		const ids = ['a', 'b'];
		orderForDeck(ids, true);
		expect(ids).toEqual(['a', 'b']);
	});
});
