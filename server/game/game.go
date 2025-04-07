package game

import (
	"encoding/json"
	"time"

	"github.com/rs/zerolog/log"
)

// HandleMessage handles incoming messages from players
// If a message is returned, send it back to the caller.
// TODO: Make this a channel and async go routine
func (g *Game) HandleMessage(from *Player, msg Message) {
	if msg.PlayerID == "" {
		// This feels like a bug futher up and should not be fixed here.
		msg.PlayerID = from.ID
	}

	switch msg.Type {
	case "sync":
		g.SyncPlayerState(from.ID)
		return
	case "update":
		g.update(msg)
	}

	// For whatever reason, we broadcast every message.
	// This feels.... wrong
	data, _ := json.Marshal(msg)
	g.out <- &PlayerMessage{ // TODO: Full channel problems
		To:      []string{},
		Exclude: from.ID,
		Content: data,
	}

	return
}

func (g *Game) SyncPlayerState(id string) {
	g.mu.Lock()
	returnMsg := &Message{
		Type:      "sync",
		PlayerID:  id, // TODO: should be a server id or something
		Timestamp: time.Now().UnixMilli(),
		State:     g,
	}
	data, _ := json.Marshal(returnMsg)

	g.out <- &PlayerMessage{
		To:      []string{id},
		Content: data,
	}
	defer g.mu.Unlock()
}

func (g *Game) DisconnectPlayer(p *Player) {
	g.mu.Lock()
	defer g.mu.Unlock()

	// TODO: channels?
	p.Connected = false
	// broadcastPlayerChange(c.Lobby, c.ID, "disconnect", time.Now().UnixMilli())
}

func (g *Game) BroadcastPlayerChange(playerID, changeType string, timestamp int64) {
	// Create connect/disconnect message with path to update
	msg := Message{
		Type:      "update",
		Path:      []string{"players", playerID, "connected"},
		PlayerID:  playerID,
		Timestamp: timestamp,
	}

	// Set value based on connection type
	var valueJSON []byte
	if changeType == "connect" {
		valueJSON = []byte("true")
	} else {
		valueJSON = []byte("false")
	}
	msg.Value = json.RawMessage(valueJSON)

	// Marshal message
	payload, err := json.Marshal(msg)
	if err != nil {
		log.Err(err).Msg("Failed to marshal player change message")
		return
	}

	// Broadcast to all clients in the lobby
	g.out <- &PlayerMessage{
		To:      []string{},
		Content: payload,
	}
}

func (g *Game) ConnectPlayer(playerID string) *Player {
	g.mu.Lock()
	defer g.mu.Unlock()

	existing, ok := g.Players[playerID]
	if ok {
		// TODO: What?! We should check if the player is still listening
		// on another websocket and do something.
		existing.Connected = true
		return existing
	}

	newPlayer := &Player{
		ID:            playerID,
		JoinTimestamp: time.Now().UnixMilli(),
		Connected:     true,
		TrayCards:     make(map[string]Card),
		Seat:          0,
		DeckIDs:       make([]string, 0),
		Metadata:      make(map[string]any),
	}
	g.Players[playerID] = newPlayer
	return newPlayer
}

func (g *Game) update(msg Message) {
	if len(msg.Path) == 0 || msg.Value == nil {
		log.Error().Msgf("Invalid update message: missing path or value")
		return
	}

	g.mu.Lock()
	defer g.mu.Unlock()

	// Apply the update based on the path
	log.Debug().Msgf("Applying update for path: %v", msg.Path)

	switch msg.Path[0] {
	case "decks":
		if len(msg.Path) < 2 {
			log.Error().Msgf("Invalid deck path: %v", msg.Path)
			return
		}
		g.updateDeck(msg)

	case "objects":
		if len(msg.Path) < 2 {
			log.Error().Msgf("Invalid object path: %v", msg.Path)
			return
		}
		g.updateObject(msg)

	case "players":
		if len(msg.Path) < 2 {
			log.Error().Msgf("Invalid player path: %v", msg.Path)
			return
		}
		g.updatePlayer(msg)

	default:
		log.Error().Msgf("Unknown path root: %s", msg.Path[0])
	}
}

