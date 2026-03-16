---
phase: 01-fix-scoring-multipliers
plan: 01
subsystem: api
tags: [typescript, scoring, multiplier, game-logic]

# Dependency graph
requires: []
provides:
  - "RoundResult interface with isFinisher, effectiveHandScore, rawTotal, isHugoRound, finishedWithJoker fields"
  - "endRound(finisherPlayerId?) method with correct joker×2, Hugo×2, closed-hand 400/800 logic"
  - "finishedWithJoker: boolean field on Game class"
  - "private initializeRound() helper method"
affects: [02-game-ui-flow, socketHandler.ts]

# Tech tracking
tech-stack:
  added: []
  patterns: ["endRound() as single source of truth for all scoring multiplier logic"]

key-files:
  created: []
  modified:
    - hugo-server/src/models/Game.ts

key-decisions:
  - "finisherPlayerId parameter made optional (finisherPlayerId?) with fallback to this.finisherPlayerId so socketHandler.ts callers (Plan 02) don't break before migration"
  - "jokerMult applies ONLY to handScore, not penaltyScore — as specified in CONTEXT.md"
  - "hugoMult applies to entire rawTotal (handScore + penaltyScore + openBonus + finishBonus)"
  - "Closed hand penalty: 800 when noOtherPlayersOpened, 400 otherwise"
  - "Hand tile bug fixed: tile.value * 10 (was * 2)"

patterns-established:
  - "endRound() centralizes all scoring: never compute round scores outside this method"
  - "multiplier = hugoMult * jokerMult as single display value (1, 2, or 4)"
  - "effectiveHandScore = handScore * jokerMult (component separation pattern)"

requirements-completed: [PUAN-01, PUAN-02, PUAN-03]

# Metrics
duration: 3min
completed: 2026-03-16
---

# Phase 1 Plan 01: Fix Scoring Multipliers Summary

**endRound() rewritten in Game.ts with correct tile×10 scoring, joker×2 on handScore only, Hugo×2 on rawTotal, and closed-hand 400/800 penalty — all centralized in a single method**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-16T18:10:58Z
- **Completed:** 2026-03-16T18:13:52Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Replaced incorrect `RoundResult` interface with complete schema including `isFinisher`, `effectiveHandScore`, `rawTotal`, `isHugoRound`, `finishedWithJoker` fields
- Rewrote `endRound()` with correct multiplier logic: joker×2 applied only to handScore, Hugo×2 applied to rawTotal, combined Hugo+joker = ×4 on handScore
- Fixed hand tile scoring bug (`tile.value * 2` → `tile.value * 10`)
- Implemented closed-hand penalty logic (800 when no other players opened, 400 otherwise)
- Added `finishedWithJoker: boolean` state field on Game class
- Added `private initializeRound()` helper for between-round reset

## Task Commits

1. **Task 1 + Task 2: RoundResult interface, finishedWithJoker field, endRound() method** - `01e6692` (feat)

Note: Tasks 1 and 2 were committed together because the new RoundResult interface broke the old endRound() method, making the intermediate state non-compilable. Both tasks were applied to Game.ts atomically.

**Plan metadata:** (created after this commit)

## Files Created/Modified
- `hugo-server/src/models/Game.ts` - New RoundResult interface, finishedWithJoker field, rewritten endRound(), new initializeRound() helper

## Decisions Made
- Made `finisherPlayerId` parameter optional (`finisherPlayerId?`) with fallback to `this.finisherPlayerId`. This prevents breaking the two existing `socketHandler.ts` call sites (which will be migrated in Plan 02 as specified).
- Kept `startNextRound()` method intact — it is still referenced by socketHandler.ts and will be refactored in Plan 02.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Made finisherPlayerId parameter optional to preserve compilation**
- **Found during:** Task 2 (endRound implementation)
- **Issue:** The plan specified `endRound(finisherPlayerId: string)` but socketHandler.ts has 2 call sites calling `endRound()` with no arguments. The plan explicitly states socketHandler.ts is NOT touched until Plan 02, so changing the method signature to require an argument would break compilation.
- **Fix:** Changed parameter to optional (`finisherPlayerId?`) with `const resolvedFinisherId = finisherPlayerId ?? this.finisherPlayerId ?? ''`. Existing callers still work; Plan 02 callers can pass the explicit ID.
- **Files modified:** hugo-server/src/models/Game.ts
- **Verification:** `npx tsc --noEmit` exits 0
- **Committed in:** 01e6692

**2. [Rule 1 - Bug] Tasks 1 and 2 committed atomically**
- **Found during:** Task 1 verification (tsc check)
- **Issue:** Replacing the RoundResult interface removed `penaltyEntries` and added new required fields. The existing `endRound()` body used `penaltyEntries` in the result object, causing a TypeScript error. Task 1 alone could not compile until Task 2's endRound() rewrite was applied.
- **Fix:** Applied both tasks and committed together since the intermediate state (new interface + old method) is non-compilable by design.
- **Files modified:** hugo-server/src/models/Game.ts
- **Verification:** `npx tsc --noEmit` exits 0 after combined commit

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug/compile dependency)
**Impact on plan:** Both auto-fixes are necessary for correct compilation. No scope creep. The optional parameter preserves backward compatibility for Plan 02.

## Issues Encountered
None — all issues resolved via auto-fix deviation rules.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Game.ts endRound() is the single source of truth for scoring — ready for Plan 02
- socketHandler.ts still calls old `endRound()` pattern (no args, calls startNextRound() separately) — Plan 02 will migrate these call sites to pass finisherPlayerId and remove the separate startNextRound() call
- `finishedWithJoker` flag exists on Game but is not yet set anywhere in socketHandler.ts — Plan 02 must set it before calling endRound()

## Self-Check: PASSED
- Game.ts: FOUND
- SUMMARY.md: FOUND
- Commit 01e6692: FOUND

---
*Phase: 01-fix-scoring-multipliers*
*Completed: 2026-03-16*
