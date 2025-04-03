/**
 * Lobby Manager
 * Handles creation and management of game lobbies
 */
import { type ServerWebSocket } from "bun";
import { Lobby, Message, UpdateMessage } from "../models/types";
import { createInitialGameState, hasPermission, setValueAtPath } from "../utils/stateUtils";
import * as logger from "../utils/logger";

// Define a ServerWebSocket type with unknown data
type WebSocket = ServerWebSocket<unknown>;

export class LobbyManager {
  private lobbies = new Map<string, Lobby>();
  private clientToLobby = new Map<WebSocket, string>();
  private clientToPlayer = new Map<WebSocket, string>();

  /**
   * Get player ID for a socket connection
   */
  public getPlayerIdForSocket(client: WebSocket): string | undefined {
    return this.clientToPlayer.get(client);
  }

  /**
   * Create a new lobby or return existing one
   */
  public getLobby(lobbyId: string): Lobby {
    if (!this.lobbies.has(lobbyId)) {
      logger.info(`Creating new lobby: ${lobbyId}`);
      this.lobbies.set(lobbyId, {
        id: lobbyId,
        state: createInitialGameState(),
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
    
    // Check permissions
    if (!hasPermission(playerId, message.path)) {
      logger.warn(`Permission denied for player ${playerId} to update path: ${message.path.join('.')}`);
      this.sendError(client, "Permission denied");
      return;
    }
    
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
    this.broadcastUpdate(lobby, message, client);
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
   * Broadcast an update to all clients in a lobby except the sender
   */
  private broadcastUpdate(lobby: Lobby, message: UpdateMessage, excludeClient: WebSocket): void {
    const senderPlayerId = this.clientToPlayer.get(excludeClient) || "unknown";
    
    logger.debug(`Broadcasting update from player ${senderPlayerId} to all other players in lobby ${lobby.id}`, {
      path: message.path,
      otherPlayerCount: lobby.players.size - 1
    });
    
    let sentCount = 0;
    
    for (const client of this.clientToLobby.keys()) {
      if (client !== excludeClient && this.clientToLobby.get(client) === lobby.id) {
        client.send(JSON.stringify(message));
        sentCount++;
      }
    }
    
    logger.debug(`Update broadcast complete. Sent to ${sentCount} clients`);
  }

  /**
   * Broadcast a message to all clients in a lobby
   */
  private broadcast(lobby: Lobby, message: Message): void {
    for (const client of this.clientToLobby.keys()) {
      if (this.clientToLobby.get(client) === lobby.id) {
        const clientPlayerId = this.clientToPlayer.get(client) || "unknown";
        logger.logWebsocketMessage('SENDING', message, clientPlayerId, clientPlayerId);
        client.send(JSON.stringify(message));
      }
    }
  }

  /**
   * Send error message to a client
   */
  private sendError(client: WebSocket, errorMessage: string): void {
    const playerId = this.clientToPlayer.get(client) || "unknown";
    
    const message: Message = {
      type: "error",
      playerId: "server",
      timestamp: Date.now(),
      payload: { message: errorMessage }
    };
    
    logger.warn(`Sending error to player ${playerId}: ${errorMessage}`);
    client.send(JSON.stringify(message));
  }
}
