package main

import (
	"context"
	"encoding/json"
	"flag"
	"net/http"
	"sync"
	"time"

	"github.com/jollygrin/tts-server/logger"
	"github.com/coder/websocket"
)

// Command line flags
var (
	addr  = flag.String("addr", ":8080", "http service address")
	debug = flag.Bool("debug", false, "enable debug logging")
)

// CardState represents a card on the table or in a deck
type CardState struct {
	ID           string `json:"id"`
	Position     Vec3   `json:"position,omitempty"`
	Rotation     Vec3   `json:"rotation,omitempty"`
	FaceImageUrl string `json:"faceImageUrl,omitempty"`
	BackImageUrl string `json:"backImageUrl,omitempty"`
	FaceUp       bool   `json:"faceUp,omitempty"`
}

// DeckState represents a deck of cards on the table
type DeckState struct {
	ID       string               `json:"id"`
	Position Vec3                 `json:"position,omitempty"`
	Rotation Vec3                 `json:"rotation,omitempty"`
	Cards    map[string]CardState `json:"cards,omitempty"`
	FaceUp   bool                 `json:"faceUp,omitempty"`
}

// Vec3 represents a 3D position or rotation
type Vec3 struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	Z float64 `json:"z"`
}

// PlayerState represents a player in the game
type PlayerState struct {
	ID            string               `json:"id"`
	JoinTimestamp int64                `json:"joinTimestamp"`
	Connected     bool                 `json:"connected"`
	TrayCards     map[string]CardState `json:"trayCards,omitempty"`
	Seat          int                  `json:"seat,omitempty"`
	DeckIDs       []string             `json:"deckIds,omitempty"`
	Metadata      map[string]any       `json:"metadata,omitempty"`
}

// GameState represents the complete state of a game
type GameState struct {
	Decks   map[string]DeckState   `json:"decks"`
	Objects map[string]CardState   `json:"objects"`
	Players map[string]PlayerState `json:"players"`
	LobbyID string                 `json:"lobbyId"`
}

// Lobby represents a game room
type Lobby struct {
	ID      string
	Clients map[*Client]bool
	// GameState is the authoritative state for this lobby
	State GameState
	mu    sync.Mutex
}

// Client represents a websocket client
type Client struct {
	ID    string
	Conn  *websocket.Conn
	Lobby *Lobby
	Send  chan []byte
}

// Message represents a message from a client
type Message struct {
	Type      string          `json:"type"`
	Path      []string        `json:"path,omitempty"`
	Value     json.RawMessage `json:"value,omitempty"`
	PlayerID  string          `json:"playerId"`
	Timestamp int64           `json:"timestamp"`
	// For sync messages
	State *GameState `json:"state,omitempty"`
}

// Global lobby registry
var (
	lobbies   = make(map[string]*Lobby)
	lobbiesMu sync.Mutex
)

// Handle websocket connections
func handleWebsocket(w http.ResponseWriter, r *http.Request) {
	// Upgrade HTTP connection to websocket
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true, // Fix this when you go to prod
	})
	if err != nil {
		logger.Error("Failed to upgrade connection: %v", err)
		return
	}

	// Extract lobbyID and playerID from query parameters
	lobbyID := r.URL.Query().Get("lobby")
	playerID := r.URL.Query().Get("player")

	if lobbyID == "" || playerID == "" {
		logger.Error("Missing lobby ID or player ID")
		_ = conn.Close(websocket.StatusInternalError, "missing lobby or player ID")
		return
	}

	logger.Info("Player %s connecting to lobby %s", playerID, lobbyID)

	// Get or create lobby
	lobby := getLobby(lobbyID)

	// Create new client
	client := &Client{
		ID:    playerID,
		Conn:  conn,
		Lobby: lobby,
		Send:  make(chan []byte, 256),
	}

	// Add client to lobby and track player
	lobby.mu.Lock()
	lobby.Clients[client] = true

	// Check if player already exists, if not add them with join timestamp
	timestamp := time.Now().UnixMilli()
	if player, exists := lobby.State.Players[playerID]; exists {
		// Player exists but was disconnected, mark as connected
		player.Connected = true
		lobby.State.Players[playerID] = player
	} else {
		// New player, add them
		lobby.State.Players[playerID] = PlayerState{
			ID:            playerID,
			JoinTimestamp: timestamp,
			Connected:     true,
			TrayCards:     make(map[string]CardState),
			DeckIDs:       []string{},
			Metadata:      make(map[string]any),
		}
	}
	lobby.mu.Unlock()

	logger.Info("Player %s connected to lobby %s", playerID, lobbyID)

	// Send full game state to the new client
	sendGameState(client)

	// Broadcast player connected message to all other clients
	broadcastPlayerChange(lobby, playerID, "connect", timestamp)

	// Start client routines
	go client.readPump()
	go client.writePump()
}

