<script lang="ts">
	import { gameStore } from '$lib/store/game/gameStore.svelte';
	import {
		Button,
		Pane,
		Point,
		Wheel,
		Text,
		AutoValue,
		Folder,
		Element,
		FpsGraph,
		Textarea
	} from 'svelte-tweakpane-ui';
	import { DEG2RAD } from 'three/src/math/MathUtils.js';
	import { purgeUndefinedValues } from '$lib/utils/transforms/data';
	import type { GameDTO } from '$lib/store/game/types';
	import { gameActions } from '$lib/store/game/actions';
	import { connectionStore } from '$lib/store/connectionStore.svelte';
	import {
		listScenarios,
		getScenario,
		applyScenario,
		claimSeat,
		isSeatPlaceholder,
		type SeatIndex
	} from '$lib/scenario/scenario';
	import { buildInviteUrl, pickInviteSeat } from '$lib/scenario/invite';
	import { List } from 'svelte-tweakpane-ui';
	import HUDPieces from '$lib/HUDPieces.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import toast from 'svelte-french-toast';

	function clearOverlay() {
		gameStore.updateState({ overlays: { table: null } });
		imageUrl = '';
	}

	let rot = $state(0);
	// world height of the overlay in table units (plane is aspect-normalized)
	let scale = $state($gameStore?.overlays?.table?.scale ?? 12);
	let point3d = $state({ x: 0, y: 0 });
	let imageUrl = $state($gameStore?.overlays?.table?.imageUrl ?? '');

	$effect(() => {
		const _imageUrl = imageUrl === '' ? undefined : imageUrl;
		gameStore.updateState({
			overlays: {
				table: purgeUndefinedValues({
					imageUrl: _imageUrl,
					rotation: [0, rot * DEG2RAD, 0],
					position: [point3d.x, 0.255, point3d.y],
					scale
				}) as NonNullable<GameDTO['overlays']>[string]
			}
		});
	});

	let lobbyId = $state(page.url.searchParams.get('lobby') ?? '');
	// /play with no ?lobby rolls a name and replaceState()s it in after this pane
	// has already mounted — adopt it so the share link isn't empty
	$effect(() => {
		const fromUrl = page.url.searchParams.get('lobby');
		if (fromUrl && !lobbyId) lobbyId = fromUrl;
	});
	const lobbyUrl = $derived(
		new URLSearchParams({ server: $connectionStore.serverUrl, lobby: lobbyId }).toString()
	);

	// scenario presets (built at /setup, stored in localStorage)
	let selectedScenario = $state(listScenarios()[0]?.name ?? '');
	let scenarioNames = $state(listScenarios().map((s) => s.name));
	const scenarioOptions = $derived(
		scenarioNames.length
			? Object.fromEntries(scenarioNames.map((n) => [n, n]))
			: { '(none — build one at /setup)': '' }
	);
	// unclaimed placeholder seats present in the synced state
	const openSeats = $derived(
		Object.keys($gameStore?.players ?? {})
			.filter(isSeatPlaceholder)
			.map((id) => Number(id.slice(4)) as SeatIndex)
			.sort()
	);

	function seedLobby() {
		const scenario = getScenario(selectedScenario);
		if (!scenario) return toast.error('No preset selected — build one at /setup');
		applyScenario(scenario);
		toast('Lobby seeded — everyone claim a seat to take its decks');
	}

	function handleClaimSeat(seat: SeatIndex) {
		if (claimSeat(seat)) toast(`You claimed seat ${seat}`);
		else toast.error(`Seat ${seat} is no longer open`);
	}

	// invite link that auto-claims the opposing (first open, non-mine) seat on
	// join; without open seats it degrades to a plain lobby link
	function copyInvite() {
		const inviteSeat = pickInviteSeat(openSeats, gameActions.getMySeat());
		const url = buildInviteUrl({
			origin: page.url.origin,
			server: $connectionStore.serverUrl,
			lobby: lobbyId,
			seat: inviteSeat
		});
		navigator.clipboard.writeText(url);
		toast(
			inviteSeat === undefined
				? `Copied lobby link (no open seats): ${url}`
				: `Copied invite — joiner auto-claims seat ${inviteSeat}`
		);
	}
</script>

<Pane
	position="draggable"
	title="Settings"
	expanded={true}
	width={300}
	y={0}
	x={0}
	localStoreId="table-settings"
>
	<FpsGraph />
	<Folder title="Connection" expanded={false}>
		<Text label="My ID" value={localStorage.getItem('myPlayerId') ?? ''} disabled />
		<Text label="Server:" bind:value={$connectionStore.serverUrl} />
		<Text label="Lobby:" bind:value={lobbyId} />
		<Button
			title="Share lobby: {lobbyId}"
			on:click={() => {
				// copy an invite that seats the joiner; my own navigation must NOT
				// carry ?seat= or I'd claim the seat meant for the opponent
				copyInvite();
				goto(`/play?${lobbyUrl}`, { invalidateAll: true });
			}}
		/>
		<Textarea
			disabled
			value={`Share copies an invite link — whoever opens it is seated at the first open seat and gets its decks.`}
		/>
	</Folder>
	<Folder title="Scenarios" expanded={false}>
		<List label="Preset" bind:value={selectedScenario} options={scenarioOptions} />
		<Button title="Seed lobby with preset" on:click={seedLobby} />
		<Button
			title="Refresh preset list"
			on:click={() => (scenarioNames = listScenarios().map((s) => s.name))}
		/>
		{#each openSeats as seat (seat)}
			<Button title="Claim seat {seat}" on:click={() => handleClaimSeat(seat)} />
		{/each}
		<Button title="Copy opponent invite" on:click={copyInvite} />
		<Textarea
			disabled
			rows={3}
			value={`Build presets at /setup. Seeding replaces the table for the whole lobby; each player then claims a seat to take over its decks.`}
		/>
	</Folder>
	<HUDPieces ownerId={gameActions.getMyId() ?? undefined} />
	<Folder title="Overlays" expanded={false}>
		<Button title="Clear overlay" on:click={clearOverlay} />
		<Text label="Image URL" bind:value={imageUrl}></Text>
		<Point bind:value={point3d} label="Position" />
		<AutoValue label="Scale" bind:value={scale} />
		<Wheel label="Rotation" bind:value={rot} format={(v) => `${(Math.abs(v) % 360).toFixed(0)}°`} />
	</Folder>
	<Folder title="Keybinds">
		<Button
			on:click={() => gameActions?.setSeat()}
			label="Seat: {$gameStore?.players?.[gameActions?.getMe()?.id ?? 0]?.seat}"
			title="Next Seat"
		/>
		<Text label="Reset camera" value="C" disabled />
		<Text label="Preview hovered" value="spacebar" disabled />
		<Text label="Tap card" value="T" disabled />
		<Text label="Reverse Tap card" value="R" disabled />
		<Text label="Flip card" value="F" disabled />
		<Text label="Group stack into deck" value="G" disabled />
		<Text label="Cancel drag" value="Esc" disabled />
		<Text label="Nudge card higher" value="Arrow Up" disabled />
		<Text label="Nudge card lower" value="Arrow Up" disabled />
	</Folder>
</Pane>
