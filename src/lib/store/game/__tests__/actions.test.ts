import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

const sent: any[] = [];
let connected = true;

vi.mock('$lib/websocket/connection', () => ({
	isWebSocketConnected: () => connected,
	sendMessage: (message: any) => {
		sent.push(message);
		return true;
	}
}));
vi.mock('$lib/websocket/storeIntegration', () => ({ flushPendingUpdate: () => {} }));

const { gameStore } = await import('../gameStore.svelte');
const { gameActions } = await import('../actions');

const facedownCard = {
	position: [0, 0, 0] as [number, number, number],
	rotation: [180, 0, 0] as [number, number, number],
	faceImageUrl: 'ace.png',
	visibility: { kind: 'hidden' as const }
};

const actionsSent = () => sent.filter((m) => m.type === 'action').map((m) => m.value);

beforeEach(() => {
	sent.length = 0;
	connected = true;
	localStorage.setItem('myPlayerId', 'me');
	gameStore.set({
		cards: { c1: { ...facedownCard } },
		players: { me: { id: 'me', seat: 0, joinTimestamp: 0, tray: {}, metadata: {} } },
		decks: {
			'deck:me:main': {
				id: 'deck:me:main',
				cards: [{ id: 'x', faceImageUrl: 'two.png' }],
				cardCount: 9
			}
		}
	});
});

describe('with a server to arbitrate', () => {
	it('asks to flip rather than flipping', () => {
		gameActions.flipCard('c1');
		expect(actionsSent()).toEqual([{ action: 'flip', id: 'c1' }]);
		// the card does not turn over until the server says so — it is holding
		// the face until then
		expect(get(gameStore).cards?.c1?.rotation).toEqual([180, 0, 0]);
	});

	it('asks to peek, and does not invent an entitlement', () => {
		gameActions.peekCard('c1');
		expect(actionsSent()).toEqual([{ action: 'peek', id: 'c1' }]);
		expect(get(gameStore).cards?.c1?.visibility).toEqual({ kind: 'hidden' });
	});

	it('grabs before dragging and drops after', () => {
		gameActions.grabObject('c1');
		gameActions.dropObject('c1');
		expect(actionsSent()).toEqual([
			{ action: 'grab', id: 'c1' },
			{ action: 'drop', id: 'c1' }
		]);
	});

	it('moves a card into the hand without writing the hand', () => {
		gameActions.moveCardToTray('c1', 'me');
		expect(actionsSent()).toEqual([{ action: 'tray', id: 'c1' }]);
		const state = get(gameStore);
		expect(state.cards?.c1).toBeUndefined(); // gone from the table immediately
		expect(state.players?.me?.tray).toEqual({}); // the hand comes from the server
	});

	it('takes a card out of the hand facedown, leaving its face behind', () => {
		gameStore.set({
			...get(gameStore),
			players: {
				me: {
					id: 'me',
					seat: 0,
					joinTimestamp: 0,
					tray: { c9: { faceImageUrl: 'king.png', backImageUrl: 'back.png' } },
					metadata: {}
				}
			}
		});

		gameActions.moveCardOutOfTray('c9', 'me', {
			position: [1, 2.5, 1],
			rotation: [180, 0, 0]
		});

		expect(actionsSent()).toEqual([
			{ action: 'untray', id: 'c9', position: [1, 2.5, 1], rotation: [180, 0, 0] }
		]);
		const card = get(gameStore).cards?.c9;
		expect(card?.faceImageUrl).toBeUndefined();
		expect(card?.backImageUrl).toBe('back.png');
		expect(card?.visibility).toEqual({ kind: 'hidden' });
	});

	it('draws by id and never touches the deck itself', () => {
		const id = gameActions.drawFromTop('deck:me:main', {
			cardId: 'card:me:opaque',
			position: [0, 2.5, 0],
			rotation: [180, 0, 0]
		});
		expect(id).toBe('card:me:opaque');
		expect(actionsSent()).toEqual([
			{
				action: 'draw',
				deckId: 'deck:me:main',
				id: 'card:me:opaque',
				position: [0, 2.5, 0],
				rotation: [180, 0, 0]
			}
		]);
		expect(get(gameStore).decks?.['deck:me:main']?.cards).toHaveLength(1);
	});

	it('counts a deck by what the server said, not by what it was sent', () => {
		expect(gameActions.getDeckLength('deck:me:main')).toBe(9);
	});

	it('shuffles server-side', () => {
		gameActions.shuffleDeck('deck:me:main');
		expect(actionsSent()).toEqual([{ action: 'shuffle', deckId: 'deck:me:main' }]);
	});
});

describe('with no server (the offline scenario editor)', () => {
	beforeEach(() => {
		connected = false;
	});

	it('flips locally and keeps the visibility model consistent', () => {
		gameActions.flipCard('c1');
		expect(actionsSent()).toEqual([]);
		expect(get(gameStore).cards?.c1?.rotation).toEqual([0, 0, 0]);
		expect(get(gameStore).cards?.c1?.visibility).toEqual({ kind: 'public' });
	});

	it('moves the card into the hand itself', () => {
		gameActions.moveCardToTray('c1', 'me');
		const state = get(gameStore);
		expect(state.cards?.c1).toBeUndefined();
		expect(state.players?.me?.tray?.c1?.faceImageUrl).toBe('ace.png');
	});

	it('carries the face across when taking a card out of the hand', () => {
		gameActions.moveCardToTray('c1', 'me');
		gameActions.moveCardOutOfTray('c1', 'me', {
			position: [1, 2.5, 1],
			rotation: [180, 0, 0]
		});
		expect(get(gameStore).cards?.c1?.faceImageUrl).toBe('ace.png');
	});

	it('draws off the local deck', () => {
		const id = gameActions.drawFromTop('deck:me:main', {
			cardId: 'card:me:local',
			position: [0, 2.5, 0],
			rotation: [180, 0, 0]
		});
		expect(id).toBe('card:me:local');
		expect(get(gameStore).cards?.['card:me:local']?.faceImageUrl).toBe('two.png');
		expect(get(gameStore).decks?.['deck:me:main']?.cards).toHaveLength(0);
	});
});
