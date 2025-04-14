import { cardActions } from './card';
import { deckActions } from './deck';
import { playerActions } from './player';
import { trayActions } from './tray';

export const gameActions = {
	...cardActions,
	...deckActions,
	...playerActions,
	...trayActions
};
