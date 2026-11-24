// ESCHATON server: Express static + Socket.io rooms. Server owns all game state.
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const CONFIG = require('./config');
const Game = require('./game');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const nm = (p) => path.join(__dirname, '..', 'node_modules', p);

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/vendor/d3.min.js', (_, res) => res.sendFile(nm('d3/dist/d3.min.js')));
app.get('/vendor/topojson-client.min.js', (_, res) => res.sendFile(nm('topojson-client/dist/topojson-client.min.js')));
app.get('/vendor/countries-110m.json', (_, res) => res.sendFile(nm('world-atlas/countries-110m.json')));
app.get('/config.js', (_, res) => res.type('application/javascript').send(`window.CONFIG = ${JSON.stringify(CONFIG)};`));
app.get('/health', (_, res) => res.json({ ok: true, rooms: rooms.size }));

const rooms = new Map(); // code -> { game, timer, reportUntil, emptySince }

function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do c = Array.from({ length: 5 }, () => A[Math.floor(Math.random() * A.length)]).join(''); while (rooms.has(c));
  return c;
}
const clean = (s, n) => String(s || '').replace(/[<>]/g, '').trim().slice(0, n);

function broadcast(room) {
  const g = room.game;
  for (const p of g.players.values()) {
    if (!p.socketId) continue;
    if (g.phase === 'lobby') io.to(p.socketId).emit('lobby', { ...g.lobbyView(), you: p.id });
    else io.to(p.socketId).emit('state', g.viewFor(p.id));
  }
}

function chatVisibleTo(g, m, p) {
  if (m.scope === 'all') return true;
  if (m.scope === 'coalition') return p.coalition === m.coalition;
  return m.from === p.id || m.to === p.id;
}
function sendChatHistory(g, p) {
  io.to(p.socketId).emit('chatHistory', g.chat.filter((m) => chatVisibleTo(g, m, p)).slice(-150));
}

function tick(room) {
  const g = room.game;
  if (g.phase === 'orders' && (Date.now() >= g.deadline || g.allSubmitted())) {
    const report = g.resolve();
    for (const p of g.players.values()) if (p.socketId) io.to(p.socketId).emit('report', report);
    if (g.phase !== 'over') {
      g.phase = 'report';
      g.deadline = Date.now() + CONFIG.reportSeconds * 1000;
    }
    broadcast(room);
  } else if (g.phase === 'report' && Date.now() >= g.deadline) {
    g.nextTurn();
    broadcast(room);
  }
  // cleanup: no connected humans for 15 minutes
  const anyone = g.humans().some((p) => p.connected);
  if (anyone) room.emptySince = null;
  else if (!room.emptySince) room.emptySince = Date.now();
  else if (Date.now() - room.emptySince > 15 * 60 * 1000) { clearInterval(room.timer); rooms.delete(g.code); }
}

function createRoom() {
  const code = makeCode();
  const room = { game: new Game(code), emptySince: null };
  room.timer = setInterval(() => { try { tick(room); } catch (e) { console.error('tick error', e); } }, 500);
  rooms.set(code, room);
  return room;
}

