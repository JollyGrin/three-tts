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

	out chan *PlayerMessage
	mu  sync.Mutex

	// pending offline broadcasts, keyed by player id — armed on disconnect,
	// cancelled when the same id reconnects inside the grace period
	offlineTimers map[string]*time.Timer
	offlineGrace  time.Duration
}

// offlineGraceDefault is how long a disconnected player has to reconnect
// before the lobby is told they went offline. Covers page refreshes and brief
// network blips without the other clients ever seeing a flicker.
const offlineGraceDefault = 5 * time.Second

type PlayerMessage struct {
	// TODO: Probably a better way to add addressing
	To      []string // If To is empty, it sends to all
	Exclude string   // Easy method to exclude a player
	Content json.RawMessage
}

func NewGame() (*Game, <-chan *PlayerMessage) {
	out := make(chan *PlayerMessage, 50)
	now := time.Now()
	return &Game{
		Players:       make(map[string]*Player),
		out:           out,
		Data:          map[string]any{},
		CreatedAt:     now,
		LastActivity:  now,
		offlineTimers: make(map[string]*time.Timer),
		offlineGrace:  offlineGraceDefault,
	}, out
}

// Player represents a player in the game
// TODO: This player
type Player struct {
	ID            string `json:"id"`
	JoinTimestamp int64  `json:"joinTimestamp"`
	Connected     bool   `json:"connected"`
	Seat          int    `json:"seat,omitempty"`

	// live socket count for this player id — a reconnect can attach the new
	// socket before the old one's close is noticed, and the player is only
	// offline when the last socket is gone
	conns int
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
