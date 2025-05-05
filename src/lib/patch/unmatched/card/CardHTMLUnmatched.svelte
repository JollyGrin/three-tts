<script lang="ts">
	import { HTML } from '@threlte/extras';
	import { UNMATCHED_DECK_THRALL } from '../../../../routes/unmatched/constants-thrall-deck';
	import { calculateCardProps, cardConstants, cardStyles, cardTypeColors } from './CardHelpers';
	import type { DeckImportCardType, UnmatchedCardType } from './CardTypes';

	let { id, cardData } = $props<{ id: string; cardData?: DeckImportCardType }>();

	// Convert card data from deck to match DeckImportCardType
	const defaultCard = UNMATCHED_DECK_THRALL.deck_data.cards[11];
	const defaultCardTyped: DeckImportCardType = {
		id: 'default',
		title: defaultCard.title,
		characterName: defaultCard.characterName,
		type: defaultCard.type as UnmatchedCardType,
		value: defaultCard.value,
		basicText: defaultCard.basicText,
		immediateText: defaultCard.immediateText,
		duringText: defaultCard.duringText,
		afterText: defaultCard.afterText,
		boost: defaultCard.boost,
		quantity: defaultCard.quantity,
		imageUrl: defaultCard.imageUrl
	};

	// Use provided cardData or fallback to the default card
	const card = cardData || defaultCardTyped;

	// Calculate all card properties statically
	const cardProps = calculateCardProps(card);

	// Static card dimensions for Threlte HTML component
	const htmlWidth = 630 * 10; // 10x for better resolution
	const htmlHeight = 880 * 10;

	// Helper to determine card type color
	const cardTypeColor = cardTypeColors[card.type as keyof typeof cardTypeColors] || '#4aa46a';
</script>

<HTML
	transform
	occlude
	pointerEvents="all"
	position={[0, 0, 0.02]}
	scale={0.01}
	resolutionScale={1.5}
	transmissionScale={1}
