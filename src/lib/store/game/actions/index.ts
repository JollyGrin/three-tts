import { cardActions } from './card';
import { deckActions } from './deck';
import { playerActions } from './player';
import { trayActions } from './tray';
import { pieceActions } from './piece';
import { snapActions } from './snap';
import { bagActions } from './bag';
import { withIntents } from '../intents';

/**
 * `withIntents` names every verb on the bag for the intent channel
 * (tableplace-169). It changes no behaviour: the wrapper only marks which verb
 * is running, and an event is minted at the patch seam — so the read-only verbs
 * here (`getMe`, `getDeckLength`, `bagCount`, …) emit nothing at all.
 */
export const gameActions = withIntents({
	...cardActions,
	...deckActions,
	...playerActions,
	...trayActions,
	...pieceActions,
	...snapActions,
	...bagActions
});
