---
phase: 01-fix-scoring-multipliers
plan: 02
subsystem: api
tags: [socket.io, typescript, game-logic, scoring]

# Dependency graph
requires:
  - phase: 01-01
    provides: endRound() method with multiplier calculation and RoundResult interface in Game.ts
provides:
  - game:finishRound socket event handler in socketHandler.ts
  - game:roundEnd room broadcast with RoundResult[] including multiplier field
  - game:newRound and per-player game:tiles broadcast after round advance
affects:
  - 02-ui-and-flow (frontend will consume game:roundEnd and game:newRound events)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Set finishedWithJoker flag on game before calling endRound() to propagate joker multiplier"
    - "Capture finishedWithJoker from results array after endRound() resets the game field"
    - "completedRound = game.status === 'finished' ? game.round : game.round - 1 (endRound increments internally)"

key-files:
  created: []
  modified:
    - hugo-server/src/socket/socketHandler.ts

key-decisions:
  - "Read finishedWithJoker from results[0] in broadcast rather than game.finishedWithJoker (reset to false by endRound)"
  - "Emit game:roundEnd to all room members, then conditionally emit game:tiles and game:newRound only if game not finished"

patterns-established:
  - "Socket handler checks player turn before any game mutation"
  - "Tile found in player.tiles before discarding to capture isJoker flag"

requirements-completed:
  - PUAN-01
  - PUAN-02
  - PUAN-03

# Metrics
duration: 8min
completed: 2026-03-16
---

# Phase 01 Plan 02: Fix Scoring Multipliers - Socket Handler Integration Summary

**game:finishRound socket handler wired to endRound() scoring engine — joker multiplier flag set pre-call, RoundResult[] broadcast to room via game:roundEnd with multiplier field**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-16T00:00:00Z
- **Completed:** 2026-03-16T00:08:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added `import { RoundResult } from '../models/Game'` to socketHandler.ts
- Implemented `game:finishRound` handler that validates player turn, locates tile, sets `game.finishedWithJoker` from `finishTile.isJoker`, then calls `game.endRound(playerId)`
- Broadcast `game:roundEnd` to entire room with complete RoundResult[] including `multiplier`, `isHugoRound`, `finishedWithJoker` fields
- Conditionally emit per-player `game:tiles` and room-wide `game:newRound` when game status is not `'finished'`
- TypeScript compilation passes with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Add game:finishRound socket handler to socketHandler.ts** - `cd3585c` (feat)

**Plan metadata:** (to be committed with SUMMARY.md and STATE.md)

## Files Created/Modified
- `hugo-server/src/socket/socketHandler.ts` - Added RoundResult import and game:finishRound handler with game:roundEnd, game:tiles, game:newRound broadcasts

## Decisions Made
- Read `finishedWithJoker` from `results[0]?.finishedWithJoker` for the broadcast payload instead of `game.finishedWithJoker` directly, because `endRound()` resets the field to `false` before returning — the value is preserved in each RoundResult object
- Used `completedRound = game.status === 'finished' ? game.round : game.round - 1` because `endRound()` increments `this.round` internally when advancing to next round

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend scoring pipeline is fully wired: client emits `game:finishRound` → server sets joker flag → `endRound()` computes multiplied scores → `game:roundEnd` broadcast delivers RoundResult[] to all players
- Frontend (Phase 2) can now consume `game:roundEnd` to display RoundSummary with multiplier indicators and update Scoreboard

---
*Phase: 01-fix-scoring-multipliers*
*Completed: 2026-03-16*
