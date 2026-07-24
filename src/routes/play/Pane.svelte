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
	import { List } from 'svelte-tweakpane-ui';
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

	// invite link that auto-claims the opposing (first open, non-mine) seat on join
	function copyOpponentInvite() {
		const mySeat = gameActions.getMySeat();
		const inviteSeat = openSeats.find((s) => s !== mySeat) ?? openSeats[0];
		if (inviteSeat === undefined)
			return toast.error('No open seats — seed a scenario and claim yours first');
		const params = new URLSearchParams({
			server: $connectionStore.serverUrl,
			lobby: lobbyId,
			seat: String(inviteSeat)
		});
		const url = `${page.url.host}/play?${params.toString()}`;
		navigator.clipboard.writeText(url);
		toast(`Copied invite — joiner auto-claims seat ${inviteSeat}`);
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
				goto(`/play?${lobbyUrl}`, { invalidateAll: true });
				const hostUrl = page.url.host ?? '';
				const url = `${hostUrl}/play?${lobbyUrl}`;
				navigator.clipboard.writeText(url);
				toast(`Copied to clipboard: ` + url);
			}}
		/>
		<Textarea
			disabled
			value={`Enter the server and lobby names. Then click share to copy to clipboard. Then refresh page to join.`}
		/>
	</Folder>
	<Folder title="Scenarios" expanded={false}>
		<List label="Preset" bind:value={selectedScenario} options={scenarioOptions} />
		<Button title="Seed lobby with preset" on:click={seedLobby} />
		<Button title="Refresh preset list" on:click={() => (scenarioNames = listScenarios().map((s) => s.name))} />
		{#each openSeats as seat (seat)}
			<Button title="Claim seat {seat}" on:click={() => handleClaimSeat(seat)} />
		{/each}
		<Button title="Copy opponent invite" on:click={copyOpponentInvite} />
		<Textarea
			disabled
			rows={3}
			value={`Build presets at /setup. Seeding replaces the table for the whole lobby; each player then claims a seat to take over its decks.`}
		/>
	</Folder>
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
		<Text label="Nudge card higher" value="Arrow Up" disabled />
		<Text label="Nudge card lower" value="Arrow Up" disabled />
	</Folder>
</Pane>
