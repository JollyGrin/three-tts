package game

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// doc decodes a JSON literal into the same shape the server holds state in, so
// tests exercise the real float64/[]any/map[string]any world.
func doc(t *testing.T, raw string) map[string]any {
	t.Helper()
	var out map[string]any
	require.NoError(t, json.Unmarshal([]byte(raw), &out))
	return out
}

func TestViewStripsFacesOfHiddenCards(t *testing.T) {
	state := doc(t, `{
		"cards": {
			"card:alice:1": {
				"faceImageUrl": "ace-of-spades.png",
				"backImageUrl": "back.png",
				"position": [1,0,1],
				"rotation": [180,0,0],
				"visibility": {"kind": "hidden"}
			},
			"card:alice:2": {
				"faceImageUrl": "two-of-clubs.png",
				"rotation": [0,0,0],
				"visibility": {"kind": "public"}
			}
		}
	}`)

	for _, player := range []string{"alice", "bob"} {
		view := viewFor(state, player)
		hidden := entity(view, colCards, "card:alice:1")
		assert.NotContains(t, hidden, fieldFace, "%s must not receive a hidden face", player)
		// everything needed to render the card is still there
		assert.Equal(t, "back.png", hidden[fieldBack])
		assert.NotNil(t, hidden[fieldPosition])
		assert.NotNil(t, hidden[fieldVisibility])

		public := entity(view, colCards, "card:alice:2")
		assert.Equal(t, "two-of-clubs.png", public[fieldFace])
	}
}

func TestViewShipsFaceOnlyToPeeker(t *testing.T) {
	state := doc(t, `{
		"cards": {
			"c1": {
				"faceImageUrl": "secret.png",
				"rotation": [180,0,0],
				"visibility": {"kind": "hidden", "seenBy": ["alice"]}
			}
		}
	}`)

	assert.Equal(t, "secret.png", entity(viewFor(state, "alice"), colCards, "c1")[fieldFace])
	assert.NotContains(t, entity(viewFor(state, "bob"), colCards, "c1"), fieldFace)
}

// A card with no visibility descriptor — seeded by a scenario file or an older
// client — must fall back to the safe reading, not the convenient one.
func TestVisibilityDefaultsToOrientation(t *testing.T) {
	state := doc(t, `{
		"cards": {
			"down": {"faceImageUrl": "secret.png", "rotation": [180,0,0]},
			"up":   {"faceImageUrl": "shown.png",  "rotation": [0,0,0]},
			"bare": {"faceImageUrl": "shown.png"}
		}
	}`)
	view := viewFor(state, "alice")

	assert.NotContains(t, entity(view, colCards, "down"), fieldFace)
	assert.Equal(t, "shown.png", entity(view, colCards, "up")[fieldFace])
	assert.Equal(t, "shown.png", entity(view, colCards, "bare")[fieldFace])
}

func TestViewShipsOtherPlayersTrayAsACount(t *testing.T) {
	state := doc(t, `{
		"players": {
			"alice": {"id":"alice","seat":0,"tray":{"c1":{"faceImageUrl":"a.png"},"c2":{"faceImageUrl":"b.png"}}},
			"bob":   {"id":"bob","seat":1,"tray":{"c3":{"faceImageUrl":"c.png"}}},
			"seat2": {"id":"seat2","seat":2,"tray":{"c4":{"faceImageUrl":"d.png"}}}
		}
	}`)

	view := viewFor(state, "alice")

	mine := entity(view, colPlayers, "alice")
	assert.Len(t, mine[fieldTray], 2, "my own hand comes through in full")
	assert.Equal(t, float64(2), mine[fieldHandCount])

	theirs := entity(view, colPlayers, "bob")
	assert.NotContains(t, theirs, fieldTray)
	assert.Equal(t, float64(1), theirs[fieldHandCount])

	// an unclaimed seat's pre-dealt hand belongs to nobody yet
	placeholder := entity(view, colPlayers, "seat2")
	assert.NotContains(t, placeholder, fieldTray)
	assert.Equal(t, float64(1), placeholder[fieldHandCount])

	// the belt-and-braces check the ticket asks for: inspect the payload
	payload, err := json.Marshal(view)
	require.NoError(t, err)
	assert.NotContains(t, string(payload), "c.png")
	assert.NotContains(t, string(payload), "d.png")
	assert.Contains(t, string(payload), "a.png")
}

