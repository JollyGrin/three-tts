package game

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newSanitizeGame(t *testing.T, state string) *Game {
	t.Helper()
	g, _ := NewGame()
	g.Data = doc(t, state)
	return g
}

func TestUpdateCannotWriteAnotherPlayersRow(t *testing.T) {
	g := newSanitizeGame(t, `{"players":{"alice":{"id":"alice","seat":0},"bob":{"id":"bob","seat":1}}}`)

	accepted, refused := g.sanitizeUpdate(doc(t, `{"players":{
		"bob":   {"seat": 3},
		"alice": {"seat": 2}
	}}`), "alice")

	players, _ := accepted[colPlayers].(map[string]any)
	assert.NotContains(t, players, "bob")
	assert.Contains(t, players, "alice")
	assert.Len(t, refused, 1)
}

func TestUpdateCannotWriteAHand(t *testing.T) {
	g := newSanitizeGame(t, `{"players":{"alice":{"id":"alice","tray":{}}}}`)

	accepted, refused := g.sanitizeUpdate(doc(t,
		`{"players":{"alice":{"seat":1,"tray":{"c1":{"faceImageUrl":"a.png"}}}}}`), "alice")

	alice, _ := accepted[colPlayers].(map[string]any)["alice"].(map[string]any)
	assert.NotContains(t, alice, fieldTray)
	assert.Equal(t, float64(1), alice["seat"], "the rest of the row still applies")
	assert.Len(t, refused, 1)
}

// Introducing yourself carries an empty tray, and a scenario seeds the hands of
// seats nobody is sitting in yet. Neither is a hand mutation.
func TestUpdateAllowsEmptyTrayAndSeatSeeding(t *testing.T) {
	g := newSanitizeGame(t, `{"players":{}}`)

	accepted, refused := g.sanitizeUpdate(doc(t, `{"players":{
		"alice": {"id":"alice","tray":{}},
		"seat1": {"id":"seat1","seat":1,"tray":{"dealt":{"faceImageUrl":"a.png"}}}
	}}`), "alice")

	players, _ := accepted[colPlayers].(map[string]any)
	assert.Contains(t, players["alice"], fieldTray)
	assert.Contains(t, players["seat1"], fieldTray)
	assert.Empty(t, refused)
}

func TestUpdateCannotDeclareVisibilityOrLeases(t *testing.T) {
	g := newSanitizeGame(t, `{"cards":{"c1":{"rotation":[180,0,0],"faceImageUrl":"secret.png"}}}`)

	accepted, _ := g.sanitizeUpdate(doc(t, `{"cards":{"c1":{
		"visibility": {"kind":"public"},
		"heldBy": "mallory",
		"position": [1,1,1]
	}}}`), "mallory")

	card, _ := accepted[colCards].(map[string]any)["c1"].(map[string]any)
	assert.NotContains(t, card, fieldVisibility)
	assert.NotContains(t, card, fieldHeldBy)
	assert.Contains(t, card, fieldPosition, "the honest part of the patch still applies")
}

func TestUpdateCannotRepaintAnExistingCardsFace(t *testing.T) {
	g := newSanitizeGame(t, `{"cards":{"c1":{"rotation":[0,0,0],"faceImageUrl":"real.png"}}}`)

	accepted, _ := g.sanitizeUpdate(doc(t,
		`{"cards":{"c1":{"faceImageUrl":"forged.png"},"c2":{"faceImageUrl":"mine.png","rotation":[0,0,0]}}}`),
		"alice")

	cards, _ := accepted[colCards].(map[string]any)
	existing, _ := cards["c1"].(map[string]any)
	assert.NotContains(t, existing, fieldFace)
	created, _ := cards["c2"].(map[string]any)
	assert.Equal(t, "mine.png", created[fieldFace], "putting your own card on the table is fine")
}

func TestUpdateCannotRewriteAnExistingDecksCards(t *testing.T) {
	g := newSanitizeGame(t, `{"decks":{"d1":{"id":"d1","cards":[{"id":"x","faceImageUrl":"a.png"}]}}}`)

	accepted, refused := g.sanitizeUpdate(doc(t,
		`{"decks":{"d1":{"cards":[],"position":[1,1,1]}}}`), "alice")

	deck, _ := accepted[colDecks].(map[string]any)["d1"].(map[string]any)
	assert.NotContains(t, deck, fieldCards, "draw/shuffle/place are actions, not patches")
	assert.Contains(t, deck, fieldPosition, "moving the deck around is still fine")
	assert.Len(t, refused, 1)
}

func TestUpdateAllowsWholesaleDeckDefinition(t *testing.T) {
	g := newSanitizeGame(t, `{"decks":{}}`)

	accepted, refused := g.sanitizeUpdate(doc(t,
		`{"decks":{"d1":{"id":"d1","cards":[{"id":"x","faceImageUrl":"a.png"}]}}}`), "alice")

	deck, _ := accepted[colDecks].(map[string]any)["d1"].(map[string]any)
	require.NotNil(t, deck)
	assert.Len(t, deck[fieldCards], 1, "imports and scenario seeds bring their own card lists")
	assert.Empty(t, refused)
}

func TestSanitizeDoesNotAliasTheIncomingPatch(t *testing.T) {
	g := newSanitizeGame(t, `{"cards":{}}`)
	patch := doc(t, `{"cards":{"c1":{"position":[1,1,1],"rotation":[0,0,0]}}}`)

	accepted, _ := g.sanitizeUpdate(patch, "alice")
	entity(patch, colCards, "c1")[fieldPosition] = "tampered"

	card, _ := accepted[colCards].(map[string]any)["c1"].(map[string]any)
	assert.Equal(t, []any{1.0, 1.0, 1.0}, card[fieldPosition])
}
