package game

import (
	"regexp"
	"slices"
	"strings"
)

// Collections inside the synced GameDTO document.
const (
	colCards    = "cards"
	colDecks    = "decks"
	colPlayers  = "players"
	colPieces   = "pieces"
	colOverlays = "overlays"
)

// Fields the server owns. A client may never write these — they are the
// secrecy model itself, so a hand-crafted socket message must not be able to
// declare a card public or hand itself a hold lease.
const (
	fieldVisibility = "visibility"
	fieldHeldBy     = "heldBy"
	fieldFace       = "faceImageUrl"
	fieldBack       = "backImageUrl"
	fieldTray       = "tray"
	fieldHandCount  = "handCount"
	fieldCards      = "cards"
	fieldCardCount  = "cardCount"
	fieldIsFaceUp   = "isFaceUp"
	fieldRotation   = "rotation"
	fieldPosition   = "position"
	fieldSeenBy     = "seenBy"
	fieldKind       = "kind"
)

const (
	visPublic = "public"
	visHidden = "hidden"
)

// facedownRotationX is the flip convention shared with the client: 180° on the
// x axis means the back of the card is what the table sees.
const facedownRotationX = 180.0

// seatPlaceholder matches the `seat0`–`seat3` stand-in players a scenario is
// authored against. They are not real players, so nobody is entitled to their
// hand until a player claims the seat (see claimSeat).
var seatPlaceholder = regexp.MustCompile(`^seat[0-3]$`)

func isSeatPlaceholder(id string) bool { return seatPlaceholder.MatchString(id) }

// isFacedown reports whether a card's rotation puts its back up.
func isFacedown(card map[string]any) bool {
	rot := floats(card[fieldRotation], 3)
	return rot[0] == facedownRotationX
}

// cardVisibility resolves a card's visibility descriptor.
//
// A missing descriptor falls back to orientation: a facedown card is hidden
// from everyone. That default is deliberately the *safe* one — state seeded by
// an older client or a scenario file has no descriptor, and inferring "public"
// there would leak exactly what this model exists to protect.
func cardVisibility(card map[string]any) (kind string, seenBy []string) {
	if v, ok := card[fieldVisibility].(map[string]any); ok {
		switch k, _ := v[fieldKind].(string); k {
		case visPublic:
			return visPublic, nil
		case visHidden:
			return visHidden, strSlice(v[fieldSeenBy])
		}
	}
	if isFacedown(card) {
		return visHidden, nil
	}
	return visPublic, nil
}

// canSeeCard reports whether playerID is entitled to a card's face.
func canSeeCard(card map[string]any, playerID string) bool {
	kind, seenBy := cardVisibility(card)
	if kind == visPublic {
		return true
	}
	return slices.Contains(seenBy, playerID)
}

func hiddenVisibility(seenBy []string) map[string]any {
	v := map[string]any{fieldKind: visHidden}
	if len(seenBy) > 0 {
		list := make([]any, len(seenBy))
		for i, id := range seenBy {
			list[i] = id
		}
		v[fieldSeenBy] = list
	}
	return v
}

func publicVisibility() map[string]any {
	return map[string]any{fieldKind: visPublic}
}

// viewFor builds the copy of the game document that playerID is entitled to
// receive. Everything a player may not see is removed here, on the way out of
// the server — this is the one place the secrecy property is enforced for
// reads, so nothing downstream needs to be trusted with hidden data.
//
// The rules:
//   - a card whose face this player may not see ships without faceImageUrl
//     (backs, transforms and the visibility descriptor still ship, so the table
//     renders identically and the client knows *that* it is hidden)
//   - a deck ships as a count; a face-up deck additionally ships its top card,
//     which is the only card anyone can actually see
//   - another player's tray ships as a count with no contents at all
func viewFor(data map[string]any, playerID string) map[string]any {
	out := make(map[string]any, len(data))
	for key, value := range data {
		switch key {
		case colCards:
			out[key] = filterCards(value, playerID)
		case colDecks:
			out[key] = filterDecks(value)
		case colPlayers:
			out[key] = filterPlayers(value, playerID)
		default:
			out[key] = deepCopy(value)
		}
	}
	return out
}

func filterCards(value any, playerID string) any {
	cards, ok := value.(map[string]any)
	if !ok {
		return deepCopy(value)
	}
	out := make(map[string]any, len(cards))
	for id, raw := range cards {
		card, ok := raw.(map[string]any)
		if !ok {
			out[id] = deepCopy(raw)
			continue
		}
		copied := deepCopyMap(card)
		if !canSeeCard(card, playerID) {
			delete(copied, fieldFace)
		}
		out[id] = copied
	}
	return out
}

func filterDecks(value any) any {
	decks, ok := value.(map[string]any)
	if !ok {
		return deepCopy(value)
	}
	out := make(map[string]any, len(decks))
	for id, raw := range decks {
		deck, ok := raw.(map[string]any)
		if !ok {
			out[id] = deepCopy(raw)
			continue
		}
		copied := deepCopyMap(deck)
		if cards, ok := deck[fieldCards].([]any); ok {
			copied[fieldCardCount] = float64(len(cards))
			// A face-up pile shows exactly one card to the table: its top.
			// Everything under it — and every card in a facedown deck — stays
			// on the server.
			if isFaceUp(deck) && len(cards) > 0 {
				copied[fieldCards] = []any{deepCopy(cards[0])}
			} else {
				delete(copied, fieldCards)
			}
		}
		out[id] = copied
	}
	return out
}

func filterPlayers(value any, playerID string) any {
	players, ok := value.(map[string]any)
	if !ok {
		return deepCopy(value)
	}
	out := make(map[string]any, len(players))
	for id, raw := range players {
		player, ok := raw.(map[string]any)
		if !ok {
			out[id] = deepCopy(raw)
			continue
		}
		copied := deepCopyMap(player)
		if tray, ok := player[fieldTray].(map[string]any); ok {
			copied[fieldHandCount] = float64(len(tray))
			if id != playerID {
				delete(copied, fieldTray)
			}
		}
		out[id] = copied
	}
	return out
}

func isFaceUp(deck map[string]any) bool {
	up, _ := deck[fieldIsFaceUp].(bool)
	return up
}

// renameOwner swaps the owner segment of a `kind:owner:slug` entity id.
func renameOwner(id, from, to string) string {
	parts := strings.Split(id, ":")
	for i, part := range parts {
		if part == from {
			parts[i] = to
		}
	}
	return strings.Join(parts, ":")
}
