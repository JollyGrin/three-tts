/// <reference types="bun-types" />
/**
 * Seed a live lobby with a scenario, from a terminal.
 *
 *   bun run seed-lobby --lobby brave-otter --server localhost:8080 --scenario duel.tbps.json
 *
 * Resolve the scenario's packs → compose the table (`src/lib/compose/`) → open
 * a websocket as a throwaway player → send the same per-deck patches a browser
 * would → disconnect. Players then do nothing but open
 * `/play?lobby=<lobby>&seat=<n>` and claim a seat.
 *
 * This is the whole point of the composer: no browser, no Svelte store, no
 * second implementation of the entity-id grammar. A provisioning API only has
 * to call this path, not invent it.
 *
 * Two consequences worth knowing (see issue #39, deliberately not solved here):
 * the seeder is a real client, so its disconnect is a normal empty transition
 * and an unopened lobby is garbage-collected after the server's 15-minute idle
 * TTL; and lobby state is in-memory, so a server restart drops it.
 */

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { composeScenario } from '../src/lib/compose/scenario';
import { BUILTIN_PACKS, PACK_SOURCE_BUILTIN } from '../src/lib/packs/builtin';
import { parsePackFile } from '../src/lib/packs/file';
import { PACK_SOURCE_LOCAL } from '../src/lib/packs/library';
import { parseScenarioFile } from '../src/lib/scenario/file';
import { randomLobbyName } from '../src/lib/utils/lobby-name';
import type { PackRef, Scenario } from '../src/lib/scenario/file';
import type { GamePackDef } from '../src/lib/packs/types';
import type { GameDTO } from '../src/lib/store/game/types';

const USAGE = `Seed a lobby with a scenario file.

  bun run seed-lobby --scenario <file.tbps.json> [options]

Options
  --scenario <file>  tbps scenario to lay out                    (required)
  --lobby <slug>     lobby to seed; a random name if omitted
  --server <host>    lobby server host[:port]                    (localhost:8080)
  --pack <file>      a .tbpp.json to resolve a pack ref against; repeatable.
                     Needed for refs the scenario marks 'local' — those live in
                     a browser's library, which a terminal cannot read.
  --player <id>      websocket player id to seed as     (seed-<random>)
  --dry-run          compose and print a summary, connect to nothing
  --help             this

The seeded table is authored for the placeholder seats seat0…seat3; a player
claims one by opening /play?lobby=<slug>&seat=<n>.`;

type Options = {
	scenario?: string;
	lobby: string;
	server: string;
	packFiles: string[];
	player: string;
	dryRun: boolean;
	help: boolean;
};

function parseArgs(argv: string[]): Options {
	const opts: Options = {
		lobby: '',
		server: 'localhost:8080',
		packFiles: [],
		player: `seed-${Math.random().toString(36).slice(2, 8)}`,
		dryRun: false,
		help: false
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const value = () => {
			const next = argv[++i];
			if (next === undefined) throw new Error(`${arg} needs a value`);
			return next;
		};
		switch (arg) {
			case '--scenario':
				opts.scenario = value();
				break;
			case '--lobby':
				opts.lobby = value();
				break;
			case '--server':
				opts.server = value();
				break;
			case '--pack':
				opts.packFiles.push(value());
				break;
			case '--player':
				opts.player = value();
				break;
			case '--dry-run':
				opts.dryRun = true;
				break;
			case '--help':
			case '-h':
				opts.help = true;
				break;
			default:
				throw new Error(`unknown argument '${arg}'`);
		}
	}
	return opts;
}

