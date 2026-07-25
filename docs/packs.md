# tbpp & tbps — the table.place file formats

table.place has two native file formats, both plain JSON:

| Format                              | Filename           | What it is                                                                                                     |
| ----------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------- |
| **tbpp** — table.place **pack**     | `<name>.tbpp.json` | A content library: decks (piles of cards), pieces, board overlays. What _exists_.                              |
| **tbps** — table.place **scenario** | `<name>.tbps.json` | An arrangement: where things start, which seat owns what, initial counter values. What the _table looks like_. |

"Deck" keeps its everyday meaning — one pile of cards _inside_ a pack. A pack can hold several decks (draw pile, discard, tokens-as-cards…).

The compound `.tbpp.json` / `.tbps.json` suffix keeps the brand while staying `.json` to every tool: GitHub renders them, editors validate them via the `$schema` line, `jq` doesn't care.

## In-band discriminators

Files get renamed and piped, so the _content_ identifies the format, not the filename. Every pack file carries `"tbpp": 1` and every scenario file carries `"tbps": 1` or `"tbps": 2` at the top level — the value is the format version. Parsers reject files without their marker (with one legacy exception, below) and files from a future version, with readable errors either way.

## Validation

JSON Schemas are generated from the TypeScript types (`bun run schemas` → `static/`) and served by the deployed site:

- `https://table.place/pack.schema.json`
- `https://table.place/scenario.schema.json`

Add the `$schema` line to a hand-written file and VS Code gives you autocomplete and inline validation for free. The app's own parsers (`parsePackFile` / `parseScenarioFile`) validate independently at import time and point at the offending field (`decks[0].cards[3].face must be a non-empty string`).

The schema plus this doc is the whole authoring contract — the format is deliberately small enough to hand-write, generate from a spreadsheet, or ask an LLM for.

## tbpp — packs

A pack file is a `GamePackDef` (`src/lib/packs/types.ts`) plus the discriminator:

```json
{
	"$schema": "https://table.place/pack.schema.json",
	"tbpp": 1,
	"id": "my-proto",
	"name": "My Prototype",
	"scope": "player",
	"decks": [
		{
			"slot": "main",
			"name": "Draw Pile",
			"back": "https://example.com/cards/back.png",
			"cards": [
				{ "code": "strike", "name": "Strike", "face": "https://example.com/cards/strike.png" },
				{ "code": "guard", "name": "Guard", "face": "https://example.com/cards/guard.png" }
			]
		}
	]
}
```

Field notes:

- **`id`** — stable identity for the pack (`standard-52`, `imported:<slug>`…).
- **`scope`** — `'table'` (the shared game: board, communal decks; loaded once per lobby by the host) or `'player'` (what one player brings, spawned per seat — a deck-builder export is a player pack). See SPEC.md §4d.
- **`decks[].slot`** — stable id within the pack; **`cards[].code`** — stable id within the deck. Both survive re-exports, so external tools can reference cards as `<pack>/<slot>/<code>`.
- **`pieces`** (optional) — tokens, pawns, and counters: `{ kind: 'token'|'pawn'|'counter', name, color?, imageUrl?, radius?, maxValue?, position: [x, z] }`.
- **`overlays`** (optional) — board/map images: `{ imageUrl, ratio, scale }` (`ratio` = width/height).
- **`source`** (optional) — provenance stamp written by converters (currently only `"tts"`). Native packs omit it.

### Face refs

Card `face`/`back` (and piece/overlay `imageUrl`) are **refs** — tiny strings resolved to textures only at render time, so files and synced game state never carry image data:

- `https://…` — plain image URL, creator-hosted (imgur, GitHub raw, your own site). table.place hosts no assets.
- `gen:std52/<code>` — procedurally generated client-side (e.g. `gen:std52/AS`, `gen:std52/back`). Zero image assets; used by the built-in standard-52 pack.
- `sheet:{"url":…,"cols":…,"rows":…,"index":…}` — one cell of a sprite sheet, sliced client-side. Mostly produced by the TTS importer.

The built-in `STANDARD_52` pack (`src/lib/packs/standard52.ts`) is the canonical example: 52 cards, all `gen:` faces, serialized it is a valid tbpp file.

### TTS is an import boundary, not part of the spec

