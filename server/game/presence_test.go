package game

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// drain empties the out channel and returns the decoded presence patches, in
// order. Non-update messages fail the test — presence must ride the ordinary
// update channel.
func drainPresence(t *testing.T, out <-chan *PlayerMessage) []map[string]any {
	t.Helper()
	var patches []map[string]any
	for {
		select {
		case msg := <-out:
			var m Message
			require.NoError(t, json.Unmarshal(msg.Content, &m))
			require.Equal(t, "update", m.Type)
			var patch map[string]any
			require.NoError(t, json.Unmarshal(m.Value, &patch))
			patches = append(patches, patch)
		default:
			return patches
		}
	}
}

func connectedValue(t *testing.T, patch map[string]any, id string) any {
	t.Helper()
	players, ok := patch["players"].(map[string]any)
	require.True(t, ok, "patch has no players object: %v", patch)
	row, ok := players[id].(map[string]any)
	require.True(t, ok, "patch has no row for %s: %v", id, patch)
	return row["connected"]
}

func TestConnectBroadcastsPresencePatch(t *testing.T) {
	g, out := NewGame()

	g.ConnectPlayer("alice")

	patches := drainPresence(t, out)
	require.Len(t, patches, 1)
	require.Equal(t, true, connectedValue(t, patches[0], "alice"))

	// the patch also landed in g.Data, so late joiners get it via sync
	players := g.Data["players"].(map[string]any)
	require.Equal(t, true, players["alice"].(map[string]any)["connected"])
}

func TestPresenceMergeKeepsExistingPlayerState(t *testing.T) {
	g, out := NewGame()
	g.offlineGrace = 20 * time.Millisecond
	// state a client would have written: seat, tray, joinTimestamp
	g.Data = map[string]any{
		"players": map[string]any{
			"alice": map[string]any{"id": "alice", "seat": 2, "joinTimestamp": float64(10), "tray": map[string]any{"c1": map[string]any{}}},
		},
	}

	p := g.ConnectPlayer("alice")
	g.DisconnectPlayer(p)
	// wait for the offline broadcast to land in g.Data
	require.Eventually(t, func() bool {
		g.mu.Lock()
		defer g.mu.Unlock()
		row := g.Data["players"].(map[string]any)["alice"].(map[string]any)
		return row["connected"] == false
	}, time.Second, 5*time.Millisecond)

	g.mu.Lock()
	row := g.Data["players"].(map[string]any)["alice"].(map[string]any)
	g.mu.Unlock()
	require.Equal(t, 2, row["seat"])
	require.Equal(t, float64(10), row["joinTimestamp"])
	require.Contains(t, row["tray"], "c1")
	drainPresence(t, out)
}

func TestReconnectInsideGraceNeverBroadcastsOffline(t *testing.T) {
	g, out := NewGame()
	g.offlineGrace = 50 * time.Millisecond

	p := g.ConnectPlayer("alice")
	g.DisconnectPlayer(p)
	// reconnect well inside the grace period — same id, as a page refresh does
	g.ConnectPlayer("alice")

	// wait past the (cancelled) grace period, then assert nobody was ever told
	// alice went offline
	time.Sleep(150 * time.Millisecond)
	for _, patch := range drainPresence(t, out) {
		require.Equal(t, true, connectedValue(t, patch, "alice"),
			"offline patch leaked despite reconnect inside grace")
	}

	players := g.Data["players"].(map[string]any)
	require.Equal(t, true, players["alice"].(map[string]any)["connected"])
	require.True(t, g.Players["alice"].Connected)
}

func TestDisconnectPastGraceBroadcastsOffline(t *testing.T) {
	g, out := NewGame()
	g.offlineGrace = 20 * time.Millisecond

	p := g.ConnectPlayer("alice")
	drainPresence(t, out) // discard the connect patch

	g.DisconnectPlayer(p)

	// nothing may be sent before the grace period expires
	require.Empty(t, drainPresence(t, out))

	require.Eventually(t, func() bool {
		patches := drainPresence(t, out)
		return len(patches) == 1 && connectedValue(t, patches[0], "alice") == false
	}, time.Second, 5*time.Millisecond)

	g.mu.Lock()
	defer g.mu.Unlock()
	players := g.Data["players"].(map[string]any)
	require.Equal(t, false, players["alice"].(map[string]any)["connected"])
}

// A reconnect can attach the new socket before the old one's close is
// noticed. The stale disconnect must not mark the player offline.
func TestStaleDisconnectAfterReconnectKeepsPlayerOnline(t *testing.T) {
	g, out := NewGame()
	g.offlineGrace = 20 * time.Millisecond

	p := g.ConnectPlayer("alice") // original socket
	g.ConnectPlayer("alice")      // new socket attaches first…
	g.DisconnectPlayer(p)         // …then the old socket's close lands

	time.Sleep(100 * time.Millisecond)
	for _, patch := range drainPresence(t, out) {
		require.Equal(t, true, connectedValue(t, patch, "alice"))
	}
	require.True(t, g.Players["alice"].Connected)
}
