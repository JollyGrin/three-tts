package lobby

import (
	"context"
	"slices"
	"sync"

	"github.com/jollygrin/tts-server/game"
	"github.com/rs/zerolog/log"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

// Lobby represents a game room
type Lobby struct {
	ID      string
	clients map[*Client]struct{}

	// State is the authoritative state for this lobby
	state      *game.Game
	gameEvents <-chan *game.PlayerMessage
	mu         sync.Mutex
	cancel     context.CancelFunc
}

func newLobby(id string) *Lobby {
	ctx, cancel := context.WithCancel(context.Background())
	g, msgs := game.NewGame()
	l := &Lobby{
		ID:         id,
		clients:    make(map[*Client]struct{}),
		state:      g,
		gameEvents: msgs,
		mu:         sync.Mutex{},
		cancel:     cancel,
	}

	go l.run(ctx)
	return l
}

func (l *Lobby) run(ctx context.Context) {
	defer l.Close()
	for {
		select {
		case <-ctx.Done():
			log.Info().
				Str("lobby", l.ID).
				Msg("Lobby closing")
			return
		case msg := <-l.gameEvents:
			l.mu.Lock()
			for client := range l.clients {
				if msg.Exclude != client.Player.ID && (len(msg.To) == 0 || slices.Contains(msg.To, client.ID)) {
					client.Send <- msg.Content
				}
			}
			l.mu.Unlock()
		}
	}
}

func (l *Lobby) Close() {
	l.cancel()
	// TODO: CLOSE GAME
	// WATCH CHANNELS, prevent deadlocks and leaks
}

func (l *Lobby) AddClient(id string, conn *websocket.Conn) *Client {
	// Enter the player into the game first
	player := l.state.ConnectPlayer(id)

	// TODO: Excessive locking
	l.mu.Lock()
	defer l.mu.Unlock()
	client := &Client{
		ID:     id,
		Conn:   conn,
		Send:   make(chan []byte, 256),
		Player: player,
	}

	// Add to the lobby
	l.clients[client] = struct{}{}

	return client
}

// Client represents a websocket client
type Client struct {
	ID string
	// TODO: Refactor to a more general conn or use channels
	Conn *websocket.Conn
	Send chan []byte // TODO: Statically type this message
	// The player in the game state
	Player *game.Player

	close sync.Once
}

func (l *Lobby) clientRead(ctx context.Context, c *Client) {
	defer l.unsubscribe(c)
	for {
		// Read message from client
		var msg game.Message
		err := wsjson.Read(ctx, c.Conn, &msg)
		if err != nil {
			break
		}

		l.state.HandleMessage(c.Player, msg)

		// TODO: Uh no, let the game handle messages
		//l.mu.Lock()
		//l.State = msg.State
		//l.mu.Unlock()

		//c.Lobby.Broadcast(msg)
	}
}

func (l *Lobby) clientWrite(ctx context.Context, c *Client) {
	defer l.unsubscribe(c)
	for {
		select {
		case message, ok := <-c.Send:
			if !ok {
				// Channel was closed
				return
			}

			if err := c.Conn.Write(context.Background(), websocket.MessageText, message); err != nil {
				log.Err(err).Msg("Failed to write message")
				return
			}

			log.Debug().
				Str("player", c.ID).
				Msg("Sent message to player")
		}
	}
}

// unsubscribe will only close the connection once
func (l *Lobby) unsubscribe(c *Client) {
	c.close.Do(func() {
		l.mu.Lock()
		defer l.mu.Unlock()

		l.state.DisconnectPlayer(c.Player)
		_ = c.Conn.Close(websocket.StatusInternalError, "unsubscribing")
		delete(l.clients, c)
	})
}
