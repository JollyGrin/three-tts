package game

import (
	"encoding/json"
	"maps"
	"time"

	"github.com/jollygrin/tts-server/jsonmerge"
	"github.com/rs/zerolog/log"
)

// HandleMessage handles incoming messages from players.
//
// Nothing is relayed verbatim any more: state changes are validated, applied to
// the canonical document, and then fanned out as *per-recipient* patches built
// from what each player is entitled to see (see buildFanout). Presence pings
// carry no state and are still passed straight through.
func (g *Game) HandleMessage(from *Player, msg Message) {
	if msg.PlayerID == "" {
		// This feels like a bug futher up and should not be fixed here.
		msg.PlayerID = from.ID
	}

	switch msg.Type {
	case "sync":
		g.SyncPlayerState(from.ID)
	case "update":
		g.applyUpdate(from.ID, msg)
	case "action":
		g.applyAction(from.ID, msg)
	case "connect", "disconnect":
		data, _ := json.Marshal(msg)
		g.send(&PlayerMessage{To: []string{}, Exclude: from.ID, Content: data})
	default:
		log.Warn().Str("type", msg.Type).Msg("Unknown message type")
	}
}

// applyUpdate is the merge-patch path: cheap, frequent, non-secret changes
// (drag streams, layout, scenario seeds). The patch is filtered down to what
// the sender is allowed to write before it touches the canonical document.
func (g *Game) applyUpdate(sender string, msg Message) {
	if msg.Value == nil {
		log.Error().Msg("Invalid update message: missing value")
		return
	}

	// decode outside the lock; only the merge itself needs exclusivity
	var patch map[string]any
	if err := json.Unmarshal(msg.Value, &patch); err != nil {
		log.Err(err).Msg("Failed to decode update value")
		return
	}

	g.mu.Lock()
	accepted, refused := g.sanitizeUpdate(patch, sender)
	g.Data = jsonmerge.MergeMaps(g.Data, accepted)
	g.Updates++
	g.touchActivity()
	// the sender applied its own patch optimistically, so its believed state is
	// the last view we sent plus that patch — diffing against it is what walks
	// back the parts we refused
	messages := g.buildFanout(sender, patch, nil)
	g.mu.Unlock()

	g.send(messages...)
	if len(refused) > 0 {
		log.Warn().Str("player", sender).Strs("refused", refused).Msg("Rejected parts of an update")
		g.sendError(sender, "update rejected: "+refused[0])
	}
}

// buildFanout produces one patch per connected player: their new entitled view
// diffed against what we last sent them. Expects g.mu to be held; the returned
// messages must be sent after releasing it.
//
// touched entities are force-included for the sender. An action the sender
// mirrored locally (drawing a card, emptying a slot in its hand) leaves the
// server with nothing to diff when it fails, so those refs are restated
// explicitly — as the canonical entity, or as a null when it does not exist.
func (g *Game) buildFanout(sender string, senderPatch map[string]any, touched []entityRef) []*PlayerMessage {
	var messages []*PlayerMessage
	now := time.Now().UnixMilli()

	for id, player := range g.Players {
		if !player.Connected {
			delete(g.views, id)
			continue
		}

		view := viewFor(g.Data, id)
		believed := g.views[id]
		if believed == nil {
			believed = map[string]any{}
		}
		if id == sender && senderPatch != nil {
			believed = jsonmerge.MergeMaps(deepCopyMap(believed), senderPatch)
		}
		patch := diffMaps(believed, view)
		if id == sender {
			for _, ref := range touched {
				forceRef(patch, view, ref)
			}
		}
		g.views[id] = view

		if len(patch) == 0 {
			continue
		}
		value, err := json.Marshal(patch)
		if err != nil {
			log.Err(err).Msg("Failed to marshal patch")
			continue
		}
		content, err := json.Marshal(&Message{
			Type:      "update",
			PlayerID:  serverID,
			Timestamp: now,
			Value:     value,
		})
		if err != nil {
			log.Err(err).Msg("Failed to marshal update message")
			continue
		}
		messages = append(messages, &PlayerMessage{To: []string{id}, Content: content})
	}
	return messages
}