>
	<div
		style="width: {htmlWidth}px; height: {htmlHeight}px; overflow: hidden; user-select: none; transform: translate3d(0,0,0); backface-visibility: hidden;"
	>
		<svg
			preserveAspectRatio="xMinYMin meet"
			viewBox="0 0 63 88"
			width="{htmlWidth}px"
			height="{htmlHeight}px"
		>
			<!-- Clipping paths -->
			<clipPath id="innerBorder-{id}">
				<rect
					width={cardProps.innerWidth}
					height={cardConstants.height - 2 * cardConstants.outerBorderWidth}
					rx={cardConstants.innerCornerRadius}
				/>
			</clipPath>

			<clipPath id="topPanel-{id}">
				<rect width={cardProps.topPanelWidth} height={cardProps.topPanelHeight} />
			</clipPath>

			<!-- Card outer border -->
			<rect
				width={cardConstants.width}
				height={cardConstants.height}
				rx={cardConstants.cornerRadius}
				style="fill: {cardConstants.outerBorderColour};"
			/>

			<!-- Card content group -->
			<g
				transform="translate({cardConstants.outerBorderWidth} {cardConstants.outerBorderWidth})"
				clip-path="url(#innerBorder-{id})"
			>
				<!-- Top panel background -->
				<rect
					class="top-panel"
					width={cardProps.topPanelWidth}
					height={cardProps.topPanelHeight}
					style="fill: #fff;"
				/>

				<!-- Card image -->
				<image
					width={cardProps.topPanelWidth}
					href={cardProps.dataUri}
					clip-path="url(#topPanel-{id})"
					preserveAspectRatio="xMidYMid meet"
				/>

				<!-- Left side panel -->
				<polygon
					style="fill: {cardConstants.outerBorderColour};"
					points="0,0 10,0 10,39.6 5,42.9 0,40.1"
				/>

				<!-- Character name panel -->
				<polygon style="fill: #000;" points="0,14.2 10,14.2 10,39.87 5,42.77 0,39.9" />

				<!-- Character name -->
				<text
					x="-20"
					y="7"
					text-anchor="end"
					transform="rotate(-90 0 0)"
					style="fill: #fff; font-family: 'BebasNeueRegular', sans-serif; font-size: 6px;"
				>
					{card.characterName}
				</text>

				<!-- Card type indicator (top triangle) -->
				<polygon style="fill: {cardTypeColor};" points="0,0 10,0 10,14.2 5,17.1 0,14.2" />

				<!-- Card value (if not scheme) -->
				{#if !cardProps.isScheme}
					<text
						x="5"
						y="14.8"
						text-anchor="middle"
						style="fill: #fff; font-family: 'BebasNeueRegular', sans-serif; font-size: 7.8px;"
					>
						{card.value}
					</text>
				{/if}

				<!-- Card icon (placeholder) -->
				<text
					x="5"
					y="6"
					text-anchor="middle"
					style="fill: #fff; font-family: sans-serif; font-size: 4px;"
				>
					{#if card.type === 'attack'}
						⚔️
					{:else if card.type === 'defense'}
						🛡️
					{:else if card.type === 'versatile'}
						⚡
					{:else}
						✨
					{/if}
				</text>

				<!-- Bottom panel -->
				<rect
					class="bottom-panel"
					width={cardProps.bottomPanelWidth}
					height={cardProps.bottomPanelHeight}
					y={cardProps.bottomPanelY}
					style="fill: #000;"
				/>

				<!-- Card title -->
				<text
					style="fill: #fff; font-family: 'BebasNeueRegular', sans-serif; font-size: 5px;"
					y={cardProps.bottomPanelY}
					dy="6"
				>
					{#each cardProps.wrapCardTitle as line, index (index)}
						<tspan x={cardConstants.bottomPanelPadding} dy="6">
							{line}
						</tspan>
					{/each}
				</text>

				<!-- Separator line -->
				<line
					x1={cardConstants.bottomPanelPadding}
					y1={cardProps.bottomPanelY + 1.5 + 6 * cardProps.wrapCardTitle.length}
					x2={cardProps.bottomPanelWidth - cardConstants.bottomPanelPadding}
					y2={cardProps.bottomPanelY + 1.5 + 6 * cardProps.wrapCardTitle.length}
					stroke-width="0.4"
					stroke="#fff"
				/>

				<!-- Basic text if any -->
				{#if card.basicText}
					<text
						style="fill: #fff; font-family: 'ArchivoNarrow', sans-serif; font-size: 3.3px;"
						y={cardProps.bottomPanelY + 3.3 * 0.8 + 6 * cardProps.wrapCardTitle.length}
					>
						{#each cardProps.wrapBasicText as line, index (index)}
							<tspan dy={3.3 * 1.1} x={cardConstants.bottomPanelPadding}>
								{line}
							</tspan>
						{/each}
					</text>
				{/if}

				<!-- IMMEDIATELY section -->
				{#if !cardProps.isScheme && card.immediateText}
					<text
						style="fill: #fff; font-family: 'ArchivoNarrow', sans-serif; font-size: 3.3px;"
						y={cardProps.bottomPanelY +
							3.3 * 0.8 +
							6 * cardProps.wrapCardTitle.length +
							3.3 * 1.1 * cardProps.wrapBasicText.length}
					>
						<tspan
							dy="4.36"
							x={cardConstants.bottomPanelPadding}
							style="fill: #fff; font-family: 'BebasNeueRegular', sans-serif; font-size: 4px;"
						>
							IMMEDIATELY:
						</tspan>
						{#each cardProps.wrapImmediateText as line, index (index)}
							<tspan
								dy={index ? 3.3 * 1.1 : 0}
								x={index ? cardConstants.bottomPanelPadding : undefined}
							>
								{line}
							</tspan>
						{/each}
					</text>
				{/if}

				<!-- DURING COMBAT section -->
				{#if !cardProps.isScheme && card.duringText}
					<text
						style="fill: #fff; font-family: 'ArchivoNarrow', sans-serif; font-size: 3.3px;"
						y={cardProps.bottomPanelY +
							3.3 * 0.8 +
							6 * cardProps.wrapCardTitle.length +
							3.3 * 1.1 * (cardProps.wrapBasicText.length + cardProps.wrapImmediateText.length)}
					>
						<tspan
							dy="4.36"
							x={cardConstants.bottomPanelPadding}
							style="fill: #fff; font-family: 'BebasNeueRegular', sans-serif; font-size: 4px;"
						>
							DURING COMBAT:
						</tspan>
						{#each cardProps.wrapDuringText as line, index (index)}
							<tspan
								dy={index ? 3.3 * 1.1 : 0}
								x={index ? cardConstants.bottomPanelPadding : undefined}
							>
								{line}
							</tspan>
						{/each}
					</text>
				{/if}

				<!-- AFTER COMBAT section -->
				{#if !cardProps.isScheme && card.afterText}
					<text
						style="fill: #fff; font-family: 'ArchivoNarrow', sans-serif; font-size: 3.3px;"
						y={cardProps.bottomPanelY +
							3.3 * 0.8 +
							6 * cardProps.wrapCardTitle.length +
							3.3 *
								1.1 *
								(cardProps.wrapBasicText.length +
									cardProps.wrapImmediateText.length +
									cardProps.wrapDuringText.length)}
					>
						<tspan
							dy="4.36"
							x={cardConstants.bottomPanelPadding}
							style="fill: #fff; font-family: 'BebasNeueRegular', sans-serif; font-size: 4px;"
						>
							AFTER COMBAT:
						</tspan>
						{#each cardProps.wrapAfterText as line, index (index)}
							<tspan
								dy={index ? 3.3 * 1.1 : 0}
								x={index ? cardConstants.bottomPanelPadding : undefined}
							>
								{line}
							</tspan>
						{/each}
					</text>
				{/if}

				<!-- Boost value -->
				{#if card.boost}
					<g>
						<circle
							r={cardConstants.boostCircleRadius}
							fill={cardConstants.outerBorderColour}
							cx="52"
							cy={cardProps.bottomPanelY - 1}
						/>
						<circle
							r={cardConstants.boostCircleRadius - cardConstants.hRuleThickness}
							fill="#000"
							cx="52"
							cy={cardProps.bottomPanelY - 1}
						/>
						<text
							x="52"
							y={cardProps.bottomPanelY - 1}
							dy="1.5"
							text-anchor="middle"
							style="fill: #fff; font-family: 'BebasNeueRegular', sans-serif; font-size: 5px;"
						>
							{card.boost}
						</text>
					</g>
				{/if}

				<!-- Bottom text and quantity -->
				<text
					x="52.5"
					y={cardConstants.height - 2 * cardConstants.outerBorderWidth - 1.5}
					text-anchor="end"
					style="fill: #fff; font-family: 'BebasNeueRegular', sans-serif; font-size: 1.8px;"
				>
					{card.title}
				</text>
				<line
					x1="53.25"
					y1={cardConstants.height - 2 * cardConstants.outerBorderWidth - 0.8}
					x2="53.25"
					y2={cardConstants.height - 2 * cardConstants.outerBorderWidth - 1.5 - 2.2}
					stroke-width="0.3"
					stroke="#fff"
				/>
				<text
					x="54"
					y={cardConstants.height - 2 * cardConstants.outerBorderWidth - 1.5}
					style="fill: #fff; font-family: 'LeagueGothic', sans-serif; font-size: 1.8px;"
				>
					{card.quantity}
				</text>
			</g>
		</svg>
	</div>
</HTML>
