# Structure: Hugo Game App

## Directory Layout

```
hugo-game-app/
├── hugo-server/                    # Node.js/TypeScript backend
│   ├── src/
│   │   ├── index.ts                # Entry point — Express + Socket.IO setup
│   │   ├── config/
│   │   │   └── config.ts           # Port, CORS origin, game settings
│   │   ├── models/
│   │   │   ├── Game.ts             # Core game engine (dealing, turns, sets, scoring)
│   │   │   ├── Player.ts           # Player state (tiles, scores, ready status)
│   │   │   ├── Room.ts             # Room state (players list, game reference)
│   │   │   └── Tile.ts             # Tile data model (color, value, status)
│   │   ├── socket/
│   │   │   └── socketHandler.ts    # All Socket.IO event handlers
│   │   └── utils/
│   │       └── GameManager.ts      # Singleton store — players, rooms, games
│   ├── package.json
│   ├── tsconfig.json
│   └── .env                        # Environment config (PORT, ORIGIN)
│
├── hugo-ui/                        # React/Vite frontend
│   ├── src/
│   │   ├── main.jsx                # React entry point
│   │   ├── App.jsx                 # Root component, view routing
│   │   ├── components/
│   │   │   ├── Login.jsx           # Player registration screen
│   │   │   ├── Lobby.jsx           # Room list, create/join
│   │   │   ├── Room.jsx            # Pre-game room, ready state
│   │   │   ├── Game/
│   │   │   │   └── Game.jsx        # Main game coordinator component
│   │   │   ├── GameBoard/
│   │   │   │   └── GameBoard.jsx   # Table sets display area
│   │   │   ├── Tile/
│   │   │   │   └── Tile.jsx        # Individual tile component (draggable)
│   │   │   ├── TileHolder/
│   │   │   │   └── TileHolder.jsx  # Player hand tile rack
│   │   │   ├── OpenSetsArea/
│   │   │   │   └── OpenSetsArea.jsx # Table sets drop target
│   │   │   ├── PlayerPanel/
│   │   │   │   └── PlayerPanel.jsx # Opponent info display
│   │   │   ├── CenterArea/
│   │   │   │   └── CenterArea.jsx  # Deck + discard pile area
│   │   │   ├── CenterTile/
│   │   │   │   └── CenterTile.jsx  # Top-of-discard tile display
│   │   │   ├── DiscardAreas/
│   │   │   │   └── DiscardAreas.jsx # Discard drop targets
│   │   │   ├── RoundSummary/
│   │   │   │   └── RoundSummary.jsx # Round result display
│   │   │   └── Scoreboard/
│   │   │       └── Scoreboard.jsx  # Game scoreboard
│   │   ├── hooks/
│   │   │   ├── useGameState.js     # Central game state hook
│   │   │   └── useGameSocket.js    # Socket event subscription hook
│   │   ├── services/
│   │   │   └── socketService.js    # Socket.IO client singleton
│   │   ├── utils/
│   │   │   ├── gameUtils.js        # Set validation, tile scoring helpers
│   │   │   └── tileHandlers.js     # Drag-and-drop tile logic
│   │   └── assets/
│   │       └── css/
│   │           ├── global.css
│   │           └── components/     # Per-component CSS files
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── .planning/                      # GSD planning directory
├── document.txt                    # Game rules/design notes
└── README.md
```

## Key File Locations

| Purpose | File |
|---------|------|
| Server entry | `hugo-server/src/index.ts` |
| Game engine | `hugo-server/src/models/Game.ts` |
| All socket events | `hugo-server/src/socket/socketHandler.ts` |
| In-memory state store | `hugo-server/src/utils/GameManager.ts` |
| Client entry | `hugo-ui/src/main.jsx` |
| Game UI coordinator | `hugo-ui/src/components/Game/Game.jsx` |
| Client socket | `hugo-ui/src/services/socketService.js` |
| Client state | `hugo-ui/src/hooks/useGameState.js` |
| Game rules config | `hugo-server/src/config/config.ts` |
| Environment | `hugo-server/.env` |

## Naming Conventions

- **Server models**: PascalCase classes (`Game`, `Player`, `Room`, `Tile`)
- **Socket events**: `namespace:action` format (`game:drawTile`, `player:register`, `room:join`)
- **UI components**: PascalCase, each in own directory with matching `.jsx` and `.css` files
- **Hooks**: `use` prefix camelCase (`useGameState`, `useGameSocket`)
- **Utils**: camelCase files (`gameUtils.js`, `tileHandlers.js`)
- **CSS**: Component name matches directory name (`Tile.css` for `Tile/Tile.jsx`)

## Adding New Code

- **New socket event**: Add handler in `hugo-server/src/socket/socketHandler.ts`
- **New game logic**: Add method to `hugo-server/src/models/Game.ts`
- **New UI component**: Create `hugo-ui/src/components/ComponentName/ComponentName.jsx` + matching CSS
- **New client socket call**: Add emit in `hugo-ui/src/services/socketService.js`, subscribe in `useGameSocket.js`
- **New game state**: Extend `useGameState.js` reducer/state shape