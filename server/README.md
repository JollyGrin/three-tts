# Server to handle websocket connections

server/
├── index.ts               # Main entry point
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── src/
│   ├── core/
│   │   ├── websocketServer.ts  # WebSocket connection handling
│   │   └── lobbyManager.ts     # Lobby and state management
│   ├── models/
│   │   └── types.ts            # Type definitions
│   └── utils/
│       └── stateUtils.ts       # State update utilities
│       └── logger.ts           # Logging utilities

## Implementation Details

The server is built on [Bun](https://bun.sh/) for high-performance WebSocket handling with TypeScript support. The architecture focuses on real-time synchronized game state with minimal latency.

### Key Components

#### `WebSocketServer`
Handles raw WebSocket connections, authentication, and message routing to appropriate lobbies.

#### `LobbyManager`
Core of the server's functionality:
- Manages multiple isolated game lobbies
- Maintains game state for each lobby
- Processes updates from clients
- Broadcasts changes to other clients in the same lobby

### Message Flow

1. **Client connects** → Authentication → Assigned to lobby
2. **Client sends update** → LobbyManager validates → State updated → Broadcast to other clients
3. **Client disconnects** → Cleanup resources → Notify other players

### State Management

The server implements a simple but effective approach to state synchronization:

```
Client A → Update → Server → Apply update → Broadcast → Client B
```

- Updates are processed using the `setValueAtPath` function that applies surgical changes
- Each update includes a path (e.g., `['boardState', 'card:123']`) and a value object
- Null values trigger object deletion

### Synchronization Strategies

We tested several approaches to handle high-frequency updates (like card dragging):

| Strategy | Implementation | Result |
|----------|---------------|--------|
| Server Ownership Tracking | Track which player "owns" an object | Added complexity with minimal benefit |
| Update Throttling | Limit update frequency on server | Helps but doesn't prevent feedback loops |
| Client-side Ownership | Let clients determine ownership | Best solution with minimal server complexity |
| Last-Writer-Wins | Latest update overwrites | Created jittering |

### Lessons Learned

1. **Client-Side Ownership Works Best**: Having clients track "lastTouchedBy" with timestamps proved more effective than complex server-side tracking
2. **Minimal Server Logic**: The server primarily forwards updates after validation, keeping complexity low
3. **State Path Structure**: The `path` approach for updates makes it easy to apply targeted changes

### Adding New Features

When extending the server:

1. **Update Types**: Add new types to `models/types.ts`
2. **Permission Logic**: Extend the permission checks in `LobbyManager` if needed
3. **Testing**: Test with multiple clients for feedback loops before committing
4. **Logging**: Use the logger for detailed message tracking when debugging

## Goal

- Create a server that can handle websocket connections
- connection groups are broken up into different lobbies. Each lobby is a new instance
- each lobby has a unique id. Players that connect to the same lobby can share messages withe each other
- each player has a unique id, and optionally (can be null/undefined) a secret passphrase

## Data Structure
All data is visible, including player's private state, but only the owner of the player can update their state
```ts
// Anyone can update the objects on the board
const BoardState = {
    [objectId]: {...objectState},
    ...
}

// Only the owner of the player can update the player state
const PlayerStates = {
    [playerId]: {
        metadata: { ...playerMetadata }, // extra data to store game information (life, mana, etc)
        decks: { [deckId]: {...deckState} }, // each deck has a unique id
        tray: { ...trayState } // cards in the hand only visible to player
    },
    ...
}
```

## Sending Messages
Send as surgical updates as possible to the websocket. For example, don't send the entire board state on every update.
This is especially important for movement, which has a lot of changes as items are dragged.

Additionally, have the websocket send surgical updates to the client, which updates the client piece by piece instead of rerendering everything.

This means the client will need to interpret state changes and apply the diffs locally. On reload, will load the entire state of the game again.

## Considerations
Identify how to refactor the existing stores to weave together with the websocket layer. The stores should handle client data (card position/movement/etc). These local changes should update the websocket, and the websocket should update these local stores
- ObjectStore: public objects on the table that can be dragged (currently only cards, later will incorporate other objects)
- SeatStore: global rotation data for the user. Each player will face a different direction, and objects should be seen from their viewpoint.
- TrayStore: cards in the player's hand, not visible to the other players
- DeckStore: decks on the table (not draggable)
- DragStore: information about the currently dragged object (including hover, isTrayHovered, isDeckHovered) and the intersection point
