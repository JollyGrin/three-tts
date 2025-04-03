import { CARDS_SORCERY } from '$lib/utils/mock/cards-sorcery';

export function generateCardImages(amount: number = 5) {
	if (amount > CARDS_SORCERY.length) {
		throw new Error('Count cannot be greater than the array length');
	}

	const shuffled = [...CARDS_SORCERY].sort(() => Math.random() - 0.5);
	return shuffled
		.slice(0, amount)
		.map((card) => `https://card.cards.army/cards/${card.slug}.webp`);
}
