package main

import (
	"encoding/json"
	"flag"
	"net/http"
	"sync"
	"time"

	"github.com/jollygrin/tts-server/logger"
	"github.com/gorilla/websocket"
)

// Command line flags
var (
	addr  = flag.String("addr", ":8080", "http service address")
	debug = flag.Bool("debug", false, "enable debug logging")
)

// Upgrader for websocket connections
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for now
	},
}

// ConnectedPlayer represents a player in a lobby
type ConnectedPlayer struct {
	ID            string    `json:"id"`
	JoinTimestamp int64     `json:"joinTimestamp"`
}

// Lobby represents a game room
type Lobby struct {
	ID      string
	Clients map[*Client]bool
	// Players tracks connected players with their join timestamps
	Players map[string]*ConnectedPlayer
	mu      sync.Mutex
}

// Client represents a websocket client
type Client struct {
	ID         string
	Conn       *websocket.Conn
	Lobby      *Lobby
	Send       chan []byte
}

// Message represents a message from a client
type Message struct {
	Type      string          `json:"type"`
	Path      []string        `json:"path,omitempty"`
	Value     json.RawMessage `json:"value,omitempty"`
	PlayerID  string          `json:"playerId"`
	Timestamp int64           `json:"timestamp"`
	// For playerList messages
	Players   []*ConnectedPlayer `json:"players,omitempty"`
}

// Global lobby registry
var (
	lobbies = make(map[string]*Lobby)
	lobbiesMu sync.Mutex
)

// Handle websocket connections
func handleWebsocket(w http.ResponseWriter, r *http.Request) {
	// Upgrade HTTP connection to websocket
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		logger.Error("Failed to upgrade connection: %v", err)
		return
	}

	// Extract lobbyID and playerID from query parameters
	lobbyID := r.URL.Query().Get("lobby")
	playerID := r.URL.Query().Get("player")

	if lobbyID == "" || playerID == "" {
		logger.Error("Missing lobby ID or player ID")
		conn.Close()
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
	if _, exists := lobby.Players[playerID]; !exists {
		lobby.Players[playerID] = &ConnectedPlayer{
			ID:            playerID,
			JoinTimestamp: timestamp,
		}
	}
	lobby.mu.Unlock()

	logger.Info("Player %s connected to lobby %s", playerID, lobbyID)
	
	// Send current player list to the new client
	sendPlayerList(client)
	
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
		Players: make(map[string]*ConnectedPlayer),
	}
	lobbies[id] = lobby
	return lobby
}

// Read messages from the websocket
func (c *Client) readPump() {
	defer func() {
		c.Lobby.mu.Lock()
		delete(c.Lobby.Clients, c)
		// Don't remove the player from the Players map to preserve join order
		// We'll handle reconnections at the application level
		c.Lobby.mu.Unlock()
		c.Conn.Close()
		logger.Info("Player %s disconnected from lobby %s", c.ID, c.Lobby.ID)
		
		// Broadcast player disconnected message
		broadcastPlayerChange(c.Lobby, c.ID, "disconnect", time.Now().UnixMilli())
	}()

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				logger.Error("Unexpected close error: %v", err)
			}
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
	defer c.Conn.Close()

	for {
		select {
		case message, ok := <-c.Send:
			if !ok {
				// Channel was closed
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
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

	// Re-encode the message
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

// Send the current player list to a client
func sendPlayerList(client *Client) {
	lobby := client.Lobby
	lobby.mu.Lock()
	
	// Convert map to slice for JSON
	players := make([]*ConnectedPlayer, 0, len(lobby.Players))
	for _, player := range lobby.Players {
		players = append(players, player)
	}
	lobby.mu.Unlock()
	
	// Create player list message
	msg := Message{
		Type:      "playerList",
		PlayerID:  client.ID,
		Timestamp: time.Now().UnixMilli(),
		Players:   players,
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
	// Create connect/disconnect message
	msg := Message{
		Type:      changeType,
		PlayerID:  playerID,
		Timestamp: timestamp,
	}
	
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
