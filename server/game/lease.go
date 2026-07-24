package game

import "time"

// Hold leases. `grab` claims an object, `drop` releases it, and while a lease
// is out nobody else may move, flip, tray or otherwise mutate that object.
// The holder is published on the entity (heldBy) so every client can render
// "someone else has this"; the expiry is server-private.
//
// All functions here expect g.mu to be held.

func holdKey(col, id string) string { return col + "/" + id }

// holder returns the current owner of an object's lease, "" when free. A lease
// past its TTL is treated as free: the holder's client is gone or wedged.
func (g *Game) holder(col, id string) string {
	ent := entity(g.Data, col, id)
	if ent == nil {
		return ""
	}
	held, _ := ent[fieldHeldBy].(string)
	if held == "" {
		return ""
	}
	if expiry, ok := g.holds[holdKey(col, id)]; ok && time.Now().After(expiry) {
		return ""
	}
	return held
}

// mutableBy reports whether player may change this object. Objects that do not
// exist yet are mutable (that is a create), and an object nobody holds is fair
// game — contention is the thing leases exist to stop.
func (g *Game) mutableBy(col, id, player string) bool {
	held := g.holder(col, id)
	return held == "" || held == player
}

// grab claims the lease, refreshing it if the caller already holds it.
func (g *Game) grab(col, id, player string) bool {
	ent := entity(g.Data, col, id)
	if ent == nil {
		return false
	}
	if !g.mutableBy(col, id, player) {
		return false
	}
	ent[fieldHeldBy] = player
	g.holds[holdKey(col, id)] = time.Now().Add(holdTTL)
	return true
}

// drop ends the lease. The object keeps whatever transform was last streamed,
// which is what makes a synthesized drop (disconnect, expiry) safe.
func (g *Game) drop(col, id, player string) bool {
	ent := entity(g.Data, col, id)
	if ent == nil {
		return false
	}
	if held, _ := ent[fieldHeldBy].(string); held != "" && held != player {
		return false
	}
	g.release(col, id)
	return true
}

func (g *Game) release(col, id string) {
	if ent := entity(g.Data, col, id); ent != nil {
		delete(ent, fieldHeldBy)
	}
	delete(g.holds, holdKey(col, id))
}

// touchHold keeps a live lease alive while its holder is still streaming.
func (g *Game) touchHold(col, id, player string) {
	if ent := entity(g.Data, col, id); ent != nil {
		if held, _ := ent[fieldHeldBy].(string); held == player {
			g.holds[holdKey(col, id)] = time.Now().Add(holdTTL)
		}
	}
}

// releaseHeldBy drops every lease a player owns — the synthesized drop that
// runs when they disconnect. Objects stay exactly where they were last seen.
func (g *Game) releaseHeldBy(player string) []entityRef {
	var released []entityRef
	for _, col := range []string{colCards, colPieces} {
		entities := collection(g.Data, col, false)
		for id, raw := range entities {
			ent, ok := raw.(map[string]any)
			if !ok {
				continue
			}
			if held, _ := ent[fieldHeldBy].(string); held == player {
				g.release(col, id)
				released = append(released, entityRef{col: col, id: id})
			}
		}
	}
	return released
}
