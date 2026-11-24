// Builds the stylized after-action report from a finished game's chronicle.
const CONFIG = require('./config');

const pickOne = (a) => a[Math.floor(Math.random() * a.length)];

function build(game, replay) {
  const players = new Map(replay.players.map((p) => [p.id, p]));
  const who = (pid) => {
    const p = players.get(pid);
    if (!p) return 'An unknown commander';
    return p.persona ? `${p.persona.title} ${p.name}` : p.name;
  };
  const ch = game.chronicle;
  const strikes = ch.filter((e) => e.t === 'strike');
  const trig = ch.filter((e) => e.t === 'trigsit');
  const betrayals = ch.filter((e) => e.t === 'betray');
  const signs = ch.filter((e) => e.t === 'sign');
  const eschaton = ch.find((e) => e.t === 'eschaton');
  const quotes = ch.filter((e) => e.t === 'quote');
  const final = replay.final;
  const winner = final.winner;
  const winRatio = final.scoreboard[0].ratio;

  const stats = {
    turns: final.turn,
    nukes: replay.players.reduce((s, p) => s + p.stats.nukes, 0),
    intercepted: strikes.filter((s) => s.intercepted).length,
    damage: final.scoreboard.reduce((s, r) => s + r.inflicted, 0),
    glassed: Object.values(game.territories).filter((t) => t.hp <= 0).length,
    betrayals: betrayals.length,
    pacts: signs.length,
    peace: trig.filter((t) => t.how === 'peace').length,
    military: trig.filter((t) => t.how === 'military').length,
    frozen: trig.filter((t) => t.how === 'timer').length,
    peakEsc: Math.max(...replay.frames.map((f) => f.esc)),
    leaders: replay.players.length,
    ignited: ch.filter((e) => e.t === 'spawn').length,
    maxTier: Math.max(1, ...ch.filter((e) => e.t === 'tier').map((e) => e.level)),
  };

  // ---------- headline
  let headline, dek, stamp = 'DECLASSIFIED';
  if (eschaton) {
    headline = `THE WORLD ENDED ON TURN ${stats.turns}`;
    dek = `${who(eschaton.by)} of ${eschaton.c} launched the strike that broke the meter. Every silo opened. In the ashes, ${winner} somehow came out ahead.`;
    stamp = 'MUTUALLY ASSURED';
  } else if (stats.nukes === 0) {
    headline = 'NOT ONE WARHEAD FLEW';
    dek = `All ${trig.length} crises ended without a mushroom cloud. ${winner} won the long game on the battlefield.`;
  } else if (stats.peace >= stats.military && stats.peace >= stats.frozen) {
    headline = 'COOLER HEADS PREVAILED';
    dek = `${stats.nukes} warheads flew, but ${stats.peace} of ${trig.length} crises ended at the negotiating table. ${winner} played the board best.`;
  } else if (stats.military >= stats.frozen) {
    headline = 'THE CRISES WERE SETTLED BY FORCE';
    dek = `${stats.military} flashpoints fell to armies, not diplomats. ${stats.nukes} warheads lit the sky. ${winner} walked out on top.`;
  } else {
    headline = 'A FROZEN WORLD';
    dek = `Nobody blinked and nobody won: ${stats.frozen} crises simply ran out the clock. ${winner} edged the ratio.`;
  }

  // ---------- key moments
  const moments = [];
  const M = (turn, weight, icon, title, text) => moments.push({ turn, weight, icon, title, text });
  const first = strikes.find((s) => s.first);
  if (first) M(first.turn, 9, '☢', 'FIRST BLOOD', `${who(first.by)} (${first.c}) opens the nuclear age with a ${first.kind} strike on ${first.target || first.defC}${first.intercepted ? ', and it is shot down' : ` for ${first.dmg} damage`}.`);
  const biggest = strikes.filter((s) => !s.intercepted).sort((a, b) => b.dmg - a.dmg)[0];
  if (biggest && biggest !== first) M(biggest.turn, 7, '💥', 'HEAVIEST BLOW', `${who(biggest.by)} (${biggest.c}) hits ${biggest.target} for ${biggest.dmg} damage${biggest.ret ? ' in automated retaliation' : ''}.`);
  for (const g of strikes.filter((s) => s.glass).slice(0, 2)) M(g.turn, 6, '🔥', `${(g.target || '').toUpperCase()} IS GLASS`, `${who(g.by)} (${g.c}) wipes ${g.target} off the map.`);
  for (const b of betrayals.slice(0, 3)) M(b.turn, 8, '🗡', 'BETRAYAL', `${who(b.by)} (${b.c}) tears up the non-aggression pact with ${b.victim}.`);
  if (signs[0]) M(signs[0].turn, 4, '🤝', 'FIRST PACT', `${signs[0].a} and ${signs[0].b} sign a non-aggression pact.`);
  // 21 crises would swamp the timeline: keep the 5 most dramatic (force > peace > frozen, earliest first)
  const howRank = { military: 0, peace: 1, timer: 2 };
  for (const t of trig.slice().sort((x, y) => howRank[x.how] - howRank[y.how] || x.turn - y.turn).slice(0, 5)) {
    if (t.how === 'peace') M(t.turn, 5, '🕊', t.name, `Settled at the table by ${t.negotiators.length} negotiator${t.negotiators.length === 1 ? '' : 's'}.`);
    else if (t.how === 'military') M(t.turn, 5, '⚔', t.name, `${t.winner} wins by force against ${t.sides.find((s) => s !== t.winner)}.`);
    else M(t.turn, 3, '⌛', t.name, 'The clock runs out. A frozen conflict.');
  }
  for (const e of ch.filter((x) => x.t === 'tier' && x.level >= 3)) M(e.turn, 7, '⚠', `THREAT LEVEL ${e.level}: ${e.name}`, CONFIG.threat.tiers[e.level - 1].unlocks);
  for (const e of ch.filter((x) => x.t === 'spawn' && !/^The world/.test(x.cause)).slice(0, 3)) M(e.turn, 6, '🔥', `${e.name} IGNITES`, `${e.cause}.`);
  const caught = ch.find((e) => e.t === 'spycaught');
  if (caught) M(caught.turn, 3, '🕵', 'AGENT BURNED', `A ${caught.c} spy is caught red-handed inside ${caught.target}.`);
  const hot = replay.frames.find((f) => f.esc >= 7);
  if (hot && !eschaton) M(hot.turn, 6, '🚨', 'BRINK', `Escalation hits ${hot.esc}. Launch-on-warning systems go live worldwide.`);
  if (eschaton) M(eschaton.turn, 10, '☢', 'ESCHATON', `${who(eschaton.by)}'s strike pushes escalation to ${CONFIG.escalation.max}. Full exchange.`);
  const keyMoments = moments.sort((a, b) => b.weight - a.weight).slice(0, 12).sort((a, b) => a.turn - b.turn || b.weight - a.weight);

  // ---------- awards
  const lastQuote = (pid) => quotes.filter((q) => q.pid === pid).pop()?.text || players.get(pid)?.persona?.motto || null;
  const top = (key) => replay.players.slice().sort((a, b) => b.stats[key] - a.stats[key])[0];
  const awards = [];
  const A = (title, p, why) => p && awards.push({ title, who: who(p.id), coalition: p.coalition, archetype: p.persona?.archetype || 'HUMAN', why, quote: lastQuote(p.id) });
  const fist = top('dealt'); if (fist?.stats.dealt > 0) A('IRON FIST', fist, `${fist.stats.dealt} direct damage dealt`);
  const trigger = top('nukes'); if (trigger?.stats.nukes > 0) A('TRIGGER FINGER', trigger, `${trigger.stats.nukes} warheads launched`);
  const tongue = top('negotiated'); if (tongue?.stats.negotiated > 0) A('SILVER TONGUE', tongue, `${Math.round(tongue.stats.negotiated)} influence spent on peace`);
  const knife = top('betrayals'); if (knife?.stats.betrayals > 0) A('KNIFE IN THE BACK', knife, `${knife.stats.betrayals} treat${knife.stats.betrayals === 1 ? 'y' : 'ies'} broken`);
  const spy = top('spyOps'); if (spy?.stats.spyOps > 0) A('SPYMASTER', spy, `${spy.stats.spyOps} successful intel ops`);
  const glass = final.scoreboard.slice().sort((a, b) => b.suffered - a.suffered)[0];
  if (glass?.suffered > 0) awards.push({ title: 'GLASS HOUSE', who: glass.c, coalition: glass.c, archetype: 'COALITION', why: `${glass.suffered} damage absorbed`, quote: null });

  // ---------- quotes (distinct speakers, dramatic events first)
  const rank = { win: 0, lose: 1, betray: 2, strike: 3, retaliate: 4, hit: 5, sign: 6, negotiate: 7, open: 8 };
  const seen = new Set();
  const bestQuotes = quotes.slice().sort((a, b) => (rank[a.event] ?? 9) - (rank[b.event] ?? 9))
    .filter((q) => (seen.has(q.pid) ? false : seen.add(q.pid))).slice(0, 6)
    .map((q) => ({ who: q.name, coalition: q.coalition, text: q.text, turn: q.turn, event: q.event }));

  const epitaph = eschaton
    ? pickOne(['They inherited every warhead in history and found a use for all of them.', 'The meter went to ten. So did everything else.', 'History ends here. Nobody is left to write it.'])
    : stats.nukes === 0
      ? pickOne(['The bombs stayed in the silos. For once.', 'Every finger hovered over the button. None pressed it.'])
      : pickOne(['The world survived, though plenty of it is still glowing.', 'They stepped back from the brink, but only one step.', 'Peace, of a kind. Glowing at the edges.']);

  const lines = [
    '☢ ESCHATON // AFTER-ACTION REPORT',
    headline,
    dek,
    '',
    `🏆 ${winner} prevails · INDDIR/SUFDDIR ${winRatio.toFixed(2)}`,
    `☢ ${stats.nukes} warheads · 🛡 ${stats.intercepted} intercepted · 🔥 ${stats.glassed} territories glassed`,
    `🗡 ${stats.betrayals} betrayals · 🕊 ${stats.peace} peace deals · ⚔ ${stats.military} won by force · peak escalation ${stats.peakEsc}/10`,
    `🔥 ${stats.ignited} crises ignited by spillover · threat level reached ${stats.maxTier}/5 (${CONFIG.threat.tiers[stats.maxTier - 1].name})`,
    '',
    'KEY MOMENTS',
    ...keyMoments.slice(0, 7).map((m) => `T${m.turn} ${m.icon} ${m.title}: ${m.text}`),
    '',
    ...bestQuotes.slice(0, 2).map((q) => `"${q.text}" (${q.who}, ${q.coalition})`),
    '',
    epitaph,
  ];

  return { headline, dek, stamp, stats, moments: keyMoments, awards, quotes: bestQuotes, epitaph, shareText: lines.join('\n') };
}

module.exports = { build };