// Get or create a lobby
func getLobby(id string) *Lobby {
	lobbiesMu.Lock()
	defer lobbiesMu.Unlock()

	if lobby, exists := lobbies[id]; exists {
		return lobby
	}

	logger.Info("Creating new lobby: %s", id)
	lobby := &Lobby{
		ID:      id,
		Clients: make(map[*Client]bool),
		State: GameState{
			Decks:   make(map[string]DeckState),
			Objects: make(map[string]CardState),
			Players: make(map[string]PlayerState),
			LobbyID: id,
		},
	}
	lobbies[id] = lobby
	return lobby
}

// Read messages from the websocket
func (c *Client) readPump() {
	defer func() {
		c.Lobby.mu.Lock()
		delete(c.Lobby.Clients, c)

		// Mark player as disconnected
		if player, exists := c.Lobby.State.Players[c.ID]; exists {
			player.Connected = false
			c.Lobby.State.Players[c.ID] = player
		}

		c.Lobby.mu.Unlock()
		c.Conn.Close(websocket.StatusInternalError, "readPump closed")
		logger.Info("Player %s disconnected from lobby %s", c.ID, c.Lobby.ID)

		// Broadcast player disconnected message
		broadcastPlayerChange(c.Lobby, c.ID, "disconnect", time.Now().UnixMilli())
	}()

	for {
		// TODO: Throw in an actual context.
		_, message, err := c.Conn.Read(context.Background())
		if err != nil {
			logger.Error("Unexpected close error: %v", err)
			break
		}

		logger.Debug("Received message from player %s: %s", c.ID, string(message))

		// Parse the message
		var msg Message
		if err := json.Unmarshal(message, &msg); err != nil {
			logger.Error("Failed to parse message: %v", err)
			continue
		}

		// Process the message
		c.processMessage(msg)
	}
}

// Write messages to the websocket
func (c *Client) writePump() {
	defer c.Conn.Close(websocket.StatusInternalError, "writePump closed")

	for {
		select {
		case message, ok := <-c.Send:
			if !ok {
				// Channel was closed
				return
			}

			if err := c.Conn.Write(context.Background(), websocket.MessageText, message); err != nil {
				logger.Error("Failed to write message: %v", err)
				return
			}

			logger.Debug("Sent message to player %s", c.ID)
		}
	}
}

// Process incoming messages
func (c *Client) processMessage(msg Message) {
	// Set the player ID if not already set
	if msg.PlayerID == "" {
		msg.PlayerID = c.ID
	}

	// Handle different message types
	switch msg.Type {
	case "update":
		// Apply the update to the lobby's state
		applyUpdate(c.Lobby, msg)

	case "sync":
		// Request for full state sync - send the current state
		sendGameState(c)
		return // Don't broadcast sync requests
	}

	// Re-encode the message to broadcast to others
	payload, err := json.Marshal(msg)
	if err != nil {
		logger.Error("Failed to marshal message: %v", err)
		return
	}

	// Broadcast to all clients in the lobby
	c.Lobby.mu.Lock()
	for client := range c.Lobby.Clients {
		// Don't send back to the originating client
		if client != c {
			select {
			case client.Send <- payload:
				logger.Debug("Broadcast message to player %s", client.ID)
			default:
				logger.Warn("Failed to broadcast message to player %s (channel full)", client.ID)
				close(client.Send)
				delete(c.Lobby.Clients, client)
			}
		}
	}
	c.Lobby.mu.Unlock()
}

