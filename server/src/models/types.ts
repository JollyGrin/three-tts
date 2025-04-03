/**
 * Core type definitions for the websocket server
 */

// Game state structure
export interface GameState {
  boardState: BoardState;
  playerStates: PlayerStates;
}

// Board state - objects on the board that anyone can update
export interface BoardState {
  [objectId: string]: ObjectState;
}

// Object state (cards on the board)
export interface ObjectState {
  position: [number, number, number];
  rotation: [number, number, number];
  faceImageUrl: string;
  backImageUrl?: string;
}

// Player states - only the owner can update their state
export interface PlayerStates {
  [playerId: string]: PlayerState;
}

export interface PlayerState {
  metadata: PlayerMetadata;
  decks: {
    [deckId: string]: DeckState;
  };
  tray: TrayState;
}

// Player metadata (life, mana, etc.)
export interface PlayerMetadata {
  seat: 0 | 1 | 2 | 3; // Seat position (0, 90, 180, 270 degrees)
  name: string;
  // Additional player metadata can be added here
}

// Deck state
export interface DeckState {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number];
  isFaceUp?: boolean;
  deckBackImageUrl?: string;
  cards: CardInDeck[];
}

// Card in deck
export interface CardInDeck {
  id: string;
  faceImageUrl: string;
  backImageUrl?: string;
}

// Tray state (player's hand)
export interface TrayState {
  [cardId: string]: CardInTray;
}

// Card in tray
export interface CardInTray {
  position: [number, number, number];
  rotation: [number, number, number];
  faceImageUrl: string;
}

// Message types
export type MessageType = 'connect' | 'sync' | 'update' | 'action' | 'error' | 'playerList';

// Message structure
export interface Message {
  type: MessageType;
  playerId: string;
  timestamp: number;
  messageId?: string; // Added for message tracking to prevent loops
  payload?: any;
  // For update messages:
  path?: string[];
  value?: any;
}

// Connect message payload
export interface ConnectPayload {
  lobbyId: string;
  playerId: string;
  secret?: string;
}

// Update message
export interface UpdateMessage extends Message {
  type: 'update';
  path: string[];
  value: any;
  messageId?: string; // Explicit inclusion in the UpdateMessage type
}

// Lobby data
export interface Lobby {
  id: string;
  state: GameState;
  players: Set<string>;
  playerSecrets: Map<string, string>;
}
