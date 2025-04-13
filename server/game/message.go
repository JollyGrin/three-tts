package game

import "encoding/json"

// Message represents a message from a client
type Message struct {
	Type string `json:"type"`
	//Path      []string        `json:"path,omitempty"`
	Value     json.RawMessage `json:"value,omitempty"`
	PlayerID  string          `json:"playerId"`
	Timestamp int64           `json:"timestamp"`
}
