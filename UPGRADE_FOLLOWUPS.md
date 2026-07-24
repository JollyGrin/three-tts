# Upgrade Follow-ups (2026-07-24)

Open action items from the threlte/three/svelte upgrade and the card z-fighting fix. Done in that change: three 0.174→0.185, @threlte/core 8.0→8.5, extras 9.0→9.21, rapier 3.0→3.5 (+ rapier3d-compat 0.19), svelte 5.20→5.56; camera near/far tightened to 0.5/200; cards given real thickness (`CARD_THICKNESS`); dropped cards stack via `resolveStackHeight()` instead of all resting coplanar at y=0.26; `{#key}` material remounts removed. Check/tests/build all green — but the items below still need action.

## 1. Visual verification (do first)

The upgrade and stacking fix were verified by build/tests only, never in a browser. Run `bun run dev` and check:

- Drop several cards on top of each other → they stack with visible separation, no flicker/flashing.
- Draw from a deck and cycle a discard pile → no image flash (previously caused by `{#key}` remounts).
- Tap/flip → springs settle onto stacked heights naturally.

## 2. `Card.svelte` state-capture warnings are real bugs

`bun run check` reports 3 `state_referenced_locally` warnings, two of which matter:

- `seatRotation` is captured once when constructing the `rotationTap` Spring (`Card.svelte:51`) — if a player changes seats mid-game, card tap orientation won't update.
- `cardState` is similarly captured for the `rotation` Spring's initial value (`Card.svelte:44`).

Fix by deriving spring targets in effects rather than baking initial values in.

## 3. ~~Elevate-then-settle hack~~ — RESOLVED 2026-07-24

Replaced the `setTimeout` settle with a single height effect that keeps the card lifted while `|rotation.current − rotation.target| > 2°` and settles to the store's stack height once the flip completes. Postscript: the hack's own "does this create a feedback loop?" comment was prophetic — the old per-frame height-sync effect (depending on `height.current`) was re-targeting height every frame and cancelling the lift, which is why flips clipped the table.

## 4. ~~Rapier: remove or adopt~~ — RESOLVED 2026-07-24

Removed `@threlte/rapier` + `@dimforge/rapier3d-compat` and unwrapped `<World>` from `TableScene.svelte`. Postscript: the "inert, so low risk" assessment was wrong — after the upgrade, `<World>`'s async WASM init failure silently prevented every scene child (table, cards, decks) from mounting. Lesson: a wrapper component that gates children on async init is never inert.

## 5. Unify height magic numbers

- `Deck.svelte`: top-card y=0.21 and box height 0.4 are not derived from `src/lib/utils/constants-cards.ts`.
- `actions/card.ts` `incrementHeight`: magic 0.5 ceiling with an in-code todo.

Both should be expressed in terms of the card constants so future scale changes don't reintroduce near-coplanar surfaces.

## 6. Verify CI is green

`bun run check` and `vitest` were failing **before** this upgrade (stale references to a deleted `objectStore.svelte`, missing `jsdom` devDependency) — both fixed now, but the GitHub Pages deploy workflow may have been red for a while. Confirm it passes on the next push.
