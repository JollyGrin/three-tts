# Browser TTS
Recreating table top simulator in the browser using threejs (threlte)

# Notes:
- debugging websocket. Adding the send broadcast in storeIntegrations by wrapping the store functions
- working with partial and full update in path (see notes in file)
- need to have this update the client and prevent feedback loops

--- 

# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you've seen this, you've probably already done this step. Congrats!

```bash
# create a new project in the current directory
npx sv create

# create a new project in my-app
npx sv create my-app
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Running the server

The backend server is a Go websocket server. To run it locally:

```bash
# from the project root
cd server
./run.sh
```

By default, the server listens on port 8080 (or uses the $PORT environment variable if set).

### Exposing via ngrok

To expose the server to the internet and get a public URL:

```bash
ngrok http 8080
```

This will display a forwarding URL (for example https://<your-ngrok-id>.ngrok.io) which you can use in the client to connect over WebSocket.

### Client configuration

In the app Settings pane (Settings > Connection), set the **Server** field to your server address _without_ `http://` or `https://`, for example:

```text
localhost:8080
<your-ngrok-id>.ngrok.io
```

The client reads this value from `localStorage.serverurl` and automatically prefixes `ws://` for local addresses or `wss://` for secure hosts, then connects at `/ws`.
