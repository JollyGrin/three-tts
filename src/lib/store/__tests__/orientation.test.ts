/**
 * Per-card default orientation (tableplace-132): `orientation: 'landscape'` is
 * carried as its own field through every hop a card takes — deck → draw →
 * loose card → group → deck again, bag → draw → bag again — and is NEVER baked
 * into `rotation[2]`. Tap is additive on that axis and the snap/group logic
 * reads a squared-up yaw as z % 180 == 0, so the persisted rotation must stay
 * orientation-relative; the renderers alone apply the quarter turn.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { gameStore } from '../game/gameStore.svelte';
import { gameActions } from '../game/actions';
import { dragStore } from '../dragStore.svelte';
import { composePackDeck } from '$lib/compose/pack';
import type { GamePackDef } from '$lib/packs/types';

const ME = 'seat0';
const DECK = `deck:${ME}:0`;

const PACK: GamePackDef = {
	id: 'sorcery-ish',
	name: 'Sorcery-ish',
	scope: 'player',
	decks: [
		{
			slot: 'atlas',
			name: 'Atlas',
			back: 'https://x/site-back.png',
			cards: [
				{ code: 'site-1', face: 'https://x/site-1.png', orientation: 'landscape' },
				{ code: 'spell-1', face: 'https://x/spell-1.png' }
			]
		}
	]
};

function seed(isFaceUp = false) {
	gameStore.set({
		players: { [ME]: { id: ME, seat: 0 } },
		decks: {
			[DECK]: {
				id: DECK,
				isFaceUp,
				position: [0, 0.4, 0] as [number, number, number],
				rotation: [0, 0, 0] as [number, number, number],
				cards: [
					{ id: 'site', faceImageUrl: 'site.png', orientation: 'landscape' as const },
					{ id: 'spell', faceImageUrl: 'spell.png' }
				]
			}
		},
		cards: {}
	});
}

beforeEach(() => {
	localStorage.setItem('myPlayerId', ME);
	dragStore.set({
		isDragging: null,
		isHovered: null,
		isDeckHovered: null,
		isBagHovered: null,
		isTrayHovered: false
	});
	seed();
});

describe('composePackDeck', () => {
	it('carries a landscape card onto CardInDeck and leaves portrait implicit', () => {
		const { deck } = composePackDeck(PACK, PACK.decks[0], { ownerId: ME });
		const [site, spell] = deck.cards ?? [];
		expect(site.orientation).toBe('landscape');
		expect(spell.orientation).toBeUndefined();
	});
});

describe('drawFromTop', () => {
	it('carries orientation onto the drawn card without touching its rotation', () => {
		gameActions.drawFromTop(DECK, 2);
		const cards = get(gameStore).cards ?? {};
		expect(cards['site']?.orientation).toBe('landscape');
		expect(cards['spell']?.orientation).toBeUndefined();
		// facedown flip only — no 90 baked into the yaw
		expect(cards['site']?.rotation?.[0]).toBe(180);
		expect(Math.abs(cards['site']?.rotation?.[2] ?? NaN)).toBe(0);
	});
});

describe('ungroupDeck', () => {
	it('spreads a landscape card with its orientation and a squared-up yaw', () => {
		const result = gameActions.ungroupDeck(DECK);
		expect(result.ok).toBe(true);
		const cards = get(gameStore).cards ?? {};
		expect(cards['site']?.orientation).toBe('landscape');
		expect(cards['spell']?.orientation).toBeUndefined();
		expect(Math.abs(cards['site']?.rotation?.[2] ?? NaN)).toBe(0);
	});
});

describe('groupStackIntoDeck', () => {
	it('keeps orientation on the pile members, so a re-draw restores it', () => {
		gameActions.ungroupDeck(DECK);
		const grouped = gameActions.groupStackIntoDeck('site');
		expect(grouped).toBeTruthy();
		const deck = get(gameStore).decks?.[grouped as string];
		const site = deck?.cards?.find((c) => c.id === 'site');
		const spell = deck?.cards?.find((c) => c.id === 'spell');
		expect(site?.orientation).toBe('landscape');
		expect(spell?.orientation).toBeUndefined();
	});
});

describe('tapCard on a landscape card', () => {
	it('is plain additive yaw — orientation-relative, never pre-rotated', () => {
		// facedown deck: top = last element, so drawing both lands 'site' too
		gameActions.drawFromTop(DECK, 2);
		gameActions.tapCard(false, 'site');
		const card = get(gameStore).cards?.['site'];
		expect(card?.rotation?.[2]).toBe(90);
		expect(card?.orientation).toBe('landscape');
	});
});

describe('bag draw and return', () => {
	const BAG = `piece:${ME}:pouch-0`;

	function seedBag() {
		gameStore.set({
			players: { [ME]: { id: ME, seat: 0 } },
			decks: {},
			cards: {},
			pieces: {
				[BAG]: {
					kind: 'bag',
					name: 'Pouch',
					position: [0, 0.335, 0] as [number, number, number],
					rotation: [0, 0, 0] as [number, number, number],
					drawMode: 'lifo' as const,
					contents: [
						{
							kind: 'card' as const,
							code: 'site',
							face: 'site.png',
							orientation: 'landscape' as const
						}
					]
				}
			}
		});
	}

	it('carries orientation out of the bag and back in again', () => {
		seedBag();
		const draw = gameActions.drawFromBag(BAG);
		expect(draw).toBeTruthy();
		const card = get(gameStore).cards?.[draw!.id];
		expect(card?.orientation).toBe('landscape');

		const returned = gameActions.returnToBag(BAG, draw!.id);
		expect(returned).toBe(true);
		const contents = get(gameStore).pieces?.[BAG]?.contents ?? [];
		expect(contents[0]).toMatchObject({ kind: 'card', orientation: 'landscape' });
	});
});

describe('tray round-trip', () => {
	it('a landscape card keeps its orientation through hand and back to the table', () => {
		// facedown deck: top = last element, so drawing both lands 'site' too
		gameActions.drawFromTop(DECK, 2);
		gameActions.moveCardToTray('site', ME);
		const inTray = get(gameStore).players?.[ME]?.tray?.['site'];
		expect(inTray?.orientation).toBe('landscape');

		const out = gameActions.moveCardOutOfTray('site', ME);
		expect(out?.orientation).toBe('landscape');
	});
});
