# Testing Patterns

**Analysis Date:** 2026-03-16

## Test Framework

**Runner:**
- Not configured - no test runner installed

**Assertion Library:**
- Not configured - no testing library present

**Run Commands:**
```bash
npm test              # Backend: "Error: no test specified && exit 1" (hugo-server/package.json)
npm test              # Frontend: no test script defined
```

**Current State:**
- No test files found in codebase (no `*.test.js`, `*.spec.js`, `*.test.ts`, or `*.spec.ts` files)
- No testing dependencies in either `hugo-ui/package.json` or `hugo-server/package.json`
- Zero test infrastructure established

## Test File Organization

**Location:**
- Not established - no test directory structure

**Naming:**
- Not established

**Structure:**
- Not established

## Test Structure

**Suite Organization:**
- Not currently used

**Patterns:**
- Not established

## Mocking

**Framework:**
- Not configured

**Patterns:**
- Not established

**What to Mock:**
- Not established

**What NOT to Mock:**
- Not established

## Fixtures and Factories

**Test Data:**
- Not established - no test utilities found

**Location:**
- Not established

## Coverage

**Requirements:**
- None enforced

**View Coverage:**
- No coverage tool configured

## Test Types

**Unit Tests:**
- Not implemented
- Candidates: `hugo-server/src/utils/gameUtils.js` (if created), model validation methods

**Integration Tests:**
- Not implemented
- Candidates: Game state changes across multiple operations

**E2E Tests:**
- Not implemented
- Framework: Not used

## Testing Recommendations for Implementation

**Priority Areas:**

### High Priority (Core Logic)
**Backend Game Logic** - `hugo-server/src/models/Game.ts`
- Test set validation methods:
  - `validateSetTiles()` (line 665-675)
  - `validateSameNumberSetTiles()` (line 677-694)
  - `validateSequentialSetTiles()` (line 696-740)
- Test game actions:
  - `openHand()` (line 304-401) - complex business rules
  - `addTileToSet()` (line 411-541) - okey swapping and penalties
  - `drawTile()` and `discardTile()` (line 196-277) - turn logic

**Frontend State Management** - `hugo-ui/src/hooks/useGameState.js`
- Test state synchronization from server
- Test tile position updates
- Test round end result handling

### Medium Priority (Integration)
**SocketService** - `hugo-ui/src/services/socketService.js`
- Test connect/disconnect lifecycle
- Test emit-response patterns

**Game Flow** - `hugo-server/src/utils/GameManager.ts`
- Test room creation and player management
- Test game initialization

### Low Priority (Utilities)
**Game Utilities** - `hugo-ui/src/utils/gameUtils.js`
- Pure function testing for `getOrderedPlayers()`, `getOkeyValue()`, etc.

## Suggested Testing Setup

### Framework Choice
1. **Backend:** Jest (Node.js TypeScript testing standard)
2. **Frontend:** Vitest (modern, Vite-native alternative to Jest)

### Implementation Steps
1. Install testing framework and assertion library
2. Add test scripts to package.json files
3. Create test directory structure
4. Add critical path tests (validation, game state)
5. Establish minimum coverage targets (60-70%)

### Test Pattern Templates

**Backend Model Test (Jest + TypeScript):**
```typescript
describe('Game.validateSetTiles', () => {
  let game: Game;

  beforeEach(() => {
    game = new Game([new Player('Test', 'socket1')]);
  });

  it('should validate same number sets correctly', () => {
    // Test implementation
  });
});
```

**Frontend Hook Test (Vitest + React Testing Library):**
```javascript
import { renderHook, act } from '@testing-library/react';
import useGameState from '../hooks/useGameState';

describe('useGameState', () => {
  it('should initialize with room game state', () => {
    // Test implementation
  });
});
```

---

*Testing analysis: 2026-03-16*
