# Server to handle websocket connections

## Goal

- Create a server that can handle websocket connections
- connection groups are broken up into different lobbies. Each lobby is a new instance
- each lobby has a unique id. Players that connect to the same lobby can share messages withe each other
- each player has a unique id, and optionally (can be null/undefined) a secret passphrase

## Data Structure
All data is visible, including player's private state, but only the owner of the player can update their state
```ts
// Anyone can update the objects on the board
const BoardState = {
    [objectId]: {...objectState},
    ...
}

// Only the owner of the player can update the player state
const PlayerStates = {
    [playerId]: {
        metadata: { ...playerMetadata }, // extra data to store game information (life, mana, etc)
        decks: { [deckId]: {...deckState} }, // each deck has a unique id
        tray: { ...trayState } // cards in the hand only visible to player
    },
    ...
}
```

## Sending Messages
Send as surgical updates as possible to the websocket. For example, don't send the entire board state on every update.
This is especially important for movement, which has a lot of changes as items are dragged.

Additionally, have the websocket send surgical updates to the client, which updates the client piece by piece instead of rerendering everything.

This means the client will need to interpret state changes and apply the diffs locally. On reload, will load the entire state of the game again.

## Considerations
Identify how to refactor the existing stores to weave together with the websocket layer. The stores should handle client data (card position/movement/etc). These local changes should update the websocket, and the websocket should update these local stores
- ObjectStore: public objects on the table that can be dragged (currently only cards, later will incorporate other objects)
- SeatStore: global rotation data for the user. Each player will face a different direction, and objects should be seen from their viewpoint.
- TrayStore: cards in the player's hand, not visible to the other players
- DeckStore: decks on the table (not draggable)
- DragStore: information about the currently dragged object (including hover, isTrayHovered, isDeckHovered) and the intersection point
