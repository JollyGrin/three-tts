# Implementation Plan for Websocket Server

## Overview

This plan outlines the implementation of a websocket server for a tabletop simulator built with Threlte (Svelte & Three.js). The server will enable multiple players to connect to the same game lobby, share game state, and update elements based on ownership permissions.

## 1. Server Architecture

### 1.1 Technology Stack
- **Runtime**: Bun (as specified in user preferences)
- **Websocket Library**: Native Bun websockets or ws/Socket.IO
- **Server Structure**: Modular design with separate concerns for:
  - Connection handling
  - Lobby management
  - State management
  - Authorization/permissions
  - Message processing

### 1.2 Core Components
- **Connection Manager**: Handles client connections, disconnections, and reconnections
- **Lobby Manager**: Creates and manages game lobbies with unique IDs
- **State Manager**: Maintains the game state for each lobby
- **Message Handler**: Processes incoming messages and routes them appropriately
- **Permission System**: Controls who can update which parts of the game state

## 2. Data Structure
the gamestate is broken down into:
- decks: all decks on the table (location, rotation, cards, face up/down)
- objects: all cards on the table (location, rotation, face/back image)
- players: all players in the game
    - player: meatadata (life, resources), deckIds, tray*, seat*
    * (tray & seat are updated via a subscription to the local stores. This means only the local player can update their own state)

all of these are records for quick lookups and path adjustments. For example:
```
const decks = {
    deck1: {...state},
    deck2: {...state},
    ...
}
const objects = {
    object1: {...state},
}
const players = {
    player1: {...state},
    player2: {...state},
    ...
}

const gamestate = {decks, objects, players, lobbyId}
```
The entire gamestate should always be on the server, so that if a player reloads the page, everything is synced.

Updates to the gamestate should be through surgical changes. 
When a player broadcasts a change, it will just be the path towards the variable to be changed in the gamestate, and the new value. 
Then each client should be able read this message and apply it locally in their client stores.

```

## 3. Client-Server Integration

### 3.1 Client Store Integration
The current client stores need to be connected to the websocket layer:
read the readme in lib/stores/README-stores.md for information how the svelte stores are setup to update the client. Remember that since decks and objects are on the table, anyone can touch and update them.

### 3.2 Surgical Updates
Both server-to-client and client-to-server updates should be surgical to minimize data transfer:

```typescript
// Example surgical update format
interface StateUpdate {
  target: 'player' | 'deck' | 'object';
  action: 'add' | 'update' | 'remove';
  path: string[]; // e.g., ['deck', 'deck1', 'cards'] or ['object', 'card3', 'position']
  value: any; // The new value for the specified path
}
```

## 4. Message Protocol

### 4.1 Message Types
- **Connect**: Initial connection with player ID, secret passphrase, lobby ID
- **Sync**: Full state sync (used on initial connection or reconnection)
- **Update**: Surgical update to a specific part of the state
- @deprecated: move actions to update - **Action**: Game actions like drawing cards, shuffling decks
- **Error**: Error messages from server
- @deprecated: move playerList to and update to players **PlayerList**: Updates about players in the lobby

### 4.2 Message Structure
```typescript
interface Message {
  type: 'connect' | 'sync' | 'update' | 'error';
  payload: any;
  timestamp: number;
  playerId: string;
  // For update messages:
  path?: string[];
  value?: any;
}
```

## 5. Authorization and Permissions

### 5.1 Permission Rules
- objects: all objects are on the table and able to be moved/updated by anyone
- decks: all decks are on the table and able to be moved/updated by anyone
- players: players holds all the players, but the client will only send updates their own player data.

### 5.2 Implementation
- Use player ID and optional secret passphrase for authentication. Can just join with lobby id and player id
- @deprecated: not needed? keep it simple and handle restriction on client Validate each update message against permission rules
- Reject unauthorized updates with appropriate error messages

## 6. Implementation Steps

### 6.1 Server Setup
1. Create a basic go server with websocket support
2. Implement connection handling and lobby management
3. Set up the data structure for game state
4. Create permission validation system

### 6.2 Message Handling
1. Implement message parsing and validation
2. Create handlers for each message type
3. Set up surgical update processor
4. Implement state diffing for efficient updates
5. All messages should have the id of the player who initiated it and the timestamp of the action

### 6.3 Client Integration
1. Refactor client stores to connect with websocket
2. Add reconnection and sync functionality
3. Create middleware for sending updates to server
4. Implement client-side permissions validation
5. Keep ALL integrations seperate from client stores. Do not edit client stores directly. Instead use an init function to change store update functions with a websocket wrapper that sends the message
6. When receiving messages from the server, apply them to the client stores BUT do not rebroadcast these updates. Only send updates to the server when local player iniates.
    - This is very important to get right, otherwise will create a feedback loop where broadcasting will update opponent, then this update triggers them to broadcast, causing you to update and trigger... and so on. 
    - should be clever enough to detect and avoid this.


## 7. Optimizations

### 7.1 Bandwidth Optimization
- Use JSON for message format with minimal payload size
- Group multiple rapid updates (e.g., during movement) into batches

### 7.2 Latency Handling
- Use timestamps for order resolution

## Next Steps

1. Create a basic server with websocket connections
2. Implement the lobby system
3. Define the message protocol in detail
4. Create the permission system
5. Integrate with client stores
6. Test with multiple players