io.on('connection', (socket) => {
  const ctx = () => {
    const room = rooms.get(socket.data.code);
    const p = room?.game.players.get(socket.data.pid);
    return room && p ? { room, g: room.game, p } : null;
  };
  const err = (msg) => socket.emit('errorMsg', msg);
  const bind = (room, p) => {
    p.socketId = socket.id; p.connected = true;
    socket.data.code = room.game.code; socket.data.pid = p.id;
    socket.join(room.game.code);
    socket.emit('joined', { code: room.game.code, pid: p.id, token: p.token });
    sendChatHistory(room.game, p);
    broadcast(room);
  };

  socket.on('create', ({ name } = {}) => {
    const room = createRoom();
    const p = room.game.addPlayer(clean(name, 16) || 'Commander');
    bind(room, p);
  });

  socket.on('join', ({ code, name, token } = {}) => {
    const room = rooms.get(clean(code, 8).toUpperCase());
    if (!room) return err('No game with that room code.');
    const g = room.game;
    // reconnect
    if (token) {
      const p = [...g.players.values()].find((x) => x.token === token);
      if (p) return bind(room, p);
    }
    if (g.phase === 'lobby') {
      if (g.humans().length >= CONFIG.maxPlayers) return err('Room is full.');
      return bind(room, g.addPlayer(clean(name, 16) || 'Commander'));
    }
    if (g.phase === 'over') return err('That game has ended.');
    // mid-game: take over an AI slot in the coalition with fewest humans
    const ais = [...g.players.values()].filter((x) => x.isAI);
    if (!ais.length || g.humans().length >= CONFIG.maxPlayers) return err('Game in progress and no AI slots left.');
    const humansIn = (c) => g.coalitionMembers(c).filter((x) => !x.isAI).length;
    ais.sort((a, b) => humansIn(a.coalition) - humansIn(b.coalition));
    const p = ais[0];
    p.isAI = false; p.name = clean(name, 16) || 'Commander'; p.token = `t${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    p.submitted = false; p.orders = null;
    g.pushLog(`${p.name} takes command of an ${p.coalition} slot.`, 'sys');
    bind(room, p);
  });

  socket.on('setCoalition', (c) => {
    const x = ctx(); if (!x) return;
    if (x.g.setCoalition(x.p.id, c)) broadcast(x.room);
  });
  socket.on('setTimer', (s) => {
    const x = ctx(); if (!x || x.g.hostId !== x.p.id || x.g.phase !== 'lobby') return;
    if (CONFIG.turnSecondOptions.includes(Number(s))) { x.g.turnSeconds = Number(s); broadcast(x.room); }
  });
  socket.on('start', () => {
    const x = ctx(); if (!x || x.g.hostId !== x.p.id || x.g.phase !== 'lobby') return;
    x.g.start();
    broadcast(x.room);
  });
  socket.on('orders', (orders) => {
    const x = ctx(); if (!x) return;
    if (x.g.submitOrders(x.p.id, orders)) broadcast(x.room);
  });
  socket.on('unsubmit', () => {
    const x = ctx(); if (!x) return;
    x.g.unsubmit(x.p.id); broadcast(x.room);
  });
  socket.on('treaty:propose', (target) => { const x = ctx(); if (x && x.g.proposeTreaty(x.p.id, target)) broadcast(x.room); });
  socket.on('treaty:respond', ({ id, accept } = {}) => { const x = ctx(); if (x && x.g.respondTreaty(x.p.id, id, !!accept)) broadcast(x.room); });
  socket.on('treaty:break', (id) => { const x = ctx(); if (x && x.g.breakTreaty(x.p.id, id)) broadcast(x.room); });

  socket.on('chat', ({ to, text } = {}) => {
    const x = ctx(); if (!x) return;
    const msg = clean(text, 300);
    if (!msg) return;
    const { g, p } = x;
    const m = { from: p.id, fromName: p.name, coalition: p.coalition, text: msg, t: Date.now(), scope: 'all' };
    if (to === 'coalition') m.scope = 'coalition';
    else if (to && to !== 'all') {
      const target = g.players.get(to);
      if (!target) return;
      m.scope = 'pm'; m.to = target.id; m.toName = target.name;
    }
    g.chat.push(m);
    if (g.chat.length > 500) g.chat.shift();
    for (const q of g.players.values()) if (q.socketId && chatVisibleTo(g, m, q)) io.to(q.socketId).emit('chat', m);
  });

  socket.on('disconnect', () => {
    const x = ctx(); if (!x) return;
    if (x.p.socketId !== socket.id) return;
    x.p.connected = false; x.p.socketId = null;
    if (x.g.phase === 'lobby') x.g.removePlayer(x.p.id);
    broadcast(x.room);
  });
});

server.listen(PORT, () => console.log(`ESCHATON listening on :${PORT}`));
