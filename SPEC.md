# Spec: Browser Tabletop Sandbox with TTS Save Import

The product path: users drop a Tabletop Simulator save/mod JSON into the app and play it in the browser with friends. No TTS install, no Unity, no mod hosting by us.

This spec unifies and supersedes the sequencing in `TTS_IMPORT_PLAN.md` (importer internals). `SPACETIMEDB_MIGRATION.md` is kept as the detailed reference for one backend option, but the backend decision is made in §4 — and SpacetimeDB is currently shelved as overkill.

**Hard constraint:** the frontend always builds and runs as a pure static site on GitHub Pages. Any backend is optional at runtime (solo/local mode must work with no backend at all) and swappable behind a small sync interface.

## Goals

1. **Load `tts.json`** — any TTS save/workshop mod parses and loads; unsupported objects degrade to labeled placeholders, never a failed import.
2. **Own primitive library** — procedurally generated dice/chips/pawns/etc. so we ship zero Berserk Games assets.
3. **New multiplayer backend** — SpacetimeDB replaces the Go WebSocket server: persistence, automatic sync, no hand-rolled JSON merge.

## Non-goals

- Lua/XML UI execution (mods load visually complete without scripts).
- Physics-simulation parity (raycast drag + springs, as today).
- In-browser Unity AssetBundles (impossible) or a server-side extraction pipeline (deferred indefinitely — legal review first).
- Hosting, indexing, or distributing mod files or their assets (legal posture, see Guardrails).

## Architecture

```
┌──────────────────────────────┐        ┌──────────────────────────┐
│ GitHub Pages (static)        │  WSS   │ Sync backend (Railway)   │
│                              │◄──────►│ — optional at runtime,   │
│ SvelteKit + Threlte          │        │   swappable (see §4)     │
│ ┌──────────┐  ┌───────────┐  │        │                          │
│ │TTS parser│→ │game objects│ │        │ lobby state + actions    │
│ └──────────┘  └───────────┘  │        │ + persistence            │
│ primitive lib │ sheet slicer │        └──────────────────────────┘
└──────┬───────────────────────┘
       │ direct fetch (CORS ok, no proxy)
       ▼
 Steam CDN / imgur / any asset host   ← user's browser only; we never relay
```

- The **user's browser** fetches all mod assets directly from their original hosts. No backend touches asset bytes (Steam's CDN serves `Access-Control-Allow-Origin: *`; verified 2026-07).
- The TTS file is parsed **client-side**; only our own normalized object rows go to SpacetimeDB.

---

## 1. TTS parser (`src/lib/tts/`)

Pure TS, no rendering. Details in `TTS_IMPORT_PLAN.md`; summary of modules:

- `types.ts` — save-format types vendored from matanlurey/tts-save-format.
- `urls.ts` — rewrite dead `cloud-3.steamusercontent.com/ugc/` → `steamusercontent-a.akamaihd.net/ugc/`; force https; emit asset manifest.
- `coords.ts` — Unity LH/degrees → three.js RH/radians + one scene-scale constant (`TTS_UNITS_PER_WORLD_UNIT`). Get this right first; everything inherits it.
- `cards.ts` — `CardID` decode (`sheetKey = floor(id/100)`, `cell = id % 100`), row-major sheet UVs, `UniqueBack` / `BackIsHidden` / hidden-last-cell rules.
- `parse.ts` — walk `ObjectStates` (recursing `ContainedObjects`), emit `ImportedObject[]` + import report.

### Normalized output: `ImportedObject`

One discriminated union the renderer and the DB both speak:

```typescript
type ImportedObject = {
  id: string;                        // generated; TTS GUID kept in props
  kind: 'card' | 'deck' | 'board' | 'token' | 'tile' | 'standee'
      | 'bag' | 'die' | 'chip' | 'pawn' | 'model' | 'placeholder';
  transform: { pos: [x, y, z]; rot: [x, y, z]; scale: [x, y, z] }; // three.js space
  name: string;                      // Nickname || friendly type name
  color?: string;                    // ColorDiffuse as hex
  locked: boolean;
  props: KindProps;                  // kind-specific, JSON-serializable
};
```

