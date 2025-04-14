<script lang="ts">
	import { onMount } from 'svelte';

	let { onClose }: { onClose(): void } = $props();

	// Event handlers
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		}
	}

	function handleOverlayClick() {
		onClose();
	}

	let serverUrl = $state('localhost:8080');

	onMount(() => {
		const cache = localStorage.getItem('serverurl');
		if (!cache) localStorage.setItem('serverurl', serverUrl);
		if (cache) serverUrl = cache;
	});
</script>

<svelte:window on:keydown={handleKeydown} />

{#snippet modalBody()}
	<p class="mb-4 text-xl">Connection Settings</p>
	<div class="flex flex-col gap-2">
		<span> Server URL: </span>
		<input
			placeholder="Server URL"
			class="rounded border-1 border-gray-200 p-1"
			bind:value={serverUrl}
		/>
		<button
			class="rounded bg-gray-300 p-2"
			onclick={() => {
				localStorage.setItem('serverurl', serverUrl);
			}}
		>
			Update LocalStorage
		</button>
		<button
			class="rounded bg-gray-300 p-2"
			onclick={() => {
				localStorage.setItem('serverurl', 'localhost:8080');
				serverUrl = 'localhost:8080';
			}}
		>
			Reset LocalStorage
		</button>
	</div>
{/snippet}

<!-- Modal Overlay with Backdrop -->
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
	<!-- Modal Dialog -->
	<dialog
		class="bg-brand-dark text-brand-fore mx-4 w-full max-w-md rounded-lg p-0 shadow-lg open:block"
		open
		aria-labelledby="modal-title"
	>
		<!-- Modal Header with Close Button -->
		<div class="flex justify-end p-2">
			<button
				class="rounded-full p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
				onclick={onClose}
				aria-label="Close"
			>
				X
			</button>
		</div>

		<!-- Modal Body -->
		<div class="px-6 pb-6">
			{@render modalBody()}
		</div>
	</dialog>

	<!-- Invisible overlay to close modal when clicking outside -->
	<button
		class="fixed inset-0 h-full w-full cursor-default bg-transparent"
		onclick={handleOverlayClick}
		aria-label="Close modal"
		tabindex="-1"
	></button>
</div>

<style>
	/* Dialog styling */
	dialog {
		margin: auto;
		/* background: transparent; */
		/* color: white; */
		/* border: none; */
		z-index: 51;
	}
	dialog::backdrop {
		display: none;
	}
</style>
