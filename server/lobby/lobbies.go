package lobby

import (
	"github.com/rs/zerolog/log"
)

func (l *Lobbies) lobby(id string) *Lobby {
	l.lobbiesMu.Lock()
	defer l.lobbiesMu.Unlock()

	if lobby, exists := l.lobbies[id]; exists {
		return lobby
	}

	log.Info().
		Str("lobby", id).
		Msgf("Creating new lobby: %s", id)

	lobby := NewLobby(id)

	l.lobbies[id] = lobby
	return lobby
}
