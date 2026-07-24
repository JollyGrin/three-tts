# Multiplayer Backend Options — Cost & Tradeoff Analysis

Companion to `SPEC.md` §4b/§4c. Goal: the lowest-compute way to run multiplayer for a 2–8 player tabletop, while the frontend stays a pure static site on GitHub Pages. All options plug in behind the `SyncAdapter` interface (`connect/send/stream/onPatch`), so this decision is swappable, not a bet.

Workload reality check: actions are occasional; drags stream at 20–30 Hz × ~40 B to a handful of peers. Total bandwidth per lobby is KB/s. Nothing here is compute-bound — the decision is about **connectivity, persistence, and failure modes**, not throughput.

## Option matrix

| | Cost | Persistence | NAT/connectivity | Host dependency | Effort | Status |
|---|---|---|---|---|---|---|
| A. `local` (no backend) | $0 | localStorage | n/a | n/a | Small | Planned (SPEC M2) |
| B. P2P WebRTC, host-authoritative | $0 | Host localStorage / export | Needs STUN + TURN fallback | Yes — the big tradeoff | Medium | **Recommended default** |
| C. Bun/TS WS server on Railway | ~$5/mo flat | SQLite on volume | None (server is public) | No | Medium | Escape hatch |
| D. Cloudflare Durable Objects | ~$0–5/mo | DO storage | None | No | Medium + new platform | Revisit at scale |
| E. Patch existing Go server | Railway ~$5/mo | Added (SQLite) | None | No | Low-Medium | Fallback only |
| F. SpacetimeDB | Free tier / ~$5 self-host | Yes | None | No | Medium + ecosystem risk | Shelved (see `SPACETIMEDB_MIGRATION.md`) |

## B. P2P WebRTC (host-authoritative) — the $0 path

**Topology:** star. The host's browser owns canonical `GameDTO` and applies the action protocol (SPEC §4c) exactly as a server would — host *is* the server. Peers send actions/streams over data channels; host fans out patches. This maps 1:1 onto the existing `actions/` vocabulary.

**What it needs to actually work:**

1. **Signaling** (peers finding each other): free PeerJS cloud broker, or a ~50-line Cloudflare Worker (free tier). Effectively $0; no maintained server.
2. **STUN:** free (public Google STUN). Gets most peer pairs connected via hole-punching.
3. **TURN — do not skip.** ~10–20% of real-world pairs (symmetric NAT, corporate/university networks, some mobile carriers) cannot hole-punch and need a relay that proxies game traffic. Without TURN this cohort simply cannot play, and it presents as unfixable flaky bug reports. Cloudflare's TURN service has a generous free tier, and relayed tabletop traffic is tiny. Budget: still $0, but it is mandatory configuration.

**Known issues (bounded, not research problems):**

- **Host lifecycle** — host closes tab/laptop sleeps → game freezes. v1 mitigation: host state persisted to localStorage each action; host refresh restores + peers auto-reconnect. v2: host migration (a peer promotes itself with last-known state). This is the largest engineering delta vs. a server.
- **Background-tab throttling** — browsers throttle timers in inactive tabs; a backgrounded host lags everyone. Mitigate: do work on message events (not timers); show a "you're hosting" visibility warning.
- **No cross-session persistence** unless host exports/saves. Acceptable for friends' game nights.
- **Late joiners** get a full state snapshot from the host on connect (cheap — state is small).

**What P2P is genuinely bad at** (and is explicitly not the current product): public lobbies, stranger matchmaking, durable long-running games with rotating participants. If the product moves there, that's the trigger to stand up C or D.

## C. Bun/TS server on Railway — the $5 flat path

A WS lobby server idles at ~40 MB RAM / near-zero CPU → Railway hobby plan is effectively a flat ~$5/mo at this scale. Buys: zero NAT issues, always-on lobbies, SQLite persistence, no host-migration code, one shared type system with the client (see SPEC §4b for why TS over Go). This is the option to reach for **when the P2P failure modes start costing real annoyance**, not before.

## D. Cloudflare Durable Objects — the middle path to know about

One DO per lobby; with the WebSocket hibernation API, idle lobbies cost ~nothing, and the free/$5 Workers tier covers this scale. Structurally a perfect fit (single-threaded per-lobby actor = action ordering for free). Costs: new platform/mental model, DO-specific APIs, and its advantage over Railway only materializes at a scale (thousands of idle lobbies) the project doesn't have. Revisit if hosting costs or global latency ever matter.

## E/F. Go patches & SpacetimeDB

- **E:** keeping the Go server means keeping hand-rolled JSON merge in two languages — the root cause of past feedback-loop bugs. Only worth patching if a rewrite stalls entirely.
- **F:** solves sync/persistence elegantly but adds a young ecosystem + new paradigm for a project whose scale doesn't need it. Full plan preserved in `SPACETIMEDB_MIGRATION.md` if that changes.

## Recommended sequence

1. **`local` adapter** ships with SPEC M2 (solo play, $0, no backend at all).
2. **`p2p` adapter** as the default multiplayer: signaling Worker + STUN + Cloudflare TURN, host-authoritative, localStorage host persistence. Total infra cost: $0; GitHub Pages remains the only deployment.
3. **`ws-v2` (C)** added only when P2P's host-dependency demonstrably hurts. Additive, not a rewrite — the adapter seam guarantees renderer/store never change.

## Follow-up questions to resolve before building the p2p adapter

- Signaling: PeerJS broker (zero code, third-party dependency) vs. own CF Worker (~50 lines, no dependency)?
- Host migration in v1 or defer? (Recommend: defer; ship refresh-restore only.)
- TURN provider: Cloudflare free tier vs. self-host coturn later — measure actual relay % first.
- How does the ephemeral drag tier (SPEC §4c) map to data channels — ordered-reliable for actions + unordered-unreliable channel for streams? (Likely yes: two channels per peer.)
- Lobby URL format for P2P (host peer id in the query string vs. short-code lookup via signaling worker).
