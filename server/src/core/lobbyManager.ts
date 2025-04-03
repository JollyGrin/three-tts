/**
 * Lobby Manager
 * Handles creation and management of game lobbies
 */
import { type ServerWebSocket } from "bun";
import { Lobby, Message, UpdateMessage } from "../models/types";
import * as logger from "../utils/logger";
import { setValueAtPath } from "../utils/stateUtils";

// Define a type alias for ServerWebSocket with unknown data
type WebSocket = ServerWebSocket<unknown>;

export class LobbyManager {
  private lobbies = new Map<string, Lobby>();
  private clientToLobby = new Map<WebSocket, string>();
  private clientToPlayer = new Map<WebSocket, string>();
  private objectOwnership = new Map<string, { playerId: string, timestamp: number }>();

  /**
   * Get player ID for a socket connection
   */
  public getPlayerIdForSocket(client: WebSocket): string | undefined {
    return this.clientToPlayer.get(client);
  }

  /**
   * Get lobby ID for a player ID
   */
  public getPlayerLobby(playerId: string): string | undefined {
    // Find the socket for this player
    for (const [socket, id] of this.clientToPlayer.entries()) {
      if (id === playerId) {
        return this.clientToLobby.get(socket);
      }
    }
    return undefined;
  }

  /**
   * Create a new lobby or return existing one
   */
  public getLobby(lobbyId: string): Lobby {
    if (!this.lobbies.has(lobbyId)) {
      logger.info(`Creating new lobby: ${lobbyId}`);
      this.lobbies.set(lobbyId, {
        id: lobbyId,
        state: {
          boardState: {},
          playerStates: {}
        },
        players: new Set<string>(),
        playerSecrets: new Map<string, string>()
      });
    }
    
    return this.lobbies.get(lobbyId)!;
  }

  /**
   * Add player to a lobby
   */
  public addPlayerToLobby(
    lobbyId: string, 
    playerId: string, 
    client: WebSocket, 
    secret?: string
  ): void {
    const lobby = this.getLobby(lobbyId);
    
    // Add player to lobby
    lobby.players.add(playerId);
    
    // Store secret if provided
    if (secret) {
      lobby.playerSecrets.set(playerId, secret);
    }
    
    // Map client to lobby and player
    this.clientToLobby.set(client, lobbyId);
    this.clientToPlayer.set(client, playerId);
    
    logger.info(`Player ${playerId} added to lobby ${lobbyId}`);
    logger.debug(`Current lobby state: ${lobby.players.size} players, ${Object.keys(lobby.state.boardState).length} board objects`);
    
    // Initialize player state if needed
    if (!lobby.state.playerStates[playerId]) {
      logger.debug(`Creating initial state for player ${playerId}`);
      lobby.state.playerStates[playerId] = {
        metadata: {
          name: playerId,
          seat: 0 // Default seat position
        },
        decks: {},
        tray: {}
      };
    }
    
    // Send full state to the new player
    this.sendFullState(client, lobby);
    
    // Broadcast player list update to all players in lobby
    this.broadcastPlayerList(lobby);
  }

  /**
   * Remove player from a lobby
   */
  public removePlayerFromLobby(client: WebSocket): void {
    const lobbyId = this.clientToLobby.get(client);
    const playerId = this.clientToPlayer.get(client);
    
    if (!lobbyId || !playerId) return;
    
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
    
    // Remove player from lobby
    lobby.players.delete(playerId);
    
    logger.info(`Player ${playerId} removed from lobby ${lobbyId}`);
    
    // Clean up mappings
    this.clientToLobby.delete(client);
    this.clientToPlayer.delete(client);
    
    // Broadcast player list update
    this.broadcastPlayerList(lobby);
    
    // Delete lobby if empty
    if (lobby.players.size === 0) {
      logger.info(`Lobby ${lobbyId} is empty, removing it`);
      this.lobbies.delete(lobbyId);
    }
  }

