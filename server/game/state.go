package game

import (
	"encoding/json"
	"sync"
)

type Game struct {
	Data    json.RawMessage    `json:"data"`
	Players map[string]*Player `json:"players"`
	out     chan *PlayerMessage
	mu      sync.Mutex
}

type PlayerMessage struct {
	// TODO: Probably a better way to add addressing
	To      []string // If To is empty, it sends to all
	Exclude string   // Easy method to exclude a player
	Content json.RawMessage
}

func NewGame() (*Game, <-chan *PlayerMessage) {
	out := make(chan *PlayerMessage, 50)
	return &Game{
		Players: make(map[string]*Player),
		out:     out,
		Data:    json.RawMessage(`{}`),
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
