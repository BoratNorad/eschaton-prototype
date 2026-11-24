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

  // ---------------- Threat levels (capability unlocks) ----------------
  // The game starts small: only a few TRIGSITs are active and only crisis-local actions are allowed.
  // As escalation rises, the threat level ratchets up (never down), unlocking more dangerous options
  // and igniting more dormant TRIGSITs. `at` = escalation needed. `builds` = units newly buildable.
  threat: {
    tiers: [
      { level: 1, name: 'CRISIS',            at: 0,   spawn: 0, builds: ['conv', 'defense'],
        unlocks: 'Deploy divisions and negotiate at your own TRIGSITs. Pacts only with coalitions you face.' },
      { level: 2, name: 'CONFRONTATION',     at: 1.5, spawn: 1, builds: ['spies'],
        unlocks: 'Spies and disinformation. Mediate any crisis. Pacts with anyone.' },
      { level: 3, name: 'BRINKMANSHIP',      at: 3.5, spawn: 1, builds: ['tactical', 'delivery'],
        unlocks: 'Tactical nukes against enemy divisions at your TRIGSITs.' },
      { level: 4, name: 'NUCLEAR THRESHOLD', at: 5.5, spawn: 2, builds: [],
        unlocks: 'Tactical strikes on the homeland of coalitions you face in a crisis.' },
      { level: 5, name: 'GENERAL WAR',       at: 7.5, spawn: 2, builds: ['strategic'],
        unlocks: 'Strategic warheads. Any coalition can be targeted.' },
    ],
  },

  // ---------------- Spillover (decisions ignite dormant TRIGSITs) ----------------
  spillover: {
    battleEscalation: 0.12,        // each crisis where both sides fight this turn
    militaryWinEscalation: 0.75,   // a TRIGSIT won by force
    spawnEscalation: 0.15,         // a new TRIGSIT ignites
    spyCaughtEscalation: 0.25,
    peaceDeescalation: 0.75,       // a TRIGSIT settled by negotiation
    calmDecay: 0.5,                // no nukes AND no battles this turn
    cooling: 0.1,                  // any turn without nukes cools the meter this much
    nonNuclearCap: 9.5,            // only an actual nuke can push the meter to ESCHATON
    defeatSpawnChance: 0.6,        // loser of a military resolution flares up elsewhere
    nukeSpawnChance: 0.5,          // victim of a nuke dragged into a new front
    betrayalSpawnChance: 1,        // breaking a pact ignites that pair's crisis
    spyCaughtSpawnChance: 0.35,
    mobilizationThreshold: 20,     // total divisions at one crisis...
    mobilizationSpawnChance: 0.1,  // ...may spill into a neighbouring crisis
    maxSpawnsPerTurn: 2,           // (threat-level ignitions don't count toward this)
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

  // ---------------- Tutorial ----------------
  tutorial: {
    coalition: 'AMNAT',
    include: ['berlin'],       // the tutorial's first crisis is always Berlin
    turnSeconds: 600,          // relaxed timer for training games
    aiHoldFireTurns: 4,        // AI makes no unprovoked nukes for this many turns
  },

  // ---------------- AI ----------------
  ai: {
    firstStrikeChance: 0.015,
    retaliateChance: 0.25,
    retaliateHeadroom: 1.2,          // AI keeps retaliating until escalation reaches its caution level + this
    trigsitNukeChance: 0.08,         // when outnumbered at a TRIGSIT
    negotiateChance: 0.35,
    spyChance: 0.2,
    treatyProposeChance: 0.15,
    nukesPerCoalitionPerTurn: 1,     // AI coalition launches at most this many strikes per turn
    betrayChance: 0.35,              // per active pact per turn, scaled by (0.4 - loyalty)
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
  // One crisis for EVERY pair of coalitions (7 coalitions -> 21 TRIGSITs; each coalition is in 6).
  // sides: [A, B]. timer: turns until it freezes into a stalemate. year/blurb: shown in the dossier.
  // Where two blocs never clashed directly, the crisis is the alternate-history version of a real event.
  trigsits: [
    { id: 'berlin',   name: 'BERLIN BLOCKADE',      lonlat: [13.4, 52.5],   sides: ['AMNAT', 'SOVWAR'],    timer: 12, year: 1948,
      blurb: 'Soviet forces cut every road and rail line into West Berlin. The West answers with an airlift: one plane every few minutes, around the clock.' },
    { id: 'korea',    name: '38TH PARALLEL',        lonlat: [127.0, 38.0],  sides: ['AMNAT', 'REDCHI'],    timer: 10, year: 1950,
      blurb: 'Chinese "volunteers" pour across the Yalu and the front lurches back toward the parallel. Generals are already asking about atomic options.' },
    { id: 'cuba',     name: 'CUBAN MISSILES',       lonlat: [-79.5, 22.0],  sides: ['AMNAT', 'LATAM'],     timer: 9,  year: 1962,
      blurb: 'Medium-range missiles are photographed in Cuba, ninety miles from Florida. A naval quarantine goes up. Thirteen days on the brink.' },
    { id: 'bengal',   name: 'BAY OF BENGAL',        lonlat: [89.5, 20.0],   sides: ['AMNAT', 'INDPAK'],    timer: 11, year: 1971,
      blurb: 'As India and Pakistan go to war over the east, a US carrier task force steams into the bay. New Delhi reads it as a threat.' },
    { id: 'golan',    name: 'GOLAN HEIGHTS',        lonlat: [35.8, 33.0],   sides: ['IRLIBSYR', 'AMNAT'],  timer: 10, year: 1973,
      blurb: 'Syrian armor storms the heights on a holy day. Whoever holds the ridge looks down on all of Galilee. Airlifts race to resupply both sides.' },
    { id: 'vela',     name: 'VELA FLASH',           lonlat: [40.0, -47.0],  sides: ['AMNAT', 'SOUTHAF'],   timer: 13, year: 1979,
      blurb: 'A satellite records a double flash over the empty southern ocean. Someone has tested a bomb, and nobody will admit who.' },
    { id: 'ussuri',   name: 'USSURI RIVER',         lonlat: [133.8, 46.5],  sides: ['SOVWAR', 'REDCHI'],   timer: 12, year: 1969,
      blurb: 'Border guards fight over a frozen river island. Moscow quietly asks what a strike on Chinese nuclear sites would cost.' },
    { id: 'khyber',   name: 'KHYBER PASS',          lonlat: [71.0, 34.1],   sides: ['SOVWAR', 'INDPAK'],   timer: 12, year: 1979,
      blurb: 'Soviet divisions in Afghanistan stare down the ancient pass into Pakistan, while rifles and money flow the other way.' },
    { id: 'tabriz',   name: 'AZERBAIJAN CRISIS',    lonlat: [46.3, 38.1],   sides: ['SOVWAR', 'IRLIBSYR'], timer: 11, year: 1946,
      blurb: 'Soviet troops refuse to leave northern Iran and back a breakaway republic in Tabriz. The first crisis of the Cold War.' },
    { id: 'cape',     name: 'CAPE SEA LANES',       lonlat: [18.4, -34.4],  sides: ['SOVWAR', 'SOUTHAF'],  timer: 13, year: 1975,
      blurb: 'Soviet warships shadow the tanker route around the Cape. Pretoria casts itself as the last guardian of the passage.' },
    { id: 'grenada',  name: 'GRENADA AIRSTRIP',     lonlat: [-61.7, 12.1],  sides: ['SOVWAR', 'LATAM'],    timer: 9,  year: 1983,
      blurb: 'A long new runway on a small island. Built for tourist jets or for long-range bombers? Everyone assumes the worst.' },
    { id: 'aksai',    name: 'AKSAI CHIN',           lonlat: [79.0, 35.0],   sides: ['INDPAK', 'REDCHI'],   timer: 11, year: 1962,
      blurb: 'A military road across a disputed high plateau turns into a short, brutal war fought at 5,000 meters.' },
    { id: 'hormuz',   name: 'STRAIT OF HORMUZ',     lonlat: [56.3, 26.6],   sides: ['REDCHI', 'IRLIBSYR'], timer: 10, year: 1987,
      blurb: 'Chinese-made anti-ship missiles appear on the shores of the strait. A fifth of the world\'s oil sails within range.' },
    { id: 'tazara',   name: 'TAZARA RAILWAY',       lonlat: [31.5, -10.2],  sides: ['REDCHI', 'SOUTHAF'],  timer: 14, year: 1975,
      blurb: 'Beijing builds a railway nearly 1,900 km long into the heart of southern Africa. Pretoria sees a supply line for its enemies.' },
    { id: 'ayacucho', name: 'AYACUCHO',             lonlat: [-74.2, -13.2], sides: ['REDCHI', 'LATAM'],    timer: 12, year: 1980,
      blurb: 'A Maoist insurgency burns ballot boxes in the Andes and declares a people\'s war, with Beijing\'s little red book as its manual.' },
    { id: 'baloch',   name: 'BALOCHISTAN',          lonlat: [62.5, 28.5],   sides: ['INDPAK', 'IRLIBSYR'], timer: 10, year: 1973,
      blurb: 'An insurgency straddles the Iran–Pakistan border. Tehran sends helicopter gunships and wants a say in how it ends.' },
    { id: 'durban',   name: 'DURBAN SANCTIONS',     lonlat: [31.0, -29.9],  sides: ['INDPAK', 'SOUTHAF'],  timer: 13, year: 1946,
      blurb: 'India becomes the first nation to cut trade with Pretoria over the treatment of Natal\'s Indians. In this timeline the embargo turns into a naval standoff.' },
    { id: 'demerara', name: 'DEMERARA COAST',       lonlat: [-58.2, 6.8],   sides: ['INDPAK', 'LATAM'],    timer: 12, year: 1964,
      blurb: 'Strikes and riots on Guyana\'s sugar coast set communities against each other, and outside powers start choosing sides.' },
    { id: 'mozchan',  name: 'MOZAMBIQUE CHANNEL',   lonlat: [41.0, -17.0],  sides: ['IRLIBSYR', 'SOUTHAF'], timer: 11, year: 1979,
      blurb: 'Iran\'s revolution cuts off Pretoria\'s oil. Blockade-running tankers slip down the channel at night with their lights off.' },
    { id: 'contra',   name: 'IRAN–CONTRA PIPELINE', lonlat: [-85.5, 13.0],  sides: ['IRLIBSYR', 'LATAM'],  timer: 10, year: 1986,
      blurb: 'Missiles go one way and cash the other, through jungle airstrips that officially do not exist.' },
    { id: 'angola',   name: 'CUITO CUANAVALE',      lonlat: [18.6, -15.2],  sides: ['SOUTHAF', 'LATAM'],   timer: 11, year: 1987,
      blurb: 'Cuban brigades and South African columns grind each other down in the largest battle on African soil since the Second World War.' },
  ],
};

if (typeof module !== 'undefined') module.exports = CONFIG;
