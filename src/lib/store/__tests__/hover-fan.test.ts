/**
 * Hover fan membership: hovering a card in a loose pile has to hand the
 * renderer the whole pile — the same set `G` would swallow — so the fan
 * preview can never disagree with the action it previews.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { gameStore } from '../game/gameStore.svelte';
import { dragStore, dragActions, setHover, clearHover } from '../dragStore.svelte';
import { CARD_REST_Y, CARD_THICKNESS } from '$lib/utils/constants-cards';

const card = (x: number, y: number, z: number) => ({
	position: [x, y, z] as [number, number, number],
	rotation: [180, 0, 0] as [number, number, number],
	faceImageUrl: 'face.png'
});

describe('hover fan', () => {
	beforeEach(() => {
		dragActions.reset();
		gameStore.set({
			cards: {
				bottom: card(0, CARD_REST_Y, 0),
				middle: card(0.1, CARD_REST_Y + CARD_THICKNESS, 0.1),
				top: card(0.2, CARD_REST_Y + 2 * CARD_THICKNESS, 0.2),
				elsewhere: card(9, CARD_REST_Y, 9)
			}
		});
	});

	it('collects the whole pile, bottom → top, from any member', () => {
		setHover('top');
		expect(get(dragStore).hoveredStack).toEqual(['bottom', 'middle', 'top']);
		setHover('bottom');
		expect(get(dragStore).hoveredStack).toEqual(['bottom', 'middle', 'top']);
	});

	it('leaves a lone card unfanned', () => {
		setHover('elsewhere');
		expect(get(dragStore).isHovered).toBe('elsewhere');
		expect(get(dragStore).hoveredStack).toBeNull();
	});

	it('stays suppressed while dragging', () => {
		dragActions.start('elsewhere', 2);
		setHover('top');
		expect(get(dragStore).hoveredStack).toBeNull();
		expect(get(dragStore).isHovered).toBe('elsewhere');
	});

	it('drops the fan when the pointer leaves', () => {
		setHover('top');
		clearHover('top');
		expect(get(dragStore).isHovered).toBeNull();
		expect(get(dragStore).hoveredStack).toBeNull();
	});

	it('ignores a stale leave from a card the pointer has already left', () => {
		// fanning moves cards, so leave(top) can arrive after enter(middle)
		setHover('top');
		setHover('middle');
		clearHover('top');
		expect(get(dragStore).isHovered).toBe('middle');
		expect(get(dragStore).hoveredStack).toEqual(['bottom', 'middle', 'top']);
	});

	it('never writes anything into the shared game state', () => {
		const before = structuredClone(get(gameStore));
		setHover('top');
		clearHover('top');
		expect(get(gameStore)).toEqual(before);
	});
});
