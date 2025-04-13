Manages the state for client

# game state

the gamestate is broken down into:
- decks: all decks on the table (location, rotation, cards, face up/down)
- objects: all cards on the table (location, rotation, face/back image)
- players: all players in the game
    - player: meatadata (life, resources), deckIds, tray*, seat*
    * (tray & seat are updated via a subscription to the local stores. This means only the local player can update their own state)

all of these are records for quick lookups and path adjustments. For example:
```
const decks = {
    deck1: {...state},
    deck2: {...state},
    ...
}
const objects = {
    object1: {...state},
}
const players = {
    player1: {...state},
    player2: {...state},
    ...
}

const gamestate = {decks, objects, players, lobbyId}
```
The entire gamestate should always be on the server, so that if a player reloads the page, everything is synced.

Updates to the gamestate should be through surgical changes. 
When a player broadcasts a change, it will just be the path towards the variable to be changed in the gamestate, and the new value. 
Then each client should be able read this message and apply it locally in their client stores.

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

# Tech Debt
Just updated the updateStore function to accept a very silly pattern. The previous method to updating state was update(id, payload)
Now the message is {id: payload}
later should refactor all the update functions to just send {id: payload} and remove the helper functions

Just added a bunch of transform-helpers to make the updateDeck, updateCard, and updatePlayer use the same format
