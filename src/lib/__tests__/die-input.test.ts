/**
 * Click-to-roll has the same two hazards a counter's click has, so it gets the
 * same harness (see counter-input.test.ts): Threlte queues a piece's group once
 * per child mesh the ray pierced, and a die is also a draggable piece, so a
 * press that travelled must not also roll.
 *
 * Getting either wrong is expensive here in a way it is not for a counter: a
 * double dispatch is two rolls, which is two state patches and a result the
 * player never saw the first half of.
 */
import { describe, expect, it, vi } from 'vitest';
import type { IntersectionEvent } from '@threlte/extras';
import { createDieInput } from '../utils/die-input';

type Handlers = ReturnType<typeof createDieInput>;
type Hit = { label: string; handlers: Handlers };

/** replica of @threlte/extras' dispatch loop: near → far, break on stopPropagation */
function dispatch(hits: Hit[], nativeEvent: Event, delta = 0) {
	let stopped = false;
	const dispatched: string[] = [];

	for (const hit of hits) {
		if (stopped) break;
		dispatched.push(hit.label);
		hit.handlers.onclick({
			delta,
			nativeEvent,
			stopPropagation: () => {
				stopped = true;
			},
			stopImmediatePropagation: () => {}
		} as unknown as IntersectionEvent<MouseEvent>);
	}

	return { dispatched, stopped };
}

function die(roll: (id: string) => void, id = 'piece:seat0:d20-0', wasDrag = false) {
	return createDieInput({ id: () => id, isDie: () => true, wasDrag: () => wasDrag, roll });
}

/** a die's raycastable children, near → far */
const dieHits = (handlers: Handlers): Hit[] => [
	{ label: 'hover-label', handlers },
	{ label: 'die-mesh', handlers }
];

describe('die input', () => {
	it('rolls once when one click hits several of the die’s child meshes', () => {
		const roll = vi.fn();
		const handlers = die(roll);

		const { dispatched } = dispatch(dieHits(handlers), new MouseEvent('click'));

		expect(roll).toHaveBeenCalledTimes(1);
		expect(roll).toHaveBeenCalledWith('piece:seat0:d20-0');
		expect(dispatched).toEqual(['hover-label']);
	});

	it('still rolls once if every duplicate entry reaches the handler', () => {
		const roll = vi.fn();
		const handlers = die(roll);
		const native = new MouseEvent('click');

		for (let i = 0; i < 3; i++) {
			handlers.onclick({
				delta: 0,
				nativeEvent: native,
				stopPropagation: () => {},
				stopImmediatePropagation: () => {}
			} as unknown as IntersectionEvent<MouseEvent>);
		}

		expect(roll).toHaveBeenCalledTimes(1);
	});

	it('does not roll the die you just dragged, however the drag is detected', () => {
		const rolledByDelta = vi.fn();
		// pointer travelled far enough for Threlte to report it
		dispatch(dieHits(die(rolledByDelta)), new MouseEvent('click'), 20);
		expect(rolledByDelta).not.toHaveBeenCalled();

		const rolledByFlag = vi.fn();
		// …and the same via the piece's own threshold, which trips first
		dispatch(dieHits(die(rolledByFlag, 'piece:seat0:d6-0', true)), new MouseEvent('click'));
		expect(rolledByFlag).not.toHaveBeenCalled();
	});

	it('claims a drag release anyway, so the duplicate entry cannot roll it', () => {
		const roll = vi.fn();
		const { dispatched } = dispatch(dieHits(die(roll)), new MouseEvent('click'), 20);
		expect(dispatched).toEqual(['hover-label']);
	});

	it('only the topmost die in a pile rolls', () => {
		const roll = vi.fn();
		const top = die(roll, 'piece:seat0:top-0');
		const bottom = die(roll, 'piece:seat0:bottom-0');

		dispatch(
			[...dieHits(top), { label: 'bottom-mesh', handlers: bottom }],
			new MouseEvent('click')
		);

		expect(roll).toHaveBeenCalledTimes(1);
		expect(roll).toHaveBeenCalledWith('piece:seat0:top-0');
	});

	it('a non-die piece ignores it entirely, so hits below still see the click', () => {
		const roll = vi.fn();
		const token = createDieInput({
			id: () => 'piece:seat0:token-0',
			isDie: () => false,
			wasDrag: () => false,
			roll
		});

		const { dispatched, stopped } = dispatch(
			[{ label: 'token-disc', handlers: token }],
			new MouseEvent('click')
		);

		expect(roll).not.toHaveBeenCalled();
		expect(stopped).toBe(false);
		expect(dispatched).toEqual(['token-disc']);
	});
});