// updateDeck applies updates to a deck in the game state
func (g *Game) updateDeck(msg Message) {
	deckID := msg.Path[1]

	// If we're creating a new deck
	if len(msg.Path) == 2 {
		var deck Deck
		if err := json.Unmarshal(msg.Value, &deck); err != nil {
			log.Error().Msgf("Failed to unmarshal deck: %v", err)
			return
		}
		deck.ID = deckID
		g.Decks[deckID] = &deck
		log.Debug().Msgf("Created/replaced deck: %s", deckID)
		return
	}

	// Make sure the deck exists before updating properties
	deck, exists := g.Decks[deckID]
	if !exists {
		// If the deck doesn't exist, create an empty one
		deck = &Deck{
			ID:    deckID,
			Cards: make(map[string]Card),
		}
		g.Decks[deckID] = deck
	}

	// Update specific deck property
	if len(msg.Path) >= 3 {
		propName := msg.Path[2]

		switch propName {
		case "position":
			var position Vec3
			if err := json.Unmarshal(msg.Value, &position); err != nil {
				log.Error().Msgf("Failed to unmarshal position: %v", err)
				return
			}
			// Get copy of deck, modify it, and put it back
			deckCopy := g.Decks[deckID]
			deckCopy.Position = position
			g.Decks[deckID] = deckCopy

		case "rotation":
			var rotation Vec3
			if err := json.Unmarshal(msg.Value, &rotation); err != nil {
				log.Error().Msgf("Failed to unmarshal rotation: %v", err)
				return
			}
			// Get copy of deck, modify it, and put it back
			deckCopy := g.Decks[deckID]
			deckCopy.Rotation = rotation
			g.Decks[deckID] = deckCopy

		case "faceUp":
			var faceUp bool
			if err := json.Unmarshal(msg.Value, &faceUp); err != nil {
				log.Error().Msgf("Failed to unmarshal faceUp: %v", err)
				return
			}
			// Get copy of deck, modify it, and put it back
			deckCopy := g.Decks[deckID]
			deckCopy.FaceUp = faceUp
			g.Decks[deckID] = deckCopy

		case "cards":
			// Handle card operations
			if len(msg.Path) < 4 {
				log.Error().Msgf("Invalid cards path: %v", msg.Path)
				return
			}

			cardID := msg.Path[3]

			// If this is setting a specific card
			if len(msg.Path) == 4 {
				var card Card
				if err := json.Unmarshal(msg.Value, &card); err != nil {
					log.Error().Msgf("Failed to unmarshal card: %v", err)
					return
				}
				card.ID = cardID

				// Get copy of deck, modify it, and put it back
				deckCopy := g.Decks[deckID]
				if deckCopy.Cards == nil {
					deckCopy.Cards = make(map[string]Card)
				}
				deckCopy.Cards[cardID] = card
				g.Decks[deckID] = deckCopy
				return
			}

			// Handle card property update
			if len(msg.Path) >= 5 {
				// Make sure the card exists
				card, exists := g.Decks[deckID].Cards[cardID]
				if !exists {
					card = Card{ID: cardID}
				}

				cardProp := msg.Path[4]
				switch cardProp {
				case "faceUp":
					var faceUp bool
					if err := json.Unmarshal(msg.Value, &faceUp); err != nil {
						log.Error().Msgf("Failed to unmarshal card faceUp: %v", err)
						return
					}
					card.FaceUp = faceUp

				case "faceImageUrl":
					var url string
					if err := json.Unmarshal(msg.Value, &url); err != nil {
						log.Error().Msgf("Failed to unmarshal card faceImageUrl: %v", err)
						return
					}
					card.FaceImageUrl = url

				case "backImageUrl":
					var url string
					if err := json.Unmarshal(msg.Value, &url); err != nil {
						log.Error().Msgf("Failed to unmarshal card backImageUrl: %v", err)
						return
					}
					card.BackImageUrl = url
				}

				// Update the card
				// Get copy of deck, modify it, and put it back
				deckCopy := g.Decks[deckID]
				if deckCopy.Cards == nil {
					deckCopy.Cards = make(map[string]Card)
				}
				deckCopy.Cards[cardID] = card
				g.Decks[deckID] = deckCopy
			}
		}
	}
}

