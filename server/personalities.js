// Fictional heads of state for AI players. Each persona = archetype (base traits + voice)
// + personal jitter + motto. Traits are 0..1 and steer ai.js decisions.
//   aggression: first strikes, nuking troops     caution: respects the escalation meter
//   diplomacy: pacts + negotiation               deceit: spy ops, disinformation
//   loyalty: keeps treaties (low = betrays)      vengeance: retaliates when hit

const ARCHETYPES = {
  HAWK: {
    traits: { aggression: 0.8, caution: 0.35, diplomacy: 0.2, deceit: 0.4, loyalty: 0.5, vengeance: 0.85 },
    builds: ['tactical', 'strategic', 'conv', 'delivery', 'defense'],
    lines: {
      open: ['Ready the bombers. We will not be the ones who blink.', 'The map is a chessboard, and I play white.'],
      strike: ['Let the record show they had every chance.', 'A message has been sent. It is very short.', 'Deterrence, delivered.'],
      retaliate: ['You struck first. We strike last.', 'Measured response. Measured in megatons.'],
      hit: ['They will regret the day they woke us.', 'Mark that city. Mark the man who ordered it.'],
      betray: ['Paper burns faster than cities.', 'Treaties are for nations that cannot defend themselves.'],
      sign: ['A pause. Nothing more.'],
      negotiate: ['Talk, then. But keep the engines warm.'],
      win: ['As I predicted. Strength is the only diplomacy.'],
      lose: ['We were betrayed by softness.'],
    },
  },
  DOVE: {
    traits: { aggression: 0.1, caution: 0.85, diplomacy: 0.9, deceit: 0.2, loyalty: 0.9, vengeance: 0.25 },
    builds: ['defense', 'conv', 'spies', 'tactical', 'delivery'],
    lines: {
      open: ['There is still time to choose the table over the trench.', 'Every warhead we do not fire is a victory.'],
      strike: ['God forgive us. They left no other door.', 'I signed it with a shaking hand.'],
      retaliate: ['We answered because silence would invite more.'],
      hit: ['Send the medics, not the missiles.', 'We grieve. We do not escalate.'],
      betray: ['I am ashamed of what this office required.'],
      sign: ['Today, the world is slightly safer.', 'Ink is cheaper than blood.'],
      negotiate: ['Every crisis has a table. Pull up a chair.', 'Let the diplomats work through the night.'],
      win: ['We won by refusing to lose the world.'],
      lose: ['We kept our hands clean. It was not enough.'],
    },
  },
  GAMBLER: {
    traits: { aggression: 0.7, caution: 0.1, diplomacy: 0.5, deceit: 0.5, loyalty: 0.3, vengeance: 0.5 },
    builds: ['strategic', 'delivery', 'tactical', 'conv', 'spies'],
    lines: {
      open: ['Deal me in. All of it.', 'Fortune favors the first launch.'],
      strike: ['Double or nothing.', 'Roll the dice. Watch them glow.'],
      retaliate: ['You raised. I re-raise.'],
      hit: ['Ha! Good hand. Mine is better.', 'That one stung. Let it ride.'],
      betray: ['The house always cheats.', 'Nothing personal. Just odds.'],
      sign: ['Sure, shake on it. Count your fingers.'],
      negotiate: ['Every bet needs a cash-out window.'],
      win: ['Never doubted it. Well, once.'],
      lose: ['The table was rigged. Again.'],
    },
  },
  PARANOID: {
    traits: { aggression: 0.35, caution: 0.6, diplomacy: 0.3, deceit: 0.8, loyalty: 0.4, vengeance: 0.95 },
    builds: ['defense', 'spies', 'tactical', 'defense', 'conv'],
    lines: {
      open: ['They are already inside the walls. I can feel it.', 'Trust nobody. Verify twice. Then trust nobody.'],
      strike: ['Pre-emptive. Before they could do it to us.', 'They were planning this. I simply finished first.'],
      retaliate: ['I KNEW it. I knew it all along.'],
      hit: ['Find the traitor who let that through.', 'Double the shield. Triple it.'],
      betray: ['They were going to break it anyway.'],
      sign: ['I will be watching every signature on that page.'],
      negotiate: ['Talks are just spying with better catering.'],
      win: ['Vigilance. Always vigilance.'],
      lose: ['Sabotage. It was sabotage from the start.'],
    },
  },
  SCHEMER: {
    traits: { aggression: 0.4, caution: 0.5, diplomacy: 0.65, deceit: 0.95, loyalty: 0.1, vengeance: 0.5 },
    builds: ['spies', 'tactical', 'conv', 'strategic', 'defense'],
    lines: {
      open: ['Smile. Sign. Wait.', 'Let the giants exhaust each other.'],
      strike: ['Timing is everything, and the time is now.', 'They never saw the knife behind the handshake.'],
      retaliate: ['How predictable of them. How useful.'],
      hit: ['Interesting. Write down who benefits.'],
      betray: ['A treaty is a promise to wait for a better moment.', 'Oh, did we have an agreement? How quaint.'],
      sign: ['Delighted. Truly. Let us be friends.', 'Of course I accept.'],
      negotiate: ['Every peace has a price. I set it.'],
      win: ['Everyone played chess. I played everyone.'],
      lose: ['A temporary setback in a very long game.'],
    },
  },
  ZEALOT: {
    traits: { aggression: 0.95, caution: 0.05, diplomacy: 0.1, deceit: 0.3, loyalty: 0.6, vengeance: 1.0 },
    builds: ['tactical', 'conv', 'strategic', 'tactical', 'delivery'],
    lines: {
      open: ['Retreat is a word for other people.', 'History has chosen us. We merely carry out the sentence.'],
      strike: ['The fire purifies.', 'Let them learn what conviction weighs.'],
      retaliate: ['For every one of ours, ten of theirs.'],
      hit: ['Martyrs do not surrender.', 'Their bombs only harden us.'],
      betray: ['No pact binds the righteous.'],
      sign: ['A truce with the unworthy. Temporary.'],
      negotiate: ['We will hear their surrender terms.'],
      win: ['Destiny is not a matter of opinion.'],
      lose: ['Defeat is impossible. This is merely a test.'],
    },
  },
  PRAGMATIST: {
    traits: { aggression: 0.4, caution: 0.65, diplomacy: 0.6, deceit: 0.5, loyalty: 0.7, vengeance: 0.5 },
    builds: ['conv', 'defense', 'tactical', 'spies', 'strategic'],
    lines: {
      open: ['Numbers, not nerves.', 'Let us find out what everything costs.'],
      strike: ['The math favored action.', 'Regrettable. Cost-effective.'],
      retaliate: ['Deterrence only works if it is credible.'],
      hit: ['Assess, rebuild, respond. In that order.'],
      betray: ['Circumstances changed. So did the arithmetic.'],
      sign: ['A sensible arrangement for both parties.'],
      negotiate: ['A cheap peace beats an expensive war.'],
      win: ['Good management. That is all this was.'],
      lose: ['The projections were optimistic.'],
    },
  },
  SHOWMAN: {
    traits: { aggression: 0.6, caution: 0.3, diplomacy: 0.7, deceit: 0.45, loyalty: 0.3, vengeance: 0.65 },
    builds: ['strategic', 'delivery', 'conv', 'tactical', 'defense'],
    lines: {
      open: ['The cameras are rolling. Let us give them a show.', 'History remembers the loudest voice.'],
      strike: ['Lights, camera, ignition.', 'Put that on the front page.'],
      retaliate: ['Encore! The crowd demanded an encore.'],
      hit: ['Our cities are fine. Mostly. Roll the anthem.', 'They will pay for that headline.'],
      betray: ['The sequel needed a twist.'],
      sign: ['Sign it on camera. Both of us smiling.'],
      negotiate: ['Peace summit! Prime time! My podium is bigger.'],
      win: ['Roll credits. My name goes first.'],
      lose: ['The real winner here is me, in a sense.'],
    },
  },
};

