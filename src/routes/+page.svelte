<script lang="ts">
</script>

<svelte:head>
	<title>table place</title>
	<meta name="description" content="A tabletop simulator in the browser" />
</svelte:head>

<div class="grid h-screen w-screen place-items-center bg-emerald-50">
	<div class="max-w-lg rounded bg-white p-6 shadow">
		<h1 class="mb-4 text-3xl font-bold">Welcome to table.place</h1>
		<p class="mb-2">A browser-based tabletop simulator</p>
		<a href="https://github.com/JollyGrin/three-tts" class="underline"> github </a>
		<h2 class="mt-4 mb-2 text-xl font-semibold">Getting Started</h2>
		<ol class="mb-4 list-inside list-decimal">
			<li>Run the backend: <code>cd server && ./run.sh</code></li>
			<li>(Optional) Expose with ngrok: <code>ngrok http 8080</code></li>
			<li>Click <strong>Open Table</strong> and spawn a deck of cards</li>
		</ol>
		<p class="mb-4">
			In the Settings pane (⚙️), set the Server to <code>localhost:8080</code> or your ngrok URL, and
			enter a Lobby ID.
		</p>
		<a href="/play" class="block rounded bg-emerald-400 py-2 text-center font-medium text-white"
			>Open Table</a
		>
		<a
			href="/setup"
			class="mt-2 block rounded border border-emerald-400 py-2 text-center font-medium text-emerald-600"
			>Scenario Setup</a
		>
		<p class="mt-2 text-sm text-gray-500">
			Build a reusable game setup locally — import decks for both seats, place the map, then seed a
			lobby with it from the table's Settings → Scenarios.
		</p>
	</div>
</div>
