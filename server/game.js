// ESCHATON game engine. Server-authoritative; clients only submit orders.
const CONFIG = require('./config');
const TERR = require('./territories');
const atlas = require('world-atlas/countries-110m.json');
const AI = require('./ai');
const Personas = require('./personalities');

const COALS = Object.keys(CONFIG.coalitions);
const UNIT_KEYS = Object.keys(CONFIG.units);
const RES_KEYS = Object.keys(CONFIG.resources);

const NAMES = {};
for (const g of atlas.objects.countries.geometries) if (g.id) NAMES[g.id] = g.properties.name;

const AI_NAMES = ['HAL', 'WOPR', 'COLOSSUS', 'GUARDIAN', 'PERIMETR', 'SAGE', 'ORACLE', 'SKYNET-0', 'JOSHUA', 'DEEP-RED',
  'MINUTEMAN', 'TOPOL', 'DF-5', 'AGNI', 'GHAURI', 'SHAHAB', 'SCUD', 'RSA-3', 'CONDOR', 'FROG-7', 'TITAN', 'R-7'];

let uid = 0;
const newId = (p) => `${p}${(++uid).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const rnd = () => Math.random();
const pick = (a) => a[Math.floor(rnd() * a.length)];
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round1 = (v) => Math.round(v * 10) / 10;

class Game {
  constructor(code, hostName) {
    this.code = code;
    this.phase = 'lobby'; // lobby | orders | report | over
    this.players = new Map();
    this.hostId = null;
    this.turnSeconds = CONFIG.defaultTurnSeconds;
    this.turn = 0;
    this.deadline = 0;
    this.escalation = 0;
    this.territories = {};
    this.trigsits = [];
    this.treaties = [];
    this.scores = {};
    this.log = [];
    this.chat = [];
    this.falseIntel = {}; // coalition -> {mode, until}
    this.lastStruckBy = {}; // coalition -> coalition (for AI retaliation)
    this.lastReport = null;
    this.winner = null;
    this.endReason = null;
    this.tutorial = false;
    this.tier = 1;            // threat level (1..5), only ratchets up
    this.mode = 'human';      // 'human' | 'ai' (spectated simulation)
    this.chatter = [];        // AI leader lines waiting to be broadcast as chat
    this.chronicle = [];      // structured history for the after-action report
    this.frames = [];         // replay snapshots, one per turn
    this._quotes = [];
    this.replayId = null;
  }

  // ------------------------------------------------------------ lobby
  addPlayer(name, coalition) {
    const id = newId('p');
    const token = newId('t') + newId('');
    const p = this._makePlayer(id, name, false);
    p.token = token;
    if (coalition && this.canJoinCoalition(coalition)) p.coalition = coalition;
    this.players.set(id, p);
    if (!this.hostId) this.hostId = id;
    return p;
  }
  _makePlayer(id, name, isAI) {
    return {
      id, name: String(name || 'Commander').slice(0, 16), isAI, coalition: null, connected: !isAI,
      res: { ind: 0, ura: 0, inf: 0 }, arsenal: Object.fromEntries(UNIT_KEYS.map((k) => [k, 0])),
      intel: {}, orders: null, submitted: false, private: [],
      stats: { dealt: 0, nukes: 0, betrayals: 0, negotiated: 0, spyOps: 0, spyCaught: 0 },
    };
  }
  humans() { return [...this.players.values()].filter((p) => !p.isAI); }
  coalitionMembers(c) { return [...this.players.values()].filter((p) => p.coalition === c); }
  canJoinCoalition(c) { return COALS.includes(c) && this.coalitionMembers(c).length < CONFIG.maxPerCoalition; }
  setCoalition(pid, c) {
    const p = this.players.get(pid);
    if (!p || this.phase !== 'lobby') return false;
    if (c === null) { p.coalition = null; return true; }
    if (p.coalition === c || !this.canJoinCoalition(c)) return false;
    p.coalition = c;
    return true;
  }
  removePlayer(pid) {
    this.players.delete(pid);
    if (this.hostId === pid) this.hostId = this.humans()[0]?.id || null;
  }

  // ------------------------------------------------------------ start
  start(opts = {}) {
    const fillTo = opts.fillTo || CONFIG.minSlotsPerCoalition;
    // humans without a coalition go to the least-populated one
    for (const p of this.humans()) {
      if (!p.coalition) {
        const opts = COALS.filter((c) => this.canJoinCoalition(c));
        const min = Math.min(...opts.map((c) => this.coalitionMembers(c).length));
        p.coalition = pick(opts.filter((c) => this.coalitionMembers(c).length === min));
      }
    }
    // AI fills slots
    const need = COALS.reduce((s, c) => s + Math.max(0, fillTo - this.coalitionMembers(c).length), 0);
    const personas = Personas.draw(need);
    for (const c of COALS) {
      while (this.coalitionMembers(c).length < fillTo) {
        const persona = personas.shift();
        const p = this._makePlayer(newId('a'), 'AI', true);
        p.name = persona.name;
        p.persona = persona;
        p.coalition = c;
        this.players.set(p.id, p);
      }
    }
    // starting resources + split arsenal
    for (const c of COALS) {
      const def = CONFIG.coalitions[c].start;
      const mem = this.coalitionMembers(c);
      mem.forEach((p, i) => {
        p.res = { ...def.res };
        for (const k of UNIT_KEYS) {
          const tot = def.arsenal[k] || 0;
          p.arsenal[k] = Math.floor(tot / mem.length) + (i < tot % mem.length ? 1 : 0);
        }
      });
      this.scores[c] = { inflicted: 0, suffered: 0 };
    }
    // territories
    for (const [id, row] of Object.entries(TERR)) {
      const d = CONFIG.defaultYield;
      const [coalition, ind = d.ind, ura = d.ura, inf = d.inf, hp = d.hp] = row;
      this.territories[id] = { id, name: NAMES[id] || id, coalition, yields: { ind, ura, inf }, hp, maxHp: hp };
    }
    // trigsits
    this.trigsits = CONFIG.trigsits.map((t) => ({
      ...t, control: 0, peace: 0, turnsLeft: t.timer, status: 'dormant', winner: null,
      forces: { [t.sides[0]]: {}, [t.sides[1]]: {} }, negotiators: {},
    }));
    this.turn = 1;
    this.igniteInitial(opts.include || []);
    this.pushLog(`ESCHATON INITIATED. ${this.players.size} commanders across ${COALS.length} coalitions. ${this.activeTrigsits().length} TRIGSITs active, ${this.trigsits.length - this.activeTrigsits().length} dormant. THREAT LEVEL 1: CRISIS.`, 'sys');
    for (const p of shuffle([...this.players.values()].filter((x) => x.persona)).slice(0, 3)) this.say(p, 'open');
    this.frames.push(this.snapshot([], []));
    this.beginOrders();
  }

  beginOrders() {
    this.phase = 'orders';
    this.deadline = Date.now() + this.turnSeconds * 1000;
    for (const p of this.players.values()) { p.orders = null; p.submitted = false; }
    // AI orders immediately
    for (const p of this.players.values()) if (p.isAI) { p.orders = AI.orders(this, p); p.submitted = true; }
  }

  allSubmitted() {
    return [...this.players.values()].every((p) => p.submitted || (!p.isAI && !p.connected));
  }

  submitOrders(pid, orders) {
    const p = this.players.get(pid);
    if (!p || this.phase !== 'orders') return false;
    const builds = {};
    for (const k of UNIT_KEYS) {
      const n = Math.floor(Number(orders?.builds?.[k]) || 0);
      if (n > 0) builds[k] = Math.min(n, 50);
    }
    const actions = Array.isArray(orders?.actions) ? orders.actions.slice(0, CONFIG.actionsPerTurn) : [];
    p.orders = { builds, actions };
    p.submitted = true;
    return true;
  }
  unsubmit(pid) {
    const p = this.players.get(pid);
    if (p && this.phase === 'orders') p.submitted = false;
  }

  // ------------------------------------------------------------ helpers
  unitCost(p, unit) {
    const base = CONFIG.units[unit].cost;
    const ab = CONFIG.coalitions[p.coalition].ability;
    const cost = { ...base };
    if (unit === 'conv' && ab.id === 'peopleswar') cost.ind = Math.ceil(cost.ind * (1 - ab.value));
    if (unit === 'spies' && ab.id === 'proxy') for (const k in cost) cost[k] = Math.ceil(cost[k] / 2);
    return cost;
  }
  canAfford(p, cost) { return Object.entries(cost).every(([k, v]) => p.res[k] >= v - 1e-9); }
  pay(p, cost) { for (const [k, v] of Object.entries(cost)) p.res[k] -= v; }
  strikeInfCost(kind) {
    return Math.ceil(CONFIG.strike[kind].infCost * (1 + this.escalation * CONFIG.strike.escalationInfCostMult));
  }
  coalTotal(c, key) { return this.coalitionMembers(c).reduce((s, p) => s + p.arsenal[key], 0); }
  activeTreaty(a, b) {
    return this.treaties.find((t) => t.status === 'active' && ((t.a === a && t.b === b) || (t.a === b && t.b === a)));
  }
  pushLog(text, cls = '') {
    const e = { turn: this.turn, text, cls, t: Date.now() };
    this.log.push(e);
    if (this.log.length > 300) this.log.shift();
    if (this._events) this._events.push(e);
    return e;
  }
  priv(p, text, cls = 'intel') { p.private.push({ turn: this.turn, text, cls }); if (p.private.length > 60) p.private.shift(); }
  ratio(c) { const s = this.scores[c]; return s.inflicted / Math.max(s.suffered, CONFIG.ratioFloor); }
  recordDamage(attC, defC, amount, attP) {
    if (amount <= 0) return;
    if (attP) attP.stats.dealt += amount;
    this.scores[attC].inflicted += amount;
    this.scores[defC].suffered += amount;
  }

  // ------------------------------------------------------------ treaties (instant)
  proposeTreaty(pid, target) {
    const p = this.players.get(pid);
    if (!p || !COALS.includes(target) || target === p.coalition || this.phase === 'lobby' || this.phase === 'over') return null;
    if (!this.canTreaty(p.coalition, target)) return null;
    const exists = this.treaties.find((t) => ['proposed', 'active'].includes(t.status) &&
      ((t.a === p.coalition && t.b === target) || (t.a === target && t.b === p.coalition)));
    if (exists) return null;
    const t = { id: newId('tr'), a: p.coalition, b: target, status: 'proposed', by: p.name, turn: this.turn };
    this.treaties.push(t);
    this.pushLog(`${p.name} (${p.coalition}) proposes a NON-AGGRESSION PACT to ${target}.`, 'treaty');
    return t;
  }
  respondTreaty(pid, tid, accept) {
    const p = this.players.get(pid);
    const t = this.treaties.find((x) => x.id === tid);
    if (!p || !t || t.status !== 'proposed' || t.b !== p.coalition) return null;
    t.status = accept ? 'active' : 'rejected';
    if (accept) { this.chronicle.push({ t: 'sign', turn: this.turn, a: t.a, b: t.b, by: p.id }); this.say(p, 'sign', 0.6); }
    this.pushLog(accept ? `PACT SIGNED: ${t.a} ⟷ ${t.b} non-aggression (accepted by ${p.name}).`
      : `${p.name} (${t.b}) REJECTS the pact offered by ${t.a}.`, 'treaty');
    return t;
  }
  breakTreaty(pid, tid, reason) {
    const p = this.players.get(pid);
    const t = this.treaties.find((x) => x.id === tid);
    if (!p || !t || t.status !== 'active' || (t.a !== p.coalition && t.b !== p.coalition)) return null;
    t.status = 'broken';
    t.brokenBy = p.coalition;
    const other = t.a === p.coalition ? t.b : t.a;
    p.stats.betrayals++;
    this.chronicle.push({ t: 'betray', turn: this.turn, by: p.id, c: p.coalition, victim: other });
    this.say(p, 'betray');
    if (rnd() < CONFIG.spillover.betrayalSpawnChance) this.spawnCrisis((t) => t.sides.includes(p.coalition) && t.sides.includes(other), `${p.coalition}'s betrayal of ${other}`);
    p.res.inf = Math.max(0, p.res.inf - CONFIG.treaty.breakInfPenalty);
    this.escalation = Math.min(CONFIG.escalation.max, this.escalation + CONFIG.escalation.treatyBreak);
    this.pushLog(`⚠ TREATY BROKEN: ${p.name} (${p.coalition}) tears up the pact with ${other}${reason ? ' — ' + reason : ''}. Escalation +${CONFIG.escalation.treatyBreak}.`, 'alert');
    return t;
  }

  // ------------------------------------------------------------ resolution
  resolve() {
    this._events = [];
    this._anims = [];
    this._nukesThisTurn = 0;
    this._saidThisTurn = 0;
    this._spawns = 0;
    this._battles = 0;
    for (const p of this.players.values()) p._spyUsed = 0, p._dlvUsed = 0;
    this.pushLog(`── TURN ${this.turn} RESOLUTION ──`, 'sys');

    // Collect actions in a fair random player order
    const order = shuffle([...this.players.values()]);
    const acts = (type) => order.flatMap((p) => (p.orders?.actions || []).filter((a) => a && a.type === type).map((a) => [p, a]))
      .filter(([p, a]) => { const r = this.allowed(p, a); if (!r.ok) this.priv(p, `Order blocked: ${r.reason}`, 'warn'); return r.ok; });

    for (const [p, a] of acts('spy')) this.doSpy(p, a);
    for (const [p, a] of acts('negotiate')) this.doNegotiate(p, a);
    for (const [p, a] of acts('commit')) this.doCommit(p, a);
    for (const [p, a] of acts('withdraw')) this.doWithdraw(p, a);
    for (const [p, a] of acts('strike')) {
      if (this.phase === 'over') break;
      this.doStrike(p, a.kind, a.target, false);
      if (this.escalation >= CONFIG.escalation.max) { this.eschaton(); break; }
    }

    if (this.phase !== 'over') {
      this.checkTier();
      this.resolveTrigsits();
      for (const p of order) this.doBuilds(p);
      this.doIncome();
      AI.diplomacy(this);
      this.expireTreatyProposals();
      if (this._nukesThisTurn === 0) this.escalation = Math.max(0, this.escalation - CONFIG.spillover.cooling);
      if (this._nukesThisTurn === 0 && !this._battles && this.escalation > 0) {
        this.escalation = Math.max(0, this.escalation - CONFIG.spillover.calmDecay);
        this.pushLog(`A calm turn: no nukes, no fighting. Escalation eases to ${round1(this.escalation)}.`, 'calm');
      }
      this.checkTier();
      this.checkEnd();
    }

    const report = { turn: this.turn, events: this._events, anims: this._anims };
    this.frames.push(this.snapshot(this._events, this._anims));
    this.lastReport = report;
    this._events = null;
    return report;
  }

  nextTurn() {
    if (this.phase === 'over') return;
    this.turn++;
    this.beginOrders();
  }

  doSpy(p, a) {
    const target = a.target;
    if (p.arsenal.spies - p._spyUsed < 1) return;
    if (a.mode === 'plant') {
      p._spyUsed++;
      const mode = a.fake === 'deflate' ? 'deflate' : 'inflate';
      this.falseIntel[p.coalition] = { mode, until: this.turn + CONFIG.spy.falseIntelTurns };
      this.priv(p, `Disinformation planted: enemy spies will see ${mode.toUpperCase()}D ${p.coalition} numbers until turn ${this.turn + CONFIG.spy.falseIntelTurns}.`);
      return;
    }
    if (!COALS.includes(target) || target === p.coalition) return;
    p._spyUsed++;
    const ab = CONFIG.coalitions[p.coalition].ability;
    const chance = clamp(CONFIG.spy.baseSuccess - CONFIG.spy.perEnemySpy * this.coalTotal(target, 'spies') + (ab.id === 'proxy' ? ab.value : 0),
      CONFIG.spy.minSuccess, 0.95);
    if (rnd() > chance) {
      p.arsenal.spies--;
      p.stats.spyCaught++;
      this.chronicle.push({ t: 'spycaught', turn: this.turn, by: p.id, c: p.coalition, target });
      this.bumpEsc(CONFIG.spillover.spyCaughtEscalation);
      if (rnd() < CONFIG.spillover.spyCaughtSpawnChance) this.spawnCrisis((t) => t.sides.includes(p.coalition) && t.sides.includes(target), `A burned ${p.coalition} agent inside ${target}`);
      this.pushLog(`🕵 SPY CAPTURED: ${target} counter-intelligence catches an agent of ${p.name} (${p.coalition}).`, 'intel');
      return;
    }
    const snap = {};
    for (const k of UNIT_KEYS) snap[k] = this.coalTotal(target, k);
    for (const tr of this.trigsits) for (const side of tr.sides) if (side === target) snap.conv += Object.values(tr.forces[side]).reduce((s, n) => s + n, 0);
    const fi = this.falseIntel[target];
    if (fi && fi.until >= this.turn) {
      const m = fi.mode === 'inflate' ? CONFIG.spy.inflateMult : CONFIG.spy.deflateMult;
      for (const k of UNIT_KEYS) snap[k] = Math.max(0, Math.round(snap[k] * m * (0.85 + rnd() * 0.3)));
    }
    p.intel[target] = { turn: this.turn, arsenal: snap };
    p.stats.spyOps++;
    this.priv(p, `INTEL ON ${target}: STR ${snap.strategic} · TAC ${snap.tactical} · DLV ${snap.delivery} · ABM ${snap.defense} · CONV ${snap.conv} · SPY ${snap.spies}`);
  }

  doNegotiate(p, a) {
    const tr = this.trigsits.find((t) => t.id === a.trigsit && t.status === 'active');
    const amt = Math.floor(Number(a.amount) || 0);
    if (!tr || amt <= 0 || p.res.inf < amt) return;
    p.res.inf -= amt;
    const ab = CONFIG.coalitions[p.coalition].ability;
    const mult = ab.id === 'nonaligned' ? ab.value : 1;
    const gain = amt * CONFIG.trigsit.peacePerInfluence * mult;
    tr.peace = Math.min(CONFIG.trigsit.peaceThreshold, tr.peace + gain);
    tr.negotiators[p.id] = (tr.negotiators[p.id] || 0) + amt;
    p.stats.negotiated += amt;
    this.say(p, 'negotiate', 0.2);
    this.pushLog(`🕊 ${p.name} (${p.coalition}) invests ${amt} influence in talks at ${tr.name}. Peace ${Math.round(tr.peace)}%.`, 'calm');
  }

  doCommit(p, a) {
    const tr = this.trigsits.find((t) => t.id === a.trigsit && t.status === 'active');
    const n = Math.min(Math.floor(Number(a.amount) || 0), p.arsenal.conv);
    if (!tr || n <= 0 || !tr.sides.includes(p.coalition)) return;
    p.arsenal.conv -= n;
    tr.forces[p.coalition][p.id] = (tr.forces[p.coalition][p.id] || 0) + n;
    this.pushLog(`${p.name} (${p.coalition}) deploys ${n} divisions to ${tr.name}.`, 'mil');
  }

  doWithdraw(p, a) {
    const tr = this.trigsits.find((t) => t.id === a.trigsit && t.status === 'active');
    if (!tr || !tr.sides.includes(p.coalition)) return;
    const n = tr.forces[p.coalition][p.id] || 0;
    if (!n) return;
    delete tr.forces[p.coalition][p.id];
    p.arsenal.conv += n;
    this.pushLog(`${p.name} (${p.coalition}) withdraws ${n} divisions from ${tr.name}.`, 'mil');
  }

  sideForces(tr, side) { return Object.values(tr.forces[side]).reduce((s, n) => s + n, 0); }

  killForces(tr, side, n) {
    let killed = 0;
    const f = tr.forces[side];
    while (killed < n) {
      const ids = Object.keys(f).filter((id) => f[id] > 0);
      if (!ids.length) break;
      const id = pick(ids);
      f[id]--; killed++;
      if (f[id] <= 0) delete f[id];
    }
    return killed;
  }

  doStrike(p, kind, target, isRetaliation) {
    if (!['tactical', 'strategic'].includes(kind) || !target) return false;
    const S = CONFIG.strike[kind];
    let defC, ter, tr;
    if (target.kind === 'territory') {
      ter = this.territories[target.id];
      if (!ter || ter.coalition === p.coalition) return false;
      defC = ter.coalition;
    } else if (target.kind === 'trigsit') {
      tr = this.trigsits.find((t) => t.id === target.id && t.status === 'active');
      if (!tr || kind !== 'tactical' || !tr.sides.includes(p.coalition)) return false;
      defC = tr.sides.find((s) => s !== p.coalition);
    } else return false;

    if (p.arsenal[kind] < 1) { if (!isRetaliation) this.priv(p, `Strike aborted: no ${kind} warheads.`, 'warn'); return false; }
    if (kind === 'strategic' && p._dlvUsed >= p.arsenal.delivery) { if (!isRetaliation) this.priv(p, 'Strike aborted: no free delivery system.', 'warn'); return false; }
    const infCost = isRetaliation ? 0 : this.strikeInfCost(kind);
    if (p.res.inf < infCost) { this.priv(p, `Strike aborted: need ${infCost} influence (political cost).`, 'warn'); return false; }

    const tre = this.activeTreaty(p.coalition, defC);
    if (tre) this.breakTreaty(p.id, tre.id, 'by launching a nuclear strike');

    p.res.inf -= infCost;
    p.arsenal[kind]--;
    p.stats.nukes++;
    this._lastStriker = p;
    const firstNuke = !this.chronicle.some((e) => e.t === 'strike');
    const chron = { t: 'strike', turn: this.turn, by: p.id, c: p.coalition, defC, kind, ret: isRetaliation, first: firstNuke, dmg: 0, intercepted: false };
    this.chronicle.push(chron);
    if (kind === 'strategic') p._dlvUsed++;
    this._nukesThisTurn++;
    this.escalation = Math.min(CONFIG.escalation.max, this.escalation + (isRetaliation ? CONFIG.strike.retaliationEscalation : S.escalation));
    this.lastStruckBy[defC] = p.coalition;

    const targetName = ter ? ter.name : tr.name;
    const anim = { from: CONFIG.coalitions[p.coalition].capital, to: ter ? null : tr.lonlat, toTerritory: ter?.id, kind, coalition: p.coalition, intercepted: false };
    this._anims.push(anim);

    // interception
    const ab = CONFIG.coalitions[defC].ability;
    const icp = Math.min(CONFIG.strike.interceptCap, this.coalTotal(defC, 'defense') * CONFIG.strike.interceptPerDefense + (ab.id === 'aegis' ? ab.value : 0));
    const tag = isRetaliation ? '↩ RETALIATION' : kind === 'strategic' ? '☢ STRATEGIC STRIKE' : '☢ TACTICAL STRIKE';
    if (ter && rnd() < icp) {
      anim.intercepted = true;
      chron.intercepted = true;
      chron.target = targetName;
      this.pushLog(`${tag}: ${p.name} (${p.coalition}) → ${targetName} [${defC}] — INTERCEPTED by missile defense.`, 'nuke');
    } else {
      const mult = 1 + this.escalation * CONFIG.strike.escalationDamageMult;
      if (ter) {
        const dmg = Math.min(ter.hp, Math.round(S.damage * mult));
        ter.hp -= dmg;
        this.recordDamage(p.coalition, defC, dmg, p);
        Object.assign(chron, { dmg, target: targetName, glass: ter.hp <= 0 });
        this.pushLog(`${tag}: ${p.name} (${p.coalition}) → ${targetName} [${defC}] — ${dmg} damage. ${ter.hp <= 0 ? targetName.toUpperCase() + ' IS GLASS.' : ''}`, 'nuke');
      } else {
        const enemy = this.sideForces(tr, defC);
        const kill = Math.min(enemy, Math.max(S.trigsitKillMin, Math.ceil(enemy * S.trigsitKillPct)));
        const k = this.killForces(tr, defC, kill);
        const dmg = Math.round(k * CONFIG.trigsit.damagePerCasualty * 2 * mult);
        this.recordDamage(p.coalition, defC, dmg, p);
        Object.assign(chron, { dmg, target: `${defC} forces at ${targetName}` });
        this.pushLog(`${tag}: ${p.name} (${p.coalition}) nukes ${defC} forces at ${targetName} — ${k} divisions vaporized (${dmg} damage).`, 'nuke');
      }
    }

    if (!chron.intercepted && rnd() < CONFIG.spillover.nukeSpawnChance) {
      this.spawnCrisis((t) => t.sides.includes(defC) && !t.sides.includes(p.coalition), `Fallout from ${targetName} drags ${defC} into a new front`);
    }
    this.say(p, isRetaliation ? 'retaliate' : 'strike', isRetaliation ? 0.5 : 0.8);
    if (!chron.intercepted && chron.dmg >= 30) { const v = pick(this.coalitionMembers(defC).filter((x) => x.persona).concat([null])); if (v) this.say(v, 'hit', 0.4); }
    // automatic retaliation (one level deep — no infinite chains)
    if (!isRetaliation) {
      const dab = CONFIG.coalitions[defC].ability;
      const chance = CONFIG.strike.retaliationBase + this.escalation * CONFIG.strike.retaliationPerLevel + (dab.id === 'deadhand' ? dab.value : 0);
      if (rnd() < chance) {
        const shooters = this.coalitionMembers(defC).sort((x, y) => (y.arsenal.strategic + y.arsenal.tactical) - (x.arsenal.strategic + x.arsenal.tactical));
        const s = shooters[0];
        if (s) {
          const caps = this.capsFor(s);
          let rk = caps.strategic && s.arsenal.strategic > 0 && s._dlvUsed < s.arsenal.delivery ? 'strategic' : s.arsenal.tactical > 0 ? 'tactical' : null;
          let tgt = null;
          if (caps.nukeTerritory) {
            const targets = Object.values(this.territories).filter((t) => t.coalition === p.coalition && t.hp > 0).sort((x, y) => y.hp - x.hp);
            if (targets.length) tgt = { kind: 'territory', id: targets[0].id };
          } else if (tr && this.sideForces(tr, p.coalition) > 0) {
            rk = s.arsenal.tactical > 0 ? 'tactical' : null; // below the nuclear threshold: answer at the crisis itself
            tgt = { kind: 'trigsit', id: tr.id };
          }
          if (rk && tgt) {
            this.pushLog(`LAUNCH ON WARNING: ${defC} automated systems retaliate against ${p.coalition}!`, 'alert');
            this.doStrike(s, rk, tgt, true);
          }
        }
      }
    }
    return true;
  }

  eschaton() {
    this.escalation = CONFIG.escalation.max;
    this.chronicle.push({ t: 'eschaton', turn: this.turn, by: this._lastStriker?.id, c: this._lastStriker?.coalition });
    this.pushLog('████ ESCHATON ████ Escalation has reached maximum. Every silo opens. Full exchange.', 'alert');
    for (const p of shuffle([...this.players.values()])) {
      const enemies = Object.values(this.territories).filter((t) => t.coalition !== p.coalition && t.hp > 0 && !this.activeTreaty(p.coalition, t.coalition));
      while ((p.arsenal.strategic > 0 || p.arsenal.tactical > 0) && enemies.length) {
        const kind = p.arsenal.strategic > 0 ? 'strategic' : 'tactical';
        p.arsenal[kind]--;
        const ter = pick(enemies);
        const defC = ter.coalition;
        const ab = CONFIG.coalitions[defC].ability;
        const icp = Math.min(CONFIG.strike.interceptCap, this.coalTotal(defC, 'defense') * CONFIG.strike.interceptPerDefense + (ab.id === 'aegis' ? ab.value : 0));
        const intercepted = rnd() < icp;
        if (this._anims.length < 120) this._anims.push({ from: CONFIG.coalitions[p.coalition].capital, toTerritory: ter.id, kind, coalition: p.coalition, intercepted });
        if (intercepted) continue;
        const dmg = Math.min(ter.hp, Math.round(CONFIG.strike[kind].damage * 2));
        ter.hp -= dmg;
        this.recordDamage(p.coalition, defC, dmg, p);
        p.stats.nukes++;
        if (ter.hp <= 0) enemies.splice(enemies.indexOf(ter), 1);
      }
    }
    this.endGame('ESCHATON — mutual assured destruction');
  }

  resolveTrigsits() {
    const T = CONFIG.trigsit;
    for (const tr of this.trigsits) {
      if (tr.status !== 'active' || tr.ignitedTurn === this.turn) continue;
      const [A, B] = tr.sides;
      const fa = this.sideForces(tr, A), fb = this.sideForces(tr, B);
      // combat
      if (fa > 0 && fb > 0) {
        const lossA = this.killForces(tr, A, Math.max(1, Math.round(fb * T.casualtyRate)));
        const lossB = this.killForces(tr, B, Math.max(1, Math.round(fa * T.casualtyRate)));
        this.recordDamage(B, A, lossA * T.damagePerCasualty);
        this.recordDamage(A, B, lossB * T.damagePerCasualty);
        this.pushLog(`⚔ ${tr.name}: ${A} loses ${lossA}, ${B} loses ${lossB} divisions.`, 'mil');
        this._battles++;
        this.bumpEsc(CONFIG.spillover.battleEscalation);
      }
      if (fa + fb >= CONFIG.spillover.mobilizationThreshold && rnd() < CONFIG.spillover.mobilizationSpawnChance) {
        const c = fa >= fb ? A : B;
        this.spawnCrisis((t) => t.sides.includes(c) && t.id !== tr.id, `Mass mobilization at ${tr.name} stretches ${c} onto another front`);
      }
      const eff = (c, f) => f * (CONFIG.coalitions[c].ability.id === 'mountain' ? 1 + CONFIG.coalitions[c].ability.value : 1);
      const net = eff(A, fa) - eff(B, fb);
      tr.control = clamp(tr.control + net * T.progressPerForce, -T.winThreshold, T.winThreshold);
      tr.turnsLeft--;

      if (tr.peace >= T.peaceThreshold) this.closeTrigsit(tr, 'peace', null);
      else if (tr.control >= T.winThreshold) this.closeTrigsit(tr, 'military', A);
      else if (tr.control <= -T.winThreshold) this.closeTrigsit(tr, 'military', B);
      else if (tr.turnsLeft <= 0) this.closeTrigsit(tr, 'timer', null);
    }
  }

  closeTrigsit(tr, how, winner) {
    tr.status = 'resolved';
    tr.how = how;
    tr.winner = winner;
    this.chronicle.push({ t: 'trigsit', turn: this.turn, id: tr.id, name: tr.name, how, winner, sides: tr.sides,
      negotiators: Object.keys(tr.negotiators) });
    // return surviving forces
    for (const side of tr.sides) for (const [pid, n] of Object.entries(tr.forces[side])) {
      const p = this.players.get(pid);
      if (p) p.arsenal.conv += n;
    }
    tr.forces = { [tr.sides[0]]: {}, [tr.sides[1]]: {} };
    if (how === 'peace') {
      this.escalation = Math.max(0, this.escalation - CONFIG.spillover.peaceDeescalation);
      const ids = Object.keys(tr.negotiators);
      for (const id of ids) { const p = this.players.get(id); if (p) for (const [k, v] of Object.entries(CONFIG.trigsit.peaceDividend)) p.res[k] += v; }
      this.pushLog(`✅ TRIGSIT RESOLVED — ${tr.name}: settled at the negotiating table. ${ids.length} negotiators share the peace dividend.`, 'resolve');
    } else if (how === 'military') {
      const mem = this.coalitionMembers(winner);
      for (const p of mem) for (const [k, v] of Object.entries(CONFIG.trigsit.militaryReward)) p.res[k] += v / mem.length;
      this.pushLog(`✅ TRIGSIT RESOLVED — ${tr.name}: ${winner} wins militarily and seizes the spoils.`, 'resolve');
      this.bumpEsc(CONFIG.spillover.militaryWinEscalation);
      const loser = tr.sides.find((s) => s !== winner);
      if (rnd() < CONFIG.spillover.defeatSpawnChance) this.spawnCrisis((t) => t.sides.includes(loser), `Defeat at ${tr.name} radicalizes ${loser}`);
    } else {
      this.pushLog(`✅ TRIGSIT RESOLVED — ${tr.name}: the clock runs out. Frozen conflict, no victor.`, 'resolve');
    }
  }

  doBuilds(p) {
    if (!p.orders) return;
    const built = [];
    for (const [unit, n] of Object.entries(p.orders.builds || {})) {
      if (!CONFIG.units[unit]) continue;
      if (!this.unitUnlocked(p, unit)) { this.priv(p, `Build blocked: ${CONFIG.units[unit].short} is not unlocked yet.`, 'warn'); continue; }
      let c = 0;
      const cost = this.unitCost(p, unit);
      while (c < n && this.canAfford(p, cost)) { this.pay(p, cost); p.arsenal[unit]++; c++; }
      if (c) built.push(`${c} ${CONFIG.units[unit].short}`);
      if (c < n) this.priv(p, `Build shortfall: only ${c}/${n} ${CONFIG.units[unit].short} affordable.`, 'warn');
    }
    if (built.length) this.priv(p, `Production complete: ${built.join(', ')}.`, 'ok');
  }

  coalitionIncome(c) {
    const inc = { ind: 0, ura: 0, inf: 0 };
    for (const t of Object.values(this.territories)) {
      if (t.coalition !== c) continue;
      const f = t.maxHp ? t.hp / t.maxHp : 0;
      for (const k of RES_KEYS) inc[k] += t.yields[k] * f;
    }
    return inc;
  }
  playerIncome(p) {
    const ci = this.coalitionIncome(p.coalition);
    const n = this.coalitionMembers(p.coalition).length || 1;
    const ab = CONFIG.coalitions[p.coalition].ability;
    const out = {};
    for (const k of RES_KEYS) out[k] = ci[k] / n + CONFIG.basePlayerIncome[k];
    if (ab.id === 'uranium') out.ura += ab.value;
    return out;
  }
  doIncome() {
    for (const p of this.players.values()) {
      const inc = this.playerIncome(p);
      for (const k of RES_KEYS) p.res[k] += inc[k];
    }
  }

  expireTreatyProposals() {
    for (const t of this.treaties) if (t.status === 'proposed' && this.turn - t.turn >= 2) {
      t.status = 'expired';
      this.pushLog(`Pact offer ${t.a} → ${t.b} expires unanswered.`, 'treaty');
    }
  }

  checkEnd() {
    if (this.trigsits.every((t) => t.status !== 'active')) this.endGame('All TRIGSITs resolved');
    else if (this.turn >= CONFIG.maxTurns) this.endGame('Turn limit reached');
  }

  endGame(reason) {
    this.phase = 'over';
    this.endReason = reason;
    const ranked = COALS.slice().sort((a, b) => this.ratio(b) - this.ratio(a));
    this.winner = ranked[0];
    const speaker = (c) => this.coalitionMembers(c).filter((x) => x.persona).sort((a, b) => b.stats.dealt - a.stats.dealt)[0];
    const w = speaker(ranked[0]), l = speaker(ranked[ranked.length - 1]);
    if (w) this.say(w, 'win', 1, true);
    if (l) this.say(l, 'lose', 1, true);
    this.pushLog(`GAME OVER (${reason}). ${this.winner} prevails with INDDIR/SUFDDIR ratio ${this.ratio(this.winner).toFixed(2)}.`, 'sys');
  }

  // ------------------------------------------------------------ crises, threat levels, permissions
  activeTrigsits() { return this.trigsits.filter((t) => t.status === 'active'); }

  // Random TRIGSITs until every coalition is in at least one (some end up in more).
  igniteInitial(include) {
    for (const id of include) { const t = this.trigsits.find((x) => x.id === id); if (t) t.status = 'active'; }
    for (let guard = 0; guard < 50; guard++) {
      const covered = new Set(this.activeTrigsits().flatMap((t) => t.sides));
      const missing = COALS.filter((c) => !covered.has(c));
      if (!missing.length) break;
      const c = pick(missing);
      const t = pick(this.trigsits.filter((x) => x.status === 'dormant' && x.sides.includes(c)));
      if (t) t.status = 'active';
    }
  }

  // Non-nuclear escalation can approach but never trigger ESCHATON — only a real launch can.
  bumpEsc(amount) {
    if (this.escalation >= CONFIG.spillover.nonNuclearCap) return;
    this.escalation = Math.min(CONFIG.spillover.nonNuclearCap, this.escalation + amount);
  }

  spawnCrisis(filter, cause, force = false) {
    if (!force && this._spawns >= CONFIG.spillover.maxSpawnsPerTurn) return null;
    const t = pick(this.trigsits.filter((x) => x.status === 'dormant' && filter(x)));
    if (!t) return null;
    t.status = 'active'; t.turnsLeft = t.timer; t.ignitedTurn = this.turn;
    if (!force) this._spawns = (this._spawns || 0) + 1;
    this.bumpEsc(CONFIG.spillover.spawnEscalation);
    this.pushLog(`🔥 SPILLOVER: ${cause}. ${t.name} ignites (${t.sides[0]} vs ${t.sides[1]}).`, 'spill');
    this.chronicle.push({ t: 'spawn', turn: this.turn, id: t.id, name: t.name, cause, sides: t.sides });
    if (this._anims) this._anims.push({ flare: true, to: t.lonlat, coalition: t.sides[0] });
    return t;
  }

  checkTier() {
    const tiers = CONFIG.threat.tiers;
    while (this.tier < tiers.length && this.escalation >= tiers[this.tier].at) {
      const T = tiers[this.tier];
      this.tier++;
      this.pushLog(`⚠ THREAT LEVEL ${T.level}: ${T.name}. Unlocked: ${T.unlocks}`, 'alert');
      this.chronicle.push({ t: 'tier', turn: this.turn, level: T.level, name: T.name });
      for (let i = 0; i < T.spawn; i++) this.spawnCrisis(() => true, `The world slides into ${T.name}`, true);
    }
  }

  adversariesOf(c) {
    const s = new Set();
    for (const t of this.activeTrigsits()) if (t.sides.includes(c)) s.add(t.sides.find((x) => x !== c));
    return s;
  }
  canTreaty(a, b) { return this.tier >= 2 || this.adversariesOf(a).has(b); }

  capsFor(p) {
    const t = this.tier;
    const builds = CONFIG.threat.tiers.filter((x) => x.level <= t).flatMap((x) => x.builds);
    return {
      tier: t, adversaries: [...this.adversariesOf(p.coalition)], builds,
      negotiateAny: t >= 2, spy: t >= 2, spyAny: t >= 4, treatyAny: t >= 2,
      nukeTrigsit: t >= 3, nukeTerritory: t >= 4, nukeAny: t >= 5, strategic: t >= 5,
    };
  }
  tierName(level) { return CONFIG.threat.tiers[level - 1]?.name || '?'; }

  // Is this order legal right now? Returns { ok, reason }.
  allowed(p, a) {
    const c = this.capsFor(p), adv = new Set(c.adversaries);
    const lock = (lvl) => ({ ok: false, reason: `unlocks at THREAT LEVEL ${lvl} (${this.tierName(lvl)})` });
    const tr = a.trigsit ? this.trigsits.find((t) => t.id === a.trigsit) : null;
    switch (a.type) {
      case 'commit': case 'withdraw':
        if (!tr || tr.status !== 'active') return { ok: false, reason: 'that TRIGSIT is not active' };
        if (!tr.sides.includes(p.coalition)) return { ok: false, reason: 'you are not a party to that TRIGSIT' };
        return { ok: true };
      case 'negotiate':
        if (!tr || tr.status !== 'active') return { ok: false, reason: 'that TRIGSIT is not active' };
        if (!tr.sides.includes(p.coalition) && !c.negotiateAny) return lock(2);
        return { ok: true };
      case 'spy':
        if (!c.spy) return lock(2);
        if (a.mode !== 'plant' && !adv.has(a.target) && !c.spyAny) return { ok: false, reason: `you can only spy on coalitions you face in a crisis until THREAT LEVEL 4 (${this.tierName(4)})` };
        return { ok: true };
      case 'strike': {
        if (a.kind === 'strategic') return c.strategic ? { ok: true } : lock(5);
        if (a.target?.kind === 'trigsit') return c.nukeTrigsit ? { ok: true } : lock(3);
        if (!c.nukeTerritory) return lock(4);
        const ter = this.territories[a.target?.id];
        if (ter && !adv.has(ter.coalition) && !c.nukeAny) return { ok: false, reason: `you can only strike coalitions you face in a crisis until THREAT LEVEL 5 (${this.tierName(5)})` };
        return { ok: true };
      }
      default: return { ok: false, reason: 'unknown order' };
    }
  }
  unitUnlocked(p, unit) { return this.capsFor(p).builds.includes(unit); }

  // ------------------------------------------------------------ personalities & replay
  say(p, event, chance = 1, force = false) {
    if (!p?.persona) return;
    if (!force && (rnd() > chance || this._saidThisTurn >= 6)) return;
    const text = Personas.line(p.persona, event);
    if (!text) return;
    this._saidThisTurn = (this._saidThisTurn || 0) + 1;
    const q = { turn: this.turn, pid: p.id, name: `${p.persona.title} ${p.name}`, coalition: p.coalition, archetype: p.persona.archetype, event, text };
    this.chatter.push(q);
    this._quotes.push(q);
    this.chronicle.push({ t: 'quote', ...q });
  }

  snapshot(events, anims) {
    if (!this._terrIds) this._terrIds = Object.keys(this.territories);
    return {
      turn: this.turn,
      esc: round1(this.escalation),
      hp: this._terrIds.map((id) => this.territories[id].hp),
      trig: this.trigsits.map((t) => ({ id: t.id, s: t.status, ctl: Math.round(t.control), peace: Math.round(t.peace), left: t.turnsLeft, how: t.how || null, win: t.winner || null,
        f: t.sides.map((s) => this.sideForces(t, s)) })),
      scores: COALS.map((c) => [this.scores[c].inflicted, this.scores[c].suffered]),
      events: events.filter((e) => !e.text.startsWith('──')).map((e) => [e.text, e.cls]),
      anims: anims.slice(0, 150),
      quotes: this._quotes.splice(0),
    };
  }

  toReplay(id) {
    const Summary = require('./summary');
    const replay = {
      id, v: 1, created: Date.now(), mode: this.mode,
      coalitions: COALS,
      terr: this._terrIds.map((tid) => { const t = this.territories[tid]; return [tid, t.coalition, t.maxHp, t.name]; }),
      trigsits: this.trigsits.map((t) => ({ id: t.id, name: t.name, lonlat: t.lonlat, sides: t.sides })),
      players: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, coalition: p.coalition, isAI: p.isAI, stats: p.stats,
        persona: p.persona ? { title: p.persona.title, archetype: p.persona.archetype, motto: p.persona.motto } : null,
      })),
      frames: this.frames,
      final: { winner: this.winner, reason: this.endReason, turn: this.turn,
        scoreboard: COALS.map((c) => ({ c, ...this.scores[c], ratio: this.ratio(c) })).sort((a, b) => b.ratio - a.ratio) },
    };
    replay.summary = Summary.build(this, replay);
    return replay;
  }

  // ------------------------------------------------------------ views
  publicPlayers() {
    return [...this.players.values()].map((p) => ({ id: p.id, name: p.name, coalition: p.coalition, isAI: p.isAI, connected: p.connected, submitted: p.submitted, host: p.id === this.hostId }));
  }

  lobbyView() {
    return { code: this.code, phase: this.phase, hostId: this.hostId, turnSeconds: this.turnSeconds, players: this.publicPlayers() };
  }

  viewFor(pid) {
    const me = this.players.get(pid);
    const scoreboard = COALS.map((c) => ({ c, ...this.scores[c], ratio: this.ratio(c) }));
    const allies = me ? this.coalitionMembers(me.coalition).map((p) => ({ id: p.id, name: p.name, isAI: p.isAI, arsenal: p.arsenal, res: mapRound(p.res) })) : [];
    return {
      code: this.code, phase: this.phase, turn: this.turn, deadline: this.deadline, now: Date.now(), hostId: this.hostId,
      turnSeconds: this.turnSeconds, escalation: this.escalation, tutorial: this.tutorial, tier: this.tier,
      caps: me ? this.capsFor(me) : null,
      players: this.publicPlayers(),
      territories: Object.fromEntries(Object.values(this.territories).map((t) => [t.id, { c: t.coalition, hp: t.hp, maxHp: t.maxHp, y: t.yields, name: t.name }])),
      trigsits: this.trigsits.map((t) => ({
        id: t.id, name: t.name, lonlat: t.lonlat, sides: t.sides, control: t.control, peace: t.peace, turnsLeft: t.turnsLeft,
        status: t.status, how: t.how, winner: t.winner,
        forces: Object.fromEntries(t.sides.map((s) => [s, this.sideForces(t, s)])),
        mine: me ? (t.forces[me.coalition]?.[me.id] || 0) : 0,
      })),
      treaties: this.treaties.filter((t) => t.status !== 'expired' && t.status !== 'rejected').slice(-30),
      scoreboard,
      log: this.log.slice(-120),
      lastReport: this.lastReport,
      winner: this.winner, endReason: this.endReason, replayId: this.replayId,
      strikeCost: { tactical: this.strikeInfCost('tactical'), strategic: this.strikeInfCost('strategic') },
      me: me && {
        id: me.id, name: me.name, coalition: me.coalition, res: mapRound(me.res), arsenal: me.arsenal,
        income: mapRound(this.playerIncome(me)), intel: me.intel, private: me.private.slice(-40),
        submitted: me.submitted, orders: me.orders,
        costs: Object.fromEntries(UNIT_KEYS.map((k) => [k, this.unitCost(me, k)])),
        falseIntel: this.falseIntel[me.coalition] || null,
      },
      allies,
    };
  }
}

function mapRound(o) { const r = {}; for (const k in o) r[k] = Math.floor(o[k] * 10) / 10; return r; }

Game.COALS = COALS;
module.exports = Game;
