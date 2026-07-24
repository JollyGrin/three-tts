package game

import (
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"math/rand/v2"
	"slices"
	"strings"
)

// Actions are the validated write path. Anything that moves hidden information
// around — drawing, trays, flips, peeks, shuffles — happens here, on the
// server, because the client that asks for it may not (and usually must not)
// hold the data the action operates on.
//
// Every handler runs under g.mu and returns the entities it touched. Those refs
// are force-included in the requesting client's next patch, so a rejected
// action undoes whatever the client drew optimistically.

type entityRef struct{ col, id string }

type actionRequest struct {
	Action string `json:"action"`
	// ID addresses a card or a piece; `piece:` prefixed ids are pieces,
	// everything else is a card (the same convention the client drags by).
	ID       string    `json:"id,omitempty"`
	DeckID   string    `json:"deckId,omitempty"`
	Position []float64 `json:"position,omitempty"`
	Rotation []float64 `json:"rotation,omitempty"`
	Seat     *int      `json:"seat,omitempty"`
}

func (r actionRequest) collection() string {
	if strings.HasPrefix(r.ID, "piece:") {
		return colPieces
	}
	return colCards
}

var errNotFound = errors.New("not found")

// applyAction validates and applies one action, then fans the result out.
func (g *Game) applyAction(sender string, msg Message) {
	var req actionRequest
	if err := json.Unmarshal(msg.Value, &req); err != nil {
		g.sendError(sender, "malformed action")
		return
	}

	g.mu.Lock()
	touched, extra, err := g.dispatch(sender, req)
	if err == nil {
		g.Updates++
		g.touchActivity()
	}
	messages := g.buildFanout(sender, nil, touched)
	g.mu.Unlock()

	g.send(messages...)
	g.send(extra...)
	if err != nil {
		g.sendError(sender, fmt.Sprintf("%s rejected: %v", req.Action, err))
	}
}

// dispatch runs one action. The returned refs are reported even on failure —
// that is what corrects a client that already drew the result locally.
func (g *Game) dispatch(sender string, req actionRequest) ([]entityRef, []*PlayerMessage, error) {
	switch req.Action {
	case "grab":
		return g.actionGrab(sender, req)
	case "drop":
		return g.actionDrop(sender, req)
	case "flip":
		return g.actionFlip(sender, req)
	case "peek":
		return g.actionPeek(sender, req)
	case "reveal":
		return g.actionReveal(sender, req)
	case "tray":
		return g.actionTray(sender, req)
	case "untray":
		return g.actionUntray(sender, req)
	case "draw":
		return g.actionDraw(sender, req)
	case "placeOnDeck":
		return g.actionPlaceOnDeck(sender, req)
	case "shuffle":
		return g.actionShuffle(req)
	case "claimSeat":
		return g.actionClaimSeat(sender, req)
	default:
		return nil, nil, fmt.Errorf("unknown action %q", req.Action)
	}
}

func (g *Game) actionGrab(sender string, req actionRequest) ([]entityRef, []*PlayerMessage, error) {
	col := req.collection()
	refs := []entityRef{{col, req.ID}}
	if entity(g.Data, col, req.ID) == nil {
		return refs, nil, errNotFound
	}
	if !g.grab(col, req.ID, sender) {
		return refs, nil, fmt.Errorf("held by %s", g.holder(col, req.ID))
	}
	return refs, nil, nil
}

func (g *Game) actionDrop(sender string, req actionRequest) ([]entityRef, []*PlayerMessage, error) {
	col := req.collection()
	refs := []entityRef{{col, req.ID}}
	if !g.drop(col, req.ID, sender) {
		return refs, nil, errors.New("not yours to drop")
	}
	return refs, nil, nil
}

// actionFlip turns a card over. Flipping face-up is what makes a face public;
// flipping face-down takes it away from everyone again, including whoever just
// looked at it — "facedown" means hidden, with no exceptions to reason about.
func (g *Game) actionFlip(sender string, req actionRequest) ([]entityRef, []*PlayerMessage, error) {
	refs := []entityRef{{colCards, req.ID}}
	card := entity(g.Data, colCards, req.ID)
	if card == nil {
		return refs, nil, errNotFound
	}
	if !g.mutableBy(colCards, req.ID, sender) {
		return refs, nil, fmt.Errorf("held by %s", g.holder(colCards, req.ID))
	}
	rot := floats(card[fieldRotation], 3)
	if rot[0] == facedownRotationX {
		rot[0] = 0
		card[fieldVisibility] = publicVisibility()
	} else {
		rot[0] = facedownRotationX
		card[fieldVisibility] = hiddenVisibility(nil)
	}
	card[fieldRotation] = anyFloats(rot)
	return refs, nil, nil
}