`KindProps` per kind (all URLs post-rewrite):

| kind | props |
|---|---|
| `card` | `{ sheet: SheetRef, backSheet?: SheetRef }` |
| `deck` | `{ cards: Array<{id, name, sheet, backSheet?}> }` (top first) |
| `board` | `{ imageUrl, widthScale }` |
| `token` | `{ imageUrl, thickness, shape: 'silhouette' }` |
| `tile` | `{ imageUrl, thickness, shape: 'box'\|'hex'\|'circle'\|'rounded' }` |
| `standee` | `{ imageUrl }` |
| `bag` | `{ contained: ImportedObject[], infinite: boolean }` |
| `die` | `{ sides: 4\|6\|8\|10\|12\|20, customFaceUrl?: string }` |
| `chip` | `{ denomination: 10\|50\|100\|500\|1000 }` |
| `pawn` | `{ variant: 'pawn'\|'checker'\|'domino'\|'gopiece'\|... }` |
| `model` | `{ meshUrl, diffuseUrl?, normalUrl? }` (OBJ) |
| `placeholder` | `{ ttsName: string }` (Custom_Assetbundle, RPG figurines, anything unmapped) |

### `SheetRef` — the multiplayer-safe card face

```typescript
type SheetRef = { url: string; cols: number; rows: number; index: number };
```

**Critical constraint:** card faces come from sprite sheets, and canvas-sliced blob URLs are *local to one browser* — they cannot be synced. So the `SheetRef` (not a blob URL) is the value stored in the DB and broadcast; **every client slices locally** from the same descriptor via a shared cache (`sheetSlicer.ts`: fetch with `crossOrigin:'anonymous'` → canvas → object URL, cached by `url#index`). Deterministic, identical result on every client, no re-hosting of anything.

`CardDTO`/`card` rows therefore need `face` to be *either* a plain URL (Sorcery path, unchanged) *or* a `SheetRef` — model as a serialized tagged string or JSON column (see schema).

## 2. Primitive library (`src/lib/primitives/`)

Replaces every TTS built-in asset with **procedural geometry — zero asset files, zero copyright surface**:

- **Dice:** three.js built-ins — `TetrahedronGeometry` (d4), `BoxGeometry` (d6), `OctahedronGeometry` (d8), `DodecahedronGeometry` (d12), `IcosahedronGeometry` (d20); d10 = pentagonal trapezohedron (small custom BufferGeometry). Numbered faces via a tiny generated canvas texture (our own font rendering). `Custom_Dice` maps the mod's own `ImageURL` unwrap onto a d6.
- **Chips:** `CylinderGeometry` + procedural edge-stripe texture per denomination.
- **Pawn / checker / go piece:** `LatheGeometry` profiles (~10 lines each). **Domino/notecard:** boxes with generated textures.
- **Bag:** lathe "pouch" silhouette; click → contents list UI (reuses deck-draw interaction).
- **Placeholder:** rounded box, `ColorDiffuse` tint, floating `name` label (threlte `<Text>`).
- Registry: `Record<TtsName, PrimitiveComponent>`; unmatched names fall through to `placeholder`. Chess pieces/backgammon/etc. start as placeholders — promote to lathe profiles on demand.

Own visual identity is a feature here, not a compromise: our dice/chips should look like *ours* (consistent design language), which is also the trademark-safe posture.

## 3. Rendering (`src/lib/`)

Existing components stay; new ones follow `Card.svelte`'s pattern (raycast drag, spring transforms):

- `Card.svelte` / `Deck.svelte` — extended to resolve `SheetRef` faces through the slicer cache (plain-URL path untouched).
- `Token.svelte` — extruded shape (box/hex/cylinder/rounded) with image on top; `shape:'silhouette'` renders as thin cylinder v1, alpha-extrusion later.
- `Standee.svelte` — upright plane, double-sided.
- `Model.svelte` — threlte `useLoader(OBJLoader)` + diffuse texture; ignore `ColliderURL`. Vertex-count guard (~100k) → placeholder fallback.
- `Placeholder.svelte`, `Die.svelte`, `Chip.svelte` from the primitive lib. Dice: click-to-roll = random face + tween (no physics).
- `Custom_Board` reuses the existing overlay system.

