# Browser TTS
Recreating table top simulator in the browser using threejs (threlte)

## WebSocket Architecture

This project implements a real-time multiplayer experience using WebSockets. The architecture is designed to seamlessly integrate with Svelte stores and Three.js for synchronized 3D interactions.

### Key Components

- **Store Integration**: All Svelte stores (objectStore, trayStore, deckStore, etc.) are wrapped with WebSocket sync capabilities
- **Message Processing**: Incoming messages from the server are processed and applied to local stores
- **Ownership Tracking**: Cards and game objects track which player last interacted with them

### Synchronization Strategy

We use a combination of techniques to ensure smooth multiplayer interaction:

1. **Object Ownership**: When a player interacts with an object, they gain "ownership" for a short period (2 seconds)
2. **Throttled Updates**: Card movements are throttled to limit WebSocket traffic
3. **Surgical Updates**: Only changed properties are sent over the network, not entire objects
4. **Conflict Resolution**: Ownership-based conflict resolution prevents "jittering" when multiple players interact with the same object

### Challenges & Solutions

| Challenge | Failed Approaches | Working Solution |
|-----------|-------------------|-----------------|
| Feedback Loops | Server-side ownership maps, complex conflict detection | Client-side ownership model with simple "last touched" tracking |
| Card Movement Jitter | Throttling alone, server authority | Ownership-based "ignore policy" for updates to objects we're manipulating |
| Object Removal Feedback | Complex distributed cleanup | Direct null value with removal tracking sets |
| Tray-to-Table Transitions | Simultaneous operations | Sequenced operations with small delays |

### Client-Side Files

- `src/lib/websocket/`
  - `websocketService.ts` - Core WebSocket connection handling
  - `messageProcessor.ts` - Processes incoming WebSocket messages
  - `storeIntegration.ts` - Wraps stores with WebSocket capabilities

### Adding New Features

When adding new synchronized features:

1. **Update Types**: Add new types in the shared `models/types.ts`
2. **Store Integration**: Wrap store methods with `withWebsocketSync()`
3. **Message Handling**: Extend `messageProcessor.ts` to handle new data types
4. **Ownership Rules**: Consider ownership rules for conflict prevention


--- 

# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

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
