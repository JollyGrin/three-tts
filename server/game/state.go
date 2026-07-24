package game

import (
	"encoding/json"
	"sync"
	"time"
)

type Game struct {
	// Data is the authoritative game state, kept decoded so updates merge
	// map-to-map instead of re-parsing the whole document per message.
	Data    map[string]any     `json:"data"`
	Players map[string]*Player `json:"players"`

	CreatedAt    time.Time `json:"createdAt"`
	LastActivity time.Time `json:"lastActivity"`
	Updates      int64     `json:"updates"`

	// views is what we believe each client's copy of the state looks like —
	// the filtered document last sent to them. Outgoing patches are diffed
	// against it, so a client is only ever told about the part of a change it
	// is entitled to know about.
	views map[string]map[string]any
	// holds tracks when each hold lease goes stale, keyed by "<collection>/<id>".
	// The lease itself lives on the entity (heldBy) so every client can see who
	// is dragging what; only the expiry is server-private.
	holds map[string]time.Time

	out chan *PlayerMessage
	mu  sync.Mutex
}

// holdTTL bounds a lease that was never dropped — a wedged tab or a lost
// pointerup must not park a card out of everyone else's reach forever.
const holdTTL = 60 * time.Second

// serverID is the sender stamped on messages the server itself originates.
const serverID = "server"

type PlayerMessage struct {
	// TODO: Probably a better way to add addressing
	To      []string // If To is empty, it sends to all
	Exclude string   // Easy method to exclude a player
	Content json.RawMessage
}

func NewGame() (*Game, <-chan *PlayerMessage) {
	// one buffered slot per message, and a fan-out now produces one message per
	// connected player rather than one for the whole lobby
	out := make(chan *PlayerMessage, 256)
	now := time.Now()
	return &Game{
		Players:      make(map[string]*Player),
		out:          out,
		Data:         map[string]any{},
		views:        make(map[string]map[string]any),
		holds:        make(map[string]time.Time),
		CreatedAt:    now,
		LastActivity: now,
	}, out
}

// Player represents a player in the game
// TODO: This player
type Player struct {
	ID            string `json:"id"`
	JoinTimestamp int64  `json:"joinTimestamp"`
	Connected     bool   `json:"connected"`
	Seat          int    `json:"seat,omitempty"`
}

// PlayerStat is a lock-free copy of a player's status for admin views.
type PlayerStat struct {
	ID            string
	JoinTimestamp int64
	Connected     bool
}

// Stats is a snapshot of the game for admin views.
type Stats struct {
	Players      []PlayerStat
	StateBytes   int
	Updates      int64
	CreatedAt    time.Time
	LastActivity time.Time
}

func (g *Game) Stats() Stats {
	g.mu.Lock()
	defer g.mu.Unlock()
	data, _ := json.Marshal(g.Data)
	s := Stats{
		StateBytes:   len(data),
		Updates:      g.Updates,
		CreatedAt:    g.CreatedAt,
		LastActivity: g.LastActivity,
	}
	for _, p := range g.Players {
		s.Players = append(s.Players, PlayerStat{
			ID:            p.ID,
			JoinTimestamp: p.JoinTimestamp,
			Connected:     p.Connected,
		})
	}
	return s
}
