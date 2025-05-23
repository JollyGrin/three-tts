<script lang="ts">
	import {
		Button,
		Pane,
		Text,
		Element,
		TabGroup,
		TabPage,
		Point,
		List,
		Separator
	} from 'svelte-tweakpane-ui';
	import { gameActions } from '$lib/store/game/actions';
	import { convertDeckToGameDTO } from './api-sorcery-decks';
	import { DEG2RAD } from 'three/src/math/MathUtils.js';
	import { gameStore } from '$lib/store/game/gameStore.svelte';
	import { TOKEN_IDS } from './constants';
	import { getSorceryCardImage } from '$lib/utils/mock/cards';

	export const tokens: Record<string, string> = Object.fromEntries(
		TOKEN_IDS.map((id) => [id, id])
	) as Record<string, string>;
	let selectedToken: string = $state(tokens[TOKEN_IDS[0]]);
	$inspect('dddd', tokens);

	const playerId = gameActions.getMyId();
	const myDecks = $derived(
		Object.keys($gameStore?.decks ?? {}).filter((key) => key.split(':').includes(playerId ?? ''))
	);

	const PRECON_AIR_ALPHA = 'clqfhk28d0028ip242l6tp11m';
	async function fetchDeck(_curiosaId: string = PRECON_AIR_ALPHA) {
		let curiosaId = _curiosaId;
		if (_curiosaId.includes('/')) curiosaId = _curiosaId.split('/').pop() ?? PRECON_AIR_ALPHA;

		const { seat = 0 } = gameActions.getMe() ?? {};
		const response = await fetch(
			'https://corsproxy.innkeeper1.workers.dev/?url=https://curiosa.io/api/decks/' + curiosaId
		);
		const data = await response.json();
		console.log('res deck:', response, data);

		const convertedDeck = convertDeckToGameDTO(data);
		console.log('convertedDeck', convertedDeck);
		const isFirst = seat === 0;
		const negativeMod = isFirst ? 1 : -1;

		gameActions.addDeck({
			...convertedDeck.spellbook,
			cards: gameActions.shuffleCards(convertedDeck.spellbook.cards ?? []) ?? [],
			deckId: `deck:${playerId}:spellbook`,
			id: `deck:${playerId}:spellbook`,
			position: [8.5 * negativeMod, 0.4, 4.5 * negativeMod],
			rotation: [0, DEG2RAD * (isFirst ? 0 : 180), 0],
			deckBackImageUrl: '/s-back.jpg'
		});

		gameActions.addDeck({
			...convertedDeck.atlas,
			cards: gameActions.shuffleCards(convertedDeck.atlas.cards ?? []) ?? [],
			deckId: `deck:${playerId}:atlas`,
			id: `deck:${playerId}:atlas`,
			position: [10.5 * negativeMod, 0.4, 4.5 * negativeMod],
			rotation: [0, DEG2RAD * 90 * negativeMod, 0],
			deckBackImageUrl: '/a-back.png'
		});

		gameActions.addDeck({
			...convertedDeck.cemetary,
			isFaceUp: true,
			deckId: `deck:${playerId}:cemetary`,
			id: `deck:${playerId}:cemetary`,
			position: [12.5 * negativeMod, 0.4, 4.5 * negativeMod],
			rotation: [0, DEG2RAD * (isFirst ? 0 : 180), 0]
		});
	}

	let curiosaDeckIdInput = $state(PRECON_AIR_ALPHA);
</script>

<Pane
	position="draggable"
	title="Decks"
	expanded={true}
	y={0}
	x={310}
	width={300}
	localStoreId="sorcery-deck"
>
	{#if myDecks.length === 0}
		<Element>
			<div class="flex w-full justify-center font-sans text-xs text-white uppercase opacity-30">
				<span class="animate-pulse"> Load a url from Curiosa </span>
			</div>
		</Element>
		<Text label="Deck URL" bind:value={curiosaDeckIdInput} />
		<Button
			title="Load Deck"
			on:click={() => {
				fetchDeck(curiosaDeckIdInput);
			}}
		/>
	{/if}
	<TabGroup>
		{#each myDecks as deckId}
			{@const position = $gameStore?.decks?.[deckId]?.position ?? [0, 0, 0]}
			<TabPage title={deckId?.split(':')?.[2] ?? 'Deck'}>
				<Button title="Shuffle {deckId}" on:click={() => gameActions.shuffleDeck(deckId)} />
				<Point
					label="position"
					value={[position[0], position[2]]}
					on:change={(e) => {
						//@ts-expect-error: does exist
						const x = e.detail.value?.x ?? position[0];
						//@ts-expect-error: does exist
						const y = e.detail.value?.y ?? position[2];
						gameStore.updateState({
							decks: { [deckId]: { position: [x, position[1], y] } }
						});
					}}
				/>
			</TabPage>
		{/each}
	</TabGroup>
	<Separator />
	<List label="Select token" bind:value={selectedToken} options={tokens} />
	<Button
		label="Spawn token"
		title="Spawn {selectedToken}"
		on:click={() => {
			gameStore.updateState({
				cards: {
					[`card:${selectedToken}:${(Math.random() * 1000000).toFixed(0)}`]: {
						position: [0, 0.5, 0],
						faceImageUrl: getSorceryCardImage(selectedToken),
						backImageUrl: '/s-back.jpg'
					}
				}
			});
		}}
	/>
</Pane>