const PERSONAS = [
  { name: 'Ottokar Venn', title: 'Marshal', archetype: 'HAWK', motto: 'Peace is a pause between victories.' },
  { name: 'Lydia Saraband', title: 'Premier', archetype: 'DOVE', motto: 'Find the table before the trench.' },
  { name: 'Rafe Calloway', title: 'President-for-Life', archetype: 'SHOWMAN', motto: 'If it is not on television, it did not happen.' },
  { name: 'Ivo Kestrel', title: 'Chairman', archetype: 'PARANOID', motto: 'Everyone is lying. Including me.' },
  { name: 'Amara Thule', title: 'Grand Vizier', archetype: 'SCHEMER', motto: 'Smile, sign, and wait.' },
  { name: 'Dax Morrow', title: 'General', archetype: 'ZEALOT', motto: 'Retreat is a word for other people.' },
  { name: 'Mirela Voss', title: 'Chancellor', archetype: 'PRAGMATIST', motto: 'Numbers, not nerves.' },
  { name: 'Kasimir Quell', title: 'Admiral', archetype: 'GAMBLER', motto: 'Fortune favors the first launch.' },
  { name: 'Elan Arkwright', title: 'Prime Minister', archetype: 'DOVE', motto: 'Every silo closed is a monument.' },
  { name: 'Yuri Halcyon', title: 'Commissar', archetype: 'HAWK', motto: 'The strong do not negotiate with arithmetic.' },
  { name: 'Tomas Varga-Reyes', title: 'Generalissimo', archetype: 'SHOWMAN', motto: 'Make it loud. Make it gold.' },
  { name: 'Nadia Fenwick', title: 'Director', archetype: 'SCHEMER', motto: 'The best spy is the friend you trust.' },
  { name: 'Odile Brecht', title: 'Field Marshal', archetype: 'ZEALOT', motto: 'Doubt is a luxury of the defeated.' },
  { name: 'Hiro Tanaka-Bell', title: 'Secretary-General', archetype: 'PRAGMATIST', motto: 'Every decision is a spreadsheet.' },
  { name: 'Idris Marquand', title: 'Sultan', archetype: 'GAMBLER', motto: 'The pot is the planet.' },
  { name: 'Selene Ashgrove', title: 'Lord Protector', archetype: 'PARANOID', motto: 'Walls first. Questions later.' },
  { name: 'Anselm Drake', title: 'Comrade Chairman', archetype: 'HAWK', motto: 'Hesitation is the enemy of the state.' },
  { name: 'Talia Wren', title: 'First Minister', archetype: 'DOVE', motto: 'Courage is choosing not to launch.' },
  { name: 'Lucan Vey', title: 'Archon', archetype: 'SCHEMER', motto: 'Let them think it was their idea.' },
  { name: 'Ruth Ironwood', title: 'Colonel', archetype: 'ZEALOT', motto: 'The line holds or the line burns.' },
  { name: 'Felix Okafor', title: 'Governor-General', archetype: 'PRAGMATIST', motto: 'Rebuild faster than they can break.' },
  { name: 'Cass Montclair', title: 'Emperor', archetype: 'SHOWMAN', motto: 'Glory is a renewable resource.' },
  { name: 'Petra Lindqvist', title: 'Marshal', archetype: 'GAMBLER', motto: 'Bluff until it is true.' },
  { name: 'Dmitri Sable', title: 'Overseer', archetype: 'PARANOID', motto: 'The shadows report to me.' },
];

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Returns `n` unique personas with personal trait jitter.
function draw(n) {
  const pool = PERSONAS.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const out = [];
  for (let i = 0; i < n; i++) {
    const base = pool[i % pool.length];
    const arch = ARCHETYPES[base.archetype];
    const traits = {};
    for (const [k, v] of Object.entries(arch.traits)) traits[k] = clamp01(v + (Math.random() - 0.5) * 0.2);
    out.push({ ...base, name: i < pool.length ? base.name : `${base.name} II`, traits });
  }
  return out;
}

function line(persona, event) {
  const pool = ARCHETYPES[persona?.archetype]?.lines?.[event];
  return pool ? pool[Math.floor(Math.random() * pool.length)] : null;
}

module.exports = { ARCHETYPES, PERSONAS, draw, line };
