# Architecture: Hugo Game App

## Pattern

**Client-Server Real-time Architecture** via Socket.IO WebSockets.

Two-package monorepo:
- `hugo-server/` — Node.js/TypeScript backend, stateful game engine
- `hugo-ui/` — React/Vite frontend, event-driven UI

All game state lives server-side. Clients receive state updates via Socket.IO events and render accordingly.

## Layers

### Server-side

```
Entry Point (index.ts)
    └── Express HTTP + Socket.IO server setup

Socket Handler (socket/socketHandler.ts)
    └── Event routing, validation, broadcast coordination
    └── Singleton GameManager access

GameManager (utils/GameManager.ts)
    └── In-memory store of Players, Rooms, Games
    └── Singleton pattern (GameManager.getInstance())
    └── Orchestrates cross-entity operations

Domain Models
    ├── Player (models/Player.ts) — tiles, score, state
    ├── Room (models/Room.ts) — players list, game ref
    ├── Game (models/Game.ts) — full game engine logic
    └── Tile (models/Tile.ts) — tile data, status, serialization
```

### Client-side

```
Entry Point (main.jsx → App.jsx)
    └── Route-based rendering: Login → Lobby → Room → Game

React Components
    ├── Login.jsx — player name registration
    ├── Lobby.jsx — room list, create/join
    ├── Room.jsx — ready state, game start
    └── Game/Game.jsx — main game coordinator

Hooks
    ├── useGameState.js — centralized game state
    └── useGameSocket.js — socket event subscription

Services
    └── socketService.js — singleton Socket.IO client

Utilities
    ├── gameUtils.js — set validation, tile scoring
    └── tileHandlers.js — drag-drop tile logic
```

## Data Flow

### Game Initialization
```
Client                          Server
  |                               |
  |-- player:register ----------->|
  |<- {success, player} ---------|
  |                               |
  |-- room:create / room:join --->|
  |<- {success, room} -----------|
  |                               |
  |-- player:ready -------------->|
  |<- game:started (broadcast) --|
  |<- game:tiles (private) ------|
```

### Turn Flow
```
Client                          Server
  |                               |
  |-- game:drawTile ------------->|
  |<- {tile, fromDiscardOfPlayerId}|
  |<- game:tileDraw (broadcast) --|
  |                               |
  |-- game:openHand (optional) -->|
  |<- game:handOpened (broadcast)-|
  |                               |
  |-- game:addTileToSet (opt) --->|
  |<- game:tileAddedToSet --------|
  |                               |
  |-- game:discardTile ---------->|
  |<- game:tileDiscard (broadcast)|
  |<- game:nextTurn (broadcast) --|
```

### Round End
```
Server detects round end condition
    → emits game:roundEnded (results, scores)
    → 4-second timer → game:roundStarted (new round state)
```

## Key Abstractions

| Abstraction | Location | Purpose |
|-------------|----------|---------|
| `GameManager` | `hugo-server/src/utils/GameManager.ts` | Singleton store for all game state |
| `Game` | `hugo-server/src/models/Game.ts` | Full game engine: dealing, turns, sets, scoring |
| `Room` | `hugo-server/src/models/Room.ts` | Player grouping + game reference |
| `Player` | `hugo-server/src/models/Player.ts` | Per-player state: tiles, scores, penalties |
| `Tile` | `hugo-server/src/models/Tile.ts` | Tile value, color, status, visibility |
| `socketService` | `hugo-ui/src/services/socketService.js` | Singleton Socket.IO client wrapper |
| `useGameState` | `hugo-ui/src/hooks/useGameState.js` | Central client state store |

## Entry Points

- **Server**: `hugo-server/src/index.ts` — creates Express + Socket.IO server
- **Client**: `hugo-ui/src/main.jsx` → `App.jsx` — React app root

## Error Handling

- All socket events use acknowledgement callbacks with `{success, error}` shape
- Server wraps all handlers in try/catch, logs to console
- Client receives error in callback response
- No global error boundary on client (errors bubble to component level)

## Cross-Cutting Concerns

- **State serialization**: All models expose `toJSON()` / `toPublicJSON()` — public variants omit private data (e.g. other players' tiles)
- **Turn enforcement**: Server validates player turn + action state on every game event
- **Real-time sync**: State changes broadcast to entire room via `io.to(roomId).emit()`
- **Private data**: Tile hands sent only to individual socket via `io.to(player.socketId).emit()`