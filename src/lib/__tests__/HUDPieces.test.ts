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

/**
 * tweakpane's List binds by option index, not by value. Found by label rather
 * than by position: the Color blade owns a <select> of its own, so counting
 * selects picks up the colour-mode picker.
 */
function selectList(container: HTMLElement, label: string, optionIndex: number) {
	const row = [...container.querySelectorAll('.tp-lblv')].find(
		(el) => el.querySelector('.tp-lblv_l')?.textContent === label
	);
	const select = row?.querySelector('select') as HTMLSelectElement;
	select.selectedIndex = optionIndex;
	select.dispatchEvent(new Event('change', { bubbles: true }));
}

const selectKind = (container: HTMLElement, index: number) => selectList(container, 'Kind', index);

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

		selectKind(container, 2); // Token, Pawn, Counter, Dice
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

	it('picks a multi-state piece’s initial state, which is what /setup saves', async () => {
		gameStore.set({
			players: {},
			pieces: {
				'piece:seat0:brazier-0': {
					kind: 'token',
					name: 'Brazier',
					states: [
						{ face: 'https://x/lit.png', name: 'Lit' },
						{ face: 'https://x/embers.png', name: 'Embers' },
						{ face: 'https://x/out.png', name: 'Out' }
					],
					state: 0
				}
			}
		});
		const container = await mount('seat0');

		const picker = [...container.querySelectorAll('select')].find((s) =>
			[...s.options].some((o) => o.textContent?.includes('Embers'))
		)!;
		expect(picker).toBeTruthy();
		picker.selectedIndex = 2; // 'Out'
		picker.dispatchEvent(new Event('change', { bubbles: true }));
		await settle();

		expect(get(gameStore).pieces?.['piece:seat0:brazier-0']?.state).toBe(2);
		// the pane is intact: a blade swap would have replaced the whole thing
		expect(button(container, 'Remove')).toBeTruthy();
		expect(button(container, 'Spawn token')).toBeTruthy();
	});

	it('offers no state picker for a single-face piece', async () => {
		gameStore.set({
			players: {},
			pieces: { 'piece:seat0:token-0': { kind: 'token', name: 'Plain' } }
		});
		const container = await mount('seat0');
		expect(labels(container)).not.toContain('state');
	});

	it('spawns a d6 by default and a d20 when Sides says so', async () => {
		const container = await mount();

		selectKind(container, 3); // Dice
		await settle();

		// the pane is still alive after swapping in the die-only blade — a
		// tweakpane pane that tears itself down leaves no controls behind at all
		expect(labels(container)).toContain('Sides');
		expect(labels(container)).not.toContain('Max value');
		expect(button(container, 'Spawn die')).toBeTruthy();

		button(container, 'Spawn')!.click();
		await settle();
		expect(get(gameStore).pieces?.['piece:seat0:d6-0']).toMatchObject({
			kind: 'die',
			sides: 6,
			value: 1,
			rollSeq: 0
		});

		selectList(container, 'Sides', 5); // d4, d6, d8, d10, d12, d20
		await settle();
		button(container, 'Spawn')!.click();
		await settle();

		expect(get(gameStore).pieces?.['piece:seat0:d20-0']).toMatchObject({
			kind: 'die',
			sides: 20
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
