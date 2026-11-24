// Rule-based AI driven by each leader's personality traits (server/personalities.js).
// Collects resources, builds, fights at its TRIGSITs, negotiates, retaliates, spies,
// and (if disloyal) occasionally betrays a treaty partner.
const CONFIG = require('./config');
const { ARCHETYPES } = require('./personalities');
const A = CONFIG.ai;
const rnd = () => Math.random();
const pick = (a) => a[Math.floor(rnd() * a.length)];
const NEUTRAL = { aggression: 0.5, caution: 0.5, diplomacy: 0.5, deceit: 0.5, loyalty: 0.6, vengeance: 0.5 };
const DEFAULT_BUILDS = ['conv', 'tactical', 'conv', 'strategic', 'defense', 'delivery', 'spies'];

function orders(game, p) {
  const T = p.persona?.traits || NEUTRAL;
  const actions = [];
  const builds = {};
  const res = { ...p.res };
  const esc = game.escalation;
  const my = p.coalition;
  const caution = A.escalationCaution + (T.caution - 0.5) * 5; // 3.5 .. 8.5
  const holdFire = game.tutorial && game.turn <= CONFIG.tutorial.aiHoldFireTurns; // training: no unprovoked nukes early
  // shuffled so the AI spreads attention across its crises instead of always favoring the first ones
  const myTrig = game.trigsits.filter((t) => t.status === 'active' && t.sides.includes(my)).sort(() => rnd() - 0.5);
  const budget = game._aiNukes || (game._aiNukes = {});
  const add = (a) => {
    if (actions.length >= CONFIG.actionsPerTurn) return;
    if (!game.allowed(p, a).ok) return;      // respects the current threat level
    if (a.type === 'strike') {               // coalition-wide cap on AI launches per turn
      const k = `${game.turn}:${my}`;
      if ((budget[k] || 0) >= A.nukesPerCoalitionPerTurn) return;
      budget[k] = (budget[k] || 0) + 1;
    }
    actions.push(a);
  };
  const enemyTerr = (c) => Object.values(game.territories).filter((t) => t.coalition === c && t.hp > 0).sort((a, b) => b.hp - a.hp);
  const willBetray = () => T.loyalty < 0.35 && rnd() < (0.35 - T.loyalty) * 0.6;
  let tac = p.arsenal.tactical, str = p.arsenal.strategic, inf = res.inf;
  const size = Math.max(1, game.coalitionMembers(my).length / 2); // bigger coalitions: each member acts a bit less

  // 1. Retaliate if our coalition was struck last turn
  const striker = game.lastStruckBy[my];
  if (striker && esc < caution + A.retaliateHeadroom && rnd() < A.retaliateChance * (0.3 + 1.4 * T.vengeance) && (!game.activeTreaty(my, striker) || willBetray())) {
    const t = enemyTerr(striker)[Math.floor(rnd() * 3)];
    const kind = str > 0 && p.arsenal.delivery > 0 && esc < 7 && rnd() < 0.2 + 0.4 * T.aggression ? 'strategic' : 'tactical';
    if (t && (kind === 'strategic' ? str : tac) > 0 && inf >= game.strikeInfCost(kind)) {
      add({ type: 'strike', kind, target: { kind: 'territory', id: t.id } });
      inf -= game.strikeInfCost(kind);
      kind === 'strategic' ? str-- : tac--;
    }
  }

  // 1b. Below the nuclear threshold, answer a nuclear attack at a shared crisis instead
  if (striker && !actions.some((a) => a.type === 'strike') && tac > 0 && rnd() < A.retaliateChance * (0.3 + 1.4 * T.vengeance)) {
    const shared = myTrig.find((t) => t.sides.includes(striker) && game.sideForces(t, striker) > 0);
    if (shared && inf >= game.strikeInfCost('tactical')) add({ type: 'strike', kind: 'tactical', target: { kind: 'trigsit', id: shared.id } });
  }

  // 2. TRIGSITs: commit forces, nuke if outnumbered, negotiate if losing or hot
  for (const tr of myTrig) {
    const enemy = tr.sides.find((s) => s !== my);
    const mine = game.sideForces(tr, my), theirs = game.sideForces(tr, enemy);
    const favor = tr.sides[0] === my ? tr.control : -tr.control;
    if (p.arsenal.conv > 1 && actions.length < CONFIG.actionsPerTurn - 1) {
      add({ type: 'commit', trigsit: tr.id, amount: Math.ceil(p.arsenal.conv * (0.3 + 0.4 * T.aggression + rnd() * 0.2)) });
    }
    if (!holdFire && theirs > mine + 3 && tac > 0 && esc < caution && rnd() < A.trigsitNukeChance * (0.3 + 1.8 * T.aggression) && inf >= game.strikeInfCost('tactical')) {
      add({ type: 'strike', kind: 'tactical', target: { kind: 'trigsit', id: tr.id } });
      tac--; inf -= game.strikeInfCost('tactical');
    }
    if ((favor < -20 || esc >= 5 - T.diplomacy * 2) && inf > 6 && rnd() < A.negotiateChance * (0.3 + 1.4 * T.diplomacy) / size) {
      const amt = Math.floor(inf * (0.3 + 0.4 * T.diplomacy));
      add({ type: 'negotiate', trigsit: tr.id, amount: amt });
      inf -= amt;
    }
  }

  // 3. Doves mediate other conflicts when the world heats up
  if (esc >= 4 - T.diplomacy * 2 && inf > 10 && rnd() < (0.3 * T.diplomacy) / size) {
    const tr = pick(game.trigsits.filter((t) => t.status === 'active'));
    if (tr) { const amt = Math.floor(inf * 0.4); add({ type: 'negotiate', trigsit: tr.id, amount: amt }); inf -= amt; }
  }

  // 4. First strike (hawks, gamblers, zealots): rare, and only below their caution line
  if (!holdFire && myTrig.length && esc < caution - 2 && rnd() < A.firstStrikeChance * (0.2 + 4 * T.aggression) && tac > 0 && inf >= game.strikeInfCost('tactical')) {
    const enemy = pick(myTrig).sides.find((s) => s !== my);
    const t = enemyTerr(enemy)[0];
    if (t && (!game.activeTreaty(my, enemy) || willBetray())) add({ type: 'strike', kind: 'tactical', target: { kind: 'territory', id: t.id } });
  }

  // 4b. Betrayal: disloyal leaders sometimes knife a treaty partner while the world is calm
  if (!holdFire && esc < caution - 1 && tac > 0 && inf >= game.strikeInfCost('tactical')) {
    for (const tr of game.treaties.filter((t) => t.status === 'active' && (t.a === my || t.b === my))) {
      if (rnd() < A.betrayChance * Math.max(0, 0.4 - T.loyalty) * 2.5) {
        const t = enemyTerr(tr.a === my ? tr.b : tr.a)[0];
        if (t) { add({ type: 'strike', kind: 'tactical', target: { kind: 'territory', id: t.id } }); break; }
      }
    }
  }

  // 5. Spies: schemers and paranoids love them
  if (p.arsenal.spies > 0 && rnd() < A.spyChance * (0.4 + 1.6 * T.deceit)) {
    if (rnd() < 0.15 + 0.4 * T.deceit) add({ type: 'spy', mode: 'plant', fake: rnd() < 0.6 ? 'inflate' : 'deflate' });
    else add({ type: 'spy', mode: 'reveal', target: pick(Object.keys(CONFIG.coalitions).filter((c) => c !== my)) });
  }

  // 6. Builds: archetype preference, defense when the meter is hot
  let want = ARCHETYPES[p.persona?.archetype]?.builds || DEFAULT_BUILDS;
  if (esc >= 5 + T.aggression * 2) want = ['defense', ...want];
  for (let pass = 0; pass < 4; pass++) {
    for (const u of want) {
      if (!game.unitUnlocked(p, u)) continue;
      if (u === 'spies' && p.arsenal.spies >= 2 + Math.round(T.deceit * 3)) continue;
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
  const leader = (mem) => pick(mem.filter((p) => p.isAI)) || mem[0];
  for (const t of game.treaties) {
    if (t.status !== 'proposed') continue;
    const mem = game.coalitionMembers(t.b);
    if (mem.some((p) => !p.isAI)) continue; // humans decide for their coalition
    const L = leader(mem);
    const d = L?.persona?.traits?.diplomacy ?? 0.5;
    const adversaries = game.trigsits.some((tr) => tr.status === 'active' && tr.sides.includes(t.a) && tr.sides.includes(t.b));
    const accept = rnd() < A.treatyAcceptChance * (0.4 + d) * (adversaries ? 0.4 : 1);
    if (L) game.respondTreaty(L.id, t.id, accept);
  }
  for (const c of coals) {
    const mem = game.coalitionMembers(c);
    if (!mem.length || mem.some((p) => !p.isAI)) continue;
    const L = leader(mem);
    const d = L?.persona?.traits?.diplomacy ?? 0.5;
    if (rnd() > A.treatyProposeChance * (0.3 + 1.7 * d)) continue;
    const targets = coals.filter((x) => x !== c && game.canTreaty(c, x));
    if (targets.length) game.proposeTreaty(L.id, pick(targets));
  }
}

module.exports = { orders, diplomacy };
