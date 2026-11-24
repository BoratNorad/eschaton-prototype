// =====================================================================
//  ESCHATON — BALANCE & CONTENT CONFIG
//  Every tunable number lives here. The client receives this file too
//  (via /config.js) so UI costs always match the server.
// =====================================================================

const CONFIG = {
  // ---------------- Lobby / turns ----------------
  maxPlayers: 15,
  maxPerCoalition: 3,
  minSlotsPerCoalition: 2,      // AI fills each coalition up to this many slots
  defaultTurnSeconds: 75,
  turnSecondOptions: [30, 45, 60, 75, 90, 120, 180],
  reportSeconds: 7,             // how long the resolution report shows
  maxTurns: 30,                 // hard safety cap
  actionsPerTurn: 3,            // strikes / spy / commit / negotiate per player per turn (builds are free)

  // ---------------- Resources ----------------
  resources: {
    ind: { name: 'INDUSTRY', short: 'IND' },
    ura: { name: 'URANIUM', short: 'URA' },
    inf: { name: 'INFLUENCE', short: 'INF' },
  },
  basePlayerIncome: { ind: 2, ura: 1, inf: 2 }, // every player, every turn, on top of territory share
  defaultYield: { ind: 1, ura: 0, inf: 1, hp: 40 }, // for territories not listed in territories.js

  // ---------------- Build menu ----------------
  units: {
    conv:      { name: 'Conventional Forces', short: 'CONV', cost: { ind: 3 },          desc: 'Commit to TRIGSITs to win them militarily.' },
    delivery:  { name: 'Delivery Systems',    short: 'DLV',  cost: { ind: 5, ura: 1 },  desc: 'ICBMs/bombers. Each launches 1 strategic warhead per turn.' },
    tactical:  { name: 'Tactical Warhead',    short: 'TAC',  cost: { ind: 2, ura: 3 },  desc: 'Short-range nuke. Hit a territory or wipe forces at a TRIGSIT.' },
    strategic: { name: 'Strategic Warhead',   short: 'STR',  cost: { ind: 4, ura: 6 },  desc: 'City-killer. Needs a delivery system.' },
    defense:   { name: 'Missile Defense',     short: 'ABM',  cost: { ind: 6, inf: 1 },  desc: 'Adds intercept chance for your whole coalition.' },
    spies:     { name: 'Spy',                 short: 'SPY',  cost: { ind: 1, inf: 3 },  desc: 'Reveal arsenals or plant false intel. Also counter-intel.' },
  },

  // ---------------- Strikes ----------------
  strike: {
    tactical:  { damage: 20, escalation: 0.5, infCost: 1, trigsitKillPct: 0.6, trigsitKillMin: 2 },
    strategic: { damage: 60, escalation: 1.5, infCost: 2 },
    escalationDamageMult: 0.10,      // damage x (1 + esc * this)
    escalationInfCostMult: 0.25,     // political cost x (1 + esc * this)
    interceptPerDefense: 0.06,       // per ABM unit in the defending coalition
    interceptCap: 0.6,
    retaliationBase: 0.05,           // auto-retaliation chance = base + esc * perLevel
    retaliationPerLevel: 0.07,
    retaliationEscalation: 0.5,      // retaliation strikes also escalate
  },

  // ---------------- Escalation meter ----------------
  escalation: {
    max: 10,                         // reaching max triggers ESCHATON (all-out exchange, game ends)
    quietTurnDecay: 1,               // no nukes this turn -> meter drops this much
    treatyBreak: 1,
    labels: ['DEFCON 5', 'DEFCON 5', 'DEFCON 4', 'DEFCON 4', 'DEFCON 3', 'DEFCON 3', 'DEFCON 2', 'DEFCON 2', 'DEFCON 1', 'DEFCON 1', 'ESCHATON'],
  },

  // ---------------- Conventional war at TRIGSITs ----------------
  trigsit: {
    progressPerForce: 2,             // net forces advantage x this = progress per turn
    casualtyRate: 0.2,               // each side loses enemyForces x this (rounded, min 1 when opposed)
    damagePerCasualty: 3,            // conventional losses count toward SUFDDIR / INDDIR
    winThreshold: 100,
    peacePerInfluence: 2,             // negotiation: peace meter += influence x this
    peaceThreshold: 100,
    militaryReward: { ind: 12, ura: 6, inf: 6 }, // split among winning side's players
    peaceDividend: { inf: 4, ind: 4 },           // each negotiator when peace is reached
  },

  // ---------------- Intelligence ----------------
  spy: {
    baseSuccess: 0.8,
    perEnemySpy: 0.05,               // target coalition's total spies reduce success
    minSuccess: 0.25,
    falseIntelTurns: 4,
    inflateMult: 2.5,
    deflateMult: 0.3,
  },

  // ---------------- Treaties ----------------
  treaty: {
    breakInfPenalty: 5,
  },

  // ---------------- Scoring ----------------
  // ratio = INDDIR / max(SUFDDIR, ratioFloor). The floor stops a coalition that
  // fires one shot and is never hit from having an infinite ratio.
  ratioFloor: 20,

  // ---------------- AI ----------------
  ai: {
    firstStrikeChance: 0.015,
    retaliateChance: 0.25,
    trigsitNukeChance: 0.08,         // when outnumbered at a TRIGSIT
    negotiateChance: 0.35,
    spyChance: 0.2,
    treatyProposeChance: 0.06,
    treatyAcceptChance: 0.55,
    escalationCaution: 6,            // AI avoids optional nukes at/above this level
  },

  // ---------------- Coalitions ----------------
  // ability: { id, name, desc } — effects implemented in game.js by id, values here.
  coalitions: {
    AMNAT: {
      name: 'AMNAT', full: 'United States / NATO', color: '#4da3ff', capital: [-77.0, 38.9],
      history: 'Historic peak: 31,255 US warheads (1967)',
      ability: { id: 'aegis', name: 'Aegis Umbrella', desc: '+15% intercept chance vs incoming strikes.', value: 0.15 },
      start: { res: { ind: 14, ura: 8, inf: 8 }, arsenal: { conv: 8, delivery: 6, tactical: 10, strategic: 12, defense: 3, spies: 2 } },
    },
    SOVWAR: {
      name: 'SOVWAR', full: 'USSR / Warsaw Pact', color: '#ff4b4b', capital: [37.6, 55.75],
      history: 'Historic peak: ~40,000 Soviet warheads (1986)',
      ability: { id: 'deadhand', name: 'Dead Hand', desc: 'Auto-retaliation chance +25% when struck.', value: 0.25 },
      start: { res: { ind: 12, ura: 10, inf: 6 }, arsenal: { conv: 10, delivery: 6, tactical: 12, strategic: 14, defense: 2, spies: 2 } },
    },
    REDCHI: {
      name: 'REDCHI', full: "People's Republic of China", color: '#ffc531', capital: [116.4, 39.9],
      history: 'Historic stockpile: ~400 warheads (1980s–90s)',
      ability: { id: 'peopleswar', name: "People's War", desc: 'Conventional forces cost 40% less industry.', value: 0.4 },
      start: { res: { ind: 14, ura: 6, inf: 6 }, arsenal: { conv: 14, delivery: 3, tactical: 5, strategic: 4, defense: 1, spies: 2 } },
    },
    INDPAK: {
      name: 'INDPAK', full: 'India / Pakistan', color: '#ff8a3d', capital: [77.2, 28.6],
      history: 'Peak: ~170 warheads each (2020s)',
      ability: { id: 'mountain', name: 'Mountain Doctrine', desc: 'Forces at TRIGSITs push progress 50% harder.', value: 0.5 },
      start: { res: { ind: 12, ura: 6, inf: 8 }, arsenal: { conv: 10, delivery: 2, tactical: 4, strategic: 3, defense: 1, spies: 2 } },
    },
    IRLIBSYR: {
      name: 'IRLIBSYR', full: 'Iran / Libya / Syria', color: '#3ddc84', capital: [51.4, 35.7],
      history: 'Chemical stockpiles (Syria ~1,300 t) + programs',
      ability: { id: 'proxy', name: 'Proxy Network', desc: 'Spies cost half, +20% spy success.', value: 0.2 },
      start: { res: { ind: 10, ura: 6, inf: 10 }, arsenal: { conv: 8, delivery: 2, tactical: 4, strategic: 1, defense: 1, spies: 4 } },
    },
    SOUTHAF: {
      name: 'SOUTHAF', full: 'Southern Africa', color: '#c77dff', capital: [28.2, -25.75],
      history: 'Peak: 6 South African devices (1989)',
      ability: { id: 'uranium', name: 'Uranium Belt', desc: '+3 uranium every turn per player.', value: 3 },
      start: { res: { ind: 10, ura: 12, inf: 6 }, arsenal: { conv: 7, delivery: 2, tactical: 3, strategic: 2, defense: 1, spies: 2 } },
    },
    LATAM: {
      name: 'LATAM', full: 'Latin America', color: '#2ee6d6', capital: [-82.4, 23.1],
      history: 'Hosted 162 Soviet warheads in Cuba (1962)',
      ability: { id: 'nonaligned', name: 'Non-Aligned Diplomacy', desc: 'Negotiation influence counts double.', value: 2 },
      start: { res: { ind: 12, ura: 4, inf: 12 }, arsenal: { conv: 8, delivery: 1, tactical: 3, strategic: 1, defense: 1, spies: 2 } },
    },
  },

  // ---------------- TRIGSITs (historical flashpoints) ----------------
  // sides: [A, B]. timer: turns until it freezes into a stalemate.
  trigsits: [
    { id: 'berlin',  name: 'BERLIN BLOCKADE',    lonlat: [13.4, 52.5],  sides: ['AMNAT', 'SOVWAR'],    timer: 12 },
    { id: 'korea',   name: '38TH PARALLEL',      lonlat: [127.0, 38.0], sides: ['AMNAT', 'REDCHI'],    timer: 10 },
    { id: 'cuba',    name: 'CUBAN MISSILES',     lonlat: [-79.5, 22.0], sides: ['AMNAT', 'LATAM'],     timer: 9 },
    { id: 'aksai',   name: 'AKSAI CHIN',         lonlat: [79.0, 35.0],  sides: ['INDPAK', 'REDCHI'],   timer: 11 },
    { id: 'khyber',  name: 'KHYBER PASS',        lonlat: [71.0, 34.1],  sides: ['SOVWAR', 'INDPAK'],   timer: 12 },
    { id: 'golan',   name: 'GOLAN HEIGHTS',      lonlat: [35.8, 33.0],  sides: ['IRLIBSYR', 'AMNAT'],  timer: 10 },
    { id: 'angola',  name: 'CUITO CUANAVALE',    lonlat: [18.6, -15.2], sides: ['SOUTHAF', 'LATAM'],   timer: 11 },
    { id: 'ussuri',  name: 'USSURI RIVER',       lonlat: [133.8, 46.5], sides: ['SOVWAR', 'REDCHI'],   timer: 12 },
  ],
};

if (typeof module !== 'undefined') module.exports = CONFIG;
