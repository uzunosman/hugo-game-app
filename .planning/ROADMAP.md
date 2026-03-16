# Hugo Oyunu - Roadmap

**Created:** 2026-03-16
**Granularity:** Coarse
**Coverage:** 8/8 v1 requirements mapped

---

## Phases

- [ ] **Phase 1: Fix Scoring Multipliers** - Implement joker and Hugo round multipliers with unified calculation
- [ ] **Phase 2: Complete Scoring UI & Game Flow** - Display multipliers in UI and complete game flow (auto-Hugo, game end)

---

## Phase Details

### Phase 1: Fix Scoring Multipliers

**Goal:** Implement joker finishing penalty multiplier (×2), Hugo round multiplier (×4 combined), unified multiplier calculation, and star system (stars reduce roundTotal by 100 each).

**Depends on:** Nothing (foundation phase)

**Requirements:** PUAN-01, PUAN-02, PUAN-03

**Success Criteria** (what must be TRUE):
1. When a player finishes with joker, other players' penalty scores are multiplied by 2 in final round total
2. When a player finishes with joker in a Hugo round (1st, 5th, 9th), multiplier calculates as ×4 (Hugo ×2 + joker ×2)
3. Multiplier calculation is centralized in game logic (single source of truth), and all combinations (Hugo only, joker only, Hugo+joker) produce mathematically correct results
4. Round-end game state includes explicit multiplier field (e.g., `multiplier: 4`) for downstream UI consumption
5. Star system implemented: finisher earns stars based on bonus conditions (joker/Hugo/kimse açmadan), other players earn 1 star for 100+ point openings; each star deducts 100 from that round's roundTotal

**Plans:** 3 plans

Plans:
- [x] 01-01-PLAN.md — RoundResult interface + endRound() scoring logic in Game.ts
- [x] 01-02-PLAN.md — game:finishRound socket handler + game:roundEnd broadcast in socketHandler.ts
- [ ] 01-03-PLAN.md — Star system: Player.openingScore field + RoundResult.stars + endRound() star calculation

---

### Phase 2: Complete Scoring UI & Game Flow

**Goal:** Display all scoring multipliers in game UI (RoundSummary, Scoreboard), auto-detect fake joker as Hugo round, and complete game loop with end-game screen showing winner (lowest score).

**Depends on:** Phase 1

**Requirements:** PUAN-04, PUAN-05, PUAN-06, AKIS-01, AKIS-02

**Success Criteria** (what must be TRUE):
1. RoundSummary screen displays joker finishing multiplier as separate labeled row (e.g., "Joker Multiplier: ×2"), visible after round completes
2. Scoreboard displays all three scores per player (round score, penalty score, total score) correctly, with multipliers already applied
3. Scoreboard visually indicates which rounds had multipliers applied (Hugo or joker tags/badges visible)
4. When indicator tile is a fake joker, round automatically counts as Hugo round (×2 multiplier) without manual override
5. After 9th round completes, game end screen appears showing winner as player with lowest cumulative score

**Plans:** TBD

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Fix Scoring Multipliers | 2/3 | In progress | — |
| 2. Complete Scoring UI & Game Flow | 0/? | Not started | — |

---

## Context

- Phases derived from 8 v1 requirements in Scoring System and Game Flow categories
- Phase 1 fixes backend logic (multiplier calculation + star system); Phase 2 builds UI and completes game flow
- Natural dependency: UI cannot correctly display multipliers until calculation is fixed
- Coarse granularity applied: Two phases instead of one-per-requirement compression