`ttsToPack` (`src/lib/tts/to-pack.ts`) converts a parsed Tabletop Simulator Saved Object into a `GamePackDef`: TTS decks become pack decks, sprite-sheet cells become `sheet:` refs (whole images become plain URLs), loose cards group into a face-up `Loose Cards` pile, tiles/pawns/health-dials become pieces, and the result is stamped `source: "tts"`. "Backwards compatible with TTS" means the importer accepts TTS JSON and every TTS concept maps into pack primitives — TTS mechanics (CardID math, `CustomDeck` sheets, Lua scripts) never appear in tbpp itself.

## tbps — scenarios

A scenario file is a saved table arrangement (`src/lib/scenario/file.ts`) plus the discriminator. A pack says what content _is_; a scenario says _where it goes_:

```json
{
	"$schema": "https://table.place/scenario.schema.json",
	"tbps": 2,
	"name": "duel",
	"createdAt": 1700000000000,
	"packs": [{ "id": "standard-52", "source": "builtin" }],
	"placements": [
		{
			"kind": "deck",
			"pack": "standard-52",
			"content": "main",
			"seat": 0,
			"position": [8.5, 0.4, 4.5],
			"isFaceUp": false,
			"order": ["7H", "AS", "2C", "KD", "10S"]
		}
	],
	"state": {
		"pieces": { "piece:seat0:hp-0": { "kind": "counter", "name": "HP", "value": 20 } }
	}
}
```

Scenarios are **seat-relative**: entities belong to placeholder players `seat0`–`seat3` (entity ids are `kind:owner:slug`), and when a real player claims a seat every id containing that placeholder is renamed to the claimer. Only placeholder players are exported — real players never leak into a scenario file.

### packs + placements (v2)

- **`packs`** — every pack the scenario draws from: `{ id, source? }`. `source` is `"builtin"` (shipped with the app, e.g. `standard-52`) or a URL a `.tbpp.json` can be fetched from. That's enough to re-resolve the content, so the cards themselves are never copied into the scenario.
- **`placements`** — one entry per spawned thing: `{ kind, pack, content, seat?, position?, rotation?, … }`.
  - **`kind`** — `'deck' | 'piece' | 'overlay'`.
  - **`content`** — the deck's `slot`, or the index into the pack's `pieces`/`overlays`. With `packs[].id` this is the `<pack>/<slot>` addressing from the pack section.
  - **`seat`** — which placeholder owns the result (`0`–`3`). Omitted for table-scoped overlays.
  - **`order`** (decks) — the authored card sequence as pack card `code`s. **A scenario preserves card order by default**: an encounter deck, a rigged opening, a tutorial setup all reload exactly as saved. It is a list of ids, never card bodies, so referencing the pack stays the point.
  - **`shuffleOnLoad`** (decks, default `false`) — reshuffle on load instead of restoring `order`. It is **per placement**, so one scenario can hold a fixed stacked encounter deck _and_ a shuffled draw deck side by side.
  - **`isFaceUp`** (decks), **`value`** (counter pieces), **`scale`** (overlays) — arrangement details that override the pack's defaults.
- **`state`** — a `Partial<GameDTO>` snapshot (`src/lib/store/game/types.ts`) for everything _not_ pack-derived: ad-hoc pieces, hand-placed cards, TTS-imported decks. It is applied on top of the spawned placements, so it can also override them.

Export decides per entity: content carrying pack provenance (a `packOrigin` stamp, written by `spawnPack`) becomes a pack ref + placement; everything else falls back to the raw snapshot. A table with no pack content at all still exports as **v1**.

### Versions

| Version | Shape                                                | Written by                     |
| ------- | ---------------------------------------------------- | ------------------------------ |
| **v2**  | `packs` + `placements` (+ `state` for the remainder) | tables containing pack content |
| **v1**  | self-contained `state` snapshot, cards inlined       | hand-placed / TTS-only tables  |
| **v0**  | legacy `scenario-<name>.json`, no `tbps` field       | historical exports             |

All three load. `parseScenarioFile` accepts v0 (`name` + `state` is enough) and v1 unchanged, so existing files keep working; new exports always write the discriminator and the `.tbps.json` name. Loading v1/v0 applies the snapshot exactly as before — only v2 resolves packs first.

Sizing analysis for public/remote scenario seeding lives in issue #39: pack refs are what make a fetchable scenario small enough to be practical.

## Versioning

The discriminator value is the format version. Breaking changes bump it (`"tbpp": 2`); parsers reject versions they don't know rather than misread them. This matches the `{tableplace: 1}` pattern from the raw-link-loading research.
