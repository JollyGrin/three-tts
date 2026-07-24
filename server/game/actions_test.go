package game

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// table drives a Game the way a lobby does: real players, real messages, and a
// drain of the outbound channel so tests can assert on what each client would
// actually have received.
type table struct {
	t       *testing.T
	game    *Game
	out     <-chan *PlayerMessage
	players map[string]*Player
	// received is the state each client has after applying everything sent to
	// it — the client-side store, reconstructed.
	received map[string]map[string]any
}

func newTable(t *testing.T, playerIDs ...string) *table {
	t.Helper()
	g, out := NewGame()
	tb := &table{
		t:        t,
		game:     g,
		out:      out,
		players:  map[string]*Player{},
		received: map[string]map[string]any{},
	}
	for _, id := range playerIDs {
		tb.players[id] = g.ConnectPlayer(id)
		tb.received[id] = map[string]any{}
	}
	return tb
}

// seed installs canonical state directly, standing in for whatever put the
// table together (a scenario seed, a pack spawn, an import).
func (tb *table) seed(raw string) {
	tb.t.Helper()
	tb.game.mu.Lock()
	tb.game.Data = doc(tb.t, raw)
	tb.game.mu.Unlock()
	for id := range tb.players {
		tb.game.SyncPlayerState(id)
	}
	tb.drain()
}

func (tb *table) update(sender string, raw string) {
	tb.t.Helper()
	tb.game.HandleMessage(tb.players[sender], Message{
		Type:      "update",
		PlayerID:  sender,
		Timestamp: time.Now().UnixMilli(),
		Value:     json.RawMessage(raw),
	})
	tb.drain()
}

func (tb *table) action(sender string, raw string) {
	tb.t.Helper()
	tb.game.HandleMessage(tb.players[sender], Message{
		Type:      "action",
		PlayerID:  sender,
		Timestamp: time.Now().UnixMilli(),
		Value:     json.RawMessage(raw),
	})
	tb.drain()
}

// drain applies every pending outbound message to its recipients' reconstructed
// state, and returns the raw messages for assertions about wire traffic.
func (tb *table) drain() []Message {
	tb.t.Helper()
	var messages []Message
	for {
		select {
		case pm := <-tb.out:
			var msg Message
			require.NoError(tb.t, json.Unmarshal(pm.Content, &msg))
			messages = append(messages, msg)
			for id := range tb.players {
				if len(pm.To) > 0 && !containsID(pm.To, id) {
					continue
				}
				if pm.Exclude == id {
					continue
				}
				tb.apply(id, msg)
			}
		default:
			return messages
		}
	}
}

// apply mirrors the client store: sync replaces, update merges, null deletes.
func (tb *table) apply(id string, msg Message) {
	if msg.Type != "sync" && msg.Type != "update" {
		return
	}
	var value map[string]any
	if err := json.Unmarshal(msg.Value, &value); err != nil {
		return
	}
	if msg.Type == "sync" {
		tb.received[id] = value
		return
	}
	tb.received[id] = mergeWithDeletes(tb.received[id], value)
}

func mergeWithDeletes(dst, patch map[string]any) map[string]any {
	if dst == nil {
		dst = map[string]any{}
	}
	for k, v := range patch {
		if v == nil {
			delete(dst, k)
			continue
		}
		if pm, ok := v.(map[string]any); ok {
			if dm, ok := dst[k].(map[string]any); ok {
				dst[k] = mergeWithDeletes(dm, pm)
				continue
			}
			dst[k] = mergeWithDeletes(map[string]any{}, pm)
			continue
		}
		dst[k] = v
	}
	return dst
}

func containsID(list []string, want string) bool {
	for _, id := range list {
		if id == want {
			return true
		}
	}
	return false
}

func (tb *table) card(player, id string) map[string]any {
	return entity(tb.received[player], colCards, id)
}

func (tb *table) canonicalCard(id string) map[string]any {
	tb.game.mu.Lock()
	defer tb.game.mu.Unlock()
	return entity(tb.game.Data, colCards, id)
}

