# External Integrations

**Analysis Date:** 2026-03-16

## APIs & External Services

**Game Communication:**
- Socket.IO (Real-time Multiplayer) - Custom game protocol
  - Server: `hugo-server/src/socket/socketHandler.ts`
  - Client: `hugo-ui/src/services/socketService.js`
  - Transport: WebSocket + HTTP fallback
  - Port: 3001 (development)

**REST API:**
- Basic health check endpoint: `GET /`
  - Returns: `{ message, version, status }`
  - Location: `hugo-server/src/index.ts`

## Data Storage

**Databases:**
- None - In-memory only
- Game state stored in memory on server
- Resets on server restart
- Location: `hugo-server/src/utils/GameManager.ts` (manages rooms and games)

**File Storage:**
- Local filesystem only (`hugo-ui/public/`)
- No cloud storage integration

**Caching:**
- None - Real-time game state via Socket.IO

## Authentication & Identity

**Auth Provider:**
- Custom/None - No external authentication service
- Player registration by username only
  - Method: Socket.IO emit `player:register`
  - No password, no token validation
  - Location: `hugo-ui/src/components/Login.jsx`, `hugo-ui/src/services/socketService.js`
  - Player ID: UUID v4 generated server-side

## Socket.IO Events

**Player Events:**
- `player:register` - Register new player
  - Emitted from: `hugo-ui/src/services/socketService.js` (line 28)
  - Server handler: `hugo-server/src/socket/socketHandler.ts`

- `player:ready` - Set player ready status
  - Emitted from: `hugo-ui/src/services/socketService.js` (line 78)

- `player:joined` - Broadcast when player joins room
  - Emitted from: `hugo-server/src/socket/socketHandler.ts`

- `player:left` - Broadcast when player leaves room

**Room Events:**
- `room:create` - Create new game room
  - Emitted from: `hugo-ui/src/services/socketService.js` (line 38)

- `room:join` - Join existing room
  - Emitted from: `hugo-ui/src/services/socketService.js` (line 47)

- `room:leave` - Leave current room
  - Emitted from: `hugo-ui/src/services/socketService.js` (line 56)

- `rooms:list` - Get list of available rooms
  - Emitted from: `hugo-ui/src/services/socketService.js` (line 65)

**Game Events:**
- `game:start` - Start game in room
  - Emitted from: `hugo-ui/src/services/socketService.js` (line 91)

- `game:started` - Broadcast game started
  - Listener: `hugo-ui/src/services/socketService.js` (line 142)

- `game:drawTile` - Draw tile from deck or discard pile
  - Emitted from: `hugo-ui/src/services/socketService.js` (line 108)

- `game:tileDraw` - Broadcast tile draw
  - Listener: `hugo-ui/src/services/socketService.js` (line 150)

- `game:discardTile` - Discard tile from hand
  - Emitted from: `hugo-ui/src/services/socketService.js` (line 122)

- `game:tileDiscard` - Broadcast tile discard
  - Listener: `hugo-ui/src/services/socketService.js` (line 154)

- `game:nextTurn` - Trigger next player's turn
  - Listener: `hugo-ui/src/services/socketService.js` (line 158)

- `game:requestTiles` - Request player's hand tiles
  - Emitted from: `hugo-ui/src/services/socketService.js` (line 174)

- `game:tiles` - Send player's hand tiles
  - Listener: `hugo-ui/src/services/socketService.js` (line 146)

- `game:openHand` - Player opens hand with initial sets
  - Emitted from: `hugo-ui/src/services/socketService.js` (line 190)

- `game:handOpened` - Broadcast hand opened
  - Listener: `hugo-ui/src/services/socketService.js` (line 196)

- `game:addTileToSet` - Add tile to existing set
  - Emitted from: `hugo-ui/src/services/socketService.js` (line 204)

- `game:tileAddedToSet` - Broadcast tile added to set
  - Listener: `hugo-ui/src/services/socketService.js` (line 210)

- `game:dropPer` - Drop "per" (special move)
  - Emitted from: `hugo-ui/src/services/socketService.js` (line 218)

- `game:perDropped` - Broadcast per dropped
  - Listener: `hugo-ui/src/services/socketService.js` (line 224)

- `game:stateChange` - Game state updated
  - Listener: `hugo-ui/src/services/socketService.js` (line 166)

- `game:roundEnded` - Round finished
  - Listener: `hugo-ui/src/services/socketService.js` (line 232)

- `game:roundStarted` - Round started
  - Listener: `hugo-ui/src/services/socketService.js` (line 240)

## Monitoring & Observability

**Error Tracking:**
- None detected

**Logs:**
- Console logs only
  - Development: `console.log()` in multiple files
  - Examples:
    - `hugo-ui/src/services/socketService.js` (lines 15, 24, 72, 102)
    - `hugo-server/src/index.ts` (lines 48-50)
  - No structured logging or log aggregation

## CI/CD & Deployment

**Hosting:**
- Self-hosted or local deployment
- No cloud platform integration detected

**CI Pipeline:**
- None detected
- No GitHub Actions, Travis CI, or similar

## Environment Configuration

**Required env vars (Backend):**
- `PORT` - Server port (default: 3001)
- `ORIGIN` - CORS origin (default: http://localhost:5173)
- `TEST_MODE` - Enable test mode (default: false)
- `AUTO_START_GAME` - Auto-start games (default: false)
- `CLIENT_URL` - Client URL (default: http://localhost:5173)

**Secrets location:**
- `.env` file in `hugo-server/` directory (NOT committed to version control)
- Currently no sensitive secrets (no API keys, tokens, passwords)

## Frontend Configuration

**Client-side Constants:**
- Socket server URL: `http://localhost:3001` (hardcoded in `hugo-ui/src/services/socketService.js` line 3)
- Should be configurable for production deployments

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

## CORS Configuration

**Enabled Origins:**
- `origin` from config (default: http://localhost:5173)
- Methods: GET, POST
- Credentials: Enabled

**Implementation:**
```typescript
// hugo-server/src/index.ts
cors({
    origin: config.origin,
    methods: ['GET', 'POST'],
    credentials: true
})
```

---

*Integration audit: 2026-03-16*
