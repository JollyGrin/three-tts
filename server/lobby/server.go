package lobby

import (
	"crypto/subtle"
	"encoding/json"
	"html/template"
	"net/http"
	"os"
	"sort"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/rs/zerolog/log"

	"github.com/coder/websocket"
	"github.com/jollygrin/tts-server/game"
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
	mux := chi.NewRouter()
	// Health check endpoint for Railway
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})
	mux.HandleFunc("/view", srv.view)
	mux.HandleFunc("/{lobby}/debug", srv.debug)
	mux.HandleFunc("/ws", srv.handleWebsocket)

	return mux
}

// isAdmin gates admin pages behind the ADMIN_TOKEN env var: unset = the pages
// don't exist; set = require ?token=<value> (constant-time compare).
func isAdmin(r *http.Request) bool {
	token := os.Getenv("ADMIN_TOKEN")
	if token == "" {
		return false
	}
	provided := r.URL.Query().Get("token")
	return subtle.ConstantTimeCompare([]byte(provided), []byte(token)) == 1
}

func (srv *Lobbies) debug(w http.ResponseWriter, r *http.Request) {
	if !isAdmin(r) {
		http.NotFound(w, r)
		return
	}
	srv.lobbiesMu.RLock()
	l, ok := srv.lobbies[chi.URLParam(r, "lobby")]
	srv.lobbiesMu.RUnlock()
	if !ok {
		http.NotFound(w, r)
		return
	}
	data, _ := json.MarshalIndent(l.state, "", "  ")
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(data)
}

type lobbyView struct {
	ID           string
	Clients      int
	Players      []game.PlayerStat
	StateKB      float64
	Updates      int64
	Age          string
	LastActivity string
}

var viewTemplate = template.Must(template.New("view").Parse(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>lobbies — table.place</title>
<style>
	body { font-family: ui-monospace, monospace; background: #1a2420; color: #d7e2dc; padding: 2rem; }
	h1 { font-size: 1.2rem; }
	table { border-collapse: collapse; width: 100%; }
	th, td { text-align: left; padding: 0.4rem 0.8rem; border-bottom: 1px solid #35654d; vertical-align: top; }
	th { color: #8fb8a3; text-transform: uppercase; font-size: 0.7rem; }
	a { color: #7fd4a8; }
	.online { color: #7fd4a8; }
	.offline { color: #6b7a72; }
	.empty { color: #6b7a72; padding: 2rem 0; }
</style>
</head>
<body>
<h1>Active lobbies ({{len .Lobbies}})</h1>
{{if .Lobbies}}
<table>
<tr><th>Lobby</th><th>Clients</th><th>Players</th><th>State</th><th>Updates</th><th>Age</th><th>Last activity</th><th></th></tr>
{{range .Lobbies}}
<tr>
	<td>{{.ID}}</td>
	<td>{{.Clients}}</td>
	<td>
		{{range .Players}}
			<div class="{{if .Connected}}online{{else}}offline{{end}}">{{.ID}} {{if .Connected}}●{{else}}○{{end}}</div>
		{{end}}
	</td>
	<td>{{printf "%.1f" .StateKB}} KB</td>
	<td>{{.Updates}}</td>
	<td>{{.Age}}</td>
	<td>{{.LastActivity}}</td>
	<td><a href="/{{.ID}}/debug?token={{$.Token}}">state</a></td>
</tr>
{{end}}
</table>
{{else}}
<div class="empty">No active lobbies</div>
{{end}}
</body>
</html>`))

func (srv *Lobbies) view(w http.ResponseWriter, r *http.Request) {
	if !isAdmin(r) {
		http.NotFound(w, r)
		return
	}

	// copy lobby refs under the map lock, gather stats after releasing it
	srv.lobbiesMu.RLock()
	lobbies := make([]*Lobby, 0, len(srv.lobbies))
	for _, l := range srv.lobbies {
		lobbies = append(lobbies, l)
	}
	srv.lobbiesMu.RUnlock()

	views := make([]lobbyView, 0, len(lobbies))
	for _, l := range lobbies {
		stats := l.state.Stats()
		views = append(views, lobbyView{
			ID:           l.ID,
			Clients:      l.clientCount(),
			Players:      stats.Players,
			StateKB:      float64(stats.StateBytes) / 1024,
			Updates:      stats.Updates,
			Age:          time.Since(stats.CreatedAt).Round(time.Second).String(),
			LastActivity: time.Since(stats.LastActivity).Round(time.Second).String() + " ago",
		})
	}
	sort.Slice(views, func(i, j int) bool { return views[i].ID < views[j].ID })

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	err := viewTemplate.Execute(w, map[string]any{
		"Lobbies": views,
		"Token":   r.URL.Query().Get("token"),
	})
	if err != nil {
		log.Err(err).Msg("Failed to render lobby view")
	}
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
	// scenario seeds / TTS deck imports carry full card lists and blow past the
	// 32KB default; a failed read silently drops the update AND the client
	conn.SetReadLimit(1 << 20)

	// TODO: More validation
	lobbyID := r.URL.Query().Get("lobby")
	playerID := r.URL.Query().Get("player")
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
	lobby.state.SyncPlayerState(playerID)

	<-ctx.Done()
}