// actionPeek is the sanctioned way to look at a hidden card: it entitles the
// peeker to the face and puts their name in seenBy, where every other client
// can see it. Looking at a card is a move, not a side effect of hovering.
func (g *Game) actionPeek(sender string, req actionRequest) ([]entityRef, []*PlayerMessage, error) {
	refs := []entityRef{{colCards, req.ID}}
	card := entity(g.Data, colCards, req.ID)
	if card == nil {
		return refs, nil, errNotFound
	}
	kind, seenBy := cardVisibility(card)
	if kind == visPublic {
		return refs, nil, errors.New("card is already face up")
	}
	if !slices.Contains(seenBy, sender) {
		seenBy = append(seenBy, sender)
	}
	card[fieldVisibility] = hiddenVisibility(seenBy)
	return refs, []*PlayerMessage{g.logMessage("peek", sender, req.ID)}, nil
}

// actionReveal turns a hidden card face-up for the whole table at once.
func (g *Game) actionReveal(sender string, req actionRequest) ([]entityRef, []*PlayerMessage, error) {
	refs := []entityRef{{colCards, req.ID}}
	card := entity(g.Data, colCards, req.ID)
	if card == nil {
		return refs, nil, errNotFound
	}
	if !g.mutableBy(colCards, req.ID, sender) {
		return refs, nil, fmt.Errorf("held by %s", g.holder(colCards, req.ID))
	}
	rot := floats(card[fieldRotation], 3)
	rot[0] = 0
	card[fieldRotation] = anyFloats(rot)
	card[fieldVisibility] = publicVisibility()
	return refs, []*PlayerMessage{g.logMessage("reveal", sender, req.ID)}, nil
}

// actionTray moves a table card into the sender's own hand. The card leaves
// `cards` entirely, so from here on it exists only in a collection no other
// client is ever sent.
func (g *Game) actionTray(sender string, req actionRequest) ([]entityRef, []*PlayerMessage, error) {
	refs := []entityRef{{colCards, req.ID}, {colPlayers, sender}}
	card := entity(g.Data, colCards, req.ID)
	if card == nil {
		return refs, nil, errNotFound
	}
	if !g.mutableBy(colCards, req.ID, sender) {
		return refs, nil, fmt.Errorf("held by %s", g.holder(colCards, req.ID))
	}
	player := entity(g.Data, colPlayers, sender)
	if player == nil {
		return refs, nil, errors.New("no such player")
	}
	tray := collection(player, fieldTray, true)
	tray[req.ID] = map[string]any{
		fieldFace: card[fieldFace],
		fieldBack: card[fieldBack],
	}
	g.release(colCards, req.ID)
	delete(collection(g.Data, colCards, true), req.ID)
	return refs, nil, nil
}

// actionUntray puts a card from the sender's hand back on the table, facedown
// and already leased to them so the drag that follows is theirs.
func (g *Game) actionUntray(sender string, req actionRequest) ([]entityRef, []*PlayerMessage, error) {
	refs := []entityRef{{colCards, req.ID}, {colPlayers, sender}}
	player := entity(g.Data, colPlayers, sender)
	if player == nil {
		return refs, nil, errors.New("no such player")
	}
	tray := collection(player, fieldTray, false)
	if tray == nil {
		return refs, nil, errNotFound
	}
	held, ok := tray[req.ID].(map[string]any)
	if !ok {
		return refs, nil, errNotFound
	}
	if entity(g.Data, colCards, req.ID) != nil {
		return refs, nil, errors.New("already on the table")
	}
	delete(tray, req.ID)

	card := map[string]any{
		fieldFace:       held[fieldFace],
		fieldBack:       held[fieldBack],
		fieldPosition:   anyFloats(vec3(req.Position)),
		fieldRotation:   anyFloats(facedown(req.Rotation)),
		fieldVisibility: hiddenVisibility(nil),
	}
	collection(g.Data, colCards, true)[req.ID] = card
	g.grab(colCards, req.ID, sender)
	return refs, nil, nil
}

// actionDraw takes the top card off a deck and materializes it on the table.
//
// The client asks for this by id and never sees what it drew until the card
// says it may: deck contents live on the server, so a draw is the only way a
// face ever leaves it. The requested id must be namespaced to the sender, and
// is expected to be opaque — an id like `card:alice:main-AS` would announce the
// card it names.
func (g *Game) actionDraw(sender string, req actionRequest) ([]entityRef, []*PlayerMessage, error) {
	refs := []entityRef{{colCards, req.ID}, {colDecks, req.DeckID}}
	if !strings.HasPrefix(req.ID, "card:"+sender+":") {
		return refs, nil, errors.New("drawn card id must be namespaced to you")
	}
	if entity(g.Data, colCards, req.ID) != nil {
		return refs, nil, errors.New("card id already in play")
	}
	deck := entity(g.Data, colDecks, req.DeckID)
	if deck == nil {
		return refs, nil, errNotFound
	}
	cards, _ := deck[fieldCards].([]any)
	if len(cards) == 0 {
		return refs, nil, errors.New("deck is empty")
	}

	faceUp := isFaceUp(deck)
	var drawn any
	if faceUp {
		// a face-up pile is drawn from the top of the list (LIFO mirrored)
		drawn, cards = cards[0], cards[1:]
	} else {
		drawn, cards = cards[len(cards)-1], cards[:len(cards)-1]
	}
	deck[fieldCards] = cards

	entry, _ := drawn.(map[string]any)
	back := entry[fieldBack]
	if back == nil {
		back = deck["deckBackImageUrl"]
	}
	rot := vec3(req.Rotation)
	card := map[string]any{
		fieldFace:     entry[fieldFace],
		fieldBack:     back,
		fieldPosition: anyFloats(vec3(req.Position)),
	}
	if faceUp {
		rot[0] = 0
		card[fieldVisibility] = publicVisibility()
	} else {
		rot[0] = facedownRotationX
		card[fieldVisibility] = hiddenVisibility(nil)
	}
	card[fieldRotation] = anyFloats(rot)
	collection(g.Data, colCards, true)[req.ID] = card
	g.grab(colCards, req.ID, sender)
	return refs, nil, nil
}

