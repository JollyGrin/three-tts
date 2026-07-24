<!--
	Spawn/remove table pieces. Shared by the /play settings pane and the
	/setup scenario editor so the two surfaces can't drift — each route only
	supplies the owner id (my player id vs. the edited seat's placeholder).
-->
<script lang="ts">
	import {
		AutoValue,
		Button,
		Color,
		Folder,
		List,
		Text,
		TabGroup,
		TabPage
	} from 'svelte-tweakpane-ui';
	import { gameStore } from '$lib/store/game/gameStore.svelte';
	import { gameActions } from '$lib/store/game/actions';
	import { COUNTER_MAX_DEFAULT } from '$lib/utils/constants-pieces';
	import type { PieceKind } from '$lib/store/game/types';
	import toast from 'svelte-french-toast';

	let {
		ownerId,
		expanded = false,
		beforeSpawn
	}: {
		/** owner segment of the new piece id — `getMyId()` on /play, `seatPlaceholderId()` on /setup */
		ownerId?: string;
		expanded?: boolean;
		/** run before spawning (the scenario editor ensures its seat placeholder exists) */
		beforeSpawn?: () => void;
	} = $props();

	const kindOptions: Record<string, PieceKind> = {
		Token: 'token',
		Pawn: 'pawn',
		Counter: 'counter'
	};

	let kind: PieceKind = $state('token');
	let name = $state('');
	let color = $state('#c8c4b8');
	let imageUrl = $state('');
	let maxValue = $state(COUNTER_MAX_DEFAULT);

	// every piece on the table, any owner — TTS imports included
	const pieceIds = $derived(
		Object.keys($gameStore?.pieces ?? {}).filter((key) => $gameStore?.pieces?.[key])
	);

	function spawn() {
		beforeSpawn?.();
		const id = gameActions.addPiece(kind, {
			ownerId,
			name: name.trim() || undefined,
			color,
			imageUrl: kind === 'token' ? imageUrl.trim() || undefined : undefined,
			maxValue: kind === 'counter' ? maxValue : undefined
		});
		if (!id) return toast.error('Could not spawn — no player id yet');
		toast(`Spawned ${id.split(':').slice(2).join(':')}`);
	}
</script>

<Folder title="Pieces" {expanded}>
	<List label="Kind" bind:value={kind} options={kindOptions} />
	<Text label="Name" bind:value={name} />
	<Color label="Color" bind:value={color} />
	{#if kind === 'token'}
		<Text label="Image URL" bind:value={imageUrl} />
	{/if}
	{#if kind === 'counter'}
		<AutoValue label="Max value" bind:value={maxValue} />
	{/if}
	<Button title="Spawn {kind}" on:click={spawn} />
	{#if pieceIds.length > 0}
		<TabGroup>
			{#each pieceIds as pieceId (pieceId)}
				{@const piece = $gameStore?.pieces?.[pieceId]}
				<TabPage title={pieceId.split(':').slice(2).join(':')}>
					<Text label="kind" value={piece?.kind ?? ''} disabled />
					<Text label="owner" value={pieceId.split(':')[1] ?? ''} disabled />
					<Button title="Remove" on:click={() => gameActions.removePiece(pieceId)} />
				</TabPage>
			{/each}
		</TabGroup>
	{/if}
</Folder>