// Send full game state to a client (sync)
func sendGameState(client *Client) {
	lobby := client.Lobby
	lobby.mu.Lock()
	stateCopy := lobby.State
	lobby.mu.Unlock()

	// Create sync message with full state
	msg := Message{
		Type:      "sync",
		PlayerID:  client.ID,
		Timestamp: time.Now().UnixMilli(),
		State:     &stateCopy,
	}

	// Marshal and send
	payload, err := json.Marshal(msg)
	if err != nil {
		logger.Error("Failed to marshal player list: %v", err)
		return
	}

	select {
	case client.Send <- payload:
		logger.Debug("Sent player list to player %s", client.ID)
	default:
		logger.Warn("Failed to send player list to player %s (channel full)", client.ID)
	}
}

// Broadcast player connection/disconnection
func broadcastPlayerChange(lobby *Lobby, playerID, changeType string, timestamp int64) {
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
		logger.Error("Failed to marshal player change message: %v", err)
		return
	}

	// Broadcast to all clients in the lobby
	lobby.mu.Lock()
	for client := range lobby.Clients {
		// Skip the player who triggered the change
		if client.ID == playerID && changeType == "connect" {
			continue
		}

		select {
		case client.Send <- payload:
			logger.Debug("Broadcast %s message for player %s to player %s", changeType, playerID, client.ID)
		default:
			logger.Warn("Failed to broadcast player change to player %s (channel full)", client.ID)
		}
	}
	lobby.mu.Unlock()
}

// applyUpdate applies a surgical update to the lobby's state based on a message path and value
func applyUpdate(lobby *Lobby, msg Message) {
	if len(msg.Path) == 0 || msg.Value == nil {
		logger.Error("Invalid update message: missing path or value")
		return
	}

	lobby.mu.Lock()
	defer lobby.mu.Unlock()

	// Apply the update based on the path
	logger.Debug("Applying update for path: %v", msg.Path)

	switch msg.Path[0] {
	case "decks":
		if len(msg.Path) < 2 {
			logger.Error("Invalid deck path: %v", msg.Path)
			return
		}
		updateDeck(lobby, msg)

	case "objects":
		if len(msg.Path) < 2 {
			logger.Error("Invalid object path: %v", msg.Path)
			return
		}
		updateObject(lobby, msg)

	case "players":
		if len(msg.Path) < 2 {
			logger.Error("Invalid player path: %v", msg.Path)
			return
		}
		updatePlayer(lobby, msg)

	default:
		logger.Error("Unknown path root: %s", msg.Path[0])
	}
}