// updateObject applies updates to an object in the game state
func (g *Game) updateObject(msg Message) {
	objectID := msg.Path[1]

	// If we're creating/replacing a whole object
	if len(msg.Path) == 2 {
		var card Card
		if err := json.Unmarshal(msg.Value, &card); err != nil {
			log.Error().Msgf("Failed to unmarshal object: %v", err)
			return
		}
		card.ID = objectID
		g.Objects[objectID] = &card
		log.Debug().Msgf("Created/replaced object: %s", objectID)
		return
	}

	// Make sure the object exists before updating properties
	card, exists := g.Objects[objectID]
	if !exists {
		// If the object doesn't exist, create an empty one
		card = &Card{ID: objectID}
		g.Objects[objectID] = card
	}

	// Update specific object property
	if len(msg.Path) >= 3 {
		propName := msg.Path[2]

		switch propName {
		case "position":
			var position Vec3
			if err := json.Unmarshal(msg.Value, &position); err != nil {
				log.Error().Msgf("Failed to unmarshal position: %v", err)
				return
			}
			// Get copy of object, modify it, and put it back
			cardCopy := g.Objects[objectID]
			cardCopy.Position = position
			g.Objects[objectID] = cardCopy

		case "rotation":
			var rotation Vec3
			if err := json.Unmarshal(msg.Value, &rotation); err != nil {
				log.Error().Msgf("Failed to unmarshal rotation: %v", err)
				return
			}
			// Get copy of object, modify it, and put it back
			cardCopy := g.Objects[objectID]
			cardCopy.Rotation = rotation
			g.Objects[objectID] = cardCopy

		case "faceUp":
			var faceUp bool
			if err := json.Unmarshal(msg.Value, &faceUp); err != nil {
				log.Error().Msgf("Failed to unmarshal faceUp: %v", err)
				return
			}
			// Get copy of object, modify it, and put it back
			cardCopy := g.Objects[objectID]
			cardCopy.FaceUp = faceUp
			g.Objects[objectID] = cardCopy

		case "faceImageUrl":
			var url string
			if err := json.Unmarshal(msg.Value, &url); err != nil {
				log.Error().Msgf("Failed to unmarshal faceImageUrl: %v", err)
				return
			}
			// Get copy of object, modify it, and put it back
			cardCopy := g.Objects[objectID]
			cardCopy.FaceImageUrl = url
			g.Objects[objectID] = cardCopy

		case "backImageUrl":
			var url string
			if err := json.Unmarshal(msg.Value, &url); err != nil {
				log.Error().Msgf("Failed to unmarshal backImageUrl: %v", err)
				return
			}
			// Get copy of object, modify it, and put it back
			cardCopy := g.Objects[objectID]
			cardCopy.BackImageUrl = url
			g.Objects[objectID] = cardCopy
		}
	}
}

// updatePlayer applies updates to a player in the game state
func (g *Game) updatePlayer(msg Message) {
	playerID := msg.Path[1]

	// If we're creating a whole player
	if len(msg.Path) == 2 {
		var player Player
		if err := json.Unmarshal(msg.Value, &player); err != nil {
			log.Error().Msgf("Failed to unmarshal player: %v", err)
			return
		}
		player.ID = playerID
		g.Players[playerID] = &player
		log.Debug().Msgf("Created/replaced player: %s", playerID)
		return
	}

	// Make sure the player exists before updating properties
	player, exists := g.Players[playerID]
	if !exists {
		// If the player doesn't exist, create a new one
		player = &Player{
			ID:        playerID,
			Connected: true,
			TrayCards: make(map[string]Card),
			DeckIDs:   []string{},
			Metadata:  make(map[string]any),
		}
		g.Players[playerID] = player
	}

	// Update specific player property
	if len(msg.Path) >= 3 {
		propName := msg.Path[2]

		switch propName {
		case "seat":
			var seat int
			if err := json.Unmarshal(msg.Value, &seat); err != nil {
				log.Error().Msgf("Failed to unmarshal seat: %v", err)
				return
			}
			player.Seat = seat
			g.Players[playerID] = player

		case "deckIds":
			var deckIDs []string
			if err := json.Unmarshal(msg.Value, &deckIDs); err != nil {
				log.Error().Msgf("Failed to unmarshal deckIds: %v", err)
				return
			}
			player.DeckIDs = deckIDs
			g.Players[playerID] = player

		case "trayCards":
			// Handle tray card operations
			if len(msg.Path) < 4 {
				log.Error().Msgf("Invalid trayCards path: %v", msg.Path)
				return
			}

			cardID := msg.Path[3]

			// If this is setting a specific card
			if len(msg.Path) == 4 {
				var card Card
				if err := json.Unmarshal(msg.Value, &card); err != nil {
					log.Error().Msgf("Failed to unmarshal tray card: %v", err)
					return
				}
				card.ID = cardID

				if player.TrayCards == nil {
					player.TrayCards = make(map[string]Card)
				}
				player.TrayCards[cardID] = card
				g.Players[playerID] = player
				return
			}

		case "metadata":
			// Handle metadata operations
			if len(msg.Path) < 4 {
				log.Error().Msgf("Invalid metadata path: %v", msg.Path)
				return
			}

			metaKey := msg.Path[3]
			var metaValue any
			if err := json.Unmarshal(msg.Value, &metaValue); err != nil {
				log.Error().Msgf("Failed to unmarshal metadata value: %v", err)
				return
			}

			if player.Metadata == nil {
				player.Metadata = make(map[string]any)
			}
			player.Metadata[metaKey] = metaValue
			g.Players[playerID] = player
		}
	}
}
