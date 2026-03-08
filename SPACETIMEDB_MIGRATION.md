# SpacetimeDB Migration Plan

## Why

The current Go WebSocket server works but has limitations:
- **No persistence** — game state lives in memory, lost on restart
- **Manual sync** — we hand-roll JSON patch merging and broadcasting
- **~600 lines of Go** to maintain for lobby management, rate limiting, and message routing

SpacetimeDB replaces all of this with a single deployment: tables define state, reducers define mutations, and sync is automatic. We delete the entire `server/` directory.

**Cost:** Free on Maincloud (3M reducer calls/mo), or ~$3-5/mo self-hosted on Railway.

## Architecture

```
┌─────────────────────────┐         ┌──────────────────────────┐
│  GitHub Pages (static)  │  WSS    │  SpacetimeDB             │
│                         │◄───────►│  (Maincloud or Railway)  │
│  SvelteKit + Threlte    │         │                          │
│  spacetimedb TS SDK     │         │  Tables = Game State     │
│  Svelte stores          │         │  Reducers = Game Actions │
│                         │         │  Subscriptions = Sync    │
└─────────────────────────┘         └──────────────────────────┘
```

Frontend stays exactly as-is: SvelteKit + Threlte + static adapter on GitHub Pages.
Backend becomes a SpacetimeDB module (TypeScript) deployed to Maincloud or self-hosted.

## Game-Agnostic Design

The simulator has **no knowledge of game rules**. It provides physical primitives that any tabletop game can use. Players bring their own assets (card images, board images, tokens) via URLs.

### Core Primitives

| Primitive | Purpose | Examples |
|-----------|---------|----------|
| **Card** | Flat rectangular object with front/back faces | Playing cards, tarot, TCG cards |
| **Deck** | Ordered stack of cards | Draw pile, discard pile |
| **Token** | Small object placed on the board | Counters, meeples, dice results, markers |
| **Overlay** | Board surface image | Game boards, playmats, grid maps |
| **Zone** | Named spatial region | "Graveyard", "Hand", "Play Area" |
| **Player** | Participant with a seat and private tray | — |

No primitive encodes rules. A "graveyard" zone is just a label — the simulator doesn't enforce what goes there.

## SpacetimeDB Module Schema

All tables include `lobby_id` for multi-lobby isolation. Clients subscribe with:
```
SELECT * FROM <table> WHERE lobby_id = '<id>'
```

### Tables

```typescript
// ── Lobby ──────────────────────────────────────
lobby = table({
  id:         t.string().primaryKey(),   // lobby code
  created_at: t.u64(),
  settings:   t.string(),               // JSON blob for game-specific config
})

// ── Player ─────────────────────────────────────
player = table({
  identity:   t.identity().primaryKey(), // SpacetimeDB connection identity
  lobby_id:   t.string(),
  name:       t.string(),
  seat:       t.u32(),                   // 0-7, determines camera angle
  connected:  t.bool(),
  metadata:   t.string(),               // JSON — life totals, score, resources
})

// ── Card (on table) ───────────────────────────
card = table({
  id:         t.string().primaryKey(),
  lobby_id:   t.string(),
  x:          t.f64(),
  y:          t.f64(),                   // height above table
  z:          t.f64(),
  rot_x:      t.f64(),                   // flip state
  rot_y:      t.f64(),                   // facing direction
  rot_z:      t.f64(),                   // tap state
  face_url:   t.string(),               // front image URL
  back_url:   t.string(),               // back image URL
  locked:     t.bool(),                  // prevent accidental moves
  owner_id:   t.string().optional(),     // null = public, set = private to owner
})

// ── Deck ───────────────────────────────────────
deck = table({
  id:         t.string().primaryKey(),
  lobby_id:   t.string(),
  x:          t.f64(),
  y:          t.f64(),
  z:          t.f64(),
  rot_x:      t.f64(),
  rot_y:      t.f64(),
  rot_z:      t.f64(),
  face_up:    t.bool(),                  // discard pile vs draw pile
  back_url:   t.string(),               // shared card back for the deck
})

// ── Card-in-Deck (join table) ──────────────────
card_in_deck = table({
  id:         t.string().primaryKey(),   // card id
  deck_id:    t.string(),
  lobby_id:   t.string(),
  sort_order: t.u32(),                   // position in deck (0 = top)
  face_url:   t.string(),
  back_url:   t.string(),
})

// ── Tray (private hand) ────────────────────────
tray_card = table({
  id:         t.string().primaryKey(),   // card id
  lobby_id:   t.string(),
  owner_id:   t.string(),               // player identity
  sort_order: t.u32(),
  face_url:   t.string(),
  back_url:   t.string(),
})

// ── Token ──────────────────────────────────────
token = table({
  id:         t.string().primaryKey(),
  lobby_id:   t.string(),
  x:          t.f64(),
  y:          t.f64(),
  z:          t.f64(),
  label:      t.string(),               // display text (e.g. "3", "+1/+1")
  color:      t.string(),               // hex color
  image_url:  t.string().optional(),    // optional image instead of colored disc
  scale:      t.f64(),
})

// ── Overlay (board/playmat) ────────────────────
overlay = table({
  id:         t.string().primaryKey(),
  lobby_id:   t.string(),
  x:          t.f64(),
  y:          t.f64(),
  z:          t.f64(),
  rot_x:      t.f64(),
  rot_y:      t.f64(),
  rot_z:      t.f64(),
  image_url:  t.string(),
  ratio:      t.f64(),                   // width / height
  scale:      t.f64(),
  locked:     t.bool(),
})
```