// forceRef restates one entity in a patch, whether or not it changed. It is a
// union, not a replacement: the diff's own keys win, so a field the diff is
// deleting (a face that just went back into hiding) keeps its explicit null
// instead of being papered over by the restated entity.
func forceRef(patch, view map[string]any, ref entityRef) {
	target, ok := patch[ref.col].(map[string]any)
	if !ok {
		target = map[string]any{}
		patch[ref.col] = target
	}
	ent := entity(view, ref.col, ref.id)
	if ent == nil {
		target[ref.id] = nil
		return
	}
	forced := deepCopyMap(ent)
	if diffed, ok := target[ref.id].(map[string]any); ok {
		maps.Copy(forced, diffed)
	}
	target[ref.id] = forced
}

// SyncPlayerState sends a player their entire entitled view and resets our
// record of what they hold, so subsequent patches diff from a known point.
func (g *Game) SyncPlayerState(id string) {
	// marshal under the lock, send after releasing it — sending to a possibly
	// full channel while holding the state mutex can deadlock the lobby
	g.mu.Lock()
	view := viewFor(g.Data, id)
	g.views[id] = view
	data, err := json.Marshal(view)
	g.mu.Unlock()
	if err != nil {
		log.Err(err).Msg("Failed to marshal state for sync")
		return
	}

	returnMsg := &Message{
		Type:      "sync",
		PlayerID:  id, // TODO: should be a server id or something
		Timestamp: time.Now().UnixMilli(),
		Value:     data,
	}
	payload, _ := json.Marshal(returnMsg)

	g.send(&PlayerMessage{To: []string{id}, Content: payload})
}

// send delivers already-built messages. Never call it while holding g.mu.
func (g *Game) send(messages ...*PlayerMessage) {
	for _, msg := range messages {
		if msg == nil {
			continue
		}
		g.out <- msg
	}
}

func (g *Game) sendError(playerID, message string) {
	value, _ := json.Marshal(message)
	payload, err := json.Marshal(&Message{
		Type:      "error",
		PlayerID:  serverID,
		Timestamp: time.Now().UnixMilli(),
		Value:     value,
	})
	if err != nil {
		return
	}
	g.send(&PlayerMessage{To: []string{playerID}, Content: payload})
}

// logMessage records a table event everyone should know happened — who peeked
// at what, who revealed what. Looking at a hidden card is a move, so it leaves
// a trace instead of being invisible.
func (g *Game) logMessage(kind, playerID, cardID string) *PlayerMessage {
	value, err := json.Marshal(map[string]any{
		"kind":     kind,
		"playerId": playerID,
		"cardId":   cardID,
	})
	if err != nil {
		return nil
	}
	payload, err := json.Marshal(&Message{
		Type:      "log",
		PlayerID:  serverID,
		Timestamp: time.Now().UnixMilli(),
		Value:     value,
	})
	if err != nil {
		return nil
	}
	return &PlayerMessage{To: []string{}, Content: payload}
}

// DisconnectPlayer releases everything the player was holding — the
// server-synthesized drop from SPEC.md §4c — and tells everyone else.
func (g *Game) DisconnectPlayer(p *Player) {
	g.mu.Lock()
	p.Connected = false
	g.releaseHeldBy(p.ID)
	delete(g.views, p.ID)
	messages := g.buildFanout("", nil, nil)
	g.mu.Unlock()

	g.send(messages...)
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
	g.send(&PlayerMessage{To: []string{}, Content: payload})
}

func (g *Game) ConnectPlayer(playerID string) *Player {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.LastActivity = time.Now()

	existing, ok := g.Players[playerID]
	if ok {
		// TODO: What?! We should check if the player is still listening
		// on another websocket and do something.
		existing.Connected = true
		// a reconnecting client starts from nothing until it syncs
		delete(g.views, playerID)
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

func (g *Game) touchActivity() { g.LastActivity = time.Now() }