const twoPlayerTable = `{
	"cards": {
		"card:alice:1": {
			"faceImageUrl": "secret.png",
			"backImageUrl": "back.png",
			"position": [1,0,1],
			"rotation": [180,0,0],
			"visibility": {"kind":"hidden"}
		}
	},
	"players": {
		"alice": {"id":"alice","seat":0,"tray":{}},
		"bob":   {"id":"bob","seat":1,"tray":{}}
	}
}`

func TestSyncSendsEachPlayerOnlyTheirOwnView(t *testing.T) {
	tb := newTable(t, "alice", "bob")
	tb.seed(twoPlayerTable)

	for _, player := range []string{"alice", "bob"} {
		assert.NotContains(t, tb.card(player, "card:alice:1"), fieldFace)
	}
}

func TestGrabIsExclusive(t *testing.T) {
	tb := newTable(t, "alice", "bob")
	tb.seed(twoPlayerTable)

	tb.action("alice", `{"action":"grab","id":"card:alice:1"}`)
	assert.Equal(t, "alice", tb.canonicalCard("card:alice:1")[fieldHeldBy])
	// the lease is public knowledge — that is how the other client knows not to
	// start its own drag
	assert.Equal(t, "alice", tb.card("bob", "card:alice:1")[fieldHeldBy])

	tb.action("bob", `{"action":"grab","id":"card:alice:1"}`)
	assert.Equal(t, "alice", tb.canonicalCard("card:alice:1")[fieldHeldBy], "a concurrent grab is rejected")

	tb.action("alice", `{"action":"drop","id":"card:alice:1"}`)
	assert.NotContains(t, tb.canonicalCard("card:alice:1"), fieldHeldBy)

	tb.action("bob", `{"action":"grab","id":"card:alice:1"}`)
	assert.Equal(t, "bob", tb.canonicalCard("card:alice:1")[fieldHeldBy], "a dropped card is free again")
}

func TestGrabOnHeldCardReportsAnError(t *testing.T) {
	tb := newTable(t, "alice", "bob")
	tb.seed(twoPlayerTable)

	tb.action("alice", `{"action":"grab","id":"card:alice:1"}`)
	tb.game.HandleMessage(tb.players["bob"], Message{
		Type:  "action",
		Value: json.RawMessage(`{"action":"grab","id":"card:alice:1"}`),
	})
	messages := tb.drain()

	var sawError bool
	for _, msg := range messages {
		if msg.Type == "error" {
			sawError = true
		}
	}
	assert.True(t, sawError, "the refused grab is reported back to its sender")
}

func TestMoveOnAHeldCardIsRejected(t *testing.T) {
	tb := newTable(t, "alice", "bob")
	tb.seed(twoPlayerTable)
	tb.action("alice", `{"action":"grab","id":"card:alice:1"}`)

	tb.update("bob", `{"cards":{"card:alice:1":{"position":[9,9,9]}}}`)

	assert.Equal(t, []any{1.0, 0.0, 1.0}, tb.canonicalCard("card:alice:1")[fieldPosition])
	// and bob's optimistic move is walked back on his own client
	assert.Equal(t, []any{1.0, 0.0, 1.0}, tb.card("bob", "card:alice:1")[fieldPosition])
}

func TestHolderCanMoveTheirOwnCard(t *testing.T) {
	tb := newTable(t, "alice", "bob")
	tb.seed(twoPlayerTable)
	tb.action("alice", `{"action":"grab","id":"card:alice:1"}`)

	tb.update("alice", `{"cards":{"card:alice:1":{"position":[4,0,4]}}}`)

	assert.Equal(t, []any{4.0, 0.0, 4.0}, tb.canonicalCard("card:alice:1")[fieldPosition])
	assert.Equal(t, []any{4.0, 0.0, 4.0}, tb.card("bob", "card:alice:1")[fieldPosition])
}

