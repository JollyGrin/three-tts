import { cardActions } from './card';
import { deckActions } from './deck';
import { playerActions } from './player';
import { trayActions } from './tray';
import { pieceActions } from './piece';
import { snapActions } from './snap';

export const gameActions = {
	...cardActions,
	...deckActions,
	...playerActions,
	...trayActions,
	...pieceActions,
	...snapActions
};
