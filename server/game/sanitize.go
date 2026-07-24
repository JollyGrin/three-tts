package game

import "fmt"

// sanitizeUpdate splits an incoming merge patch into the part the sender is
// allowed to apply and a list of what was refused.
//
// `update` is still the write path for the cheap, non-secret half of the game —
// streaming a drag, laying out a table, seeding a scenario, moving a deck. What
// it may no longer do is touch anything that carries hidden information or
// belongs to somebody else; those go through validated actions instead (see
// actions.go). Anything refused is dropped from the patch, never merged, and
// reported back so the sender can be corrected.
//
// Expects g.mu to be held. The returned patch shares no memory with the input.
func (g *Game) sanitizeUpdate(patch map[string]any, sender string) (map[string]any, []string) {
	accepted := make(map[string]any, len(patch))
	var refused []string

	for key, value := range patch {
		switch key {
		case colCards, colPieces:
			kept, why := g.sanitizeObjects(key, value, sender)
			accepted[key] = kept
			refused = append(refused, why...)
		case colDecks:
			kept, why := g.sanitizeDecks(value)
			accepted[key] = kept
			refused = append(refused, why...)
		case colPlayers:
			kept, why := g.sanitizePlayers(value, sender)
			accepted[key] = kept
			refused = append(refused, why...)
		default:
			accepted[key] = deepCopy(value)
		}
	}

	// drop collections that ended up empty so the merge stays a no-op
	for key, value := range accepted {
		if m, ok := value.(map[string]any); ok && len(m) == 0 {
			delete(accepted, key)
		}
	}
	return accepted, refused
}

// sanitizeObjects validates a cards/pieces patch: you may not touch an object
// somebody else is holding, and you may never write the server-owned fields
// (visibility, heldBy) or repaint the face of a card that already exists.
func (g *Game) sanitizeObjects(col string, value any, sender string) (any, []string) {
	entities, ok := value.(map[string]any)
	if !ok {
		return deepCopy(value), nil
	}
	kept := make(map[string]any, len(entities))
	var refused []string

	for id, raw := range entities {
		if !g.mutableBy(col, id, sender) {
			refused = append(refused, fmt.Sprintf("%s/%s is held by %s", col, id, g.holder(col, id)))
			continue
		}
		if raw == nil { // delete
			kept[id] = nil
			continue
		}
		ent, ok := raw.(map[string]any)
		if !ok {
			kept[id] = deepCopy(raw)
			continue
		}
		exists := entity(g.Data, col, id) != nil
		copied := deepCopyMap(ent)
		delete(copied, fieldVisibility)
		delete(copied, fieldHeldBy)
		if col == colCards && exists {
			// The face of a card already on the table is the server's to
			// hand out — see flip/peek/reveal. Letting a client re-declare it
			// would let it launder a face it was never sent.
			delete(copied, fieldFace)
		}
		kept[id] = copied
		g.touchHold(col, id, sender)
	}
	return kept, refused
}

// sanitizeDecks refuses rewrites of an existing deck's card list. Creating or
// replacing a deck wholesale (import, scenario seed, pack spawn) carries the
// `id` field and is allowed; draw/shuffle/place send only `cards` and must go
// through the actions that keep deck order server-side.
func (g *Game) sanitizeDecks(value any) (any, []string) {
	decks, ok := value.(map[string]any)
	if !ok {
		return deepCopy(value), nil
	}
	kept := make(map[string]any, len(decks))
	var refused []string

	for id, raw := range decks {
		if raw == nil {
			kept[id] = nil
			continue
		}
		deck, ok := raw.(map[string]any)
		if !ok {
			kept[id] = deepCopy(raw)
			continue
		}
		copied := deepCopyMap(deck)
		delete(copied, fieldCardCount) // server-derived
		if _, hasCards := copied[fieldCards]; hasCards {
			_, isFullDefinition := copied["id"]
			if entity(g.Data, colDecks, id) != nil && !isFullDefinition {
				delete(copied, fieldCards)
				refused = append(refused, fmt.Sprintf("decks/%s card list is server-owned (use draw/shuffle/place)", id))
			}
		}
		kept[id] = copied
	}
	return kept, refused
}

// sanitizePlayers keeps players to their own row (plus the unclaimed seat
// placeholders a scenario is built from) and keeps hands out of the merge path
// entirely — a tray only ever changes via the tray/untray/claimSeat actions.
func (g *Game) sanitizePlayers(value any, sender string) (any, []string) {
	players, ok := value.(map[string]any)
	if !ok {
		return deepCopy(value), nil
	}
	kept := make(map[string]any, len(players))
	var refused []string

	for id, raw := range players {
		if id != sender && !isSeatPlaceholder(id) {
			refused = append(refused, fmt.Sprintf("players/%s is not yours to write", id))
			continue
		}
		if raw == nil {
			kept[id] = nil
			continue
		}
		player, ok := raw.(map[string]any)
		if !ok {
			kept[id] = deepCopy(raw)
			continue
		}
		copied := deepCopyMap(player)
		delete(copied, fieldHandCount) // server-derived
		if tray, present := copied[fieldTray]; present && !isSeatPlaceholder(id) {
			// An empty tray is how a client introduces itself; anything with
			// contents is a hand mutation and must be an action.
			//
			// Seeding an *unclaimed* seat's hand is the exception: a scenario
			// lays those out wholesale, and nobody is entitled to a placeholder's
			// tray anyway — it stays hidden from every client until claimed.
			if m, ok := tray.(map[string]any); !ok || len(m) > 0 {
				delete(copied, fieldTray)
				refused = append(refused, fmt.Sprintf("players/%s tray is server-owned (use tray/untray)", id))
			}
		}
		kept[id] = copied
	}
	return kept, refused
}
