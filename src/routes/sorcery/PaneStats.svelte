<script lang="ts">
	import { Button, Pane, Text, Folder, Stepper, IntervalSlider } from 'svelte-tweakpane-ui';
	import { gameActions } from '$lib/store/game/actions';
	import { gameStore } from '$lib/store/game/gameStore.svelte';

	type SorceryMetadataDTO = {
		life: number;
		air: number;
		earth: number;
		water: number;
		fire: number;
		manaTotal: number;
		manaAvailable: number;
		d6: number;
		d12: number;
	};

	const myPlayerId = gameActions.getMyId();
	const players = $derived($gameStore?.players ?? {});
	const playerIds = $derived(Object.keys(players ?? {}));
	$inspect('DEBUG players', players);

	function initStats() {
		if (typeof myPlayerId !== 'string') return console.error('No myPlayerId');
		const metadata: SorceryMetadataDTO = {
			life: 20,
			manaTotal: 0,
			manaAvailable: 0,
			air: 0,
			earth: 0,
			water: 0,
			fire: 0,
			d6: 0,
			d12: 0
		};
		gameStore.updateState({
			players: { [myPlayerId]: { metadata } }
		});
	}

	function rollDice() {
		const d6 = Math.floor(Math.random() * 6) + 1;
		const d12 = Math.floor(Math.random() * 12) + 1;
		return { d6, d12 };
	}
</script>

<Pane
	position="draggable"
	title="Game Stats"
	expanded={true}
	y={160}
	x={310}
	width={300}
	localStoreId="sorcery-deck"
>
	{#each playerIds as playerId}
		{@const metadata = $gameStore?.players?.[playerId]?.metadata as SorceryMetadataDTO}
		{@const manaTotal = metadata?.air + metadata?.earth + metadata?.water + metadata?.fire}
		<Folder title={playerId + `${myPlayerId === playerId ? ' (me)' : ''}`}>
			{#if playerId === myPlayerId && $gameStore?.players?.[playerId]?.metadata?.life === undefined}
				<Button title="init stats" on:click={initStats} />
			{:else}
				<Folder expanded={false} title="Dice">
					{#if playerId === myPlayerId}
						<Button
							title="Roll"
							on:click={() => {
								gameStore.updateState({ players: { [playerId]: { metadata: { ...rollDice() } } } });
								setTimeout(() => {
									gameStore.updateState({
										players: { [playerId]: { metadata: { d6: 0, d12: 0 } } }
									});
								}, 7000);
							}}
						/>
					{/if}
					<Text label="D6" value={$gameStore?.players?.[playerId]?.metadata?.d6 ?? 0} disabled />
					<Text label="D12" value={$gameStore?.players?.[playerId]?.metadata?.d12 ?? 0} disabled />
				</Folder>
			{/if}
			{#each ['life', 'air', 'earth', 'water', 'fire'] as key}
				<Stepper
					label={key.toUpperCase()}
					step={1}
					disabled={playerId !== myPlayerId}
					value={$gameStore?.players?.[playerId]?.metadata?.[key] ?? 0}
					on:change={(e) =>
						gameStore.updateState({
							players: { [playerId]: { metadata: { [key]: e.detail.value } } }
						})}
				/>
			{/each}
			<IntervalSlider
				label="Mana (used/total)"
				step={1}
				min={0}
				max={manaTotal}
				format={(v) => v.toFixed(0)}
				value={{
					min: ($gameStore?.players?.[playerId]?.metadata as SorceryMetadataDTO).manaAvailable ?? 0,
					max: manaTotal
				}}
				on:change={(e) => {
					const { min = 0 } = (e.detail.value as { min: number }) ?? {};
					gameStore.updateState({ players: { [playerId]: { metadata: { manaAvailable: min } } } });
				}}
			/>
		</Folder>
	{/each}
</Pane>