## 4. State shape & multiplayer backend

### 4a. State shape (backend-agnostic)

These changes happen in `GameDTO` regardless of which backend wins:

1. **`pieces: Record<string, Partial<PieceDTO>>`** — new top-level collection for everything that isn't card/deck/overlay:

```typescript
type PieceDTO = {
  id: string;
  kind: 'token'|'tile'|'standee'|'bag'|'die'|'chip'|'pawn'|'model'|'placeholder';
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  locked: boolean;
  name: string;
  color?: string;
  props: KindProps;   // cold data (see §1) — changes rarely
};
```

One generic collection with a `kind` discriminator, not a collection per kind — the TTS object variety would otherwise mean endless schema churn. Hot fields (transform) sit at the top level for cheap patches; appearance rides in `props`.

2. **Card faces:** `faceImageUrl`/`backImageUrl` widen to `face`/`back`: either a bare URL or a serialized `SheetRef` (prefix-tagged string, e.g. `sheet:{"url":...,"cols":3,"rows":3,"index":5}`). Clients resolve at render time via the slicer cache. Sorcery's plain-URL path is untouched.

3. **Seats** widen to 0–7; TTS `Hands.HandTransforms` colors map onto seats at import, extras dropped with a report note.

4. **New actions** (in `store/game/actions/`): `piece.ts` (move/update/remove, `bagTake`) and `importObjects(objects: ImportedObject[])` — applied in chunks of ~50 so a big mod doesn't produce one giant message.

### 4b. Backend decision

Requirements: lobby-scoped sync of `GameDTO`, bulk import, ideally persistence across restarts — while the frontend stays deployable to GitHub Pages with the backend URL as config, and **no backend = solo mode still works** (import, lay out a table, play locally).

