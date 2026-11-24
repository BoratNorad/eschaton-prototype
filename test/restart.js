// Reproduces "submit does nothing": start a tutorial, restart the server (like a Render redeploy),
// then press SUBMIT. Spawns its own server on port 3101.
const { spawn } = require('child_process');
const { JSDOM, VirtualConsole } = require('jsdom');
const PORT = 3101, URL = `http://localhost:${PORT}`;
let srv;
const startServer = () => new Promise((res) => {
  srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'inherit'] });
  srv.stdout.on('data', (d) => String(d).includes('listening') && res());
});
const stopServer = () => new Promise((res) => { srv.once('exit', res); srv.kill(); });
const fail = async (m) => { console.log('FAIL', m); await stopServer().catch(() => {}); process.exit(1); };
setTimeout(() => fail('timeout'), 60000);
process.on('unhandledRejection', () => {}); // network errors while the server is down are expected
process.on('uncaughtException', (e) => { if (!/ECONNRESET|ECONNREFUSED|fetch failed/.test(String(e) + String(e.cause))) throw e; });
(async () => {
  await startServer();
  const vc = new VirtualConsole();
  const dom = await JSDOM.fromURL(URL + '/', { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.fetch = (u, o) => fetch(new globalThis.URL(u, URL), o);
      w.SVGElement.prototype.getTotalLength = () => 100;
      w.SVGElement.prototype.getPointAtLength = () => ({ x: 0, y: 0 });
      w.Element.prototype.getBoundingClientRect = () => ({ width: 1200, height: 700, left: 0, top: 0 });
      w.localStorage.clear();
    } });
  const w = dom.window, $ = (s) => w.document.querySelector(s);
  const wait = async (fn, ms = 15000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) return false; await new Promise((r) => setTimeout(r, 100)); } return true; };
  await wait(() => w.io && $('[data-tutorial]')); await new Promise((r) => setTimeout(r, 300));
  $('[data-tutorial]').click();
  if (!(await wait(() => w.ESCH?.S?.tutorial && $('#submitBtn')))) await fail('tutorial did not start');
  console.log('tutorial running, turn', w.ESCH.S.turn);
  await stopServer(); console.log('server restarted (simulated redeploy)…');
  await startServer();
  await new Promise((r) => setTimeout(r, 3500)); // let socket.io reconnect
  $('#submitBtn').click();
  await new Promise((r) => setTimeout(r, 2500));
  const lost = $('#lost') && !$('#lost').classList.contains('hidden');
  const advanced = w.ESCH.S.me.submitted || w.ESCH.S.phase !== 'orders';
  console.log('after submit -> orders accepted:', advanced, '| player told game was lost:', !!lost, '| toast:', $('#toast').classList.contains('hidden') ? '-' : $('#toast').textContent);
  if (lost) { $('#lostRestart').click(); const ok = await wait(() => w.ESCH.S?.turn === 1 && $('#lost').classList.contains('hidden') && w.ESCH.S.code !== undefined);
    console.log('restart tutorial from overlay:', ok ? 'new game started, code ' + w.ESCH.S.code : 'FAILED'); if (!ok) await fail('restart failed'); }
  await stopServer();
  if (!lost && !advanced) { console.log('REPRODUCED: submit silently does nothing after a server restart'); process.exit(2); }
  console.log('PASS restart handling'); process.exit(0);
})().catch((e) => fail(e.stack));
