<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		playerList,
		orderedPlayerList,
		lobbyId,
		connectionStatus,
		ConnectionState,
		playerId,
		type OrderedPlayer
	} from './websocket/websocketService';

	// State to track
	let players: string[] = [];
	let orderedPlayers: OrderedPlayer[] = [];
	let currentLobbyId: string;
	let currentPlayerId: string;
	let connected = false;

	// Prevent excessive logging
	let lastLogTime = 0;
	let pendingLogTimeout: number | null = null;

	// Subscribe to stores for real-time updates without triggering immediate logs
	const unsubPlayerList = playerList.subscribe((value) => {
		players = value;
		scheduleLogGameState();
	});
	
	// Subscribe to ordered players list (sorted by join time)
	const unsubOrderedPlayerList = orderedPlayerList.subscribe((value) => {
		orderedPlayers = value;
		scheduleLogGameState();
	});

	const unsubLobbyId = lobbyId.subscribe((value) => {
		currentLobbyId = value;
		scheduleLogGameState();
	});

	const unsubPlayerId = playerId.subscribe((value) => {
		currentPlayerId = value;
		scheduleLogGameState();
	});

	const unsubConnection = connectionStatus.subscribe((value) => {
		connected = value === ConnectionState.CONNECTED;
		scheduleLogGameState();
	});

	// Schedule log update with debouncing to prevent rapid successive logs
	function scheduleLogGameState() {
		// Clear any pending timeout
		if (pendingLogTimeout !== null) {
			clearTimeout(pendingLogTimeout);
			pendingLogTimeout = null;
		}

		// Don't log more often than once per second
		const now = Date.now();
		if (now - lastLogTime > 1000) {
			lastLogTime = now;
			logGameState();
		} else {
			// Schedule a log for later
			pendingLogTimeout = setTimeout(() => {
				lastLogTime = Date.now();
				logGameState();
				pendingLogTimeout = null;
			}, 1000) as unknown as number;
		}
	}

	// Log game state when it changes
	function logGameState() {
		if (connected) {
			console.log('[Game State]', {
				lobby: currentLobbyId,
				totalPlayers: players.length,
				players,
				orderedPlayers: orderedPlayers.map(p => ({ id: p.id, joinedAt: new Date(p.joinTime).toLocaleTimeString() })),
				currentPlayer: currentPlayerId
			});
		}
	}

	onDestroy(() => {
		// Clean up subscriptions
		unsubPlayerList();
		unsubOrderedPlayerList();
		unsubLobbyId();
		unsubPlayerId();
		unsubConnection();
	});
</script>

<div class="game-state-logger">
	<div class="logger-container">
		<h3>Game State</h3>

		<div class="status">
			<div class="status-item">
				<span class="label">Connection:</span>
				<span class="value {connected ? 'connected' : 'disconnected'}">
					{connected ? 'Connected' : 'Disconnected'}
				</span>
			</div>

			<div class="status-item">
				<span class="label">Lobby:</span>
				<span class="value">{currentLobbyId || 'None'}</span>
			</div>

			<div class="status-item">
				<span class="label">Player ID:</span>
				<span class="value">{currentPlayerId || 'Unknown'}</span>
			</div>

			<div class="status-item">
				<span class="label">Players in Lobby:</span>
				<span class="value">{players.length}</span>
			</div>
		</div>

		<div class="players-list">
			<h4>Players (by join order):</h4>
			{#if orderedPlayers.length === 0}
				<p>No players connected</p>
			{:else}
				<ul>
					{#each orderedPlayers as player, index}
						<li class={player.id === currentPlayerId ? 'current-player' : ''}>
							<span class="position">{index + 1}.</span>
							<span class="player-id">{player.id}</span>
							{player.id === currentPlayerId ? '<You>' : ''}
							<span class="join-time">Joined: {new Date(player.joinTime).toLocaleTimeString()}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
</div>

<style>
	.game-state-logger {
		position: fixed;
		bottom: 20px;
		right: 20px;
		z-index: 1000;
		background: rgba(0, 0, 0, 0.7);
		color: white;
		border-radius: 8px;
		padding: 12px;
		font-family: monospace;
		max-width: 300px;
		max-height: 400px;
		overflow-y: auto;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
	}

	h3 {
		margin: 0 0 10px 0;
		font-size: 16px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.3);
		padding-bottom: 5px;
	}

	h4 {
		margin: 10px 0 5px 0;
		font-size: 14px;
	}

	.status {
		font-size: 12px;
	}

	.status-item {
		margin-bottom: 4px;
		display: flex;
		justify-content: space-between;
	}

	.label {
		font-weight: bold;
		margin-right: 8px;
	}

	.connected {
		color: #4caf50;
	}

	.disconnected {
		color: #f44336;
	}

	.players-list {
		margin-top: 10px;
		font-size: 12px;
	}

	.players-list ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.players-list li {
		padding: 4px 0;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 6px;
	}

	.position {
		min-width: 15px;
		font-weight: bold;
	}
	
	.player-id {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	
	.join-time {
		font-size: 0.8em;
		color: rgba(255, 255, 255, 0.7);
		margin-left: auto;
	}

	.current-player {
		color: #2196f3;
		font-weight: bold;
	}
</style>
