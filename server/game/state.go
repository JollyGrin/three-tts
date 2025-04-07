package game

import (
	"encoding/json"
	"sync"
)

type Game struct {
	Decks   map[string]*Deck   `json:"decks"`
	Objects map[string]*Card   `json:"objects"`
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
		Decks:   make(map[string]*Deck),
		Objects: make(map[string]*Card),
		Players: make(map[string]*Player),
		out:     out,
	}, out
}

// Player represents a player in the game
// TODO: This player
type Player struct {
	ID            string          `json:"id"`
	JoinTimestamp int64           `json:"joinTimestamp"`
	Connected     bool            `json:"connected"`
	TrayCards     map[string]Card `json:"trayCards,omitempty"`
	Seat          int             `json:"seat,omitempty"`
	DeckIDs       []string        `json:"deckIds,omitempty"`
	Metadata      map[string]any  `json:"metadata,omitempty"`
}

// Deck represents a deck of cards on the table
type Deck struct {
	ID       string          `json:"id"`
	Position Vec3            `json:"position,omitempty"`
	Rotation Vec3            `json:"rotation,omitempty"`
	Cards    map[string]Card `json:"cards,omitempty"`
	FaceUp   bool            `json:"faceUp,omitempty"`
}

// Card represents a card on the table or in a deck
type Card struct {
	ID           string `json:"id"`
	Position     Vec3   `json:"position,omitempty"`
	Rotation     Vec3   `json:"rotation,omitempty"`
	FaceImageUrl string `json:"faceImageUrl,omitempty"`
	BackImageUrl string `json:"backImageUrl,omitempty"`
	FaceUp       bool   `json:"faceUp,omitempty"`
}

// Vec3 represents a 3D position or rotation
type Vec3 struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	Z float64 `json:"z"`
}
