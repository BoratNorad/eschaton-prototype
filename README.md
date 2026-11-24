# ESCHATON

Turn-based Cold War thermonuclear strategy for the browser. 7 coalitions, 8 live TRIGSITs, simultaneous orders.

## Run locally
    npm install
    npm start          # http://localhost:3000

## Tests
    npm run sim                 # 50 headless all-AI games, prints balance stats
    node test/socket.js         # (server running) 2-client lobby/chat/treaty/turn test
    node test/dom.js            # (server running) headless UI smoke test
    node test/tutorial.js       # (server running) walks every tutorial step
    node test/replay.js out.png # (server running) simulates an AI war, tests replay viewer, renders share card
    node test/trigsits.js       # (server running) dossier page: markers, matrix, filters
    node test/restart.js        # spawns its own server, restarts it mid-tutorial, checks recovery

## How a game unfolds
1. **Lobby**: pick the country you will lead (this sets your coalition). AI heads of state fill the rest.
2. **World Summit** (turn 0): sign non-aggression pacts and trade agreements (+IND/+INF per turn). Ends when everyone is READY or time runs out.
3. **One opening TRIGSIT** ignites and the camera focuses on it. Parties can deploy, negotiate or withdraw; everyone else can mediate or back a side with aid (a proxy war that may drag them in).
4. **The world widens**: scheduled ignitions and spillover (defeats, nukes, betrayals, proxy aid, mobilization) set off dormant TRIGSITs; the map zooms out to fit them. The left rail lists all 21.
5. **Threat levels** (1 CRISIS → 5 GENERAL WAR) unlock by escalation *or* by how many TRIGSITs have ignited: spies → tactical nukes on troops → homeland strikes → strategic warheads.
6. The game ends when no TRIGSIT is active (not before turn 8). Best INDDIR/SUFDDIR ratio wins.

Tunables: `flow`, `threat`, `spillover`, `treaty`, `trigsit` in `server/config.js`. `node test/arc.js 200 [ai]` reports pacing.

## Modes
- **Multiplayer**: create a room, share the code, AI fills empty slots.
- **Tutorial**: solo training game with a step-by-step coach.
- **TRIGSIT Dossiers** (`/trigsits.html`): browse all 21 crises (one per pair of coalitions) on a map and a 7×7 pair matrix, with briefings. In-game, the CRISES tab lists them and flies the map to each.
- **AI War**: 21 fictional heads of state (3 per coalition), each with an archetype and traits
  (`server/personalities.js`), fight a full war instantly. Opens a replay viewer with an
  after-action report, downloadable share card (PNG) and copyable group-chat summary.
  Every finished multiplayer game also gets a replay link.

## Files
- `server/config.js`: **every balance number**: costs, damage, income, escalation, abilities, TRIGSITs
- `server/territories.js`: country → coalition and per-country yields
- `server/game.js`: rules engine (simultaneous resolution)
- `server/ai.js`: rule-based AI, steered by personality traits
- `server/personalities.js`: 24 fictional leaders, 8 archetypes, their lines
- `server/summary.js`: after-action report (headline, moments, awards, quotes)
- `server/simulate.js`: instant all-AI war
- `server/index.js`: Express + Socket.io (rooms, lobby, chat, timers)
- `public/`: client (d3-geo map, no build step)
