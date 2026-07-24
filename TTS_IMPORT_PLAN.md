# TTS JSON Importer — Implementation Plan

Goal: users drop a Tabletop Simulator save/mod JSON (`tts.json`) into the app and play it in the browser, instead of TTS.

Strategy: build the importer as a **translation layer** — TTS `ObjectStates` → the existing `GameDTO`/gameStore. The scene, card interactions, tray, and multiplayer sync all stay as they are. Nothing in the current 3D/sync stack gets scrapped.

## Scope ladder

| Tier | TTS object types | Treatment |
|---|---|---|
| 1 (MVP) | `Deck`/`DeckCustom`, `Card`/`CardCustom`, `Custom_Board` | Full support |
| 2 | `Custom_Token`, `Custom_Tile`, `Figurine_Custom`, `Bag`/`Infinite_Bag` | Full support (new Token entity) |
| 3 | `Custom_Model` (OBJ), built-ins (dice, chips, pawns) | OBJLoader + primitive stand-ins |
| 4 (never inline) | `Custom_Assetbundle`, `LuaScript`, `XmlUI` | Labeled placeholder proxy; scripts ignored |

Every unsupported object still imports as a movable placeholder (box with `Nickname` + `ColorDiffuse` tint) — a file never fails to load.

---

## Phase 1 — Parser core (`src/lib/tts/`)

Pure TypeScript, no rendering. Fully unit-testable.

- **`types.ts`** — TTS save-format types. Vendor from [matanlurey/tts-save-format](https://github.com/matanlurey/tts-save-format) (TS defs generated from JSON Schema) rather than hand-writing.
- **`urls.ts`** — asset URL normalization:
  - Rewrite dead host: `http(s)://cloud-3.steamusercontent.com/ugc/` → `https://steamusercontent-a.akamaihd.net/ugc/` (most workshop files still carry the dead host; verified the akamaihd host serves `Access-Control-Allow-Origin: *`).
  - Force https; collect every URL into a manifest for the health check (Phase 4).
- **`coords.ts`** — Unity (left-handed, Y-up, Euler Z-X-Y, degrees) → three.js (right-handed): negate Z position, mirror rotations, radians. Plus a single scene-scale constant mapping TTS table units onto our table dimensions. Round-trip unit tests.
- **`cards.ts`** — the deck math:
  - `CardID` decode: `sheetKey = floor(id / 100)` (string key into `CustomDeck`), `cellIndex = id % 100`.
  - Sheet geometry: `NumWidth` cols × `NumHeight` rows, row-major, index 0 = top-left.
  - Back rules: `UniqueBack` (back is also a sheet, same index), `BackIsHidden`, last-cell-is-hidden convention.
- **`parse.ts`** — walk `ObjectStates` (recursing into `ContainedObjects` for bags/decks), emit a normalized intermediate model (`TtsEntity[]` discriminated union: `deck | card | board | token | tile | model | placeholder`) + an import report (counts per tier, unsupported list, asset manifest).

**Tests:** vitest fixtures from 2–3 real workshop JSONs (small card game, one with tokens/tiles, one with assetbundles). Assert decode, ordering (`DeckIDs` top-first), coordinate conversion.

## Phase 2 — Sprite sheets → existing Card/Deck rendering

The gap: `CardDTO.faceImageUrl` is one image per card; TTS faces live in up-to-10×7 sprite sheets.

**v1: client-side slicing (no changes to `Card.svelte`).** Fetch sheet with `crossOrigin: "anonymous"` (akamaihd CORS is open, so canvas isn't tainted), draw each cell to canvas, `toBlob` → object URL, cache keyed by `sheetUrl + cellIndex` so duplicated cards share one blob. `TtsEntity` decks then map straight onto `DeckDTO`/`CardInDeck` with `faceImageUrl`/`backImageUrl` — the exact shape `convertDeckToGameDTO` already produces for Sorcery.

**v2 (perf, later):** UV-atlas rendering — extend `CardDTO` with optional `{sheetUrl, cols, rows, index}` and teach `Card.svelte` texture offset/repeat, so a 60-card deck shares one GPU texture. Only if slicing shows real memory/load cost; only the top card of a deck renders today, so v1 likely holds for a while.

Deliverable checkpoint: **a real workshop deck JSON dropped on the table, drawable/flippable, correct faces and backs.**

## Phase 3 — Boards, tokens, tiles, standees

- `Custom_Board` → existing **`OverlayDTO`** (imageUrl + ratio + scale + transform) — already built.
- New **`TokenDTO`** in `GameDTO` (`tokens: Record<string, Partial<TokenDTO>>`): `{ position, rotation, imageUrl, shape: 'circle'|'hex'|'box'|'rounded'|'silhouette', thickness, scale }`. New `Token.svelte` — flat extruded geometry with the image on top (alpha-silhouette extrusion is a later nicety; a textured cylinder/box reads fine). Reuse Card.svelte's drag/raycast pattern.
- `Figurine_Custom` → vertical standee plane (same Token pattern, upright).
- `Bag` → token-like object; clicking lists `ContainedObjects` (reuse deck-draw interaction).
- **Sync note:** new top-level `GameDTO` keys must flow through `storeIntegration` broadcasts and the Go server's generic JSON merge — expected to be transparent (merge is schema-agnostic), but add a two-client test.
- New gameStore **actions** file `actions/token.ts` mirroring `card.ts`.

## Phase 4 — Import UX (`/import` or drop target on the table route)

1. Drag-and-drop / file picker for `.json` (saves can be multi-MB — parse in a worker if needed).
2. **Import report screen** before loading: n decks / n cards / n tokens supported, n placeholders, asset health (parallel `HEAD`-style probes; flag dead links — link rot is the #1 real-world failure).
3. "Load to table" → mapped `GameDTO` merged into gameStore via existing actions → broadcast to lobby.
4. TTS `Hands` zones → seat mapping suggestion (hand transforms → our 4 seats + tray).

## Phase 5 — Tier-3 fidelity (after MVP proves out)

- `Custom_Model`: three.js `OBJLoader` (+ `DiffuseURL` texture); ignore `ColliderURL` — no physics dependency (Rapier is currently inert anyway).
- Built-in primitives: small library (d4–d20 polyhedra, cylinder chips, pawn) keyed by `Name`.
- Snap points (`SnapPoints` / `AttachedSnapPoints`) → snap-on-drop.
- Asset caching proxy (R2/worker keyed by UGC id) to fight link rot; also unlocks non-CORS hosts (imgur et al.) later.
- AssetBundle extraction pipeline (UnityPy → glTF, cached per URL) — separate service, separate decision.

## Explicit non-goals

- Lua / XML UI execution — mods load visually complete without scripts; automation stays manual.
- Physics simulation parity — keep raycast-drag + springs.
- In-browser AssetBundle loading — impossible; placeholders + optional offline pipeline.

## Sequencing & effort feel

1. Phase 1 parser + tests — self-contained, ~a focused session.
2. Phase 2 deck path end-to-end — the "wow" checkpoint; small, because it lands on existing DeckDTO.
3. Phase 4 minimal drop-zone (even before tokens) — dropping a real file is the fastest way to learn what real mods contain.
4. Phase 3 tokens/boards.
5. Phase 5 as demand dictates.

Biggest risks: **scene-scale mismatch** (get the TTS-unit → table-unit constant right early, everything else inherits it), **asset link rot** (mitigate with the report screen first, proxy later), and **giant decks/mods** (sheet slicing is lazy per-sheet; don't eagerly fetch a 300-object mod's every asset).
