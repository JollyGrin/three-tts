import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import PlayerHud from '../PlayerHud.svelte';
import { gameStore } from '$lib/store/game/gameStore.svelte';
import type { GameDTO } from '$lib/store/game/types';

const card = {
	position: [0, 0, 0] as [number, number, number],
	rotation: [0, 0, 0] as [number, number, number],
	faceImageUrl: 'face.png'
};

const state: Partial<GameDTO> = {
	players: {
		me: { id: 'me', seat: 0, joinTimestamp: 10, tray: { 'card:me:main-1': card }, metadata: {} },
		them: {
			id: 'them',
			seat: 1,
			joinTimestamp: 20,
			tray: { 'card:them:secret-ace': card, 'card:them:secret-king': card },
			metadata: {}
		},
		seat2: { id: 'seat2', seat: 2, joinTimestamp: 0, tray: {}, metadata: {} }
	},
	decks: {
		'deck:them:main': {
			id: 'deck:them:main',
			cards: [{ id: 'card:them:main-1', faceImageUrl: 'face.png' }]
		}
	},
	cards: {}
};

describe('PlayerHud', () => {
	beforeEach(() => {
		cleanup();
		localStorage.clear();
		localStorage.setItem('myPlayerId', 'me');
		gameStore.set(state);
	});

	it('lists every player, marks me, and shows open seats', () => {
		render(PlayerHud);
		expect(screen.getByText('me')).toBeTruthy();
		expect(screen.getByText('them')).toBeTruthy();
		expect(screen.getByText('you')).toBeTruthy();
		expect(screen.getByText('Seat 2 — open')).toBeTruthy();
	});

	it('shows counts only — never another player’s card ids', () => {
		const { container } = render(PlayerHud);
		expect(container.textContent).toContain('hand 2');
		expect(container.textContent).toContain('main');
		expect(container.textContent).not.toContain('secret-ace');
		expect(container.textContent).not.toContain('secret-king');
		expect(container.querySelectorAll('img').length).toBe(0);
	});

	it('updates live when a card moves from a deck into a tray', async () => {
		const { container } = render(PlayerHud);
		expect(container.textContent).toContain('main 1');

		gameStore.set({
			...state,
			players: {
				...state.players,
				them: { ...state.players!.them, tray: { ...state.players!.them.tray, extra: card } }
			},
			decks: { 'deck:them:main': { id: 'deck:them:main', cards: [] } }
		} as Partial<GameDTO>);
		await Promise.resolve();

		expect(container.textContent).toContain('hand 3');
		expect(container.textContent).toContain('main 0');
	});

	it('collapses to a summary and persists the choice', async () => {
		const { container, unmount } = render(PlayerHud);
		await fireEvent.click(screen.getByRole('button'));

		expect(container.textContent).toContain('2 players · 1 open');
		expect(container.textContent).not.toContain('Seat 2 — open');
		expect(localStorage.getItem('hud:players:collapsed')).toBe('true');

		// a reload re-reads the flag and starts collapsed
		unmount();
		const reloaded = render(PlayerHud);
		expect(reloaded.container.textContent).not.toContain('Seat 2 — open');
	});

	it('lets pointer events through everywhere but the HUD box', () => {
		const { container } = render(PlayerHud);
		const wrapper = container.querySelector('div');
		expect(wrapper?.className).toContain('pointer-events-none');
		expect(wrapper?.firstElementChild?.className).toContain('pointer-events-auto');
	});
});