| Option | What it is | Persistence | Effort | Verdict |
|---|---|---|---|---|
| **A. Patch the Go server** | Fix broadcast-everything (room-scoped, dirty-key diffing), add snapshot persistence (SQLite/volume on Railway) | Yes (added) | Low, but stays in Go with hand-rolled merge | Fallback |
| **B. TypeScript WS server on Railway** | Bun + `Bun.serve` websockets. Server-authoritative: clients send typed *actions* (`moveCard`, `drawFromDeck`, `importObjects`), server applies them to the canonical `GameDTO` per lobby and broadcasts patches. **Shares `GameDTO`/`ImportedObject`/action types with the client — one language, zero type drift.** Persistence: `bun:sqlite` snapshot per lobby on a Railway volume. ~$5/mo flat. | Yes | Moderate (~the Go server's size, but typed and shared) | Escape hatch when D's limits hurt |
| **C. SpacetimeDB** (per `SPACETIMEDB_MIGRATION.md`) | Tables/reducers/subscriptions | Yes | Moderate + new paradigm/ecosystem risk | Shelved — overkill for current scale; doc kept if scale demands it |
| **D. WebRTC P2P, host-authoritative (recommended)** | Host's browser owns state and applies the action protocol — host *is* the server. Peers connect via data channels; free-tier signaling + STUN + TURN fallback. $0 infra; GitHub Pages stays the only deployment. | Host localStorage / export | Moderate; host lifecycle + TURN config are the real work | **Build this** — full analysis in `MULTIPLAYER_OPTIONS.md` |

**Why D first, B as escape hatch:** the workload is KB/s per lobby — nothing is compute-bound, so the decision is connectivity/persistence/failure modes, and P2P's failure modes (TURN fallback ~10–20% of peers, host lifecycle, tab throttling) are bounded, known, and acceptable for friends-lobby play at $0. Whichever transport wins, the *action-based protocol* is the fix for the Go server's actual pains (hand-rolled JSON merge in two languages, broadcast-everything, feedback loops): one authority owns ordering, so two players drawing from one deck can't fork state. The `store/game/actions/` layer already is the action vocabulary — D applies it in the host's browser, B on a server, behind the same `SyncAdapter`. See **`MULTIPLAYER_OPTIONS.md`** for the detailed cost/tradeoff analysis and the open questions to resolve before building the p2p adapter.

Migration shape: define a `SyncAdapter` interface (`connect(lobby)`, `send(action)`, `stream(move)`, `onPatch(cb)`) with three implementations — `local` (no backend, applies actions directly; the Pages-only mode), `legacy-ws` (current Go server, during transition), `ws-v2` (option B). Renderer and store code never know which is active.

### 4c. Real-time movement: two-tier protocol

Discrete actions and continuous drags have opposite needs, so they ride the same WebSocket as two message classes:

| | **Actions** (flip, draw, shuffle, grab, drop, import) | **Ephemeral moves** (drag positions) |
|---|---|---|
| Ordering | Server-ordered, authoritative | Last-write-wins per object (seq number; stale packets dropped) |
| Validation | Yes (exists, lease held, deck not empty) | None — pure relay |
| Persistence | Applied to canonical `GameDTO`, snapshotted | Never persisted |
| Rate | Occasional | 20–30 Hz per held object |

**Drag lifecycle:** `grab(objectId)` action → server grants a *hold lease* (`heldBy`; concurrent grabs rejected — no two players fight over one card) → holder streams `move {objectId, seq, pos, rot}` → server stamps + fans out, drops stale seqs → `drop(objectId, finalTransform)` action ends the lease and persists the result. Leases auto-expire on disconnect (object stays at last streamed position via a server-synthesized drop) and after a 60s TTL, so a wedged tab can't park a card out of reach. `heldBy` rides on the entity itself, so every client can render "someone else has this" and refuse to start its own drag.

### 4e. Hidden information

Facedown is a *data* boundary, not a render flag. The rule: **hidden state never leaves the server for a player not entitled to it**, so secrecy holds against devtools, not just against the UI.

**The model.** Cards carry a visibility descriptor rather than having their secrecy inferred from rotation:

```typescript
type CardVisibility =
  | { kind: 'public' }                        // face-up: anyone may see the face
  | { kind: 'hidden'; seenBy?: string[] };    // only the listed players may
```

Facedown on the table = hidden to all. In a hand = hidden to everyone but its owner. Peeked = hidden, with the peeker in `seenBy`. State with no descriptor (a scenario file, an older client) falls back to orientation — facedown reads as hidden, which is the safe direction. Rendering keys off this, never off rotation: a card you peeked at lies facedown on the table but shows its face in the preview HUD.

**Per-recipient views.** The server builds a filtered copy of the document for each player before sending, and diffs it against what that player was last sent — so every client receives a patch stream describing only the game it is allowed to know about:

| | shipped to an entitled player | shipped to everyone else |
|---|---|---|
| card face | `faceImageUrl` | *omitted* — backs, transforms and the descriptor still ship, so the table renders identically |
| hand (`players[x].tray`) | full contents, to `x` only | `handCount` only |
| deck (`decks[d].cards`) | face-up pile: its top card | `cardCount` only — a facedown deck's order and faces never leave |

**Two write paths.** `update` merge patches remain the cheap path for drag streams, layout, imports and scenario seeds, but are now *sanitized*: a client may not write another player's row, a hand, an existing deck's card list, an existing card's face, or the server-owned `visibility`/`heldBy` fields, and may not mutate any object somebody else holds. Refused subtrees are dropped rather than merged, and the sender is told — and corrected, since its next patch is diffed against "what we last sent you, plus what you just tried".

Everything that moves hidden information is a validated **action** instead, because the requesting client usually cannot hold the data the move operates on: `draw` (server pops the deck and materializes a card under a client-supplied *opaque* id — `card:alice:main-AS` would announce the card it names), `placeOnDeck`, `shuffle`, `tray`/`untray`, `flip`, `claimSeat` (an unclaimed seat's pre-dealt hand is hidden from its claimer too), plus the deliberate reveals below.

**Peeking is a move.** Looking at a hidden card is legitimate, so it is explicit and recorded rather than a side effect of hovering: `peek` entitles you to the face and writes you into `seenBy` where the whole table can see it, announced with a `log` message; `reveal` turns a card face-up for everyone. Flipping *back* down removes the face from everyone again, peekers included — "facedown" has no exceptions to reason about.

With no backend (`local` mode, the /setup editor) there is nothing to hide and nobody to arbitrate: actions fall back to applying the move on the spot.

**Client smoothing:** remote clients feed incoming samples into the existing spring interpolation (`Card.svelte`) — springs chasing the latest sample absorb jitter without snapshot-buffer machinery. The local holder renders its own drag directly (no round-trip lag on your own hand).

**Transport:** one WebSocket, JSON, is sufficient — ~30 Hz × ~40 B × few held objects is orders of magnitude below where TCP head-of-line blocking or binary framing would matter. Revisit only if server-simulated physics (dice throwing) ever leaves the non-goals list.

In `local` mode both tiers collapse to direct store application. The 200ms client-side drag throttle from the legacy server is retired in `ws-v2` — the ephemeral tier exists precisely so drags can run at full rate.

## 4d. Game packs — the content system

A **pack** is a named, serializable definition of a game's contents — how many decks, what each is composed of, tokens, board — decoupled from any live game state. Everything that puts objects on the table goes through a pack:

```typescript
type GamePackDef = {
  id: string;                 // 'standard-52', 'imported:<hash>'
  name: string;
  scope: 'table' | 'player';  // see "Two pack scopes" below
  decks: PackDeckDef[];
  pieces?: ImportedObject[];  // tokens/tiles/boards etc. (§1 union)
  overlays?: { imageUrl: string; ratio: number; scale: number }[];
};
type PackDeckDef = {
  slot: string;               // 'main', 'discard' — stable id within the pack
  name: string;
  back: string;               // face ref (see below)
  isFaceUp?: boolean;
  cards: { code: string; name?: string; face: string }[];
};
```

**Sources of packs:**
1. **Built-in:** `standard-52` — a full playing-card deck with **procedurally generated faces** (canvas-drawn pips/courts, zero image assets, zero copyright surface — same posture as §2 primitives). It is the default content when a lobby starts empty, and doubles as fixture data for tests.
2. **TTS import (§1/§5):** the parser's output is exactly a pack — `ImportedObject[]` grouped into `GamePackDef`. The import report screen is "pack preview."
3. **User packs:** the same JSON format hand-authored or exported/re-imported, enabling a pack picker later ("choose any card game"). The creator tooling for this — JSON Schema, CSV converters, visual builder, TTS round-trip export — is designed in **`CONTENT_CREATION.md`**.

**Face refs — three URL schemes, resolved only at render time:**
- `https://…` — plain image URL (TTS imports, user packs)
- `sheet:{url,cols,rows,index}` — sprite-sheet cell (§4a)
- `gen:std52/<code>` — procedurally generated client-side (e.g. `gen:std52/AS`, `gen:std52/back`), drawn once to a canvas and cached per client

All three are tiny strings, deterministic on every client, and sync-safe — the store and wire format never carry image data, only refs. A single `resolveCardImage(ref)` helper is the one place refs become textures.

**Two pack scopes — mirroring how TTS itself organizes games:**

- **`table` packs** (TTS analog: the mod/save): the shared game — map/board overlays, communal decks, shared tokens, zones. Loaded **once per lobby**, by the host. A full TTS save imports as a table pack.
- **`player` packs** (TTS analog: Saved Objects): what one player brings — typically a single deck (+ hero pieces). Spawned **per seat** into an already-set table. Deck-builder exports like the-unmatched.club's fan-deck JSON are exactly this: the same TTS schema with an `ObjectStates` array containing one deck — so the §1 parser handles both granularities with zero extra work; classification is just "does it contain boards/many objects (table) or a lone deck (player)?" with a user override in the import report.

The Unmatched flow that must work: host imports the game's table pack (map + shared tokens), each player then imports their own fan-deck JSON as a player pack onto it. "Map import" in a rules-free sandbox = a table-scoped overlay image (existing `OverlayDTO`); movement spaces/zones arrive later as snap points (§5-tier), not as enforced rules.

**Spawning:** `spawnPack(pack, seat)` maps a pack onto `GameDTO` via existing actions (`addDeck` with shuffled cards, piece/overlay inserts) — table packs at world anchor, player packs seat-relative. Loading a pack never mutates the pack itself — packs are templates, game state is the instance.

## 5. Import UX

Route `/import` (or drop target on the table):

1. Drag `.json` / file picker. Parse in a web worker if >5 MB.
2. **Import report** before anything loads: per-kind counts, placeholder list (with TTS type names), and asset health — parallel probes of the manifest, dead links flagged (link rot is the top real-world failure; surface it *before* play, not during).
3. Options: "import decks only" (skip table clutter) / "full table".
4. Load → chunked `importObjects` actions through the active `SyncAdapter` → all clients in the lobby see the table appear (in `local` mode, it just appears for you).
5. Nothing user-dropped is uploaded anywhere except normalized game-state objects to the sync backend (no raw file storage).

## 6. Legal guardrails (build-time checklist)

- **BYO-file only.** No mod library, no workshop browser, no mod URLs fetched by us, no raw-file storage. Users obtain their own files.
- **Assets fetched by the user's browser, directly from origin hosts.** Exception: hosts without CORS headers fall back through a **pass-through** CORS proxy (currently the existing unbrewed worker) — no retention, direct-first, needed because WebGL requires pixel access where plain `<img>` display doesn't. If a *caching* proxy is ever added: register DMCA agent + ToS + repeat-infringer policy *in the same change*.
- **Zero TTS-shipped assets.** Primitives are procedural (§2); test fixtures in-repo are self-authored or public-domain decks — never scraped commercial card sheets.
- **Naming:** product name contains no "Tabletop Simulator"; compatibility phrased nominatively ("imports Tabletop Simulator save files").
- Backend state contains URLs + our own normalized metadata only — we store pointers, not works.

## 7. Milestones

| # | Deliverable | Proves |
|---|---|---|
| M1 | Parser + fixtures + tests (`src/lib/tts/`, no UI) | CardID/coords/URL logic correct |
| M2 | `SyncAdapter` interface + `local` mode; drop a real deck-mod file → playable decks **solo** (SheetRef path + import report) | The headline feature end to end, zero backend, pure GitHub Pages |
| M3 | `p2p` adapter: host-authoritative WebRTC (signaling worker + STUN/TURN, refresh-restore) | Multiplayer at $0 infra; delete `server/` + `src/lib/websocket/` after parity |
| M4 | `piece` kinds: token/tile/standee/bag + primitive dice/chips | Full card-game mods playable |
| M5 | OBJ models, snap points, seat mapping polish, remaining primitives | Fidelity tier |

M2 lands the headline feature with no backend dependency at all (and *is* the permanent solo mode, not throwaway). M3 then moves action application server-side behind the adapter — renderer and store don't change.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Scene-scale constant wrong → everything mis-sized | Fix in M1 with a known-good fixture (standard card = 2×3 TTS units ≈ 63×88 mm) |
| SheetRef resolution jank (70-cell sheets, many decks) | Lazy per-sheet fetch; only visible faces slice; LRU cap on object URLs |
| Giant mods (hundreds of objects) as one message | Chunked `importObjects`; per-import object cap with report warning |
| Backend rewrite stalls | `SyncAdapter` keeps `local` + `legacy-ws` working; solo mode never depends on any backend |
| Asset link rot mid-game | Import-time health report; broken texture → placeholder material, never a crash |
| imgur/other hosts without CORS | Report as "unloadable in browser" at import; defer proxy decision (see §6) |
