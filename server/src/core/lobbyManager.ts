/**
 * Lobby Manager
 * Handles creation and management of game lobbies
 */
import { Server, WebSocket } from "bun";
import { Lobby, GameState, Message, UpdateMessage } from "../models/types";
import { createInitialGameState, hasPermission, setValueAtPath } from "../utils/stateUtils";

export class LobbyManager {
  private lobbies = new Map<string, Lobby>();
  private clientToLobby = new Map<WebSocket, string>();
  private clientToPlayer = new Map<WebSocket, string>();

  /**
   * Create a new lobby or return existing one
   */
  public getLobby(lobbyId: string): Lobby {
    if (!this.lobbies.has(lobbyId)) {
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
    
    // Initialize player state if needed
    if (!lobby.state.playerStates[playerId]) {
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
    
    // Clean up mappings
    this.clientToLobby.delete(client);
    this.clientToPlayer.delete(client);
    
    // Broadcast player list update
    this.broadcastPlayerList(lobby);
    
    // Delete lobby if empty
    if (lobby.players.size === 0) {
      this.lobbies.delete(lobbyId);
    }
  }

  /**
   * Process update message
   */
  public processUpdate(client: WebSocket, message: UpdateMessage): void {
    const lobbyId = this.clientToLobby.get(client);
    const playerId = this.clientToPlayer.get(client);
    
    if (!lobbyId || !playerId) return;
    
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
    
    // Check permissions
    if (!hasPermission(playerId, message.path)) {
      this.sendError(client, "Permission denied");
      return;
    }
    
    // Apply update to state
    lobby.state = setValueAtPath(lobby.state, message.path, message.value);
    
    // Broadcast update to all clients in lobby except sender
    this.broadcastUpdate(lobby, message, client);
  }

  /**
   * Send full state to a client
   */
  private sendFullState(client: WebSocket, lobby: Lobby): void {
    const message: Message = {
      type: "sync",
      playerId: this.clientToPlayer.get(client) || "",
      timestamp: Date.now(),
      payload: lobby.state
    };
    
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
    
    this.broadcast(lobby, message);
  }

  /**
   * Broadcast an update to all clients in a lobby except the sender
   */
  private broadcastUpdate(lobby: Lobby, message: UpdateMessage, excludeClient: WebSocket): void {
    for (const client of this.clientToLobby.keys()) {
      if (client !== excludeClient && this.clientToLobby.get(client) === lobby.id) {
        client.send(JSON.stringify(message));
      }
    }
  }

  /**
   * Broadcast a message to all clients in a lobby
   */
  private broadcast(lobby: Lobby, message: Message): void {
    for (const client of this.clientToLobby.keys()) {
      if (this.clientToLobby.get(client) === lobby.id) {
        client.send(JSON.stringify(message));
      }
    }
  }

  /**
   * Send error message to a client
   */
  private sendError(client: WebSocket, errorMessage: string): void {
    const message: Message = {
      type: "error",
      playerId: "server",
      timestamp: Date.now(),
      payload: { message: errorMessage }
    };
    
    client.send(JSON.stringify(message));
  }
}
