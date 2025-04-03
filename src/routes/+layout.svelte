<script lang="ts">
	import '../app.css';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { initializeWebsocket } from '$lib/websocket';

	let { children } = $props();
	
	// Initialize websocket connection on mount (client-side only)
	onMount(() => {
		if (browser) {
			// Connect to the default lobby
			initializeWebsocket('default');
			console.log('Websocket connection initialized');
		}
	});
</script>

{@render children()}
