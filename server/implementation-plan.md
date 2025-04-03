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

Based on the server README, the data model will follow this structure:

```typescript
// Server-side data model
interface GameState {
  boardState: BoardState;
  playerStates: PlayerStates;
}

// Anyone can update objects on the board
interface BoardState {
  [objectId: string]: ObjectState;
}

// Only the owner of a player can update their state
interface PlayerStates {
  [playerId: string]: {
    metadata: PlayerMetadata; // Game information (life, mana, etc.)
    decks: {
      [deckId: string]: DeckState;
    };
    tray: TrayState; // Cards in hand only visible to player
  };
}
```

## 3. Client-Server Integration

### 3.1 Client Store Integration
The current client stores need to be connected to the websocket layer:

- **objectStore**: Will sync with server's `boardState` for card positions and states
- **deckStore**: Will sync with `playerStates[playerId].decks` 
- **trayStore**: Will sync with `playerStates[playerId].tray` (private to each player)
- **seatStore**: Will be part of `playerStates[playerId].metadata` for player orientation
- **dragStore**: Mostly client-side, but drag end events trigger state updates

### 3.2 Surgical Updates
Both server-to-client and client-to-server updates should be surgical to minimize data transfer:

```typescript
// Example surgical update format
interface StateUpdate {
  target: 'board' | 'player' | 'deck' | 'tray';
  action: 'add' | 'update' | 'remove';
  path: string[]; // e.g., ['playerStates', 'player1', 'decks', 'deck1']
  value: any; // The new value for the specified path
}
```

## 4. Message Protocol

### 4.1 Message Types
- **Connect**: Initial connection with player ID, secret passphrase, lobby ID
- **Sync**: Full state sync (used on initial connection or reconnection)
- **Update**: Surgical update to a specific part of the state
- **Action**: Game actions like drawing cards, shuffling decks
- **Error**: Error messages from server
- **PlayerList**: Updates about players in the lobby

### 4.2 Message Structure
```typescript
interface Message {
  type: 'connect' | 'sync' | 'update' | 'action' | 'error' | 'playerList';
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
- **Board objects**: Any player can update
- **Player state**: Only the owner can update
- **Player metadata**: Only the owner can update
- **Player decks**: Only the owner can update
- **Player tray**: Only the owner can update

### 5.2 Implementation
- Use player ID and optional secret passphrase for authentication
- Validate each update message against permission rules
- Reject unauthorized updates with appropriate error messages

## 6. Implementation Steps

### 6.1 Server Setup
1. Create a basic Bun server with websocket support
2. Implement connection handling and lobby management
3. Set up the data structure for game state
4. Create permission validation system

### 6.2 Message Handling
1. Implement message parsing and validation
2. Create handlers for each message type
3. Set up surgical update processor
4. Implement state diffing for efficient updates

### 6.3 Client Integration
1. Refactor client stores to connect with websocket
2. Add reconnection and sync functionality
3. Create middleware for sending updates to server
4. Implement client-side permissions validation

### 6.4 Testing
1. Create test scenarios for different message types
2. Test permissions with multiple players
3. Stress test with multiple updates
4. Test reconnection scenarios

## 7. Optimizations

### 7.1 Bandwidth Optimization
- Use JSON for message format with minimal payload size
- Implement binary protocol for position/rotation updates if needed
- Group multiple rapid updates (e.g., during movement) into batches

### 7.2 Latency Handling
- Implement client-side prediction for smooth movement
- Use timestamps for order resolution
- Consider lockstep synchronization for action-critical moments

## 8. Deployment Considerations
- Keep server stateless where possible for scaling
- Consider persistence layer for game state if needed
- Implement monitoring and logging
- Plan for horizontal scaling for multiple game lobbies

## Next Steps

1. Create a basic server with websocket connections
2. Implement the lobby system
3. Define the message protocol in detail
4. Create the permission system
5. Integrate with client stores
6. Test with multiple players
