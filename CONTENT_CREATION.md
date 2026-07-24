# Content Creation System — tableplace

How creators make decks/content for tableplace. Companion to `SPEC.md` §4d (game packs). The strategy in one line: **`GamePackDef` JSON is the single native content format; TTS import is a converter into it; every creator tool is just a different way of producing it.**

## Why this shape

Prior art says the winning pattern is "web tool → JSON file → drop into game":

- **the-unmatched.club** — form-based fan-deck builder exporting TTS Saved Object JSON. Creators never touch JSON by hand; they fill fields and paste image URLs.
- **TTS's own ecosystem** — deck creation in raw TTS is painful (external sprite-sheet assembly), which is exactly why community builders exist. The lesson: the game engine defines the format; third-party tools make it approachable.
- **Screentop/playingcards.io** — in-app editors with live preview; higher effort, best UX.

tableplace already has the format (`GamePackDef`: scope, decks, cards with face refs, pieces, overlays) and the renderer to preview it. The creator system is layers on top, cheapest first.

## Layer 0 — JSON Schema + docs (do first, ~free)

Publish a **JSON Schema** for `GamePackDef` (generated from the TS types in `src/lib/packs/types.ts`, e.g. via `typescript-json-schema` in a build step).

- Validation at import time with precise errors ("decks[0].cards[3].face is missing") — the import report screen gets this for free.
- Editor support for free: `"$schema": "https://tableplace…/pack.schema.json"` gives VSCode autocomplete + inline validation to anyone hand-writing a pack.
- The schema IS the format documentation; add a `docs/packs.md` with 2–3 annotated example packs (standard-52 itself is example #1).

Hand-authoring + schema is enough for technical creators and for LLM-assisted creation ("here's the schema, generate a pack for game X") — which realistically is how many packs will get made.

## Layer 1 — converters (spreadsheet-first creators)

Creators of card games live in spreadsheets. Cheap converters, all client-side in a `/create` route:

1. **CSV/TSV paste → pack**: columns `name, count, face_url, back_url` (+ optional `deck` column for multi-deck packs). Paste from Google Sheets, get a pack. This single converter probably covers the majority of real content.
2. **URL-list paste → pack**: one image URL per line = one card each; fastest possible "I have a folder of card scans on imgur" path.
3. **TTS Saved Object / save → pack**: the §1 parser (SPEC) already yields this — surfaced in the same UI. Covers the-unmatched.club exports and all existing TTS content out of the box.

All converters output the same thing: a validated `GamePackDef` + preview + "Download JSON" / "Spawn to table now".

## Layer 2 — visual pack builder (the full creator)

A `/create` editor when demand justifies it:

- Form-based deck editing (name, back, scope) with a card table (add/duplicate/reorder, per-card name + face ref).
- **Live 3D preview** using the existing renderer components (`Card.svelte`, `Deck.svelte`, resolver) — the strongest advantage tableplace has over external tools; the-unmatched.club can't show you your deck on the table.
- Sprite-sheet support both directions: *slice* a pasted sheet URL into cards (`sheet:` refs, reusing the importer's slicer), and later *assemble* per-card images into a sheet client-side (canvas) for TTS-export compatibility.
- Piece/overlay editing (tokens, boards/maps) once the `pieces` collection lands (SPEC M4).

## Layer 3 — TTS export (round-trip, ecosystem wedge)

`GamePackDef → TTS Saved Object JSON` is mechanically simple (invert the §1 parser: build `CustomDeck` sheets, encode CardIDs, mirror coordinates back). Value: creators who build in tableplace can publish to the existing TTS ecosystem too — which makes tableplace tooling worth using even for people who haven't switched. Needs client-side sheet assembly from Layer 2 first.

## Asset hosting stance (unchanged from SPEC §6)

tableplace hosts **no images and no packs**. Face refs are creator-hosted URLs (imgur, GitHub raw, own site) or generated (`gen:`)/sheet refs. Packs travel as files, or as fetchable URLs (a gist raw link in the lobby is fine — the *user* supplies it). A pack registry/gallery is deliberately out of scope until the legal posture of hosting an index is worth thinking about (same reasoning as the mod-library non-goal).

## Sequencing

| # | Deliverable | Unlocks |
|---|---|---|
| C0 | JSON Schema generated from types + validation wired into import + 2 example packs | Hand-authoring, LLM-authoring, precise import errors |
| C1 | `/create` route: CSV paste + URL-list paste converters, preview, download/spawn | Non-technical creators (spreadsheet workflow) |
| C2 | TTS Saved Object import surfaced in `/create` (parser from SPEC M1) | the-unmatched.club decks + all existing TTS content |
| C3 | Visual builder with live 3D preview | Full creator UX |
| C4 | Sheet assembly + TTS export | Round-trip; publish tableplace content back to TTS |

C0 should ride along with SPEC M1 (the parser needs pack validation anyway). C1 is a focused-session-sized feature with outsized reach.

## Open questions

- Pack identity/versioning: content hash as `id` for imported packs? `version` field for creator iterations?
- Where does per-card metadata beyond name live (rules text, stats for search/preview)? Proposal: optional `meta: Record<string, string>` on `PackCardDef`, rendered in the HUD preview only — keeps the sandbox rules-free.
- Should `gen:` become creator-extensible (parameterized generated cards, e.g. `gen:text/{"title":…}` for prototyping games with no art yet)? Cheap and very useful for playtesting-stage designers.
- ~~Naming: "pack" vs "deck file" in user-facing copy (creators from the Unmatched world will say "deck").~~ **Decided (tableplace-54):** "pack" = the content library file (`<name>.tbpp.json`); "deck" stays the word for one pile of cards *inside* a pack; "scenario" = an arrangement (`<name>.tbps.json`). See `docs/packs.md`.
