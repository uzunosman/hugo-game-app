# Coding Conventions

**Analysis Date:** 2026-03-16

## Naming Patterns

**Files:**
- Backend TypeScript models: PascalCase (e.g., `Game.ts`, `Player.ts`, `Tile.ts`)
- Frontend React components: PascalCase (e.g., `Game.jsx`, `Tile.jsx`, `GameBoard.jsx`)
- Utilities and services: camelCase (e.g., `gameUtils.js`, `socketService.js`, `tileHandlers.js`)
- Hooks: camelCase with `use` prefix (e.g., `useGameState.js`, `useGameSocket.js`)

**Functions:**
- Public methods: camelCase (e.g., `drawTile()`, `discardTile()`, `openHand()`)
- Private methods: camelCase with leading underscore (e.g., `_initializeGame()`, `_createTiles()`)
- React components: PascalCase function names (e.g., `function Game()`, `function Tile()`)
- Utility functions: camelCase, exported as named exports (e.g., `export const getOrderedPlayers()`)

**Variables:**
- Local variables: camelCase (e.g., `selectedTile`, `tilePositions`, `gameState`)
- Constants: SCREAMING_SNAKE_CASE (e.g., `SOCKET_URL`, `HUGO_ROUNDS`)
- React state: camelCase with explicit setter (e.g., `const [tiles, setTiles]`)
- Instance properties: camelCase (e.g., `this.id`, `this.players`, `this.deck`)

**Types & Enums:**
- TypeScript enums: PascalCase with SCREAMING_SNAKE_CASE values (e.g., `enum GameStatus { WAITING = 'waiting' }`)
- TypeScript interfaces: PascalCase (e.g., `interface RoundResult`, `interface TableSet`)
- Type aliases: PascalCase (e.g., `Record<string, any>`)

## Code Style

**Formatting:**
- No explicit formatter configured (Prettier not present in devDependencies)
- Code uses ES6+ syntax with consistent indentation
- Quote style: single quotes for strings in TypeScript/JavaScript

**Linting:**
- ESLint 9.21.0 configured for JavaScript/JSX files
- Config file: `hugo-ui/eslint.config.js` (new flat config format)
- Rules enforced:
  - `no-unused-vars`: Error, ignores variables starting with uppercase or underscore (`varsIgnorePattern: '^[A-Z_]'`)
  - `react-refresh/only-export-components`: Warning, allows constant exports
  - React Hooks recommended rules enforced
  - JavaScript recommended rules applied

**TypeScript:**
- Strict mode enabled: `"strict": true`
- Target: ES2020
- Module system: CommonJS for backend, ESM for frontend
- Config location: `hugo-server/tsconfig.json`

## Import Organization

**Order:**
1. External libraries (e.g., `import React`, `import { io } from 'socket.io-client'`)
2. Internal models/types (e.g., `import { Player }`, `import { Game }`)
3. Internal utilities (e.g., `import { GameManager }`)
4. CSS/Assets (e.g., `import '../../assets/css/components/Tile.css'`)

**Path Aliases:**
- Not explicitly configured
- Relative imports used throughout (e.g., `../models/`, `../../hooks/`)

**Export Style:**
- Named exports for utilities and services (e.g., `export const getOrderedPlayers()`)
- Default export for React components (e.g., `export default function Game()`)
- Class-based exports for TypeScript models (e.g., `export class Game`)

## Error Handling

**Patterns:**
- Return object pattern for success/error responses:
  ```typescript
  {
    success: boolean;
    error?: string;
    data?: any;
  }
  ```
- Null checks using optional chaining (e.g., `const tile = this.deck.pop()`)
- Conditional validation before operations (e.g., `if (!player || !this.isPlayerTurn(playerId)) return null`)
- No try-catch blocks observed; functions return null/false on failure

**Location Examples:**
- `hugo-server/src/models/Game.ts` (lines 304-401): `openHand()` demonstrates success/error pattern
- `hugo-server/src/utils/GameManager.ts` (lines 105-126): `addPlayerToRoom()` shows conditional validation

## Logging

**Framework:** `console` object (no logging library used)

**Patterns:**
- Debug logging for game state changes: `console.log('[DEBUG] ...')`
- Error logging: `console.error(...)`
- Standard logging: `console.log(...)`

**When to Log:**
- Game action verification (e.g., tile draw, discard, hand open)
- State transitions (e.g., turn changes)
- Error conditions
- Socket connection events

**Location Examples:**
- `hugo-server/src/models/Game.ts` (lines 229-275): Extensive `[DEBUG]` logging in `discardTile()`
- `hugo-server/src/models/Player.ts` (lines 45-59): Debug logging in `removeTile()`
- `hugo-ui/src/services/socketService.js` (lines 15-16): Connection logging

## Comments

**When to Comment:**
- Complex algorithms (e.g., Fisher-Yates shuffle, set validation)
- Non-obvious game rule implementations (e.g., Hugo round detection)
- TODO/FIXME notes (85 console.log calls found but no TODO comments observed)
- Business logic explanations (e.g., penalty scoring rules)

**JSDoc/TSDoc:**
- Used sparingly in frontend utilities
- Example from `hugo-ui/src/utils/gameUtils.js`:
  ```javascript
  /**
   * Oyuncuları mevcut oyuncuyu baz alarak sıralar
   * @param {Array} players - Tüm oyuncular
   * @param {String} currentPlayerId - Mevcut oyuncunun ID'si
   * @returns {Array} - Sıralanmış oyuncular
   */
  export const getOrderedPlayers = (players, currentPlayerId) => { ... }
  ```
- No JSDoc observed in TypeScript server code
- Frontend React components use comment blocks for descriptions:
  ```javascript
  /**
   * Ana Oyun bileşeni
   * @param {Object} props - Bileşen özellikleri
   */
  function Game({ player, room }) { ... }
  ```

## Function Design

**Size:**
- Generally 10-50 lines for utility functions
- Model methods range 20-100+ lines for complex logic (e.g., `addTileToSet()` at 130+ lines)
- Private validation methods typically 15-30 lines

**Parameters:**
- Functions accept specific parameters rather than large config objects
- Callbacks used for async operations (e.g., `callback(response)` in socketService)
- Default parameters used for optional values (e.g., `fromDiscard: boolean = false`)

**Return Values:**
- Consistency required across codebase
- Game actions return success/error objects with data:
  ```typescript
  {
    success: boolean;
    error?: string;
    newSets?: TableSet[];
    remainingTiles?: Record<string, any>[];
  }
  ```
- Queries return null/undefined on failure (e.g., `getPlayerById()` returns `Player | undefined`)

## Module Design

**Exports:**
- Classes: `export class ClassName { ... }`
- Functions: `export const functionName = () => { ... }`
- Enums: `export enum EnumName { ... }`
- Interfaces: `export interface InterfaceName { ... }`

**Barrel Files:**
- Not used; direct imports from files

**File Responsibility:**
- One model/class per file (e.g., `Game.ts`, `Player.ts`)
- Utilities grouped by domain (e.g., `gameUtils.js` for game logic, `tileHandlers.js` for UI tile operations)
- Services encapsulate specific concerns (e.g., `socketService.js` for WebSocket communication)

---

*Convention analysis: 2026-03-16*
