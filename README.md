# Browser TTS
Recreating table top simulator in the browser using threejs (threlte)

# Notes:
- currently debugging server to avoid infinite loops
- need to rely on self-hosting server to avoid a crazy bill
- need to fix feedback loops to host easily

--- 

## client

To run the frontend:

```bash
bun run dev
```

## Backend Prerequisites

To run the backend server you need Go installed:

- Visit https://go.dev/doc/install for platform-specific instructions.
- On macOS, use Homebrew:

```bash
brew install go
```

Verify installation:

```bash
go version
```

## Running the server

The backend server is a Go websocket server. To run it locally:

```bash
# from the project root
cd server
go build -o tts-server .
./run.sh
```

By default, the server listens on port 8080 (or uses the $PORT environment variable if set).

### Exposing via ngrok

The frontend accepts any server connection. To expose the server to the internet for free and get a public URL:

```bash
ngrok http 8080
```

This will display a forwarding URL (for example https://<your-ngrok-id>.ngrok.io) which you can use in the client to connect over WebSocket.

**Ensure your server is running on `localhost:8080` before starting ngrok. After running ngrok, copy and share the forwarding URL with other players so they can connect to your lobby.**

### Client configuration

In the app Settings pane (Settings > Connection), set the **Server** field to your server address _without_ `http://` or `https://`, for example:

```text
localhost:8080
<your-ngrok-id>.ngrok.io
```

The client reads this value from `localStorage.serverurl` and automatically prefixes `ws://` for local addresses or `wss://` for secure hosts, then connects at `/ws`.
