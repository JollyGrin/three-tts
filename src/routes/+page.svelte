<script lang="ts">
	import { goto } from '$app/navigation';
	import { randomLobbyName } from '$lib/utils/lobby-name';

	// href is a working fallback (middle-click / no JS); the click handler rolls a
	// fresh name so every launch from this page gets its own table
	let lobby = $state(randomLobbyName());

	function openTable(event: MouseEvent) {
		event.preventDefault();
		lobby = randomLobbyName();
		goto(`/play?lobby=${lobby}`);
	}

	const HAND = [
		{ index: 'A', suit: '♠', red: false },
		{ index: 'K', suit: '♥', red: true },
		{ index: 'Q', suit: '♣', red: false },
		{ index: 'J', suit: '♦', red: true },
		{ index: '10', suit: '♠', red: false }
	];
</script>

<svelte:head>
	<title>table.place — board games in your browser</title>
	<meta
		name="description"
		content="Board games in your browser. No installs, no accounts — a table is just a link. Open a table, share the URL, and play."
	/>
	<meta property="og:title" content="table.place — board games in your browser" />
	<meta
		property="og:description"
		content="No installs, no accounts — a table is just a link. Open a table, share the URL, and play."
	/>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="page">
	<!-- ============ hero: the table ============ -->
	<header class="felt relative overflow-hidden">
		<nav class="relative z-10 mx-auto flex max-w-5xl items-center gap-3 px-6 pt-6">
			<span class="wordmark text-xl text-emerald-50">table.place</span>
			<span class="alpha-badge">alpha</span>
			<a
				href="https://github.com/JollyGrin/tableplace"
				class="ml-auto text-sm text-emerald-100/80 underline decoration-emerald-100/40 underline-offset-4 hover:text-white"
			>
				GitHub
			</a>
		</nav>

		<div
			class="relative z-10 mx-auto flex max-w-5xl flex-col items-center px-6 pt-10 pb-20 text-center sm:pt-16"
		>
			<div class="fan" aria-hidden="true">
				{#each HAND as card, i (card.index + card.suit)}
					<div class="card" class:red={card.red} style="--i: {i}; --r: {(i - 2) * 12}deg">
						<span class="corner">{card.index}<br />{card.suit}</span>
						<span class="pip">{card.suit}</span>
						<span class="corner corner-bottom">{card.index}<br />{card.suit}</span>
					</div>
				{/each}
			</div>

			<h1 class="wordmark mt-10 max-w-2xl text-4xl leading-tight text-emerald-50 sm:text-6xl">
				Board games in your browser.
			</h1>
			<p class="mt-4 max-w-xl text-lg text-emerald-100/90">
				No installs, no accounts — a table is just a link.
			</p>

			<a href="/play?lobby={lobby}" onclick={openTable} class="cta mt-8">Open a table</a>
			<p class="mt-3 text-sm text-emerald-100/70">
				Yours will be called <code class="rounded bg-emerald-950/40 px-1.5 py-0.5">{lobby}</code> — the
				URL is the invite.
			</p>
		</div>
	</header>

	<!-- ============ how to play ============ -->
	<section class="paper px-6 py-16 sm:py-20">
		<div class="mx-auto max-w-5xl">
			<h2 class="wordmark text-3xl text-emerald-950 sm:text-4xl">How to play</h2>
			<div class="mt-8 grid gap-4 sm:grid-cols-3">
				<div class="step">
					<span class="step-index">1<br />♠</span>
					<h3>Open a table</h3>
					<p>
						One click and a fresh table is yours, with a name like <code>swift-otter</code>. No
						sign-up, nothing to download.
					</p>
				</div>
				<div class="step">
					<span class="step-index red">2<br />♥</span>
					<h3>Share the URL</h3>
					<p>
						The address bar <em>is</em> the invite link. Send it to your friends and they pull up a chair
						at the same table.
					</p>
				</div>
				<div class="step">
					<span class="step-index">3<br />♣</span>
					<h3>Spawn a deck and play</h3>
					<p>
						Deal, drag, flip, stack. The table doesn't enforce rules — you play the way you would at
						a real one.
					</p>
				</div>
			</div>
		</div>
	</section>

	<!-- ============ pack → scenario → play ============ -->
	<section class="paper hairline px-6 py-16 sm:py-20">
		<div class="mx-auto max-w-5xl">
			<h2 class="wordmark text-3xl text-emerald-950 sm:text-4xl">Make it your game</h2>
			<p class="mt-4 max-w-2xl text-lg text-emerald-950/80">
				The 52-card deck is just the house game. Your own game reaches the table in three steps — a
				<strong>Pack</strong> is what exists, a <strong>Scenario</strong> is how it's arranged.
			</p>
			<div class="mt-8 grid gap-4 sm:grid-cols-3">
				<a class="flow-step" href="/create">
					<span class="flow-tag">1 · Pack</span>
					<h3>Create a Pack</h3>
					<p>
						Everything your game is made of — decks, cards, tokens, boards. Build it in the pack
						editor, or import a Tabletop Simulator save.
					</p>
					<span class="flow-link">Open the pack editor →</span>
				</a>
				<a class="flow-step" href="/setup">
					<span class="flow-tag">2 · Scenario</span>
					<h3>Arrange a Scenario</h3>
					<p>
						Place the pack's contents on the table, deal decks to seats, and save the starting
						arrangement. One pack, as many scenarios as ways to play it.
					</p>
					<span class="flow-link">Open the scenario editor →</span>
				</a>
				<a class="flow-step" href="/play">
					<span class="flow-tag">3 · Play</span>
					<h3>Host it live</h3>
					<p>
						Load the scenario into a lobby and the table is set before your friends even click the
						link.
					</p>
					<span class="flow-link">Open a table →</span>
				</a>
			</div>
		</div>
	</section>

	<!-- ============ create scenarios ============ -->
	<section class="felt-deep px-6 py-16 text-emerald-50 sm:py-20">
		<div class="mx-auto max-w-5xl">
			<h2 class="wordmark text-3xl sm:text-4xl">Bring your own game</h2>
			<div class="mt-6 grid gap-10 sm:grid-cols-2">
				<div class="space-y-4 text-emerald-100/90">
					<p>
						A standard 52-card deck is built in, but any deck can join the table: import cards by
						image URL, or load Tabletop Simulator–format JSON — like the fan-made decks from
						<a href="https://the-unmatched.club" class="link-light">the-unmatched.club</a>.
					</p>
					<p>
						Build a full setup in the <a href="/setup" class="link-light">scenario editor</a> — decks
						for each seat, a map in the middle — then seed any lobby with it from the table's Settings&nbsp;→&nbsp;Scenarios.
					</p>
					<p class="text-sm text-emerald-100/60">
						Fan-made content stays fan-made: creators host their own assets, and table.place hosts
						none of them.
					</p>
				</div>
				<div class="flex items-start justify-center sm:justify-end">
					<a href="/setup" class="cta-ghost">Build a scenario</a>
				</div>
			</div>
		</div>
	</section>

	<!-- ============ where this is going ============ -->
	<section class="paper px-6 py-16 sm:py-20">
		<div class="mx-auto max-w-5xl">
			<h2 class="wordmark text-3xl text-emerald-950 sm:text-4xl">Where this is going</h2>
			<p class="mt-6 max-w-2xl text-lg text-emerald-950/80">
				The goal: any tabletop game, loadable from a file. Easier creator tools — turn a spreadsheet
				into a deck. Communities offering “play online” right from their own sites, with a table
				that's just a link away.
			</p>
			<p class="mt-4 max-w-2xl text-emerald-950/60">
				table.place is in alpha and free — no accounts, no tiers. Expect rough edges, and say hi on
				<a
					href="https://github.com/JollyGrin/tableplace"
					class="underline decoration-emerald-700/40 underline-offset-4 hover:text-emerald-950"
					>GitHub</a
				> if you hit one.
			</p>
		</div>
	</section>

	<footer class="felt-deep px-6 py-8">
		<div
			class="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 text-sm text-emerald-100/70"
		>
			<span class="wordmark text-base text-emerald-50">table.place</span>
			<span class="alpha-badge">alpha</span>
			<span>free, no accounts</span>
			<a href="https://github.com/JollyGrin/tableplace" class="link-light ml-auto">GitHub</a>
		</div>
	</footer>
</div>

<style>
	.page {
		font-family:
			ui-sans-serif,
			system-ui,
			-apple-system,
			'Segoe UI',
			sans-serif;
	}

	.wordmark {
		font-family: 'Fraunces', Georgia, serif;
		font-weight: 600;
	}

	/* --- felt table surfaces --- */
	.felt,
	.felt-deep {
		position: relative;
		background-color: #1d5c3a;
	}
	.felt {
		background-image: radial-gradient(
			ellipse 120% 90% at 50% 20%,
			#2f7d52 0%,
			#1d5c3a 55%,
			#123f27 100%
		);
	}
	.felt-deep {
		background-image: radial-gradient(ellipse 120% 120% at 50% 0%, #1d5c3a 0%, #123f27 80%);
	}
	/* felt grain */
	.felt::after,
	.felt-deep::after {
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
		opacity: 0.5;
		mix-blend-mode: overlay;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.35'/%3E%3C/svg%3E");
	}
	.felt > *,
	.felt-deep > * {
		position: relative;
		z-index: 1;
	}

	.paper {
		background-color: #f6f1e3;
		background-image: radial-gradient(ellipse 100% 80% at 50% 0%, #fbf8ee 0%, #f6f1e3 70%);
	}

	.alpha-badge {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #fef3c7;
		background: rgba(180, 83, 9, 0.55);
		border: 1px solid rgba(254, 243, 199, 0.4);
		border-radius: 9999px;
		padding: 0.15rem 0.6rem;
	}

	/* --- the dealt hand --- */
	.fan {
		--card-w: clamp(76px, 17vw, 118px);
		position: relative;
		width: calc(var(--card-w) * 3.4);
		height: calc(var(--card-w) * 1.9);
	}
	.card {
		position: absolute;
		bottom: 0;
		left: 50%;
		width: var(--card-w);
		aspect-ratio: 5 / 7;
		transform-origin: 50% 130%;
		transform: translateX(-50%) rotate(var(--r));
		background: linear-gradient(160deg, #fdfaf2 0%, #f3edda 100%);
		border-radius: calc(var(--card-w) * 0.09);
		border: 1px solid rgba(30, 41, 34, 0.12);
		box-shadow:
			0 2px 3px rgba(10, 30, 18, 0.25),
			0 10px 24px rgba(10, 30, 18, 0.35);
		color: #263528;
		animation: deal 0.7s cubic-bezier(0.2, 0.7, 0.3, 1.05) backwards;
		animation-delay: calc(var(--i) * 110ms + 150ms);
		transition: transform 0.35s ease;
	}
	.card.red {
		color: #bb4430;
	}
	.fan:hover .card {
		transform: translateX(-50%) rotate(calc(var(--r) * 1.3)) translateY(-6px);
	}
	@keyframes deal {
		from {
			transform: translateX(-50%) translateY(55%) rotate(0deg);
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.card {
			animation: none;
			transition: none;
		}
	}
	.corner {
		position: absolute;
		top: 6%;
		left: 9%;
		font-size: calc(var(--card-w) * 0.15);
		font-weight: 700;
		line-height: 1.05;
		text-align: center;
	}
	.corner-bottom {
		top: auto;
		left: auto;
		right: 9%;
		bottom: 6%;
		transform: rotate(180deg);
	}
	.pip {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		font-size: calc(var(--card-w) * 0.44);
	}

	/* --- buttons --- */
	.cta {
		display: inline-block;
		font-family: 'Fraunces', Georgia, serif;
		font-weight: 600;
		font-size: 1.15rem;
		color: #1d3a28;
		background: linear-gradient(160deg, #fdfaf2 0%, #f0e8d0 100%);
		border-radius: 0.75rem;
		padding: 0.8rem 2.4rem;
		box-shadow:
			0 2px 0 rgba(10, 30, 18, 0.35),
			0 10px 22px rgba(10, 30, 18, 0.35);
		transition:
			transform 0.15s ease,
			box-shadow 0.15s ease;
	}
	.cta:hover {
		transform: translateY(-2px);
		box-shadow:
			0 4px 0 rgba(10, 30, 18, 0.35),
			0 14px 26px rgba(10, 30, 18, 0.4);
	}
	.cta:active {
		transform: translateY(0);
	}
	.cta-ghost {
		display: inline-block;
		font-family: 'Fraunces', Georgia, serif;
		font-weight: 600;
		color: #ecfdf5;
		border: 1.5px solid rgba(236, 253, 245, 0.5);
		border-radius: 0.75rem;
		padding: 0.7rem 2rem;
		transition:
			background-color 0.15s ease,
			border-color 0.15s ease;
	}
	.cta-ghost:hover {
		background: rgba(236, 253, 245, 0.1);
		border-color: rgba(236, 253, 245, 0.8);
	}

	.link-light {
		color: #ecfdf5;
		text-decoration: underline;
		text-decoration-color: rgba(236, 253, 245, 0.4);
		text-underline-offset: 4px;
	}
	.link-light:hover {
		text-decoration-color: rgba(236, 253, 245, 0.9);
	}

	/* --- how-to-play step cards --- */
	.step {
		position: relative;
		background: #fffdf6;
		border: 1px solid rgba(30, 41, 34, 0.1);
		border-radius: 0.9rem;
		padding: 1.5rem 1.5rem 1.5rem 4.2rem;
		box-shadow: 0 6px 16px rgba(30, 41, 34, 0.08);
	}
	.step-index {
		position: absolute;
		top: 1.1rem;
		left: 1.2rem;
		font-family: 'Fraunces', Georgia, serif;
		font-weight: 700;
		font-size: 1.3rem;
		line-height: 1.05;
		text-align: center;
		color: #263528;
	}
	.step-index.red {
		color: #bb4430;
	}
	.step h3 {
		font-family: 'Fraunces', Georgia, serif;
		font-weight: 600;
		font-size: 1.2rem;
		color: #14351f;
	}
	.step p {
		margin-top: 0.5rem;
		font-size: 0.95rem;
		color: rgba(20, 53, 31, 0.75);
	}
	/* --- pack → scenario → play flow cards --- */
	.hairline {
		border-top: 1px solid rgba(30, 41, 34, 0.1);
	}
	.flow-step {
		display: block;
		position: relative;
		background: #fffdf6;
		border: 1px solid rgba(30, 41, 34, 0.1);
		border-radius: 0.9rem;
		padding: 1.5rem;
		box-shadow: 0 6px 16px rgba(30, 41, 34, 0.08);
		transition:
			transform 0.15s ease,
			box-shadow 0.15s ease;
	}
	.flow-step:hover {
		transform: translateY(-3px);
		box-shadow: 0 10px 22px rgba(30, 41, 34, 0.14);
	}
	.flow-tag {
		display: inline-block;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #1d5c3a;
		background: rgba(29, 92, 58, 0.09);
		border: 1px solid rgba(29, 92, 58, 0.2);
		border-radius: 9999px;
		padding: 0.15rem 0.6rem;
	}
	.flow-step h3 {
		margin-top: 0.8rem;
		font-family: 'Fraunces', Georgia, serif;
		font-weight: 600;
		font-size: 1.2rem;
		color: #14351f;
	}
	.flow-step p {
		margin-top: 0.5rem;
		font-size: 0.95rem;
		color: rgba(20, 53, 31, 0.75);
	}
	.flow-link {
		display: inline-block;
		margin-top: 0.8rem;
		font-size: 0.9rem;
		font-weight: 600;
		color: #1d5c3a;
	}
	.flow-step:hover .flow-link {
		text-decoration: underline;
		text-underline-offset: 4px;
	}

	.step code,
	.paper code {
		background: rgba(30, 41, 34, 0.07);
		border-radius: 0.25rem;
		padding: 0.1rem 0.35rem;
		font-size: 0.85em;
	}
</style>
