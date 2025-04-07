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