// updateDeck applies updates to a deck in the game state
func updateDeck(lobby *Lobby, msg Message) {
	deckID := msg.Path[1]

	// If we're creating a new deck
	if len(msg.Path) == 2 {
		var deck DeckState
		if err := json.Unmarshal(msg.Value, &deck); err != nil {
			logger.Error("Failed to unmarshal deck: %v", err)
			return
		}
		deck.ID = deckID
		lobby.State.Decks[deckID] = deck
		logger.Debug("Created/replaced deck: %s", deckID)
		return
	}

	// Make sure the deck exists before updating properties
	deck, exists := lobby.State.Decks[deckID]
	if !exists {
		// If the deck doesn't exist, create an empty one
		deck = DeckState{
			ID:    deckID,
			Cards: make(map[string]CardState),
		}
		lobby.State.Decks[deckID] = deck
	}

	// Update specific deck property
	if len(msg.Path) >= 3 {
		propName := msg.Path[2]

		switch propName {
		case "position":
			var position Vec3
			if err := json.Unmarshal(msg.Value, &position); err != nil {
				logger.Error("Failed to unmarshal position: %v", err)
				return
			}
			// Get copy of deck, modify it, and put it back
			deckCopy := lobby.State.Decks[deckID]
			deckCopy.Position = position
			lobby.State.Decks[deckID] = deckCopy

		case "rotation":
			var rotation Vec3
			if err := json.Unmarshal(msg.Value, &rotation); err != nil {
				logger.Error("Failed to unmarshal rotation: %v", err)
				return
			}
			// Get copy of deck, modify it, and put it back
			deckCopy := lobby.State.Decks[deckID]
			deckCopy.Rotation = rotation
			lobby.State.Decks[deckID] = deckCopy

		case "faceUp":
			var faceUp bool
			if err := json.Unmarshal(msg.Value, &faceUp); err != nil {
				logger.Error("Failed to unmarshal faceUp: %v", err)
				return
			}
			// Get copy of deck, modify it, and put it back
			deckCopy := lobby.State.Decks[deckID]
			deckCopy.FaceUp = faceUp
			lobby.State.Decks[deckID] = deckCopy

		case "cards":
			// Handle card operations
			if len(msg.Path) < 4 {
				logger.Error("Invalid cards path: %v", msg.Path)
				return
			}

			cardID := msg.Path[3]

			// If this is setting a specific card
			if len(msg.Path) == 4 {
				var card CardState
				if err := json.Unmarshal(msg.Value, &card); err != nil {
					logger.Error("Failed to unmarshal card: %v", err)
					return
				}
				card.ID = cardID

				// Get copy of deck, modify it, and put it back
				deckCopy := lobby.State.Decks[deckID]
				if deckCopy.Cards == nil {
					deckCopy.Cards = make(map[string]CardState)
				}
				deckCopy.Cards[cardID] = card
				lobby.State.Decks[deckID] = deckCopy
				return
			}

			// Handle card property update
			if len(msg.Path) >= 5 {
				// Make sure the card exists
				card, exists := lobby.State.Decks[deckID].Cards[cardID]
				if !exists {
					card = CardState{ID: cardID}
				}

				cardProp := msg.Path[4]
				switch cardProp {
				case "faceUp":
					var faceUp bool
					if err := json.Unmarshal(msg.Value, &faceUp); err != nil {
						logger.Error("Failed to unmarshal card faceUp: %v", err)
						return
					}
					card.FaceUp = faceUp

				case "faceImageUrl":
					var url string
					if err := json.Unmarshal(msg.Value, &url); err != nil {
						logger.Error("Failed to unmarshal card faceImageUrl: %v", err)
						return
					}
					card.FaceImageUrl = url

				case "backImageUrl":
					var url string
					if err := json.Unmarshal(msg.Value, &url); err != nil {
						logger.Error("Failed to unmarshal card backImageUrl: %v", err)
						return
					}
					card.BackImageUrl = url
				}

				// Update the card
				// Get copy of deck, modify it, and put it back
				deckCopy := lobby.State.Decks[deckID]
				if deckCopy.Cards == nil {
					deckCopy.Cards = make(map[string]CardState)
				}
				deckCopy.Cards[cardID] = card
				lobby.State.Decks[deckID] = deckCopy
			}
		}
	}
}

// updateObject applies updates to an object in the game state
func updateObject(lobby *Lobby, msg Message) {
	objectID := msg.Path[1]

	// If we're creating/replacing a whole object
	if len(msg.Path) == 2 {
		var card CardState
		if err := json.Unmarshal(msg.Value, &card); err != nil {
			logger.Error("Failed to unmarshal object: %v", err)
			return
		}
		card.ID = objectID
		lobby.State.Objects[objectID] = card
		logger.Debug("Created/replaced object: %s", objectID)
		return
	}

	// Make sure the object exists before updating properties
	card, exists := lobby.State.Objects[objectID]
	if !exists {
		// If the object doesn't exist, create an empty one
		card = CardState{ID: objectID}
		lobby.State.Objects[objectID] = card
	}

	// Update specific object property
	if len(msg.Path) >= 3 {
		propName := msg.Path[2]

		switch propName {
		case "position":
			var position Vec3
			if err := json.Unmarshal(msg.Value, &position); err != nil {
				logger.Error("Failed to unmarshal position: %v", err)
				return
			}
			// Get copy of object, modify it, and put it back
			cardCopy := lobby.State.Objects[objectID]
			cardCopy.Position = position
			lobby.State.Objects[objectID] = cardCopy

		case "rotation":
			var rotation Vec3
			if err := json.Unmarshal(msg.Value, &rotation); err != nil {
				logger.Error("Failed to unmarshal rotation: %v", err)
				return
			}
			// Get copy of object, modify it, and put it back
			cardCopy := lobby.State.Objects[objectID]
			cardCopy.Rotation = rotation
			lobby.State.Objects[objectID] = cardCopy

		case "faceUp":
			var faceUp bool
			if err := json.Unmarshal(msg.Value, &faceUp); err != nil {
				logger.Error("Failed to unmarshal faceUp: %v", err)
				return
			}
			// Get copy of object, modify it, and put it back
			cardCopy := lobby.State.Objects[objectID]
			cardCopy.FaceUp = faceUp
			lobby.State.Objects[objectID] = cardCopy

		case "faceImageUrl":
			var url string
			if err := json.Unmarshal(msg.Value, &url); err != nil {
				logger.Error("Failed to unmarshal faceImageUrl: %v", err)
				return
			}
			// Get copy of object, modify it, and put it back
			cardCopy := lobby.State.Objects[objectID]
			cardCopy.FaceImageUrl = url
			lobby.State.Objects[objectID] = cardCopy

		case "backImageUrl":
			var url string
			if err := json.Unmarshal(msg.Value, &url); err != nil {
				logger.Error("Failed to unmarshal backImageUrl: %v", err)
				return
			}
			// Get copy of object, modify it, and put it back
			cardCopy := lobby.State.Objects[objectID]
			cardCopy.BackImageUrl = url
			lobby.State.Objects[objectID] = cardCopy
		}
	}
}