// actionPlaceOnDeck returns a table card to a deck. The card's face goes back
// behind the server boundary in the same move.
func (g *Game) actionPlaceOnDeck(sender string, req actionRequest) ([]entityRef, []*PlayerMessage, error) {
	refs := []entityRef{{colCards, req.ID}, {colDecks, req.DeckID}}
	card := entity(g.Data, colCards, req.ID)
	if card == nil {
		return refs, nil, errNotFound
	}
	if !g.mutableBy(colCards, req.ID, sender) {
		return refs, nil, fmt.Errorf("held by %s", g.holder(colCards, req.ID))
	}
	deck := entity(g.Data, colDecks, req.DeckID)
	if deck == nil {
		return refs, nil, errNotFound
	}
	cards, _ := deck[fieldCards].([]any)
	entry := map[string]any{
		"id":      req.ID,
		fieldFace: card[fieldFace],
		fieldBack: card[fieldBack],
	}
	if isFaceUp(deck) {
		cards = append([]any{entry}, cards...)
	} else {
		cards = append(cards, entry)
	}
	deck[fieldCards] = cards
	g.release(colCards, req.ID)
	delete(collection(g.Data, colCards, true), req.ID)
	return refs, nil, nil
}

// actionShuffle reorders a deck server-side. Done on the client it would be
// meaningless: the client has counts, not cards.
func (g *Game) actionShuffle(req actionRequest) ([]entityRef, []*PlayerMessage, error) {
	refs := []entityRef{{colDecks, req.DeckID}}
	deck := entity(g.Data, colDecks, req.DeckID)
	if deck == nil {
		return refs, nil, errNotFound
	}
	cards, _ := deck[fieldCards].([]any)
	if len(cards) < 2 {
		return refs, nil, nil
	}
	shuffled := make([]any, len(cards))
	copy(shuffled, cards)
	rand.Shuffle(len(shuffled), func(i, j int) {
		shuffled[i], shuffled[j] = shuffled[j], shuffled[i]
	})
	deck[fieldCards] = shuffled
	return refs, nil, nil
}

// actionClaimSeat hands a scenario's placeholder seat to a real player: every
// entity owned by `seatN` is renamed to them, and the seat's pre-dealt hand
// moves across. This has to be a server action — the placeholder's tray is
// hidden from everyone, so the claiming client cannot see what it is claiming.
func (g *Game) actionClaimSeat(sender string, req actionRequest) ([]entityRef, []*PlayerMessage, error) {
	if req.Seat == nil || *req.Seat < 0 || *req.Seat > 3 {
		return nil, nil, errors.New("seat must be 0-3")
	}
	placeholder := fmt.Sprintf("seat%d", *req.Seat)
	players := collection(g.Data, colPlayers, true)
	ph, ok := players[placeholder].(map[string]any)
	if !ok {
		return nil, nil, errors.New("seat is not open")
	}

	refs := []entityRef{{colPlayers, placeholder}, {colPlayers, sender}}
	segment := ":" + placeholder + ":"
	for _, col := range []string{colCards, colDecks, colPieces} {
		entities := collection(g.Data, col, false)
		for id, value := range entities {
			if !strings.Contains(id, segment) {
				continue
			}
			newID := renameOwner(id, placeholder, sender)
			if ent, ok := value.(map[string]any); ok {
				if _, hasID := ent["id"]; hasID {
					ent["id"] = newID
				}
			}
			delete(entities, id)
			entities[newID] = value
			refs = append(refs, entityRef{col, id}, entityRef{col, newID})
		}
	}

	me, ok := players[sender].(map[string]any)
	if !ok {
		me = map[string]any{"id": sender}
		players[sender] = me
	}
	me["seat"] = float64(*req.Seat)
	if tray, ok := ph[fieldTray].(map[string]any); ok && len(tray) > 0 {
		maps.Copy(collection(me, fieldTray, true), tray)
	}
	delete(players, placeholder)
	return refs, nil, nil
}

// vec3 normalizes a client-supplied position/rotation to three components.
func vec3(values []float64) []float64 {
	out := make([]float64, 3)
	copy(out, values)
	return out
}

func facedown(rotation []float64) []float64 {
	rot := vec3(rotation)
	rot[0] = facedownRotationX
	return rot
}

