// Balance report for the escalation arc: how fast the threat level climbs, how many crises ignite, how games end.
// Usage: node test/arc.js [games] [mode]   mode = human (2 per coalition, default) | ai (3 per coalition)
const Game = require('../server/game');
const CONFIG = require('../server/config');
const N = Number(process.argv[2]) || 200, AIWAR = process.argv[3] === 'ai';
const o = { turns: 0, start: 0, ignited: 0, esch: 0, tierHist: [0, 0, 0, 0, 0, 0], tierTurn: [[], [], [], [], [], []], causes: {}, ends: {} };
for (let i = 0; i < N; i++) {
  const g = new Game('A'); const h = g.addPlayer('x'); g.removePlayer(h.id);
  g.start(AIWAR ? { fillTo: CONFIG.maxPerCoalition } : {});
  o.start += g.activeTrigsits().length;
  while (g.phase !== 'over') { g.resolve(); g.nextTurn(); }
  o.turns += g.turn; o.tierHist[g.tier]++;
  o.ignited += g.chronicle.filter((e) => e.t === 'spawn').length;
  for (const e of g.chronicle.filter((e) => e.t === 'tier')) o.tierTurn[e.level].push(e.turn);
  for (const e of g.chronicle.filter((e) => e.t === 'spawn')) { const k = e.cause.split(' ')[0]; o.causes[k] = (o.causes[k] || 0) + 1; }
  o.ends[g.endReason.split(' ')[0]] = (o.ends[g.endReason.split(' ')[0]] || 0) + 1;
}
const avg = (a) => (a.length ? (a.reduce((s, x) => s + x, 0) / a.length).toFixed(1) : '-');
console.log(`${N} ${AIWAR ? 'AI-war' : 'standard'} games | avg turns ${(o.turns / N).toFixed(1)} | start crises ${(o.start / N).toFixed(1)} | ignited later ${(o.ignited / N).toFixed(1)}`);
console.log('final threat level:', o.tierHist.slice(1).map((n, i) => `L${i + 1}:${Math.round((n / N) * 100)}%`).join(' '));
console.log('avg turn reached:', [2, 3, 4, 5].map((l) => `L${l}@T${avg(o.tierTurn[l])} (${Math.round((o.tierTurn[l].length / N) * 100)}%)`).join('  '));
console.log('ends:', o.ends, '| spillover causes:', o.causes);