func TestViewShipsDeckAsACount(t *testing.T) {
	state := doc(t, `{
		"decks": {
			"deck:alice:main": {
				"id": "deck:alice:main",
				"isFaceUp": false,
				"deckBackImageUrl": "back.png",
				"cards": [
					{"id":"card:alice:main-AS","faceImageUrl":"ace.png"},
					{"id":"card:alice:main-KH","faceImageUrl":"king.png"}
				]
			},
			"deck:alice:discard": {
				"id": "deck:alice:discard",
				"isFaceUp": true,
				"cards": [
					{"id":"top","faceImageUrl":"top.png"},
					{"id":"buried","faceImageUrl":"buried.png"}
				]
			}
		}
	}`)

	view := viewFor(state, "alice")

	facedown := entity(view, colDecks, "deck:alice:main")
	assert.NotContains(t, facedown, fieldCards, "a facedown deck is a count, not a card list")
	assert.Equal(t, float64(2), facedown[fieldCardCount])

	discard := entity(view, colDecks, "deck:alice:discard")
	assert.Len(t, discard[fieldCards], 1, "a face-up pile shows exactly its top card")
	assert.Equal(t, float64(2), discard[fieldCardCount])

	payload, err := json.Marshal(view)
	require.NoError(t, err)
	for _, secret := range []string{"ace.png", "king.png", "buried.png", "main-AS"} {
		assert.NotContains(t, string(payload), secret)
	}
	assert.Contains(t, string(payload), "top.png")
}

func TestViewLeavesNonSecretCollectionsAlone(t *testing.T) {
	state := doc(t, `{
		"pieces": {"piece:1": {"kind":"token","position":[0,0,0]}},
		"overlays": {"o1": {"imageUrl":"map.png"}}
	}`)
	view := viewFor(state, "alice")
	assert.Equal(t, state[colPieces], view[colPieces])
	assert.Equal(t, state[colOverlays], view[colOverlays])
}

// The view is a copy: mutating canonical state afterwards must not silently
// rewrite what we believe a client already holds (which would break diffing).
func TestViewIsADeepCopy(t *testing.T) {
	state := doc(t, `{"cards":{"c1":{"faceImageUrl":"a.png","rotation":[0,0,0]}}}`)
	view := viewFor(state, "alice")
	entity(state, colCards, "c1")[fieldFace] = "changed.png"
	assert.Equal(t, "a.png", entity(view, colCards, "c1")[fieldFace])
}

func TestDiffMapsProducesMergePatch(t *testing.T) {
	old := doc(t, `{"cards":{"a":{"position":[0,0,0],"faceImageUrl":"x.png"},"b":{"position":[1,1,1]}}}`)
	next := doc(t, `{"cards":{"a":{"position":[2,0,0]},"c":{"position":[3,3,3]}}}`)

	patch := diffMaps(old, next)
	cards, _ := patch[colCards].(map[string]any)
	require.NotNil(t, cards)

	changed, _ := cards["a"].(map[string]any)
	assert.Equal(t, []any{2.0, 0.0, 0.0}, changed[fieldPosition])
	assert.Contains(t, changed, fieldFace)
	assert.Nil(t, changed[fieldFace], "a key that vanished becomes an explicit null")
	assert.Nil(t, cards["b"], "a removed entity becomes an explicit null")
	assert.NotNil(t, cards["c"])

	// nothing changed → nothing to send
	assert.Empty(t, diffMaps(old, old))

	raw, err := json.Marshal(patch)
	require.NoError(t, err)
	assert.True(t, strings.Contains(string(raw), `"b":null`))
}
