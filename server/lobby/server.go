package lobby

import (
	"net/http"
	"sync"

	"github.com/go-chi/chi/v5"
	"github.com/jollygrin/tts-server/logger"

	"github.com/coder/websocket"
	"github.com/rs/zerolog/log"
)

type Lobbies struct {
	lobbies   map[string]*Lobby
	lobbiesMu sync.RWMutex
}

func New() *Lobbies {
	srv := &Lobbies{
		lobbies: make(map[string]*Lobby),
	}

	return srv
}

func (srv *Lobbies) Router() http.Handler {
	srv.lobbiesMu.RLock()
	defer srv.lobbiesMu.RUnlock()

	mux := chi.NewRouter()
	mux.HandleFunc("/ws", srv.handleWebsocket)

	return mux
}

func (srv *Lobbies) handleWebsocket(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Upgrade HTTP connection to websocket
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true, // Fix this when you go to prod
	})
	if err != nil {
		log.Error().Msgf("Failed to upgrade connection: %v", err)
		return
	}

	// TODO: More validation
	lobbyID := chi.URLParam(r, "lobby")
	playerID := chi.URLParam(r, "player")
	if lobbyID == "" || playerID == "" {
		log.Error().Msg("Missing lobby ID or player ID")
		_ = conn.Close(websocket.StatusInternalError, "missing lobby or player ID")
		return
	}

	log.Info().
		Str("lobby", lobbyID).
		Str("player", playerID).
		Msg("Connecting to lobby")

	lobby := srv.lobby(lobbyID)

	// TODO: Have AddClient be a func that makes the client and returns it
	client := lobby.AddClient(playerID, conn)
	log.Info().
		Str("lobby", lobbyID).
		Str("player", playerID).
		Msg("player connected to lobby")

	go lobby.clientRead(ctx, client)
	go lobby.clientWrite(ctx, client)

}