func TestDisconnectReleasesTheLease(t *testing.T) {
	tb := newTable(t, "alice", "bob")
	tb.seed(twoPlayerTable)
	tb.action("alice", `{"action":"grab","id":"card:alice:1"}`)

	tb.game.DisconnectPlayer(tb.players["alice"])
	tb.drain()

	assert.NotContains(t, tb.canonicalCard("card:alice:1"), fieldHeldBy)
	assert.NotContains(t, tb.card("bob", "card:alice:1"), fieldHeldBy)
	// the card stays exactly where the last streamed transform left it
	assert.Equal(t, []any{1.0, 0.0, 1.0}, tb.canonicalCard("card:alice:1")[fieldPosition])

	tb.players["alice"].Connected = true // reconnect
	tb.action("bob", `{"action":"grab","id":"card:alice:1"}`)
	assert.Equal(t, "bob", tb.canonicalCard("card:alice:1")[fieldHeldBy])
}

func TestExpiredLeaseIsStealable(t *testing.T) {
	tb := newTable(t, "alice", "bob")
	tb.seed(twoPlayerTable)
	tb.action("alice", `{"action":"grab","id":"card:alice:1"}`)

	tb.game.mu.Lock()
	tb.game.holds[holdKey(colCards, "card:alice:1")] = time.Now().Add(-time.Minute)
	tb.game.mu.Unlock()

	tb.action("bob", `{"action":"grab","id":"card:alice:1"}`)
	assert.Equal(t, "bob", tb.canonicalCard("card:alice:1")[fieldHeldBy])
}

func TestFlipRevealsAndRehides(t *testing.T) {
	tb := newTable(t, "alice", "bob")
	tb.seed(twoPlayerTable)

	tb.action("alice", `{"action":"flip","id":"card:alice:1"}`)
	for _, player := range []string{"alice", "bob"} {
		assert.Equal(t, "secret.png", tb.card(player, "card:alice:1")[fieldFace],
			"a face-up card is public to the whole table")
	}

	tb.action("alice", `{"action":"flip","id":"card:alice:1"}`)
	for _, player := range []string{"alice", "bob"} {
		assert.NotContains(t, tb.card(player, "card:alice:1"), fieldFace,
			"flipping back down takes the face away again")
	}
}

func TestFlipOnAHeldCardIsRejected(t *testing.T) {
	tb := newTable(t, "alice", "bob")
	tb.seed(twoPlayerTable)
	tb.action("alice", `{"action":"grab","id":"card:alice:1"}`)

	tb.action("bob", `{"action":"flip","id":"card:alice:1"}`)

	assert.Equal(t, []any{180.0, 0.0, 0.0}, tb.canonicalCard("card:alice:1")[fieldRotation])
	assert.NotContains(t, tb.card("bob", "card:alice:1"), fieldFace)
}

func TestPeekEntitlesOnlyThePeekerAndIsRecorded(t *testing.T) {
	tb := newTable(t, "alice", "bob")
	tb.seed(twoPlayerTable)

	tb.game.HandleMessage(tb.players["bob"], Message{
		Type:  "action",
		Value: json.RawMessage(`{"action":"peek","id":"card:alice:1"}`),
	})
	messages := tb.drain()

	assert.Equal(t, "secret.png", tb.card("bob", "card:alice:1")[fieldFace])
	assert.NotContains(t, tb.card("alice", "card:alice:1"), fieldFace)

	// who looked is on the card, for everyone
	visibility, _ := tb.card("alice", "card:alice:1")[fieldVisibility].(map[string]any)
	assert.Equal(t, []any{"bob"}, visibility[fieldSeenBy])

	var logged *Message
	for i, msg := range messages {
		if msg.Type == "log" {
			logged = &messages[i]
		}
	}
	require.NotNil(t, logged, "a peek is announced to the table")
	var payload map[string]any
	require.NoError(t, json.Unmarshal(logged.Value, &payload))
	assert.Equal(t, "peek", payload["kind"])
	assert.Equal(t, "bob", payload["playerId"])
	assert.Equal(t, "card:alice:1", payload["cardId"])
}

func TestRevealMakesACardPublic(t *testing.T) {
	tb := newTable(t, "alice", "bob")
	tb.seed(twoPlayerTable)

	tb.action("alice", `{"action":"reveal","id":"card:alice:1"}`)

	for _, player := range []string{"alice", "bob"} {
		assert.Equal(t, "secret.png", tb.card(player, "card:alice:1")[fieldFace])
		assert.Equal(t, []any{0.0, 0.0, 0.0}, tb.card(player, "card:alice:1")[fieldRotation])
	}
}

