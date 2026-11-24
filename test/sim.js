// Headless all-AI simulation: runs N full games and prints outcome stats.
// Usage: node test/sim.js [games]
const Game = require('../server/game');
const N = Number(process.argv[2]) || 50;
const tally = { wins: {}, reasons: {}, turns: 0, maxEsc: 0, strikes: 0 };
for (let i = 0; i < N; i++) {
  const g = new Game('SIM' + i);
  const h = g.addPlayer('tester');
  g.removePlayer(h.id); // pure AI game
  g.start({ autoSummit: true });
  let peak = 0;
  while (g.phase !== 'over') {
    const r = g.resolve();
    tally.strikes += r.anims.length;
    peak = Math.max(peak, g.escalation);
    g.nextTurn();
  }
  tally.wins[g.winner] = (tally.wins[g.winner] || 0) + 1;
  tally.reasons[g.endReason] = (tally.reasons[g.endReason] || 0) + 1;
  tally.turns += g.turn;
  tally.maxEsc += peak;
  if (i === 0) {
    console.log('Sample game final scoreboard:');
    for (const c of Game.COALS) console.log(`  ${c.padEnd(9)} inf ${String(g.scores[c].inflicted).padStart(4)}  suf ${String(g.scores[c].suffered).padStart(4)}  ratio ${g.ratio(c).toFixed(2)}`);
    console.log('  trigsits:', g.trigsits.map((t) => `${t.id}:${t.how}${t.winner ? '(' + t.winner + ')' : ''}`).join(' '));
  }
}
console.log(`\n${N} games | avg turns ${(tally.turns / N).toFixed(1)} | avg peak escalation ${(tally.maxEsc / N).toFixed(1)} | avg missiles/game ${(tally.strikes / N).toFixed(1)}`);
console.log('end reasons:', tally.reasons);
console.log('winners:', tally.wins);