  /**
   * Process update message
   */
  public processUpdate(client: WebSocket, message: UpdateMessage): void {
    const lobbyId = this.clientToLobby.get(client);
    const playerId = this.clientToPlayer.get(client);

    if (!lobbyId || !playerId) {
      logger.warn(`Update from unauthorized client, no lobby or player ID`);
      return;
    }
    
    const lobby = this.lobbies.get(lobbyId);

    if (!lobby) {
      logger.warn(`Update for non-existent lobby: ${lobbyId}`);
      return;
    }
    
    // Check basic permissions
    if (!this.hasUpdatePermission(playerId, message.path)) {
      logger.warn(`Permission denied for player ${playerId} to update path: ${message.path.join('.')}`);
      return;
    }

    // ANTI-FEEDBACK LOOP: Check if this is a card being updated
    const [stateType, objectId] = message.path;
    if (stateType === 'boardState' && 
        message.value && 
        typeof message.value === 'object' &&
        message.value.lastTouchedBy) {
      
      // Current timestamp
      const now = Date.now();
      
      // Previous ownership data we have for this object
      const lastOwnership = this.objectOwnership.get(`${lobbyId}:${objectId}`);
      
      // If this object is already being manipulated by another player
      if (lastOwnership && 
          lastOwnership.playerId !== playerId && 
          lastOwnership.playerId === message.value.lastTouchedBy &&
          now - lastOwnership.timestamp < 2000) {
        
        // Reject this update - object is locked by another player
        logger.info(`Rejecting update to ${objectId} - currently owned by ${lastOwnership.playerId}`);
        return;
      }
      
      // Update our ownership tracking
      this.objectOwnership.set(`${lobbyId}:${objectId}`, {
        playerId: message.value.lastTouchedBy,
        timestamp: message.value.lastTouchTime || now
      });
    }
    
    // Update timestamp
    message.timestamp = Date.now();
    
    // Log the update before applying it
    logger.debug(`Applying update to lobby ${lobbyId} from player ${playerId}:`, {
      path: message.path,
      messageId: message.messageId
    });
    
    // Apply update to state
    lobby.state = setValueAtPath(lobby.state, message.path, message.value);
    
    // Log after the update
    logger.debug(`Update applied, broadcasting to other clients in lobby ${lobbyId}`);
    
    // Broadcast update to all clients in lobby except sender
    this.broadcastToLobby(lobbyId, message, client);
  }

  /**
   * Send full state to a client
   */
  private sendFullState(client: WebSocket, lobby: Lobby): void {
    const playerId = this.clientToPlayer.get(client) || "";
    
    const message: Message = {
      type: "sync",
      playerId: "server",
      timestamp: Date.now(),
      payload: lobby.state
    };
    
    logger.info(`Sending full state to player ${playerId} in lobby ${lobby.id}`);
    client.send(JSON.stringify(message));
  }

  /**
   * Broadcast player list to all clients in a lobby
   */
  private broadcastPlayerList(lobby: Lobby): void {
    const message: Message = {
      type: "playerList",
      playerId: "server",
      timestamp: Date.now(),
      payload: Array.from(lobby.players)
    };
    
    logger.info(`Broadcasting player list update in lobby ${lobby.id}: ${lobby.players.size} players`);
    this.broadcast(lobby, message);
  }

  /**
   * Broadcast a message to all clients in a lobby, excluding the sender
   */
  private broadcastToLobby(lobbyId: string, message: Message, excludeWs?: WebSocket): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
    
    const messageStr = JSON.stringify(message);
    
    // Track excluded socket ID for logging
    const excludeSocketId = excludeWs ? this.getSocketId(excludeWs) : null;
    
    // Count of successful sends
    let sendCount = 0;
    
    // Broadcast to all sockets in the lobby except the sender
    for (const client of this.clientToLobby.keys()) {
      if (client !== excludeWs && this.clientToLobby.get(client) === lobbyId) {
        try {
          const receiverSocketId = this.getSocketId(client);
          
          // Log the message being sent
          logger.logWebsocketMessage(
            'SENDING',
            message,
            this.clientToPlayer.get(client) || "unknown",
            receiverSocketId
          );
          
          // Send the message
          client.send(messageStr);
          sendCount++;
        } catch (error) {
          logger.error(`Error sending message to player ${this.clientToPlayer.get(client) || "unknown"}:`, error);
          // Socket is probably dead, remove player from lobby
          this.removePlayerFromLobby(client);
        }
      }
    }
    
    logger.debug(`Broadcast message to ${sendCount} players in lobby ${lobbyId} (excluding ${excludeSocketId || 'none'})`);
  }

  /**
   * Broadcast a message to all clients in a lobby
   */
  private broadcast(lobby: Lobby, message: Message): void {
    for (const client of this.clientToLobby.keys()) {
      if (this.clientToLobby.get(client) === lobby.id) {
        const clientPlayerId = this.clientToPlayer.get(client) || "unknown";
        logger.logWebsocketMessage('SENDING', message, clientPlayerId, this.getSocketId(client));
        client.send(JSON.stringify(message));
      }
    }
  }

  /**
   * Get a unique identifier for a socket
   */
  private getSocketId(ws: WebSocket): string {
    // Use the clientToPlayer map to get the player ID associated with this socket
    const playerId = this.clientToPlayer.get(ws);
    if (playerId) {
      return `socket-${playerId.substring(0, 8)}`;
    }
    
    // Fallback if no player ID is found
    return 'unknown-socket';
  }

  /**
   * Basic permission check for updates
   */
  private hasUpdatePermission(playerId: string, path: string[]): boolean {
    // Only allow players to update their own player state
    if (path[0] === 'playerStates' && path[1] !== playerId) {
      return false;
    }
    
    return true;
  }
}
