/**
 * Tabletop Simulator Websocket Server
 * Handles game state synchronization across multiple clients.
 */
import { WebSocketServer } from './src/core/websocketServer';

// Server configuration
const PORT = Bun.env.PORT ? parseInt(Bun.env.PORT) : 3000;

// Start the websocket server
const server = new WebSocketServer(PORT);

console.log(`Websocket server running on port ${PORT}`);
console.log(`Connect to ws://localhost:${PORT}`);
