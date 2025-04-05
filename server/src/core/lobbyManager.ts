/**
 * Lobby Manager
 * Handles creation and management of game lobbies
 */
import { type ServerWebSocket } from 'bun';
import { CardInDeck, Lobby, Message, UpdateMessage } from '../models/types';
import * as logger from '../utils/logger';
import { setValueAtPath } from '../utils/stateUtils';

// Define a type alias for ServerWebSocket with unknown data
type WebSocket = ServerWebSocket<unknown>;

export class LobbyManager {
	private lobbies = new Map<string, Lobby>();
	private clientToLobby = new Map<WebSocket, string>();
	private clientToPlayer = new Map<WebSocket, string>();
	// Track join timestamps to preserve order of attendees
	private playerJoinTimes = new Map<string, number>();

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

		let playerOrder: 0 | 1 | 2 | 3 = 0;

		// Record join timestamp if this is player's first connection
		if (!this.playerJoinTimes.has(playerId)) {
			this.playerJoinTimes.set(playerId, Date.now());
			logger.info(`First join timestamp recorded for player ${playerId}`);
		} else {
			logger.info(
				`Player ${playerId} reconnected (first joined at ${new Date(this.playerJoinTimes.get(playerId)!)})`
			);
		}

		logger.info(`Player ${playerId} added to lobby ${lobbyId}`);
		logger.debug(
			`Current lobby state: ${lobby.players.size} players, ${Object.keys(lobby.state.boardState).length} board objects`
		);

		// find order of player from players join times
		let players: { id: string; time: number }[] = [];
		// organize jointimes
		this.playerJoinTimes.forEach((joinTime, playerId) => {
			players.push({ id: playerId, time: joinTime });
		});
		// sort
		players
			.sort((a, b) => a.time - b.time)
			.map((player, index) => {
				if (player.id === playerId) {
					playerOrder = (index % 4) as 0 | 1 | 2 | 3; // Ensure type safety
				}
			});

		// TODO: replace this with real data
		// BUG: this is not saving it to actual state, it clears when refereshed and does not show for opponent
		const cards: CardInDeck[] = [
			{
				id: `card:${playerId}:bosk_troll`,
				faceImageUrl: 'https://card.cards.army/cards/bosk_troll.webp'
			}
		];

		// Initialize player state if needed
		if (!lobby.state.playerStates[playerId]) {
			logger.debug(`Creating initial state for player ${playerId}`);
			const initialPlayerState = {
				// Store in a temporary variable first
				metadata: {
					name: playerId,
					seat: playerOrder
				},
				decks: {
					[`deck:${playerId}`]: {
						id: `deck:${playerId}`,
						cards: cards,
						isFaceUp: false,
						position: [8.25, 0.4, 3 + playerOrder * 3] as [
							number,
							number,
							number
						], // Ensure tuple type
						rotation: [0, 0, 0] as [number, number, number] // Also ensure tuple type for rotation
					}
				},
				tray: {}
			};
			// Assign the initial state to the lobby state
			lobby.state.playerStates[playerId] = initialPlayerState;

			// Construct an update message for the new player state
			const playerStateUpdateMessage: UpdateMessage = {
				type: 'update',
				playerId: playerId, // Indicate server-initiated change
				timestamp: Date.now(),
				messageId: `server-init-${playerId}-${Date.now()}`, // Unique ID
				path: ['playerStates', playerId],
				value: initialPlayerState // Send the newly created state object
			};

			// Broadcast this specific update to other players in the lobby
			logger.info(
				`Broadcasting initial state for player ${playerId} to other lobby members.`
			);
			this.broadcastToLobby(lobbyId, playerStateUpdateMessage, client); // Exclude the new player
		} else {
			// If player state already exists (reconnect), ensure their seat is correctly set based on order
			// This might be redundant if seat is handled client-side based on orderedPlayerList, but good practice server-side.
			if (lobby.state.playerStates[playerId].metadata.seat !== playerOrder) {
				logger.debug(
					`Updating seat for reconnecting player ${playerId} to ${playerOrder}`
				);
				lobby.state.playerStates[playerId].metadata.seat = playerOrder;
				// Also broadcast this specific change if needed, similar to above
				const seatUpdateMessage: UpdateMessage = {
					type: 'update',
					playerId: 'server',
					timestamp: Date.now(),
					messageId: `server-seat-update-${playerId}-${Date.now()}`,
					path: ['playerStates', playerId, 'metadata', 'seat'],
					value: playerOrder
				};
				this.broadcastToLobby(lobbyId, seatUpdateMessage, client);
			}
		}

