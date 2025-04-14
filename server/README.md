# Server to handle websocket connections

## Goal

- Create a server that can handle websocket connections
- connection groups are broken up into different lobbies. Each lobby is a new instance
- each lobby has a unique id. Players that connect to the same lobby can share messages withe each other
- each player has a unique id, and optionally (can be null/undefined) a secret passphrase

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

## Sending Messages
Send as surgical updates as possible to the websocket. For example, don't send the entire board state on every update.
This is especially important for movement (objectStore position), which has a lot of changes as items are dragged.

Additionally, have the websocket send surgical updates to the client, which updates the client piece by piece instead of rerendering everything.

This means the client will need to interpret state changes and apply the diffs locally. On reload, will load the entire state of the game again.

## Considerations
read the readme in lib/stores/README-stores.md for information how the svelte stores are setup to update the client. Remember that since decks and objects are on the table, anyone can touch and update them.
the data structure for objects and decks is just a record with id and values. 
playerStore holds all players, but restricts updates to only the local player.
