# Infrastructure planning — hostnames and the lobby/provisioning split

Where the deployed pieces live, and what each `*.table.place` name is for. Started
2026-07-25 alongside #116; the earlier backend-shape decisions (why a Go relay at all,
what would replace it) are in `MULTIPLAYER_OPTIONS.md` and `SPEC.md` §2, not here.

## Hostnames

| Host                | Serves                                                                | Status                                           |
| ------------------- | --------------------------------------------------------------------- | ------------------------------------------------ |
| `table.place`       | The SvelteKit client (static)                                         | Live                                             |
| `lobby.table.place` | The Go websocket relay (`server/`) — `/ws`, `/view`, `/{lobby}/debug` | Live, verified 2026-07-25                        |
| `api.table.place`   | HTTP lobby-provisioning API                                           | Reserved; still the old relay CNAME until step 3 |

Both `lobby.` and `api.` currently resolve to the same Railway relay behind Cloudflare.
That is the transitional state, not the target: `api.` gets repointed once the
provisioning API exists.

## Migration: rename the relay host, free `api.` for provisioning

1. **Stand up `lobby.table.place` against the existing Railway relay.** — **Done**
   (2026-07-25). `GET /` → `200 OK`; `/ws` → `101 Switching Protocols` through
   Cloudflare/Railway.
2. **Flip the client's default websocket host from `api.table.place` to
   `lobby.table.place`.** — **Done** (#116). `src/lib/websocket/connection.ts`.
   No dual-host fallback and no state transfer: lobby state is in-memory in
   `server/lobby/` and is dropped by every Railway redeploy, so losing a lobby to
   this change is indistinguishable from a routine deploy, and nobody was on the
   server. An explicitly-set `localStorage.serverurl` still wins and deliberately
   does not auto-migrate — there are no users to migrate.
3. **Repoint `api.table.place` at the provisioning API.** — Not started. Safe to do
   once a client build with step 2 is deployed; anyone still running an older build
   (or with `api.table.place` pinned in Settings by hand) loses multiplayer at that
   moment, which is the accepted cost.

## Decision log

### 2026-07-25 — the websocket relay moves to `lobby.table.place`

`api.table.place` was the relay's original name, from when the relay was the only
backend. It is the natural name for the HTTP lobby-provisioning API, and a name
cannot be both: a websocket upgrade and a REST surface on one host means either a
path-prefix split or a passthrough proxy, and both exist only to preserve a name
that predates the split.

**Decision:** the relay gets its own name, `lobby.table.place`, and the client
defaults there. `api.table.place` is reserved for provisioning.

**Rejected:** serving `/ws` from `api.table.place` as a passthrough. It keeps a
transitional shape permanently, and buys nothing — the only thing it would protect
is old client builds, and there are no users on them.
