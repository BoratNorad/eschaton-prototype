# ESCHATON

Turn-based Cold War thermonuclear strategy for the browser. 7 coalitions, 8 live TRIGSITs, simultaneous orders.

## Run locally
    npm install
    npm start          # http://localhost:3000

## Tests
    npm run sim                 # 50 headless all-AI games, prints balance stats
    node test/socket.js         # (server running) 2-client lobby/chat/treaty/turn test
    node test/dom.js            # (server running) headless UI smoke test

## Files
- `server/config.js`: **every balance number**: costs, damage, income, escalation, abilities, TRIGSITs
- `server/territories.js`: country → coalition and per-country yields
- `server/game.js`: rules engine (simultaneous resolution)
- `server/ai.js`: rule-based AI
- `server/index.js`: Express + Socket.io (rooms, lobby, chat, timers)
- `public/`: client (d3-geo map, no build step)
