/**
 * Websocket Server
 * Handles websocket connections and message routing
 */
import { Server, WebSocket } from "bun";
import { LobbyManager } from "./lobbyManager";
import { Message, ConnectPayload, UpdateMessage } from "../models/types";

export class WebSocketServer {
  private server: Server;
  private lobbyManager: LobbyManager;

  constructor(port: number) {
    this.lobbyManager = new LobbyManager();
    
    this.server = Bun.serve({
      port,
      fetch: (req, server) => {
        // Upgrade the request to a WebSocket connection if it's a WebSocket request
        const url = new URL(req.url);
        
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
    
    console.log(`WebSocket server started on port ${port}`);
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket): void {
    console.log("New client connected");
    // Actual connection handling is done when connect message is received
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(ws: WebSocket, message: string): void {
    try {
      const data = JSON.parse(message) as Message;
      
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
          console.warn(`Unknown message type: ${data.type}`);
      }
    } catch (error) {
      console.error("Error processing message:", error);
      
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
    console.log("Client disconnected");
    this.lobbyManager.removePlayerFromLobby(ws);
  }

  /**
   * Handle connect message
   */
  private handleConnectMessage(ws: WebSocket, message: Message): void {
    const payload = message.payload as ConnectPayload;
    
    if (!payload || !payload.lobbyId || !payload.playerId) {
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
    
    console.log(`Player ${payload.playerId} joined lobby ${payload.lobbyId}`);
  }

  /**
   * Handle update message
   */
  private handleUpdateMessage(ws: WebSocket, message: UpdateMessage): void {
    if (!message.path || message.value === undefined) {
      const errorMessage: Message = {
        type: "error",
        playerId: "server",
        timestamp: Date.now(),
        payload: { message: "Invalid update message" }
      };
      
      ws.send(JSON.stringify(errorMessage));
      return;
    }
    
    this.lobbyManager.processUpdate(ws, message);
  }

  /**
   * Handle action message
   */
  private handleActionMessage(ws: WebSocket, message: Message): void {
    // TODO: Implement action handling (card drawing, shuffling, etc.)
    console.log("Action message received:", message);
  }
}
