// Runs a full all-AI war instantly: every coalition filled to max with personality leaders.
const CONFIG = require('./config');
const Game = require('./game');

function simulate(id) {
  const g = new Game('SIM');
  g.mode = 'ai';
  g.start({ fillTo: CONFIG.maxPerCoalition, autoSummit: true });
  let guard = 0;
  while (g.phase !== 'over' && guard++ < CONFIG.maxTurns + 2) { g.resolve(); g.nextTurn(); }
  return g.toReplay(id);
}

module.exports = { simulate };