### Reducers

Game-agnostic physical operations only. No rule enforcement.

```
Lobby:       create_lobby, join_lobby, leave_lobby
Player:      set_seat, update_metadata
Card:        move_card, flip_card, tap_card, spawn_card, remove_card
Deck:        create_deck, draw_from_top, place_on_top, shuffle_deck, remove_deck
Tray:        card_to_tray, card_from_tray
Token:       spawn_token, move_token, update_token, remove_token
Overlay:     add_overlay, move_overlay, remove_overlay
Bulk:        import_deck_list (parse a deck list URL/text into cards)
```

Each reducer validates only physical constraints (e.g., "card exists", "deck not empty"), never game rules.

## Client Integration (Svelte)

### Connection

```typescript
import { DbConnection } from './spacetimedb_generated';

const conn = DbConnection.builder()
  .withUri(SPACETIMEDB_URI)
  .withModuleName('tts')
  .withToken(localStorage.getItem('stdb_token'))
  .onConnect((ctx, identity, token) => {
    localStorage.setItem('stdb_token', token);
    ctx.subscriptionBuilder()
      .subscribe(`SELECT * FROM card WHERE lobby_id = '${lobbyId}'`);
    // ... subscribe to all tables for this lobby
  })
  .build();
```

### Wiring to Svelte Stores

Replace `gameStore.updateState()` / `updateStateSilently()` with SDK callbacks:

```typescript
// Reactive state from SpacetimeDB -> Svelte store
conn.db.card.onInsert((ctx, card) => {
  cards.update(s => ({ ...s, [card.id]: card }));
});

conn.db.card.onUpdate((ctx, oldCard, newCard) => {
  cards.update(s => ({ ...s, [newCard.id]: newCard }));
});

conn.db.card.onDelete((ctx, card) => {
  cards.update(s => { delete s[card.id]; return { ...s }; });
});
```

### Actions → Reducer Calls

```typescript
// Before (current)
gameStore.updateState({ cards: { [id]: { position: [x, y, z] } } });

// After (SpacetimeDB)
conn.reducers.moveCard(id, x, y, z);
```

Throttling for drag updates (200ms debounce) stays client-side — same as today.

## Migration Steps

### Phase 1: Module + Connection
1. Install SpacetimeDB CLI (`curl -sSf https://install.spacetimedb.com | sh`)
2. Create module in `module/` directory with table definitions
3. Write core reducers (lobby, card, deck, player)
4. Deploy to Maincloud (`spacetime publish tts`)
5. Generate TypeScript client bindings (`spacetime generate --lang typescript`)

### Phase 2: Client Rewire
6. Install `spacetimedb` npm package
7. Create `spacetimeStore.ts` — connection + subscription setup
8. Wire SDK callbacks to Svelte stores (insert/update/delete → store updates)
9. Replace `gameStore.updateState()` calls with reducer calls
10. Remove `src/lib/websocket/` directory entirely

### Phase 3: Cleanup
11. Delete `server/` directory (Go server no longer needed)
12. Remove `railway.toml` (unless self-hosting SpacetimeDB there)
13. Update any deploy scripts / CI

### Phase 4: New Primitives
14. Add token table + UI components (not in current MVP)
15. Add zone table for named regions
16. Add deck import reducer (paste a deck list → cards in deck)

## What Stays the Same

- SvelteKit + Threlte frontend (all 3D rendering, drag handling, UI)
- Static hosting on GitHub Pages
- Client-side throttling for position updates
- Asset loading via image URLs (no asset hosting changes)
- Keyboard shortcuts, context menus, tray UI

## What Gets Deleted

- `server/` — entire Go server (~600 lines)
- `src/lib/websocket/` — connection, storeIntegration, message routing
- `server/jsonmerge/` — surgical JSON patching (SpacetimeDB handles row updates)

## Risks

| Risk | Mitigation |
|------|------------|
| Young ecosystem, smaller community | Module is <200 lines; easy to revert to Go server if needed |
| No official Svelte SDK (React only) | Raw SDK callbacks are simple to wire; Svelte stores are just functions |
| Schema migrations can be tricky | Keep tables flat and simple; avoid deep nesting |
| Maincloud outage | Can self-host as fallback; game state is small |
| Drag update throughput | Client-side throttle (200ms) keeps reducer call rate low |
