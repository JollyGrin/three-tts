package lobby

import (
	"time"

	"github.com/rs/zerolog/log"
)

// how long an empty lobby survives before it's garbage-collected — long
// enough that a full-lobby refresh/reconnect doesn't lose the game state
const emptyLobbyTTL = 15 * time.Minute

func (l *Lobbies) lobby(id string) *Lobby {
	l.lobbiesMu.Lock()
	defer l.lobbiesMu.Unlock()

	if lobby, exists := l.lobbies[id]; exists {
		return lobby
	}

	log.Info().
		Str("lobby", id).
		Msgf("Creating new lobby: %s", id)

	lobby := newLobby(id)
	lobby.onEmpty = func() {
		time.AfterFunc(emptyLobbyTTL, func() {
			l.lobbiesMu.Lock()
			defer l.lobbiesMu.Unlock()
			existing, ok := l.lobbies[id]
			if !ok || existing != lobby || lobby.clientCount() > 0 {
				return // someone came back, or the lobby was already replaced
			}
			log.Info().Str("lobby", id).Msg("Removing idle empty lobby")
			delete(l.lobbies, id)
			lobby.Close()
		})
	}

	l.lobbies[id] = lobby
	return lobby
}
