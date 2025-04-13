import { deckActions } from './deck';
import { playerActions } from './player';

export const gameActions = {
	...playerActions,
	...deckActions
};
