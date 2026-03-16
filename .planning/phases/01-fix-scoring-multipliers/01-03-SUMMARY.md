---
phase: 01-fix-scoring-multipliers
plan: 03
subsystem: api
tags: [typescript, scoring, stars, game-rules]

# Dependency graph
requires:
  - phase: 01-fix-scoring-multipliers
    provides: endRound() with multiplier logic (01-01), socket handler wiring (01-02)
provides:
  - Player.openingScore field tracking first-hand-open value for star eligibility
  - RoundResult.stars field in Game.ts interface
  - Star calculation in endRound(): finisher gets 1*joker*hugo*closed stars; non-finisher gets 1 star if openingScore >= 100
  - roundTotal formula updated to Math.max(0, preMult - stars * 100)
affects: [phase-02-ui-flow, frontend-scoreboard, round-summary-display]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "openingScore tracked separately from lastOpenedValue: set once on first open, used for star eligibility"
    - "Star multipliers: each bonus condition (joker/hugo/closed) doubles finisher stars"
    - "roundTotal = Math.max(0, preMult - stars*100): stars reduce score, minimum 0"

key-files:
  created: []
  modified:
    - hugo-server/src/models/Player.ts
    - hugo-server/src/models/Game.ts

key-decisions:
  - "openingScore guard: if (openingScore === 0) ensures only first open sets the value, subsequent openHand calls for same player in same round are ignored"
  - "Non-finisher star threshold: player.openingScore >= 100 (not lastOpenedValue) to correctly use the first-opening value"
  - "Math.max(0, preMult - stars*100): finisher always scores 0 or above regardless of star count"

patterns-established:
  - "Star multiplier pattern: base 1, each bonus condition multiplies by 2 (joker, hugo, closed) — max 8 stars"
  - "Two-branch star logic: isFinisher branch uses game-state flags; non-finisher uses player.openingScore"

requirements-completed: [PUAN-01, PUAN-02, PUAN-03]

# Metrics
duration: 8min
completed: 2026-03-16
---

# Phase 01 Plan 03: Star System Summary

**Star scoring added to backend: Player.openingScore field, RoundResult.stars, and endRound() formula updated to Math.max(0, preMult - stars*100)**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-16T19:52:00Z
- **Completed:** 2026-03-16T20:00:54Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `openingScore: number` to Player class (field, constructor init, resetForNewRound reset, toPublicJSON exposure)
- Added `stars: number` to RoundResult interface in Game.ts
- Implemented `openHand()` guard to set `player.openingScore` only on first hand opening
- Implemented complete star calculation in `endRound()`: finisher earns 1 × jokerStarMult × hugoStarMult × closedStarMult; non-finisher earns 1 star if openingScore >= 100
- Updated `roundTotal` formula from `rawTotal * hugoMult` to `Math.max(0, preMult - (stars * 100))`

## Task Commits

Each task was committed atomically:

1. **Task 1: Player.ts'e openingScore field ekle** - `9b77128` (feat)
2. **Task 2: Game.ts'e openingScore set etme + RoundResult.stars + endRound() yıldız hesabı** - `03dc45f` (feat)

## Files Created/Modified
- `hugo-server/src/models/Player.ts` - Added openingScore field (declaration, constructor, resetForNewRound, toPublicJSON)
- `hugo-server/src/models/Game.ts` - Added stars to RoundResult interface, openingScore set in openHand(), full star calculation and updated roundTotal formula in endRound()

## Decisions Made
- Used `player.openingScore === 0` guard in `openHand()` to detect first open: safe because openingScore is reset to 0 in `resetForNewRound()` each round
- Used `player.openingScore >= 100` for non-finisher star check (not `lastOpenedValue`): openingScore explicitly named for this purpose, while lastOpenedValue updates on every successive open call

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Star system fully implemented in backend
- `RoundResult.stars` field available for frontend RoundSummary display in Phase 2
- Phase 2 can now show star indicators in scoreboard and round summary components

---
*Phase: 01-fix-scoring-multipliers*
*Completed: 2026-03-16*
