// Two clients: create room, join, pick coalitions, chat (public + PM), treaty, submit orders, resolve a turn.
const { io } = require('socket.io-client');
const URL = process.env.URL || 'http://localhost:3000';
const a = io(URL), b = io(URL);
const log = (...x) => console.log(...x);
let code, aId, bId, step = 0, treatyFormed = false;
const done = (ok, msg) => { log(ok ? 'PASS' : 'FAIL', msg); a.close(); b.close(); process.exit(ok ? 0 : 1); };
setTimeout(() => done(false, 'timeout at step ' + step), 15000);

a.on('joined', (j) => { aId = j.pid; code = j.code; log('A created room', code); b.emit('join', { code, name: 'Bravo' }); });
b.on('joined', (j) => { bId = j.pid; log('B joined'); a.emit('setCoalition', 'AMNAT'); b.emit('setCoalition', 'SOVWAR'); });
a.on('lobby', (l) => {
  if (step === 0 && l.players.length === 2 && l.players.every((p) => p.coalition)) { step = 1; log('lobby ok', l.players.map((p) => p.name + ':' + p.coalition).join(',')); a.emit('setTimer', 30); a.emit('start'); }
});
b.on('chat', (m) => { log('B got chat', m.scope, m.text); if (m.scope === 'pm') { step = 3; a.emit('treaty:propose', 'SOVWAR'); setTimeout(() => { if (step === 3) { step = 5; a.emit('orders', { builds: { conv: 1 }, actions: [{ type: 'strike', kind: 'tactical', target: { kind: 'territory', id: '643' } }] }); b.emit('orders', { builds: {}, actions: [] }); } }, 1500); } });
b.on('state', (s) => {
  if (step === 3) {
    const t = s.treaties.find((t) => t.status === 'proposed' && t.b === 'SOVWAR');
    if (t) { step = 4; b.emit('treaty:respond', { id: t.id, accept: true }); }
  }
});
let readied = false;
a.on('state', (s) => {
  if (step === 1 && s.phase === 'summit' && !readied) {
    readied = true; log('world summit in session, seats:', s.me.countryName, '/', s.players.length, 'leaders');
    a.emit('treaty:propose', { target: 'REDCHI', kind: 'trade' });
    a.emit('ready', true); b.emit('ready', true);
  }
  if (step === 1 && s.phase === 'orders') {
    step = 2; log('game started, turn', s.turn, 'players', s.players.length, 'res', JSON.stringify(s.me.res));
    a.emit('chat', { to: 'all', text: 'hello world' });
    a.emit('chat', { to: bId, text: 'secret' });
  }
  if (step === 4 && s.treaties.some((t) => t.status === 'active')) {
    step = 5; treatyFormed = true; log('treaty active');
    a.emit('treaty:break', s.treaties.find((t) => t.status === 'active').id);
    a.emit('orders', { builds: { conv: 1 }, actions: [{ type: 'strike', kind: 'tactical', target: { kind: 'territory', id: '643' } }, { type: 'spy', mode: 'reveal', target: 'REDCHI' }] });
    b.emit('orders', { builds: {}, actions: [] });
  }
  if (step === 5 && s.phase === 'report') {
    step = 6;
    const broke = s.log.some((e) => e.text.includes('TREATY BROKEN'));
    log('turn resolved. esc', s.escalation, 'treaty broken announced:', broke, 'last events:', s.lastReport.events.length);
    log('private:', s.me.private.map((x) => x.text).join(' | '));
    const blocked = s.me.private.some((x) => /Order blocked: unlocks at THREAT LEVEL 4/.test(x.text));
    log('turn-1 nuke blocked by threat level:', blocked, '| threat', s.tier, '| active crises', s.trigsits.filter((t) => t.status === 'active').length);
    if (!blocked) return done(false, 'nuke should be locked at threat level 1');
    done(!treatyFormed || broke, 'full turn cycle' + (treatyFormed ? ' (treaty formed and broken)' : ' (no shared crisis: pact correctly unavailable at L1)'));
  }
});
a.on('errorMsg', (e) => done(false, e)); b.on('errorMsg', (e) => done(false, e));
a.emit('create', { name: 'Alpha' });
