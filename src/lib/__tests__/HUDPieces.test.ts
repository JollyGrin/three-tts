/**
 * The Pieces pane is shared by /play and /setup, so a break here breaks both.
 * Drives the real tweakpane controls in jsdom rather than calling the actions
 * directly — that's what proves the pane is wired to the store.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import { get } from 'svelte/store';
import HUDPieces from '../HUDPieces.svelte';
import { gameStore } from '../store/game/gameStore.svelte';

/** tweakpane renders asynchronously; let its microtasks flush */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

const button = (container: HTMLElement, label: string) =>
	[...container.querySelectorAll('button')].find((b) => b.textContent?.includes(label));

const labels = (container: HTMLElement) =>
	[...container.querySelectorAll('.tp-lblv_l')].map((el) => el.textContent);

/** tweakpane's List binds by option index, not by value */
function selectKind(container: HTMLElement, index: number) {
	const select = container.querySelector('select') as HTMLSelectElement;
	select.selectedIndex = index;
	select.dispatchEvent(new Event('change', { bubbles: true }));
}

async function mount(ownerId = 'seat0') {
	const { container } = render(HUDPieces, { props: { ownerId, expanded: true } });
	await settle();
	return container;
}

describe('HUDPieces', () => {
	beforeEach(() => {
		gameStore.set({ players: {}, cards: {}, decks: {}, pieces: {} });
	});

	it('spawns a token for the owner it was given', async () => {
		const container = await mount('seat0');
		expect(button(container, 'Spawn token')).toBeTruthy();

		button(container, 'Spawn')!.click();
		await settle();

		expect(get(gameStore).pieces).toMatchObject({
			'piece:seat0:token-0': { kind: 'token', radius: 0.75 }
		});
	});

	it('swaps the kind-specific controls and spawns a full counter', async () => {
		const container = await mount();
		expect(labels(container)).toContain('Image URL'); // token-only
		expect(labels(container)).not.toContain('Max value');

		selectKind(container, 2); // Token, Pawn, Counter
		await settle();

		expect(labels(container)).toContain('Max value'); // counter-only
		expect(labels(container)).not.toContain('Image URL');
		expect(button(container, 'Spawn counter')).toBeTruthy();

		button(container, 'Spawn')!.click();
		await settle();

		expect(get(gameStore).pieces?.['piece:seat0:counter-0']).toMatchObject({
			kind: 'counter',
			value: 20,
			maxValue: 20
		});
	});

	it('lists and removes every piece on the table, whoever owns it', async () => {
		gameStore.set({
			players: {},
			pieces: { 'piece:someone-else:imported-0': { kind: 'pawn', name: 'From TTS' } }
		});
		const container = await mount('seat0');

		expect(button(container, 'Remove')).toBeTruthy();
		button(container, 'Remove')!.click();
		await settle();

		expect(get(gameStore).pieces).toEqual({});
	});
});
