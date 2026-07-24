# tbpp & tbps — the table.place file formats

table.place has two native file formats, both plain JSON:

| Format                              | Filename           | What it is                                                                                                     |
| ----------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------- |
| **tbpp** — table.place **pack**     | `<name>.tbpp.json` | A content library: decks (piles of cards), pieces, board overlays. What _exists_.                              |
| **tbps** — table.place **scenario** | `<name>.tbps.json` | An arrangement: where things start, which seat owns what, initial counter values. What the _table looks like_. |

"Deck" keeps its everyday meaning — one pile of cards _inside_ a pack. A pack can hold several decks (draw pile, discard, tokens-as-cards…).

The compound `.tbpp.json` / `.tbps.json` suffix keeps the brand while staying `.json` to every tool: GitHub renders them, editors validate them via the `$schema` line, `jq` doesn't care.

## In-band discriminators

Files get renamed and piped, so the _content_ identifies the format, not the filename. Every pack file carries `"tbpp": 1` and every scenario file carries `"tbps": 1` at the top level — the value is the format version. Parsers reject files without their marker (with one legacy exception, below) and files from a future version, with readable errors either way.

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

A scenario file is a saved table arrangement (`src/lib/scenario/file.ts`) plus the discriminator:

```json
{
	"$schema": "https://table.place/scenario.schema.json",
	"tbps": 1,
	"name": "duel",
	"createdAt": 1700000000000,
	"state": {
		"cards": {},
		"decks": { "deck:seat0:main": { "…": "…" } },
		"pieces": { "piece:seat0:hp-0": { "kind": "counter", "name": "HP", "value": 20 } },
		"overlays": {},
		"players": { "seat0": { "id": "seat0", "seat": 0, "tray": {} } }
	}
}
```

`state` is a `Partial<GameDTO>` snapshot (`src/lib/store/game/types.ts`). Scenarios are **seat-relative**: entities belong to placeholder players `seat0`–`seat3` (entity ids are `kind:owner:slug`), and when a real player claims a seat every id containing that placeholder is renamed to the claimer. Only placeholder players are exported — real players never leak into a scenario file.

**Legacy fallback:** exports older than tbps v1 were named `scenario-<name>.json` and have no `tbps` field. `parseScenarioFile` still accepts them (v0) — `name` + `state` is enough. New exports always write the discriminator and the `.tbps.json` name.

**tbps v1 is self-contained** — `state` inlines full card lists. Scenarios that _reference_ packs (`<pack>/<slot>/<code>` instead of inlined data) are a planned follow-up; the sizing analysis lives in issue #39.

## Versioning

The discriminator value is the format version. Breaking changes bump it (`"tbpp": 2`); parsers reject versions they don't know rather than misread them. This matches the `{tableplace: 1}` pattern from the raw-link-loading research.
