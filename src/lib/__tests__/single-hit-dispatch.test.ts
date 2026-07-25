/**
 * Grabbing an ungrouped pile used to lift every card the ray intersected,
 * because Threlte's interactivity() dispatches pointerdown to every hit,
 * near → far, unless a handler stops propagation (see setupInteractivity in
 * @threlte/extras: it loops `for (const hit of hits)` and only `break`s once
 * a handler calls `stopPropagation()`). Card and Piece pointerdown handlers
 * both route through `claimPointerDown` for this reason.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import type { IntersectionEvent } from '@threlte/extras';
import { dragActions, dragStore } from '../store/dragStore.svelte';
import { claimPointerDown } from '../utils/single-hit-dispatch';

type FakeEvent = IntersectionEvent<PointerEvent>;

function fakeEvent(button: number, onStop: () => void): FakeEvent {
	return {
		nativeEvent: { button } as PointerEvent,
		stopPropagation: onStop,
		stopImmediatePropagation: () => {}
	} as unknown as FakeEvent;
}

/**
 * Mirrors @threlte/extras's real dispatch loop: hits are visited near → far
 * and the loop breaks as soon as a handler's stopPropagation() is called,
 * so farther hits never see the event.
 */
function dispatchPointerDown(hits: { onpointerdown: (e: FakeEvent) => void }[], button: number) {
	let stopped = false;
	for (const hit of hits) {
		if (stopped) break;
		hit.onpointerdown(
			fakeEvent(button, () => {
				stopped = true;
			})
		);
	}
}

describe('claimPointerDown', () => {
	beforeEach(() => dragActions.reset());

	it('claims a left-click and stops it from reaching farther hits', () => {
		let stopped = false;
		const claimed = claimPointerDown(
			fakeEvent(0, () => {
				stopped = true;
			})
		);

		expect(claimed).toBe(true);
		expect(stopped).toBe(true);
	});

	it('lets a right-click pass through unclaimed', () => {
		let stopped = false;
		const claimed = claimPointerDown(
			fakeEvent(2, () => {
				stopped = true;
			})
		);

		expect(claimed).toBe(false);
		expect(stopped).toBe(false);
	});

	it('two overlapping cards + one pointerdown starts exactly one drag', () => {
		const dragStartSpy = vi.fn();
		const cardHandler = (cardId: string) => (e: FakeEvent) => {
			if (!claimPointerDown(e)) return;
			dragStartSpy(cardId);
			dragActions.start(cardId, 2);
		};

		// near → far, same order Threlte's raycaster would report the hits in
		const topCard = { onpointerdown: cardHandler('card:top') };
		const bottomCard = { onpointerdown: cardHandler('card:bottom') };

		dispatchPointerDown([topCard, bottomCard], 0);

		expect(dragStartSpy).toHaveBeenCalledTimes(1);
		expect(dragStartSpy).toHaveBeenCalledWith('card:top');
		expect(get(dragStore).isDragging).toBe('card:top');
	});
});
