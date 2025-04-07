package main

import (
	"flag"
	"net/http"
	"os"

	"github.com/jollygrin/tts-server/lobby"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

// Command line flags
var (
	addr  = flag.String("addr", ":8080", "http service address")
	debug = flag.Bool("debug", false, "enable debug logging")
)

func main() {
	flag.Parse()
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})

	if *debug {
		zerolog.SetGlobalLevel(zerolog.DebugLevel)
		log.Info().Msg("Debug logging enabled")
	}

	srv := lobby.New()
	mux := srv.Router()

	// Start the server
	log.Info().Msgf("Server listening on %s", *addr)
	if err := http.ListenAndServe(*addr, mux); err != nil {
		log.Err(err).Msg("server failed")
	}
}
