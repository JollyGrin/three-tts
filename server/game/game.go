package game

import (
	"encoding/json"
	"time"

	"github.com/jollygrin/tts-server/jsonmerge"
	"github.com/rs/zerolog/log"
)

// HandleMessage handles incoming messages from players
// If a message is returned, send it back to the caller.
// TODO: Make this a channel and async go routine
func (g *Game) HandleMessage(from *Player, msg Message) {
	if msg.PlayerID == "" {
		// This feels like a bug futher up and should not be fixed here.
		msg.PlayerID = from.ID
	}

	switch msg.Type {
	case "sync":
		g.SyncPlayerState(from.ID)
		return
	case "update":
		g.update(msg)
	}

	// For whatever reason, we broadcast every message.
	// This feels.... wrong
	data, _ := json.Marshal(msg)
	g.out <- &PlayerMessage{ // TODO: Full channel problems
		To:      []string{},
		Exclude: from.ID,
		Content: data,
	}

	return
}

func (g *Game) SyncPlayerState(id string) {
	g.mu.Lock()
	cpy := make(json.RawMessage, len(g.Data))
	copy(cpy, g.Data)

	returnMsg := &Message{
		Type:      "sync",
		PlayerID:  id, // TODO: should be a server id or something
		Timestamp: time.Now().UnixMilli(),
		Value:     cpy,
	}
	data, _ := json.Marshal(returnMsg)

	g.out <- &PlayerMessage{
		To:      []string{id},
		Content: data,
	}
	defer g.mu.Unlock()
}

func (g *Game) DisconnectPlayer(p *Player) {
	g.mu.Lock()
	defer g.mu.Unlock()

	// TODO: channels?
	p.Connected = false
	// broadcastPlayerChange(c.Lobby, c.ID, "disconnect", time.Now().UnixMilli())
}

func (g *Game) BroadcastPlayerChange(playerID, changeType string, timestamp int64) {
	// Create connect/disconnect message with path to update
	msg := Message{
		Type:      "update",
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
		log.Err(err).Msg("Failed to marshal player change message")
		return
	}

	// Broadcast to all clients in the lobby
	g.out <- &PlayerMessage{
		To:      []string{},
		Content: payload,
	}
}

func (g *Game) ConnectPlayer(playerID string) *Player {
	g.mu.Lock()
	defer g.mu.Unlock()

	existing, ok := g.Players[playerID]
	if ok {
		// TODO: What?! We should check if the player is still listening
		// on another websocket and do something.
		existing.Connected = true
		return existing
	}

	newPlayer := &Player{
		ID:            playerID,
		JoinTimestamp: time.Now().UnixMilli(),
		Connected:     true,
		Seat:          0,
	}
	g.Players[playerID] = newPlayer
	return newPlayer
}

func (g *Game) update(msg Message) {
	if msg.Value == nil {
		log.Error().Msgf("Invalid update message: missing path or value")
		return
	}

	g.mu.Lock()
	defer g.mu.Unlock()

	// Apply the update based on the path
	newData, err := jsonmerge.Patch(g.Data, msg.Value)
	if err != nil {
		// TODO: Message client the error?
		log.Err(err).Msgf("Failed to apply update: %v", err)
		return
	}
	g.Data = newData
}
