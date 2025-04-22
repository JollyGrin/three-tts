<script lang="ts">
	import {
		Button,
		Pane,
		Text,
		Folder,
		Element,
		TabGroup,
		TabPage,
		Point
	} from 'svelte-tweakpane-ui';
	import { gameActions } from '$lib/store/game/actions';
	import { convertDeckToGameDTO } from './api-sorcery-decks';
	import { DEG2RAD } from 'three/src/math/MathUtils.js';
	import { gameStore } from '$lib/store/game/gameStore.svelte';

	const playerId = gameActions.getMyId();
	const myDecks = $derived(
		Object.keys($gameStore?.decks ?? {}).filter((key) => key.split(':').includes(playerId ?? ''))
	);
	$inspect({ myDecks });

	async function fetchDeck() {
		const response = await fetch(
			'https://corsproxy.innkeeper1.workers.dev/?url=https://curiosa.io/api/decks/clso3lngx007lhb600v843gd7'
		);
		const data = await response.json();
		console.log('res deck:', response, data);

		const convertedDeck = convertDeckToGameDTO(data);
		console.log('convertedDeck', convertedDeck);

		gameActions.addDeck({
			...convertedDeck.spellbook,
			deckId: `deck:${playerId}:spellbook`,
			id: `deck:${playerId}:spellbook`,
			position: [8.5, 0.4, 4.5],
			deckBackImageUrl: '/s-back.jpg'
		});

		gameActions.addDeck({
			...convertedDeck.atlas,
			deckId: `deck:${playerId}:atlas`,
			id: `deck:${playerId}:atlas`,
			position: [10.5, 0.4, 4.5],
			rotation: [0, DEG2RAD * 90, 0],
			deckBackImageUrl: '/a-back.png'
		});

		gameActions.addDeck({
			...convertedDeck.cemetary,
			isFaceUp: true,
			deckId: `deck:${playerId}:cemetary`,
			id: `deck:${playerId}:cemetary`,
			position: [12.5, 0.4, 4.5]
		});
	}
</script>

<Pane
	position="draggable"
	title="Load Deck"
	expanded={true}
	y={0}
	x={350}
	localStoreId="sorcery-deck"
>
	<Element>
		<div class="flex w-full justify-center font-sans text-xs text-white uppercase opacity-30">
			<span class="animate-pulse"> Load a url from Curiosa </span>
		</div>
	</Element>
	<Text label="Deck URL" value="" />
	<Button
		title="Load Deck"
		on:click={() => {
			fetchDeck();
		}}
	/>
	<TabGroup>
		{#each myDecks as deckId}
			{@const position = $gameStore?.decks?.[deckId]?.position ?? [0, 0, 0]}
			<TabPage title={deckId?.split(':')?.[2] ?? 'Deck'}>
				<Point
					label="position"
					value={[position[0], position[2]]}
					on:change={(e) => {
						console.log('DEBUG POS', e);
						//@ts-expect-error: does exist
						const x = e.detail.value?.x ?? position[0];
						//@ts-expect-error: does exist
						const y = e.detail.value?.y ?? position[2];
						gameStore.updateState({
							decks: { [deckId]: { position: [x, position[1], y] } }
						});
					}}
				/>
				<Button title="title" label="label" />
			</TabPage>
		{/each}
	</TabGroup>
</Pane>
