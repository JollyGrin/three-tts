<script lang="ts">
	import { Toaster } from 'svelte-french-toast';
	import '../app.css';
	let { children } = $props();
</script>

<Toaster />
{@render children()}