		// Send full state to the new player (ensures they have the LATEST state including any updates made just above)
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
			// Also clear the join times map for this lobby if needed, though it might be useful to keep if lobby re-forms?
			// For simplicity, let's clear entries related to players of this lobby
			lobby.players.forEach((pid) => this.playerJoinTimes.delete(pid));
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
			logger.warn(
				`Permission denied for player ${playerId} to update path: ${message.path.join('.')}`
			);
			return;
		}

		// Update timestamp
		message.timestamp = Date.now();

		// Log the update before applying it
		logger.debug(
			`Applying update to lobby ${lobbyId} from player ${playerId}:`,
			{
				path: message.path,
				messageId: message.messageId,
				value: message.value // Log the value being set for clarity
			}
		);

		// Apply update to state
		lobby.state = setValueAtPath(lobby.state, message.path, message.value);

		// Log after the update
		logger.debug(
			`Update applied, broadcasting to other clients in lobby ${lobbyId}`
		);

		// Broadcast update to all clients in lobby except sender
		this.broadcastToLobby(lobbyId, message, client);
	}

	/**
	 * Send full state to a client
	 */
	private sendFullState(client: WebSocket, lobby: Lobby): void {
		const playerId = this.clientToPlayer.get(client) || '';

		const message: Message = {
			type: 'sync',
			playerId: 'server',
			timestamp: Date.now(),
			payload: lobby.state // Send the current, possibly just-updated, state
		};

		logger.info(
			`Sending full state to player ${playerId} in lobby ${lobby.id}`
		);
		logger.logWebsocketMessage(
			'SENDING',
			message,
			playerId,
			this.getSocketId(client)
		); // Log sync messages too
		client.send(JSON.stringify(message));
	}

	/**
	 * Broadcast player list to all clients in a lobby
	 */
	private broadcastPlayerList(lobby: Lobby): void {
		// Get all players currently in the lobby set
		const currentPlayers = Array.from(lobby.players);

		// Create array of player data using current players and stored join times
		const playerData = currentPlayers
			.map((id) => ({
				id,
				joinTime: this.playerJoinTimes.get(id) || Date.now() // Use recorded time, fallback shouldn't usually happen here
			}))
			.filter((p) => this.playerJoinTimes.has(p.id)); // Ensure only players with recorded join times are included

		// Sort by join time (earliest first)
		playerData.sort((a, b) => a.joinTime - b.joinTime);

		// Get just the sorted IDs
		const orderedPlayerIds = playerData.map((p) => p.id);

		const message: Message = {
			type: 'playerList',
			playerId: 'server',
			timestamp: Date.now(),
			payload: {
				playerIds: currentPlayers, // Current players (unsorted, legacy)
				orderedPlayers: playerData // New structure with sorted {id, joinTime}
			}
		};

		logger.info(
			`Broadcasting player list update in lobby ${lobby.id}: ${lobby.players.size} players`
		);
		logger.debug('Player order by join time:', orderedPlayerIds.join(', '));
		this.broadcast(lobby, message); // Use the general broadcast method
	}

	/**
	 * Broadcast a message to all clients in a lobby, excluding the sender
	 */
	private broadcastToLobby(
		lobbyId: string,
		message: Message,
		excludeWs?: WebSocket
	): void {
		const lobby = this.lobbies.get(lobbyId);
		if (!lobby) return;

		const messageStr = JSON.stringify(message);

		// Track excluded socket ID for logging
		const excludeSocketId = excludeWs ? this.getSocketId(excludeWs) : 'none';
		const excludePlayerId = excludeWs
			? this.clientToPlayer.get(excludeWs)
			: 'none';

		// Count of successful sends
		let sendCount = 0;

		// Broadcast to all sockets currently mapped to this lobby except the sender
		for (const client of this.clientToLobby.keys()) {
			// Double check the client is still mapped to THIS lobby
			if (client !== excludeWs && this.clientToLobby.get(client) === lobbyId) {
				const receiverPlayerId = this.clientToPlayer.get(client) || 'unknown';
				const receiverSocketId = this.getSocketId(client);
				try {
					// Log the message being sent
					logger.logWebsocketMessage(
						'SENDING',
						message,
						receiverPlayerId,
						receiverSocketId
					);
					// Send the message
					client.send(messageStr);
					sendCount++;
				} catch (error) {
					logger.error(
						`Error sending message to player ${receiverPlayerId}:`,
						error
					);
					// Socket is probably dead, schedule removal
					// Avoid modifying collections while iterating; consider marking for removal
					// For now, just log and continue, rely on close handler for cleanup
					// this.removePlayerFromLobby(client); // <-- Potentially unsafe during iteration
				}
			}
		}

		logger.debug(
			`Broadcast message type '${message.type}' to ${sendCount} players in lobby ${lobbyId} (excluding player ${excludePlayerId} / socket ${excludeSocketId})`
		);
	}

	/**
	 * Broadcast a message to all clients mapped to a specific lobby
	 */
	private broadcast(lobby: Lobby, message: Message): void {
		// Use broadcastToLobby without excluding anyone
		this.broadcastToLobby(lobby.id, message, undefined);
	}

	/**
	 * Get a unique identifier for a socket
	 */
	private getSocketId(ws: WebSocket): string {
		// Bun's ws object might have a built-in ID or remoteAddress, let's use remoteAddress for now
		try {
			return ws.remoteAddress;
		} catch {
			// Fallback if remoteAddress isn't available or fails
			const playerId = this.clientToPlayer.get(ws);
			if (playerId) {
				return `socket-player-${playerId.substring(0, 6)}`;
			}
			return 'unknown-socket-' + Math.random().toString(36).substring(2, 8);
		}
	}

	/**
	 * Basic permission check for updates
	 */
	private hasUpdatePermission(playerId: string, path: string[]): boolean {
		// Allow server-initiated updates
		if (playerId === 'server') {
			return true;
		}

		// Only allow players to update their own player state sub-paths or general board state
		if (path[0] === 'playerStates') {
			return path[1] === playerId;
		} else if (path[0] === 'boardState') {
			// Allow players to modify the general board state
			// More granular checks could be added here later if needed
			return true;
		}

		// Deny other top-level path updates by default
		return false;
	}
}
