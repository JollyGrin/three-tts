/**
 * Scenario presets: save a fully arranged table (both seats' decks, map
 * overlay, pieces) to localStorage, then seed a live lobby with it so a
 * shared lobby can start playing immediately.
 *
 * Scenarios are seat-relative. In the /setup editor, entities are owned by
 * placeholder players (`seat0`, `seat1`, …) — entity ids are `kind:owner:slug`.
 * When a real player claims a seat in a lobby, every entity id containing that
 * placeholder owner is renamed to the claimer's id, and the placeholder's
 * seat + tray move onto the claiming player.
 */

import { get } from 'svelte/store';
import { gameStore } from '$lib/store/game/gameStore.svelte';
import { gameActions } from '$lib/store/game/actions';
import { prewarmGameState } from '$lib/packs/prewarm-state';
import type { GameDTO } from '$lib/store/game/types';

const STORAGE_KEY = 'scenarios:v1';

export type SeatIndex = 0 | 1 | 2 | 3;
type StateUpdate = Parameters<typeof gameStore.updateState>[0];

export const seatPlaceholderId = (seat: SeatIndex) => `seat${seat}`;
export const isSeatPlaceholder = (id: string) => /^seat[0-3]$/.test(id);

export type Scenario = {
	name: string;
	createdAt: number;
	state: Partial<GameDTO>;
};

function readAll(): Record<string, Scenario> {
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
	} catch {
		return {};
	}
}

function writeAll(all: Record<string, Scenario>) {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function listScenarios(): Scenario[] {
	return Object.values(readAll()).sort((a, b) => b.createdAt - a.createdAt);
}

export function getScenario(name: string): Scenario | undefined {
	return readAll()[name];
}

export function deleteScenario(name: string) {
	const all = readAll();
	delete all[name];
	writeAll(all);
}

/**
 * Snapshot the current table as a scenario. Real players (and their trays)
 * are NOT saved — only placeholder seat players survive, so the preset stays
 * portable to any future lobby.
 */
export function saveScenario(name: string): Scenario {
	const s = get(gameStore);
	const players: GameDTO['players'] = {};
	for (const [id, player] of Object.entries(s?.players ?? {})) {
		if (isSeatPlaceholder(id)) players[id] = player as GameDTO['players'][string];
	}
	const scenario: Scenario = {
		name,
		createdAt: Date.now(),
		state: {
			cards: s?.cards ?? {},
			decks: s?.decks ?? {},
			pieces: s?.pieces ?? {},
			overlays: s?.overlays ?? {},
			players
		}
	};
	const all = readAll();
	all[name] = scenario;
	writeAll(all);
	return scenario;
}

/** Placeholder players hold a seat's tray + seat index until a real player claims them. */
export function ensureSeatPlaceholder(seat: SeatIndex) {
	const id = seatPlaceholderId(seat);
	if (get(gameStore)?.players?.[id]) return;
	gameStore.updateState({
		players: { [id]: { id, seat, joinTimestamp: 0, tray: {}, metadata: {} } }
	});
}

/**
 * Replace the table contents with a scenario. Goes through updateState, so on
 * /play (ws-wrapped) it broadcasts to the whole lobby. Real player entries are
 * kept. Sheet refs are prewarmed locally, then a re-render sweep repaints.
 *
 * Sent as several messages, one per deck: decks carry full card lists, and a
 * single all-in-one update can blow past the server's websocket read limit —
 * the server then silently drops the whole seed and joiners sync stale state.
 */
export function applyScenario(scenario: Scenario) {
	const current = get(gameStore);
	const update: Record<string, Record<string, unknown>> = {
		cards: {},
		decks: {},
		pieces: {},
		overlays: {},
		players: {}
	};
	// clear the current table (placeholder players included; real players stay)
	for (const collection of ['cards', 'decks', 'pieces', 'overlays'] as const) {
		for (const key of Object.keys(current?.[collection] ?? {})) update[collection][key] = null;
	}
	for (const key of Object.keys(current?.players ?? {})) {
		if (isSeatPlaceholder(key)) update.players[key] = null;
	}
	// small payloads ride with the clear — direct assignment overwrites the
	// null for reused keys
	for (const collection of ['cards', 'pieces', 'overlays', 'players'] as const) {
		for (const [key, value] of Object.entries(scenario.state?.[collection] ?? {})) {
			update[collection][key] = value;
		}
	}
	gameStore.updateState(update as StateUpdate);
	// each deck in its own message
	for (const [key, value] of Object.entries(scenario.state?.decks ?? {})) {
		gameStore.updateState({ decks: { [key]: value } } as StateUpdate);
	}
	prewarmGameState(scenario.state, () => gameStore.updateStateSilently({}));
}

/** ids are `kind:owner:slug` — swap the owner segment */
function renameOwner(key: string, from: string, to: string): string {
	return key
		.split(':')
		.map((part) => (part === from ? to : part))
		.join(':');
}

/**
 * Claim a placeholder seat as the local player: the seat index + tray move
 * onto my player, and every entity owned by the placeholder is renamed to my
 * id so ownership-based UI (deck panes) follows. No-op if already claimed.
 */
export function claimSeat(seat: SeatIndex): boolean {
	const myId = gameActions.getMyId();
	if (!myId) return false;
	const placeholder = seatPlaceholderId(seat);
	const s = get(gameStore);
	const ph = s?.players?.[placeholder];
	if (!ph) return false;

	// decks first, one message each — full card lists must stay under the
	// server's websocket read limit
	for (const [key, value] of Object.entries(s?.decks ?? {})) {
		if (!key.includes(`:${placeholder}:`)) continue;
		const newKey = renameOwner(key, placeholder, myId);
		gameStore.updateState({
			decks: { [key]: null, [newKey]: { ...(value as object), id: newKey } }
		} as StateUpdate);
	}
	const update: Record<string, Record<string, unknown>> = { players: {}, cards: {}, pieces: {} };
	for (const collection of ['cards', 'pieces'] as const) {
		for (const [key, value] of Object.entries(s?.[collection] ?? {})) {
			if (!key.includes(`:${placeholder}:`)) continue;
			update[collection][renameOwner(key, placeholder, myId)] = value;
			update[collection][key] = null;
		}
	}
	update.players[placeholder] = null;
	update.players[myId] = { seat, tray: ph?.tray ?? {} };
	gameStore.updateState(update as StateUpdate);
	return true;
}

export function exportScenarioToFile(scenario: Scenario) {
	const blob = new Blob([JSON.stringify(scenario, null, '\t')], { type: 'application/json' });
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = `scenario-${scenario.name}.json`;
	a.click();
	URL.revokeObjectURL(a.href);
}

/** Parse a scenario file and store it. Returns the saved scenario. */
export function importScenarioFromText(text: string): Scenario {
	const parsed = JSON.parse(text);
	if (!parsed || typeof parsed !== 'object' || typeof parsed.name !== 'string' || !parsed.state) {
		throw new Error('Not a scenario file');
	}
	const scenario: Scenario = {
		name: parsed.name,
		createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
		state: parsed.state
	};
	const all = readAll();
	all[scenario.name] = scenario;
	writeAll(all);
	return scenario;
}
