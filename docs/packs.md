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

Add the `$schema` line to a hand-written file and VS Code gives you autocomplete and inline validation for free. The app's own parsers (`parsePackFile` / `parseScenarioFile`) validate independently at import time and point at the offending field (`decks[0].cards[3].face must be a non-empty string`). Both import surfaces — the pack file picker and scenario load in `/setup` — surface those messages as toasts rather than console errors.

Generation runs as part of `bun run build`, and CI (`bun run schemas:check`) fails if regeneration produces different content than what is committed, or if a schema changed without a spec-version bump — see [Spec versioning](#spec-versioning) below. The published schemas therefore cannot drift from the types.

The schema plus this doc is the whole authoring contract — the format is deliberately small enough to hand-write, generate from a spreadsheet, or ask an LLM for.

### For third parties and LLMs

`static/llms.txt` (served at `https://table.place/llms.txt`) is a single self-contained document generated from the same sources: both schemas inlined, the face-ref grammar, the world-coordinate constants, and a worked example of each format. Someone with no access to this repo should be able to read that one URL and emit a file that imports cleanly. It is generated — edit `scripts/llms.template.md`, not the output.

The worked examples live in `src/lib/formats/examples.ts` and are driven through the real import/spawn path by `src/lib/formats/__tests__/contract.test.ts`, so a published example that stopped working fails CI.

## Stability

**tbpp (packs) is a stated contract.** Decks, pieces and overlays are implemented and round-tripped in CI. Write against it.

**tbps (scenarios) is unstable and carries no compatibility promise.** Its schema is generated from live internal types (`Partial<GameDTO>` in particular) that are still churning; it is published so the current shape is visible, not as a guarantee. See issue #39 — freezing a public scenario contract is deferred until the schema settles, and publishing the generated shape here does not freeze it.

## tbpp — packs

A pack file is a `GamePackDef` (`src/lib/packs/types.ts`) plus the discriminator:

```json
{
	"$schema": "https://table.place/pack.schema.json",
	"tbpp": 1,
	"specVersion": "1.0.0",
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

Card `face`/`back` (and piece/overlay `imageUrl`) are **refs** — tiny strings resolved to textures only at render time, so files and synced game state never carry image data. The schema can only type them as `string`, so this is the normative grammar. It is implemented by `resolveCardImage` in `src/lib/packs/resolve.svelte.ts`; exactly three schemes exist, dispatched on prefix.

**`gen:std52/<code>`** — procedurally generated on a canvas, zero image assets. `std52` is the only generator that exists; an unknown `gen:` namespace falls through to the literal-URL case and renders broken. `<code>` is either the literal `back` or a card code of **rank + suit with no separator**, suit last: suits `S`/`H`/`D`/`C`, ranks `A`, `2`–`10`, `J`, `Q`, `K` (`gen:std52/AS`, `gen:std52/10D`). This is what the built-in standard-52 pack uses.

**`sheet:<json>`** — one cell of a sprite sheet, fetched once and sliced client-side. The literal prefix `sheet:` is followed immediately by a JSON object (a JSON payload nested inside a JSON string, so it is escaped in the file). Built by `makeSheetRef`; the payload is `SheetRefPayload`:

| Field   | Type    | Required | Meaning                                                                      |
| ------- | ------- | -------- | ---------------------------------------------------------------------------- |
| `url`   | string  | yes      | the sprite sheet image                                                       |
| `cols`  | number  | yes      | columns in the sheet                                                         |
| `rows`  | number  | yes      | rows in the sheet                                                            |
| `index` | number  | yes      | 0-based cell index, row-major                                                |
| `name`  | string  | no       | card name, drawn as a text placeholder if the sheet cannot be fetched        |
| `back`  | boolean | no       | if true, fall back to the generated card back instead of a named placeholder |

Resolution is asynchronous and failure is non-fatal — an unreachable sheet falls back to a placeholder rather than breaking the table. Mostly produced by the TTS importer; prefer plain URLs when authoring by hand.

**`https://…`** — a plain image URL, creator-hosted (imgur, GitHub raw, your own site), used verbatim. table.place hosts no assets, so it must be publicly reachable, CORS-readable and hotlinkable. Any ref matching neither prefix above is treated as a literal URL.

The built-in `STANDARD_52` pack (`src/lib/packs/standard52.ts`) is the canonical example: 52 cards, all `gen:` faces, serialized it is a valid tbpp file.

### TTS is an import boundary, not part of the spec

`ttsToPack` (`src/lib/tts/to-pack.ts`) converts a parsed Tabletop Simulator Saved Object into a `GamePackDef`: TTS decks become pack decks, sprite-sheet cells become `sheet:` refs (whole images become plain URLs), loose cards group into a face-up `Loose Cards` pile, tiles/pawns/health-dials become pieces, and the result is stamped `source: "tts"`. "Backwards compatible with TTS" means the importer accepts TTS JSON and every TTS concept maps into pack primitives — TTS mechanics (CardID math, `CustomDeck` sheets, Lua scripts) never appear in tbpp itself.

## tbps — scenarios

A scenario file is a saved table arrangement (`src/lib/scenario/file.ts`) plus the discriminator. A pack says what content _is_; a scenario says _where it goes_:

```json
{
	"$schema": "https://table.place/scenario.schema.json",
	"tbps": 2,
	"specVersion": "0.1.0",
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

### Spec versioning

Alongside the discriminator, every emitted document carries **`specVersion`** — the semver of the spec revision it was authored against (`src/lib/formats/spec-version.ts`). The two answer different questions: the discriminator says _which format and container shape_ this is, `specVersion` says _which revision of the rules_ produced it, finely enough to tell an additive change from a breaking one.

Schema-side metadata is not a substitute. A schema can say what the current spec is; only the document can say what it was written against, and it is the documents that escape into the wild.

`specVersion` is **optional on read** — files exported before it existed still validate and still import — and **always written on export**. `parsePackFile` / `parseScenarioFile` judge readability from the document's declared version:

| Declared                       | Result                                                        |
| ------------------------------ | ------------------------------------------------------------- |
| absent                         | accepted — predates spec versioning                           |
| older                          | accepted; keeping old files readable is the point             |
| newer, same breaking component | accepted — additive by convention, unknown fields are ignored |
| newer breaking component       | rejected, with a message naming the tag that schema lives at  |

The breaking component is the major, except under `0.x` where semver makes the minor breaking — which is why the scenario spec sits at `0.x`.

### Schema provenance

Both generated schemas carry three annotation keywords:

- `x-tableplace-spec-version` — the semver above.
- `x-generated-at` — ISO timestamp of generation.
- `x-tableplace-source-sha` — **the commit the schema was generated _from_**, not the commit that contains it. A file cannot contain the hash of the commit that introduces it, so this is necessarily an ancestor — normally the parent of the commit that ships the file. Read it as "generated from the tree at". A `-dirty` suffix means the tree had uncommitted changes at generation time.

`x-generated-at` and `x-tableplace-source-sha` are **excluded** from CI's comparison (`scripts/check-schemas.ts`): the timestamp changes on every run and the sha always differs between the committed value and a CI regeneration, so comparing either would make the check fail constantly and train everyone to ignore it.

Note for consumers: ajv's strict mode rejects unknown keywords, so validating these schemas needs `new Ajv({ strict: false })` or an `addVocabulary` call. Most validators ignore unknown keywords as the spec intends.

### Release convention

On a version bump the schema is tagged **`spec/pack/vX.Y.Z`** / **`spec/scenario/vX.Y.Z`**, so an older schema stays fetchable at its tag after `static/` moves on.

- **Major** — a breaking change: a field removed, renamed, or made required (a required-tightening rejects documents that were previously valid).
- **Minor** — an additive change: a new optional field.

CI enforces the bump: `bun run schemas:check --base <ref>` fails if a schema's content changed against the base branch without `x-tableplace-spec-version` changing.

## Known gaps

Open questions the format deliberately does **not** answer yet. They are listed rather than silently decided, because guessing here would bake a policy into a published contract (tableplace-78, CONTENT_CREATION.md). A file that invents syntax for any of them fails validation.

- **Card multiplicity.** `PackCardDef` has no `count`. Three copies of a card means three entries with distinct `code`s (`strike-1`, `strike-2`, …), because `code` is the per-deck identity that scenario `order` arrays reference. Whether multiplicity becomes a first-class field — and what it would do to `order` — is undecided.
- **Pack content versioning.** `tbpp` versions the _format_, not the pack. A pack cannot declare "Ember Duel v1.2", and there is no upgrade story for a pack whose cards changed underneath a scenario that references it by URL.
- **`id` collision policy across authors.** Pack `id` is a bare string with no namespacing, registry, or ownership check. Two authors can both ship `ember-duel`, and `resolve-packs.ts` only warns when a fetched pack's `id` disagrees with the ref. Until this is decided, the practical advice is a distinctive `id` plus a `source` URL you control.

`GamePackDef` also does not carry a board/table definition (SPEC §4d mentions one); overlays are the closest thing today.
