Manages the state for client

# stores

## deckStore
manages the decks on the table. Publicly viewable. Are assigned to players in the playerStore

## dragStore
tracks the cursor position on the table. Marks what object is being hovered/dragged.

## objectStore
manages the cards on the table. Holds position, rotation, face & back image.

## playerStore
manages the players in the game. Publicly viewable. Subscribes to the tray and seat store to update those variables.

## seatStore
manages the client's position at the table.  playerStore subscribes to this track this in the larger store.

## trayStore
manages the client's hidden hand of cards. playerStore subscribes to this track this in the larger store.

