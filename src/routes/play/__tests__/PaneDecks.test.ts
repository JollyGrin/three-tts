/**
 * The visible symptom of the broken invite handoff: a joiner had no Shuffle
 * button, because PaneDecks only lists decks whose owner segment is their own
 * id and the seat placeholder still owned them. After claiming the seat the
 * decks must appear — without a remount — and Shuffle must act on them.
 *
 * Drives the real tweakpane controls in jsdom, like HUDPieces.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import PaneDecks from '../PaneDecks.svelte';
import { gameStore } from '$lib/store/game/gameStore.svelte';
import { gameActions } from '$lib/store/game/actions';
import { claimSeat, ensureSeatPlaceholder } from '$lib/scenario/scenario';
import type { GameDTO } from '$lib/store/game/types';

// the draggable Pane observes its own size; jsdom has no ResizeObserver
class NoopResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}
vi.stubGlobal('ResizeObserver', NoopResizeObserver);

/** tweakpane renders asynchronously; let its microtasks flush */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

const button = (container: HTMLElement, label: string) =>
	[...container.querySelectorAll('button')].find((b) => b.textContent?.includes(label));

const deckOf = (id: string, n: number) => ({
	id,
	cards: Array.from({ length: n }, (_, i) => ({ id: `${id}-${i}`, faceImageUrl: 'f.png' }))
});

/** a seeded table where seat 1's decks still belong to the placeholder */
function seedSeatOneDecks() {
	gameStore.set({ players: {}, cards: {}, decks: {}, pieces: {} });
	ensureSeatPlaceholder(1);
	gameStore.updateState({
		decks: { 'deck:seat1:main': deckOf('deck:seat1:main', 8) }
	} as Partial<GameDTO>);
}

describe('PaneDecks after an invite seat claim', () => {
	beforeEach(() => {
		cleanup();
		localStorage.clear();
		seedSeatOneDecks();
	});

	it('lists no decks while the placeholder still owns them', async () => {
		localStorage.setItem('myPlayerId', 'joiner');
		gameActions.addPlayer('joiner');
		const { container } = render(PaneDecks);
		await settle();
		expect(button(container, 'Shuffle')).toBeUndefined();
	});

	it('shows the seat decks and shuffles them once the seat is claimed', async () => {
		// a joiner following an invite link mounts the pane before websocket
		// init has written their player id — the deck list must pick the id up
		// afterwards rather than latching the empty one from mount
		const { container } = render(PaneDecks);
		await settle();
		expect(button(container, 'Shuffle')).toBeUndefined();

		localStorage.setItem('myPlayerId', 'joiner');
		gameActions.addPlayer('joiner');
		expect(claimSeat(1)).toBe(true);
		// the pane re-derives from the store — no remount, no refresh
		await settle();

		const shuffle = button(container, 'Shuffle deck:joiner:main');
		expect(shuffle).toBeDefined();

		const before = get(gameStore).decks?.['deck:joiner:main']?.cards?.map((c) => c.id);
		expect(before).toHaveLength(8);

		// pin Math.random so the shuffle cannot flake into an identity permutation
		const random = vi.spyOn(Math, 'random').mockReturnValue(0);
		await fireEvent.click(shuffle!);
		random.mockRestore();

		const after = get(gameStore).decks?.['deck:joiner:main']?.cards?.map((c) => c.id);
		expect(after).toHaveLength(8);
		// same cards, different order
		expect(after?.slice().sort()).toEqual(before?.slice().sort());
		expect(after).not.toEqual(before);
	});
});
