<script lang="ts">
	import { Button, Pane, Text, Folder, Element } from 'svelte-tweakpane-ui';
	import { gameActions } from '$lib/store/game/actions';
	import toast from 'svelte-french-toast';

	async function fetchDeck() {
		const response = await fetch(
			'https://corsproxy.innkeeper1.workers.dev/?url=https://curiosa.io/api/decks/clso3lngx007lhb600v843gd7'
		);
		const data = await response.json();
		console.log('res deck:', response, data);
	}
</script>

<Pane position="draggable" title="Load Deck" expanded={true} y={0} x={350}>
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
			gameActions.initDeck({
				isFaceUp: false
			});

			gameActions.initDeck({
				isFaceUp: true
			});
		}}
	/>
</Pane>
