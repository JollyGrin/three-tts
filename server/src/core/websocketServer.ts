/**
 * Websocket Server
 * Handles websocket connections and message routing
 */
import { type ServerWebSocket } from "bun";
import { LobbyManager } from "./lobbyManager";
import { Message, ConnectPayload, UpdateMessage } from "../models/types";
import * as logger from "../utils/logger";

// Define a type alias for ServerWebSocket with unknown data
type WebSocket = ServerWebSocket<unknown>;

export class WebSocketServer {
  private lobbyManager: LobbyManager;
  private socketCounter = 0;
  private socketIds = new WeakMap<WebSocket, string>();

  constructor(port: number) {
    this.lobbyManager = new LobbyManager();
    
    logger.info(`Starting websocket server on port ${port}`);
    
    Bun.serve({
      port,
      fetch: (req, server) => {
        // Upgrade the request to a WebSocket connection if it's a WebSocket request
        if (server.upgrade(req)) {
          return; // Return if upgrade was successful
        }
        
        // Return a 404 for all other HTTP requests
        return new Response("Not Found", { status: 404 });
      },
      websocket: {
        open: this.handleConnection.bind(this),
        message: this.handleMessage.bind(this),
        close: this.handleDisconnection.bind(this)
      }
    });
    
    logger.info(`WebSocket server started on port ${port}`);
  }

  /**
   * Get or create a unique ID for a socket
   */
  private getSocketId(ws: WebSocket): string {
    if (!this.socketIds.has(ws)) {
      this.socketIds.set(ws, `socket-${++this.socketCounter}`);
    }
    return this.socketIds.get(ws)!;
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket): void {
    const socketId = this.getSocketId(ws);
    logger.info(`New client connected [Socket: ${socketId}]`);
    // Actual connection handling is done when connect message is received
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(ws: WebSocket, message: string): void {
    const socketId = this.getSocketId(ws);
    
    try {
      const data = JSON.parse(message) as Message;
      
      // Log the received message
      logger.logWebsocketMessage('RECEIVED', data, data.playerId || 'unknown', socketId);
      
      switch (data.type) {
        case "connect":
          this.handleConnectMessage(ws, data);
          break;
          
        case "update":
          this.handleUpdateMessage(ws, data as UpdateMessage);
          break;
          
        case "action":
          this.handleActionMessage(ws, data);
          break;
          
        default:
          logger.warn(`Unknown message type: ${data.type}`, { socketId });
      }
    } catch (error) {
      logger.error(`Error processing message from socket ${socketId}:`, error);
      
      const errorMessage: Message = {
        type: "error",
        playerId: "server",
        timestamp: Date.now(),
        payload: { message: "Invalid message format" }
      };
      
      ws.send(JSON.stringify(errorMessage));
    }
  }

  /**
   * Handle client disconnection
   */
  private handleDisconnection(ws: WebSocket): void {
    const socketId = this.getSocketId(ws);
    const playerId = this.lobbyManager.getPlayerIdForSocket(ws);
    logger.info(`Client disconnected [Socket: ${socketId}] [Player: ${playerId || 'unknown'}]`);
    this.lobbyManager.removePlayerFromLobby(ws);
  }

  /**
   * Handle connect message
   */
  private handleConnectMessage(ws: WebSocket, message: Message): void {
    const socketId = this.getSocketId(ws);
    const payload = message.payload as ConnectPayload;
    
    if (!payload || !payload.lobbyId || !payload.playerId) {
      logger.warn(`Invalid connect message from socket ${socketId}`, message);
      
      const errorMessage: Message = {
        type: "error",
        playerId: "server",
        timestamp: Date.now(),
        payload: { message: "Invalid connect message" }
      };
      
      ws.send(JSON.stringify(errorMessage));
      return;
    }
    
    this.lobbyManager.addPlayerToLobby(
      payload.lobbyId,
      payload.playerId,
      ws,
      payload.secret
    );
    
    logger.info(`Player ${payload.playerId} joined lobby ${payload.lobbyId} [Socket: ${socketId}]`);
  }

  /**
   * Handle update message
   */
  private handleUpdateMessage(ws: WebSocket, message: UpdateMessage): void {
    const socketId = this.getSocketId(ws);
    const playerId = this.lobbyManager.getPlayerIdForSocket(ws);
    
    if (!message.path || message.value === undefined) {
      logger.warn(`Invalid update message from player ${playerId} [Socket: ${socketId}]`, message);
      
      const errorMessage: Message = {
        type: "error",
        playerId: "server",
        timestamp: Date.now(),
        payload: { message: "Invalid update message" }
      };
      
      ws.send(JSON.stringify(errorMessage));
      return;
    }
    
    logger.debug(`Processing update from player ${playerId} [Socket: ${socketId}]`, { 
      path: message.path,
      messageId: message.messageId
    });
    
    this.lobbyManager.processUpdate(ws, message);
  }

  /**
   * Handle action message
   */
  private handleActionMessage(ws: WebSocket, message: Message): void {
    const socketId = this.getSocketId(ws);
    const playerId = this.lobbyManager.getPlayerIdForSocket(ws);
    
    // TODO: Implement action handling (card drawing, shuffling, etc.)
    logger.info(`Action message received from player ${playerId} [Socket: ${socketId}]:`, message);
  }
}