func TestTrayAndUntrayKeepHandsPrivate(t *testing.T) {
	tb := newTable(t, "alice", "bob")
	tb.seed(twoPlayerTable)

	tb.action("alice", `{"action":"tray","id":"card:alice:1"}`)

	assert.Nil(t, tb.canonicalCard("card:alice:1"), "the card leaves the table")
	mine := entity(tb.received["alice"], colPlayers, "alice")
	tray, _ := mine[fieldTray].(map[string]any)
	require.Len(t, tray, 1)
	assert.Equal(t, "secret.png", tray["card:alice:1"].(map[string]any)[fieldFace])

	theirs := entity(tb.received["bob"], colPlayers, "alice")
	assert.NotContains(t, theirs, fieldTray)
	assert.Equal(t, float64(1), theirs[fieldHandCount])

	tb.action("alice", `{"action":"untray","id":"card:alice:1","position":[2,2.5,2],"rotation":[0,0,90]}`)

	back := tb.canonicalCard("card:alice:1")
	require.NotNil(t, back)
	assert.Equal(t, []any{180.0, 0.0, 90.0}, back[fieldRotation], "cards leave the hand facedown")
	assert.Equal(t, "alice", back[fieldHeldBy], "the card comes out already leased to its drawer")
	assert.NotContains(t, tb.card("bob", "card:alice:1"), fieldFace)
	assert.Equal(t, float64(0), entity(tb.received["bob"], colPlayers, "alice")[fieldHandCount])
}

func TestTrayingSomeoneElsesHeldCardIsRejected(t *testing.T) {
	tb := newTable(t, "alice", "bob")
	tb.seed(twoPlayerTable)
	tb.action("alice", `{"action":"grab","id":"card:alice:1"}`)

	tb.action("bob", `{"action":"tray","id":"card:alice:1"}`)

	assert.NotNil(t, tb.canonicalCard("card:alice:1"))
	assert.Empty(t, entity(tb.game.Data, colPlayers, "bob")[fieldTray])
}

const deckTable = `{
	"decks": {
		"deck:alice:main": {
			"id": "deck:alice:main",
			"isFaceUp": false,
			"deckBackImageUrl": "back.png",
			"position": [8,0.4,4],
			"cards": [
				{"id":"card:alice:main-2C","faceImageUrl":"two.png"},
				{"id":"card:alice:main-AS","faceImageUrl":"ace.png"}
			]
		}
	},
	"players": {
		"alice": {"id":"alice","seat":0,"tray":{}},
		"bob":   {"id":"bob","seat":1,"tray":{}}
	}
}`

func TestDrawTakesTheTopCardWithoutShippingTheDeck(t *testing.T) {
	tb := newTable(t, "alice", "bob")
	tb.seed(deckTable)

	tb.action("alice", `{"action":"draw","deckId":"deck:alice:main","id":"card:alice:xyz789","position":[0,2.5,0],"rotation":[0,0,0]}`)

	drawn := tb.canonicalCard("card:alice:xyz789")
	require.NotNil(t, drawn)
	assert.Equal(t, "ace.png", drawn[fieldFace], "the top of a facedown deck is its last entry")
	assert.Equal(t, "back.png", drawn[fieldBack])
	assert.Equal(t, []any{180.0, 0.0, 0.0}, drawn[fieldRotation])
	assert.Equal(t, "alice", drawn[fieldHeldBy])

	// nobody — not even the drawer — is shown a face they have not turned over
	for _, player := range []string{"alice", "bob"} {
		assert.NotContains(t, tb.card(player, "card:alice:xyz789"), fieldFace)
		deck := entity(tb.received[player], colDecks, "deck:alice:main")
		assert.NotContains(t, deck, fieldCards)
		assert.Equal(t, float64(1), deck[fieldCardCount])
	}
}

func TestDrawRequiresAnIdNamespacedToTheSender(t *testing.T) {
	tb := newTable(t, "alice", "bob")
	tb.seed(deckTable)

	tb.action("bob", `{"action":"draw","deckId":"deck:alice:main","id":"card:alice:sneaky","position":[0,2.5,0]}`)

	assert.Nil(t, tb.canonicalCard("card:alice:sneaky"))
}

