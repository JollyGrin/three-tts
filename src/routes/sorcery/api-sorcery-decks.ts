import { gameActions } from '$lib/store/game/actions';
import type { GameDTO } from '$lib/store/game/types';
import { getStaticResourceUrl } from '$lib/utils/image';
import { getSorceryCardImage } from '$lib/utils/mock/cards';

type ElementThresholds = {
	waterThreshold: number;
	earthThreshold: number;
	airThreshold: number;
	fireThreshold: number;
};

type MetadataType =
	| 'Avatar'
	| 'Minion'
	| 'Magic'
	| 'Artifact'
	| 'Aura'
	| 'Site';

type CardMetadata = ElementThresholds & {
	type: MetadataType;
};

type Card = {
	identifier: string;
	name: string;
	quantity: number;
	src: string;
	metadata: CardMetadata;
};

type DeckResponse = {
	avatar: Card[];
	spellbook: Card[];
	atlas: Card[];
	sideboard: Card[];
};

export async function fetchDeck() {
	const response = await fetch(
		'https://corsproxy.innkeeper1.workers.dev/?url=https://curiosa.io/api/decks/clso3lngx007lhb600v843gd7'
	);
	const data = (await response.json()) as DeckResponse;
	console.log('res deck:', response, data);
}

export function convertDeckToGameDTO(
	data: DeckResponse
): Record<'cemetary' | 'atlas' | 'spellbook', GameDTO['decks'][string]> {
	const playerName = gameActions.getMyId();
	const atlas: GameDTO['decks'][string]['cards'] = data.atlas
		.map((card) => {
			const cards = Array.from({ length: card.quantity }).map((_, i) => ({
				id: `card:${playerName}:${card.identifier}-${i}`,
				faceImageUrl: getSorceryCardImage(card.identifier),
				backImageUrl: getStaticResourceUrl('/a-back.png')
			}));
			return cards;
		})
		.flat();

	const spellbook: GameDTO['decks'][string]['cards'] = data.spellbook
		.map((card) => {
			const cards = Array.from({ length: card.quantity }).map((_, i) => ({
				id: `card:${playerName}:${card.identifier}-${i}`,
				faceImageUrl: getSorceryCardImage(card.identifier),
				backImageUrl: getStaticResourceUrl('/s-back.jpg')
			}));
			return cards;
		})
		.flat();

	const avatar: GameDTO['decks'][string]['cards'] = data.avatar.map((card) => ({
		id: `card:${playerName}:${card.identifier}-avatar`,
		faceImageUrl: getSorceryCardImage(card.identifier),
		backImageUrl: getStaticResourceUrl('/s-back.jpg')
	}));

	return {
		cemetary: {
			id: `deck:${playerName}:cemetary`,
			cards: avatar,
			deckBackImageUrl: getStaticResourceUrl('/s-back.jpg'),
			isFaceUp: true
		},
		atlas: {
			id: `deck:${playerName}:atlas`,
			cards: atlas,
			deckBackImageUrl: getStaticResourceUrl('/a-back.png')
		},
		spellbook: {
			id: `deck:${playerName}:spellbook`,
			cards: spellbook,
			deckBackImageUrl: getStaticResourceUrl('/s-back.jpg')
		}
	};
}
