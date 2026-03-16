# Concerns: Hugo Game App

## Critical Issues

### 1. Excessive Debug Logging in Production Code
**Severity:** Medium
**Location:** `hugo-server/src/models/Player.ts:45-59`, `hugo-server/src/models/Game.ts:229-273`

`removeTile()` and `discardTile()` have extensive `console.log([DEBUG] ...)` statements that log every tile ID array on every operation. This will flood production logs and expose game state details.

**Risk:** Performance degradation in high-frequency operations, security info leak.

### 2. No Authentication or Session Persistence
**Severity:** High
**Location:** `hugo-server/src/socket/socketHandler.ts:12-36`

Players register with just a name — no authentication, no session tokens. If a player disconnects, their `playerId` is lost client-side and they cannot rejoin an active game. The `updatePlayerSocket` method exists in GameManager but is never called from the socket handler.

**Risk:** Players permanently lose game state on disconnect. No reconnection path.

### 3. Volatile In-Memory State — No Persistence
**Severity:** High
**Location:** `hugo-server/src/utils/GameManager.ts`

All game state (players, rooms, games) is stored in `Map` instances on the singleton. Server restart wipes all active games.

**Risk:** Any server crash or deploy loses all in-progress games.

### 4. setTimeout for Round Transitions
**Severity:** Medium
**Location:** `hugo-server/src/socket/socketHandler.ts:429-436`, `522-529`

`setTimeout(() => { if (!room.game) return; room.game.startNextRound(); ... }, 4000)` — the closure captures `room.game` at callback time but the guard `if (!room.game)` may be insufficient. If room is cleaned up between the discard and the 4-second callback, behavior is unpredictable.

**Risk:** Race condition causing null reference errors or double round starts.

## Tech Debt

### 5. Leftover Backup File
**Location:** `hugo-ui/src/components/Game.jsx.bak`

An old backup of Game.jsx exists in the components directory. Should be removed.

### 6. No Input Validation on Tile Count
**Location:** `hugo-server/src/models/Game.ts:172-186`

`dealTiles()` doesn't validate there are enough tiles in the deck before dealing. If somehow the deck is short, players silently receive fewer tiles.

### 7. `player.score` Field Unused
**Location:** `hugo-server/src/models/Player.ts:9`, `addScore()`, `resetScore()`

The `score` field and `addScore()`/`resetScore()` methods exist but scoring is done via `roundScores[]` array and `getTotalScore()`. The `score` field appears to be legacy and creates confusion.

### 8. No Room Size Limit Enforcement Visible
**Location:** `hugo-server/src/socket/socketHandler.ts:88-143`

`room:join` calls `gameManager.addPlayerToRoom()` — max player enforcement presumably lives in `Room.addPlayer()` but socket handler doesn't return a specific "room full" error vs. generic failure.

## Performance

### 9. Full Room List Broadcast on Every Room Change
**Location:** `hugo-server/src/socket/socketHandler.ts:70`, `127`, `181`, etc.

Every player join/leave/create broadcasts the full `rooms:list` to ALL connected clients via `io.emit()`. With many rooms and players, this becomes O(n×m) data transfer.

### 10. Sequential Set Validation (O(n²) in openHand)
**Location:** `hugo-server/src/models/Game.ts:334-355`

`openHand()` iterates all sets, and for each tile in each set calls `player.tiles.find()` — quadratic for large hands. Not a concern at current scale (max ~15 tiles) but worth noting.

## Security

### 11. PlayerId Sent by Client (Trusted Input)
**Location:** All socket events

Every game action sends `playerId` from the client. The server verifies this exists in GameManager but cannot verify the client isn't spoofing another player's ID. Authentication would fix this — for now, only the socket ID provides any identity binding (via `gameManager.getPlayerBySocketId`).

### 12. No Rate Limiting on Socket Events
**Location:** `hugo-server/src/socket/socketHandler.ts`

No throttling on socket events. A malicious client could spam `game:drawTile` or `game:discardTile` events.

## Fragile Areas

### 13. Round-End Race Condition
**Location:** `hugo-server/src/socket/socketHandler.ts:420-439`

Two paths can trigger round end: empty hand (via `game:discardTile`) and empty deck (checked in `game:drawTile`). Both paths emit `game:roundEnded` and schedule `startNextRound()`. If both fire in close succession, the second timer could call `startNextRound()` on an already-advanced round.

### 14. Client-side Set Validation Duplicated
**Location:** `hugo-ui/src/utils/gameUtils.js` and `hugo-server/src/models/Game.ts:665-740`

Set validation logic (same-number sets, sequential sets, okey/joker handling) exists both client-side (for UI feedback) and server-side (authoritative). These can drift out of sync as rules evolve.

**Risk:** Client shows "valid" but server rejects, or vice versa.