// A client that drew optimistically must be walked back when the draw fails —
// otherwise the ghost card it painted stays on its table forever.
func TestRejectedDrawRemovesTheClientsGhostCard(t *testing.T) {
	tb := newTable(t, "alice", "bob")
	tb.seed(deckTable)

	// alice paints the card she is about to drag, then the draw is refused
	tb.received["alice"] = mergeWithDeletes(tb.received["alice"], doc(t,
		`{"cards":{"card:alice:ghost":{"position":[0,2.5,0],"rotation":[180,0,0]}}}`))
	tb.action("alice", `{"action":"draw","deckId":"deck:nope","id":"card:alice:ghost","position":[0,2.5,0]}`)

	assert.Nil(t, tb.card("alice", "card:alice:ghost"))
}

func TestPlaceOnDeckPutsTheFaceBackBehindTheServer(t *testing.T) {
	tb := newTable(t, "alice", "bob")
	tb.seed(deckTable)
	tb.action("alice", `{"action":"draw","deckId":"deck:alice:main","id":"card:alice:xyz789","position":[0,2.5,0]}`)
	tb.action("alice", `{"action":"flip","id":"card:alice:xyz789"}`)
	require.Equal(t, "ace.png", tb.card("alice", "card:alice:xyz789")[fieldFace])

	tb.action("alice", `{"action":"placeOnDeck","deckId":"deck:alice:main","id":"card:alice:xyz789"}`)

	assert.Nil(t, tb.canonicalCard("card:alice:xyz789"))
	for _, player := range []string{"alice", "bob"} {
		assert.Nil(t, tb.card(player, "card:alice:xyz789"))
		assert.Equal(t, float64(2), entity(tb.received[player], colDecks, "deck:alice:main")[fieldCardCount])
	}
}

func TestShuffleStaysOnTheServer(t *testing.T) {
	tb := newTable(t, "alice", "bob")
	tb.seed(deckTable)

	tb.action("alice", `{"action":"shuffle","deckId":"deck:alice:main"}`)

	tb.game.mu.Lock()
	cards, _ := entity(tb.game.Data, colDecks, "deck:alice:main")[fieldCards].([]any)
	tb.game.mu.Unlock()
	assert.Len(t, cards, 2, "shuffling neither loses nor reveals cards")
}

func TestClaimSeatMovesTheHiddenHandServerSide(t *testing.T) {
	tb := newTable(t, "alice")
	tb.seed(`{
		"cards": {"card:seat1:token": {"position":[0,0,0],"rotation":[0,0,0],"faceImageUrl":"public.png"}},
		"decks": {"deck:seat1:main": {"id":"deck:seat1:main","cards":[{"id":"x","faceImageUrl":"a.png"}]}},
		"players": {
			"alice": {"id":"alice","seat":0,"tray":{}},
			"seat1": {"id":"seat1","seat":1,"tray":{"dealt":{"faceImageUrl":"dealt.png"}}}
		}
	}`)
	// the claiming client cannot see what it is about to claim
	require.NotContains(t, entity(tb.received["alice"], colPlayers, "seat1"), fieldTray)

	tb.action("alice", `{"action":"claimSeat","seat":1}`)

	mine := entity(tb.received["alice"], colPlayers, "alice")
	assert.Equal(t, float64(1), mine["seat"])
	tray, _ := mine[fieldTray].(map[string]any)
	require.Len(t, tray, 1, "the seat's pre-dealt hand arrives with the seat")
	assert.Equal(t, "dealt.png", tray["dealt"].(map[string]any)[fieldFace])

	assert.Nil(t, entity(tb.received["alice"], colPlayers, "seat1"))
	assert.NotNil(t, entity(tb.received["alice"], colCards, "card:alice:token"))
	assert.Nil(t, entity(tb.received["alice"], colCards, "card:seat1:token"))
	assert.NotNil(t, entity(tb.received["alice"], colDecks, "deck:alice:main"))
}
