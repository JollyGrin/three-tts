package main

import (
	"encoding/json"
	"flag"
	"net/http"
	"sync"

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

// Lobby represents a game room
type Lobby struct {
	ID      string
	Clients map[*Client]bool
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

	// Add client to lobby
	lobby.mu.Lock()
	lobby.Clients[client] = true
	lobby.mu.Unlock()

	logger.Info("Player %s connected to lobby %s", playerID, lobbyID)

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
	}
	lobbies[id] = lobby
	return lobby
}

// Read messages from the websocket
func (c *Client) readPump() {
	defer func() {
		c.Lobby.mu.Lock()
		delete(c.Lobby.Clients, c)
		c.Lobby.mu.Unlock()
		c.Conn.Close()
		logger.Info("Player %s disconnected from lobby %s", c.ID, c.Lobby.ID)
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
