/**
 * The /play settings pane used to open on Keybinds — 13 read-only key names —
 * with an FpsGraph as its first row, hiding every action behind a collapsed
 * folder (#113). What a player sees on first paint is the assertion here.
 *
 * Drives the real tweakpane controls in jsdom, like PaneDecks.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import Pane from '../Pane.svelte';
import { gameStore } from '$lib/store/game/gameStore.svelte';
import { gameActions } from '$lib/store/game/actions';
import type { GameDTO } from '$lib/store/game/types';

// the pane reads the lobby out of the URL and can navigate; neither module
// boots outside a real SvelteKit client runtime
vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/play?lobby=testlobby'), state: {} }
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

// the draggable Pane observes its own size; jsdom has no ResizeObserver
class NoopObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}
vi.stubGlobal('ResizeObserver', NoopObserver);
// the Overlays rotation Wheel is a camerakit blade, which waits on one
vi.stubGlobal('IntersectionObserver', NoopObserver);

/** tweakpane renders asynchronously; let its microtasks flush */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

/** the tweakpane folder blade whose title bar reads `title` */
const folder = (container: HTMLElement, title: string) =>
	[...container.querySelectorAll('.tp-fldv')].find(
		(f) => f.querySelector('.tp-fldv_t')?.textContent?.trim() === title
	);

const isExpanded = (el: Element | undefined) => el?.classList.contains('tp-fldv-expanded');

const deckOf = (id: string, n: number) => ({
	id,
	cards: Array.from({ length: n }, (_, i) => ({ id: `${id}-${i}`, faceImageUrl: 'f.png' }))
});

describe('/play settings pane on first paint', () => {
	beforeEach(() => {
		cleanup();
		localStorage.clear();
		gameStore.set({ players: {}, cards: {}, decks: {}, pieces: {} });
		localStorage.setItem('myPlayerId', 'player9');
		gameActions.addPlayer('player9');
	});

	it('opens Scenarios and leaves the reference folders shut', async () => {
		const { container } = render(Pane);
		await settle();

		// the actionable folder on an empty table
		expect(isExpanded(folder(container, 'Scenarios'))).toBe(true);
		// pure reference / instrumentation stays out of the way
		expect(isExpanded(folder(container, 'Keybinds'))).toBe(false);
		expect(isExpanded(folder(container, 'Debug'))).toBe(false);
		expect(isExpanded(folder(container, 'Connection'))).toBe(false);
		expect(isExpanded(folder(container, 'Overlays'))).toBe(false);
	});

	it('collapses Scenarios once the table has decks', async () => {
		const { container } = render(Pane);
		await settle();
		expect(isExpanded(folder(container, 'Scenarios'))).toBe(true);

		gameStore.updateState({
			decks: { 'deck:player9:main': deckOf('deck:player9:main', 52) }
		} as Partial<GameDTO>);
		await settle();

		expect(isExpanded(folder(container, 'Scenarios'))).toBe(false);
		// the pane survived the update — a blade change can silently tear the
		// whole thing down (see BulkSheet.svelte)
		expect(folder(container, 'Keybinds')).toBeDefined();
	});

	it('keeps the fps graph inside Debug, not at the top of the pane', async () => {
		const { container } = render(Pane);
		await settle();

		const graph = container.querySelector('.tp-fpsv');
		expect(graph).not.toBeNull();
		expect(folder(container, 'Debug')?.contains(graph!)).toBe(true);
	});

	it('labels the downward nudge Arrow Down', async () => {
		const { container } = render(Pane);
		await settle();

		const rows = [...container.querySelectorAll('.tp-lblv')];
		const row = rows.find((r) =>
			r.querySelector('.tp-lblv_l')?.textContent?.includes('Nudge card lower')
		);
		expect(row?.querySelector('input')?.value).toBe('Arrow Down');
	});
});
