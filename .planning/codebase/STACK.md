# Technology Stack

**Analysis Date:** 2026-03-16

## Languages

**Primary:**
- TypeScript 5.3.3 - Server-side logic, type-safe game engine
- JavaScript (ES6+) - Frontend React components, client utilities
- JSX - React component markup (`hugo-ui/src/components/`)

**Secondary:**
- CSS - Component styling (`hugo-ui/src/assets/css/`)

## Runtime

**Environment:**
- Node.js v23.11.0 (current development environment)

**Package Manager:**
- npm 10.9.2
- Lockfile: `package-lock.json` present in both `hugo-ui/` and `hugo-server/`

## Frameworks

**Core:**
- React 19.0.0 - UI framework, component-based architecture
  - Location: `hugo-ui/src/`
  - Usage: Login, Lobby, Room, Game components

- Express.js 4.18.3 - HTTP server framework
  - Location: `hugo-server/src/index.ts`
  - Usage: REST API with CORS support, Socket.IO integration

- Socket.IO 4.7.4 (server), 4.8.1 (client) - Real-time bidirectional communication
  - Server: `hugo-server/src/socket/socketHandler.ts`
  - Client: `hugo-ui/src/services/socketService.js`
  - Usage: Multiplayer game synchronization, room management, game events

**Build/Dev:**
- Vite 6.2.0 - Frontend build tool and dev server
  - Config: `hugo-ui/vite.config.js`
  - Port: 5173 (default dev port)
  - Plugins: @vitejs/plugin-react 4.3.4

- TypeScript 5.3.3 - Type checking and compilation
  - Config: `hugo-server/tsconfig.json`
  - Target: ES2020, Module: commonjs
  - Strict mode enabled

- nodemon 3.1.0 - Development server auto-reload
  - Watch: TypeScript source changes

- ts-node 10.9.2 - TypeScript execution in Node.js

## Key Dependencies

**Critical:**
- socket.io 4.7.4 - Real-time communication server
- socket.io-client 4.8.1 - Real-time communication client
- express 4.18.3 - HTTP server framework
- react 19.0.0 - Frontend UI library
- react-dom 19.0.0 - React DOM rendering

**Infrastructure:**
- uuid 9.0.1 - UUID generation for game entities (players, rooms, tiles, games)
  - Used in: `hugo-server/src/models/Player.ts`, `Game.ts`, `Tile.ts`, `Room.ts`

- cors 2.8.5 - CORS middleware
  - Configured in: `hugo-server/src/index.ts`
  - Allows requests from `http://localhost:5173` (dev)

- dotenv 16.4.5 - Environment variable loading
  - Loaded in: `hugo-server/src/config/config.ts`

- http (Node.js native) - HTTP server for Socket.IO integration

## Configuration

**Environment:**
- `.env` file used for configuration
- Located: `hugo-server/.env`
- Key variables:
  - `PORT` (default: 3001)
  - `ORIGIN` (default: http://localhost:5173)
  - `TEST_MODE` (default: false)
  - `AUTO_START_GAME` (default: false)
  - `CLIENT_URL` (default: http://localhost:5173)

**Build:**
- `hugo-server/tsconfig.json`: TypeScript compilation settings (strict mode, ES2020 target)
- `hugo-ui/vite.config.js`: Vite configuration with React plugin

## Platform Requirements

**Development:**
- Node.js v23.11.0 or compatible version
- npm 10.9.2 or compatible version
- Git (for version control)

**Production:**
- Node.js runtime (v18+ recommended based on ES2020 target)
- HTTP server deployment (typical: Docker, Node.js hosting, serverless)
- Connectivity for WebSocket (required for Socket.IO)

## Scripts

**Frontend (`hugo-ui/`):**
```bash
npm run dev      # Start Vite dev server on port 5173
npm run build    # Build production bundle
npm run lint     # ESLint code linting
npm run preview  # Preview production build
```

**Backend (`hugo-server/`):**
```bash
npm run dev        # Start with nodemon (auto-reload on file changes)
npm run debug      # Debug mode with Node inspector
npm run debug-brk  # Debug mode with breakpoint at startup
npm run build      # Compile TypeScript to `dist/`
npm run start      # Run compiled bundle (dist/index.js)
npm run test       # Not implemented
```

---

*Stack analysis: 2026-03-16*