// updatePlayer applies updates to a player in the game state
func updatePlayer(lobby *Lobby, msg Message) {
	playerID := msg.Path[1]

	// If we're creating a whole player
	if len(msg.Path) == 2 {
		var player PlayerState
		if err := json.Unmarshal(msg.Value, &player); err != nil {
			logger.Error("Failed to unmarshal player: %v", err)
			return
		}
		player.ID = playerID
		lobby.State.Players[playerID] = player
		logger.Debug("Created/replaced player: %s", playerID)
		return
	}

	// Make sure the player exists before updating properties
	player, exists := lobby.State.Players[playerID]
	if !exists {
		// If the player doesn't exist, create a new one
		player = PlayerState{
			ID:        playerID,
			Connected: true,
			TrayCards: make(map[string]CardState),
			DeckIDs:   []string{},
			Metadata:  make(map[string]any),
		}
		lobby.State.Players[playerID] = player
	}

	// Update specific player property
	if len(msg.Path) >= 3 {
		propName := msg.Path[2]

		switch propName {
		case "seat":
			var seat int
			if err := json.Unmarshal(msg.Value, &seat); err != nil {
				logger.Error("Failed to unmarshal seat: %v", err)
				return
			}
			player.Seat = seat
			lobby.State.Players[playerID] = player

		case "deckIds":
			var deckIDs []string
			if err := json.Unmarshal(msg.Value, &deckIDs); err != nil {
				logger.Error("Failed to unmarshal deckIds: %v", err)
				return
			}
			player.DeckIDs = deckIDs
			lobby.State.Players[playerID] = player

		case "trayCards":
			// Handle tray card operations
			if len(msg.Path) < 4 {
				logger.Error("Invalid trayCards path: %v", msg.Path)
				return
			}

			cardID := msg.Path[3]

			// If this is setting a specific card
			if len(msg.Path) == 4 {
				var card CardState
				if err := json.Unmarshal(msg.Value, &card); err != nil {
					logger.Error("Failed to unmarshal tray card: %v", err)
					return
				}
				card.ID = cardID

				if player.TrayCards == nil {
					player.TrayCards = make(map[string]CardState)
				}
				player.TrayCards[cardID] = card
				lobby.State.Players[playerID] = player
				return
			}

		case "metadata":
			// Handle metadata operations
			if len(msg.Path) < 4 {
				logger.Error("Invalid metadata path: %v", msg.Path)
				return
			}

			metaKey := msg.Path[3]
			var metaValue any
			if err := json.Unmarshal(msg.Value, &metaValue); err != nil {
				logger.Error("Failed to unmarshal metadata value: %v", err)
				return
			}

			if player.Metadata == nil {
				player.Metadata = make(map[string]any)
			}
			player.Metadata[metaKey] = metaValue
			lobby.State.Players[playerID] = player
		}
	}
}

func main() {
	flag.Parse()
	logger.SetDebug(*debug)

	logger.Info("Starting server on %s", *addr)
	if *debug {
		logger.Info("Debug logging enabled")
	}

	// Define the websocket handler
	http.HandleFunc("/ws", handleWebsocket)

	// Start the server
	logger.Info("Server listening on %s", *addr)
	if err := http.ListenAndServe(*addr, nil); err != nil {
		logger.Error("Server failed: %v", err)
	}
}