/** 'localhost:8080', 'https://host/', 'wss://host' → `ws(s)://host/ws` */
function websocketUrl(server: string, lobby: string, player: string): string {
	const host = server
		.trim()
		.replace(/^(https?|wss?):\/\//, '')
		.replace(/\/+$/, '');
	const scheme = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'ws' : 'wss';
	return `${scheme}://${host}/ws?lobby=${encodeURIComponent(lobby)}&player=${encodeURIComponent(player)}`;
}

/**
 * Resolve a scenario's pack refs without a browser.
 *
 * Same three sources `scenario/resolve-packs.ts` has, re-pointed at a
 * filesystem: the shipped builtin registry, a URL fetch, and `--pack` files
 * standing in for the browser's local library. A `source` that is neither
 * 'builtin'/'local' nor a URL is read as a path relative to the scenario, so a
 * scenario and its packs can sit side by side in a directory.
 */
async function resolvePacksFromDisk(
	refs: PackRef[],
	fromDisk: Map<string, GamePackDef>,
	baseDir: string
): Promise<{ packs: Map<string, GamePackDef>; failed: { id: string; reason: string }[] }> {
	const packs = new Map<string, GamePackDef>();
	const failed: { id: string; reason: string }[] = [];

	for (const ref of refs) {
		// a --pack file wins over everything: it is the operator saying, for this
		// run, exactly which bytes this id means
		const supplied = fromDisk.get(ref.id);
		if (supplied) {
			packs.set(ref.id, supplied);
			continue;
		}
		if ((!ref.source || ref.source === PACK_SOURCE_BUILTIN) && BUILTIN_PACKS[ref.id]) {
			packs.set(ref.id, BUILTIN_PACKS[ref.id]);
			continue;
		}
		if (!ref.source || ref.source === PACK_SOURCE_LOCAL) {
			failed.push({
				id: ref.id,
				reason: `no builtin pack '${ref.id}' — pass it with --pack <file.tbpp.json>`
			});
			continue;
		}
		try {
			const text = /^https?:\/\//.test(ref.source)
				? await fetch(ref.source).then((r) => {
						if (!r.ok) throw new Error(`HTTP ${r.status}`);
						return r.text();
					})
				: await readFile(resolve(baseDir, ref.source), 'utf8');
			packs.set(ref.id, parsePackFile(text));
		} catch (error) {
			failed.push({ id: ref.id, reason: error instanceof Error ? error.message : String(error) });
		}
	}
	return { packs, failed };
}

type Patch = Record<string, Record<string, unknown>>;

const COLLECTIONS = ['cards', 'pieces', 'overlays', 'snapPoints', 'players'] as const;

/**
 * The patches that turn whatever is in the lobby now into the composed table.
 *
 * Mirrors `applyScenario`: nulls for the current contents ride the first patch
 * (real players survive — only the seat placeholders are ours to clear), then
 * one patch per deck. Decks carry full card lists and a single all-in-one
 * update can blow past the server's 1 MB websocket read limit, after which the
 * server silently drops the whole seed.
 */
function seedPatches(composed: Partial<GameDTO>, current: Partial<GameDTO> | undefined): Patch[] {
	const clear: Patch = {
		cards: {},
		decks: {},
		pieces: {},
		overlays: {},
		snapPoints: {},
		players: {}
	};
	for (const collection of ['cards', 'decks', 'pieces', 'overlays', 'snapPoints'] as const) {
		for (const key of Object.keys(current?.[collection] ?? {})) clear[collection][key] = null;
	}
	for (const key of Object.keys(current?.players ?? {})) {
		if (/^seat[0-3]$/.test(key)) clear.players[key] = null;
	}
	for (const collection of COLLECTIONS) {
		Object.assign(clear[collection], composed[collection] ?? {});
	}

	const patches: Patch[] = [clear];
	for (const [id, deck] of Object.entries(composed.decks ?? {})) {
		patches.push({ decks: { [id]: deck as Record<string, unknown> } });
	}
	return patches;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Send every patch over one socket and hang up.
 *
 * Paced at 160 ms: the server rate-limits a client to 7 messages/second with a
 * burst of 15 and *disconnects* whoever exceeds it (server/lobby/lobby.go), so
 * a big scenario would otherwise be cut off halfway through its own seed.
 */
async function seedOverWebsocket(url: string, playerId: string, composed: Partial<GameDTO>) {
	const socket = new WebSocket(url);
	let synced: Partial<GameDTO> | undefined;

	await new Promise<void>((ok, fail) => {
		socket.addEventListener('open', () => ok(), { once: true });
		socket.addEventListener('error', () => fail(new Error(`could not connect to ${url}`)), {
			once: true
		});
	});

	// the server syncs the lobby's current state to every joiner; that snapshot
	// is what tells us which entities the seed has to clear out
	socket.addEventListener('message', (event) => {
		try {
			const message = JSON.parse(String(event.data));
			if (message?.type === 'sync') synced = message.value as Partial<GameDTO>;
		} catch {
			// a message we don't understand is not our problem — we only send
		}
	});

	const send = (value: unknown) =>
		socket.send(JSON.stringify({ type: 'update', playerId, timestamp: Date.now(), value }));

	socket.send(JSON.stringify({ type: 'connect', playerId, timestamp: Date.now() }));
	// give the sync a moment to arrive before deciding what to clear
	await sleep(300);

	const patches = seedPatches(composed, synced);
	for (const patch of patches) {
		send(patch);
		await sleep(160);
	}

	socket.close(1000, 'seeded');
	return patches.length;
}

function summarize(composed: Partial<GameDTO>) {
	const decks = Object.keys(composed.decks ?? {});
	const cards = decks.reduce((n, id) => n + (composed.decks?.[id]?.cards?.length ?? 0), 0);
	return {
		decks: decks.length,
		cards: cards + Object.keys(composed.cards ?? {}).length,
		pieces: Object.keys(composed.pieces ?? {}).length,
		overlays: Object.keys(composed.overlays ?? {}).length,
		snapPoints: Object.keys(composed.snapPoints ?? {}).length,
		seats: Object.keys(composed.players ?? {}).filter((id) => /^seat[0-3]$/.test(id))
	};
}

async function main() {
	const opts = parseArgs(process.argv.slice(2));
	if (opts.help) return console.log(USAGE);
	if (!opts.scenario) {
		console.error('--scenario is required\n');
		console.error(USAGE);
		process.exitCode = 1;
		return;
	}

	const path = resolve(process.cwd(), opts.scenario);
	const scenario: Scenario = parseScenarioFile(await readFile(path, 'utf8'));

	const fromDisk = new Map<string, GamePackDef>();
	for (const file of opts.packFiles) {
		const pack = parsePackFile(await readFile(resolve(process.cwd(), file), 'utf8'));
		fromDisk.set(pack.id, pack);
	}

	const { packs, failed } = await resolvePacksFromDisk(
		scenario.packs ?? [],
		fromDisk,
		dirname(path)
	);
	for (const { id, reason } of failed) {
		console.error(`✗ pack '${id}': ${reason}`);
	}

	const composed = composeScenario(scenario, packs);
	const counts = summarize(composed);
	const lobby = opts.lobby || randomLobbyName();

	console.log(`scenario  ${scenario.name} (${opts.scenario})`);
	console.log(
		`packs     ${packs.size} resolved${failed.length ? `, ${failed.length} failed` : ''}`
	);
	console.log(
		`table     ${counts.decks} decks · ${counts.cards} cards · ${counts.pieces} pieces · ${counts.overlays} overlays · ${counts.snapPoints} snap points`
	);
	console.log(`seats     ${counts.seats.join(', ') || 'none'}`);

	if (opts.dryRun) {
		console.log('\n--dry-run: nothing was sent.');
		return;
	}
	// a scenario whose packs all failed would "seed" an empty table over
	// whatever is already there — refuse rather than wipe a live lobby
	if (failed.length && packs.size === 0 && (scenario.placements?.length ?? 0) > 0) {
		console.error('\nNo pack resolved — refusing to seed an empty table.');
		process.exitCode = 1;
		return;
	}

	const url = websocketUrl(opts.server, lobby, opts.player);
	const sent = await seedOverWebsocket(url, opts.player, composed);
	console.log(`\nseeded ${lobby} on ${opts.server} in ${sent} patches`);
	for (const seat of counts.seats) {
		console.log(`  /play?lobby=${lobby}&seat=${seat.slice(4)}`);
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
