// Simple rule-based AI. Collects resources, builds, fights at its TRIGSITs,
// negotiates when losing, retaliates when struck, and occasionally spies.
const CONFIG = require('./config');
const A = CONFIG.ai;
const rnd = () => Math.random();
const pick = (a) => a[Math.floor(rnd() * a.length)];

function orders(game, p) {
  const actions = [];
  const builds = {};
  const res = { ...p.res };
  const esc = game.escalation;
  const my = p.coalition;
  const myTrig = game.trigsits.filter((t) => t.status === 'active' && t.sides.includes(my));
  const add = (a) => { if (actions.length < CONFIG.actionsPerTurn) actions.push(a); };
  const enemyTerr = (c) => Object.values(game.territories).filter((t) => t.coalition === c && t.hp > 0).sort((a, b) => b.hp - a.hp);
  let tac = p.arsenal.tactical, str = p.arsenal.strategic, inf = res.inf;

  // 1. Retaliate if we were struck last turn
  const striker = game.lastStruckBy[my];
  if (striker && esc < A.escalationCaution + 2 && rnd() < A.retaliateChance && !game.activeTreaty(my, striker)) {
    const t = enemyTerr(striker)[Math.floor(rnd() * 3)];
    const kind = str > 0 && p.arsenal.delivery > 0 && esc < 7 && rnd() < 0.4 ? 'strategic' : 'tactical';
    if (t && (kind === 'strategic' ? str : tac) > 0 && inf >= game.strikeInfCost(kind)) {
      add({ type: 'strike', kind, target: { kind: 'territory', id: t.id } });
      inf -= game.strikeInfCost(kind);
      kind === 'strategic' ? str-- : tac--;
    }
  }

  // 2. TRIGSITs: commit forces, nuke if badly outnumbered, negotiate if losing or hot
  for (const tr of myTrig) {
    const enemy = tr.sides.find((s) => s !== my);
    const mine = game.sideForces(tr, my), theirs = game.sideForces(tr, enemy);
    const favor = tr.sides[0] === my ? tr.control : -tr.control;
    if (p.arsenal.conv > 1 && actions.length < CONFIG.actionsPerTurn - 1) {
      add({ type: 'commit', trigsit: tr.id, amount: Math.ceil(p.arsenal.conv * (0.4 + rnd() * 0.3)) });
    }
    if (theirs > mine + 3 && tac > 0 && esc < A.escalationCaution && rnd() < A.trigsitNukeChance && inf >= game.strikeInfCost('tactical')) {
      add({ type: 'strike', kind: 'tactical', target: { kind: 'trigsit', id: tr.id } });
      tac--; inf -= game.strikeInfCost('tactical');
    }
    if ((favor < -20 || esc >= 5) && inf > 6 && rnd() < A.negotiateChance) {
      const amt = Math.floor(inf * 0.5);
      add({ type: 'negotiate', trigsit: tr.id, amount: amt });
      inf -= amt;
    }
  }

  // 3. Mediate other conflicts sometimes when the world is hot
  if (esc >= 4 && inf > 10 && rnd() < 0.2) {
    const tr = pick(game.trigsits.filter((t) => t.status === 'active'));
    if (tr) { const amt = Math.floor(inf * 0.4); add({ type: 'negotiate', trigsit: tr.id, amount: amt }); inf -= amt; }
  }

  // 4. Rare first strike against a TRIGSIT adversary
  if (myTrig.length && esc < A.escalationCaution - 2 && rnd() < A.firstStrikeChance && tac > 0 && inf >= game.strikeInfCost('tactical')) {
    const enemy = pick(myTrig).sides.find((s) => s !== my);
    const t = enemyTerr(enemy)[0];
    if (t && !game.activeTreaty(my, enemy)) add({ type: 'strike', kind: 'tactical', target: { kind: 'territory', id: t.id } });
  }

  // 5. Spies
  if (p.arsenal.spies > 0 && rnd() < A.spyChance) {
    if (rnd() < 0.3) add({ type: 'spy', mode: 'plant', fake: rnd() < 0.6 ? 'inflate' : 'deflate' });
    else add({ type: 'spy', mode: 'reveal', target: pick(Object.keys(CONFIG.coalitions).filter((c) => c !== my)) });
  }

  // 6. Builds — priorities shift with escalation
  const want = esc >= 5
    ? ['defense', 'tactical', 'conv', 'strategic', 'delivery', 'spies']
    : ['conv', 'tactical', 'conv', 'strategic', 'defense', 'delivery', 'spies'];
  for (let pass = 0; pass < 4; pass++) {
    for (const u of want) {
      if (u === 'spies' && p.arsenal.spies >= 3) continue;
      if (u === 'delivery' && p.arsenal.delivery >= p.arsenal.strategic + 1) continue;
      const cost = game.unitCost(p, u);
      const reserve = { ind: 0, ura: 0, inf: u === 'spies' ? 0 : 4 };
      if (Object.entries(cost).every(([k, v]) => res[k] - (reserve[k] || 0) >= v)) {
        for (const [k, v] of Object.entries(cost)) res[k] -= v;
        builds[u] = (builds[u] || 0) + 1;
      }
    }
  }
  return { builds, actions };
}

// Called once per resolution: AI responds to pending pacts and sometimes proposes.
function diplomacy(game) {
  const coals = Object.keys(CONFIG.coalitions);
  for (const t of game.treaties) {
    if (t.status !== 'proposed') continue;
    const mem = game.coalitionMembers(t.b);
    if (mem.some((p) => !p.isAI)) continue; // humans decide for their coalition
    const adversaries = game.trigsits.some((tr) => tr.status === 'active' && tr.sides.includes(t.a) && tr.sides.includes(t.b));
    const accept = rnd() < (adversaries ? A.treatyAcceptChance * 0.4 : A.treatyAcceptChance);
    if (mem[0]) game.respondTreaty(mem[0].id, t.id, accept);
  }
  for (const c of coals) {
    const mem = game.coalitionMembers(c);
    if (mem.some((p) => !p.isAI) || rnd() > A.treatyProposeChance) continue;
    const target = pick(coals.filter((x) => x !== c));
    game.proposeTreaty(mem[0].id, target);
  }
}

module.exports = { orders, diplomacy };
