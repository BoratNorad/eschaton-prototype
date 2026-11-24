// Headless UI smoke test: loads the real page in jsdom against a running server,
// creates a game, launches it, exercises every tab, queues orders, submits, waits for a report.
const { JSDOM, VirtualConsole } = require('jsdom');
const URL = process.env.URL || 'http://localhost:3000';
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push(e.message));
vc.on('error', (e) => errors.push(String(e)));
const fail = (m) => { console.log('FAIL', m, errors); process.exit(1); };
setTimeout(() => fail('timeout'), 40000);
(async () => {
  const dom = await JSDOM.fromURL(URL + '/', { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.fetch = (u, o) => fetch(new globalThis.URL(u, URL), o);
      w.SVGElement.prototype.getTotalLength = () => 100;
      w.SVGElement.prototype.getPointAtLength = () => ({ x: 0, y: 0 });
      w.Element.prototype.getBoundingClientRect = () => ({ width: 1200, height: 700, left: 0, top: 0 });
      w.confirm = () => true;
    } });
  const w = dom.window, $ = (s) => w.document.querySelector(s);
  const wait = async (fn, ms = 8000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) return false; await new Promise((r) => setTimeout(r, 100)); } return true; };
  if (!(await wait(() => w.io && $('#createBtn')))) fail('page did not load');
  await new Promise((r) => setTimeout(r, 500));
  $('#nameInput').value = 'Tester';
  $('#createBtn').click();
  if (!(await wait(() => !$('#lobby').classList.contains('hidden')))) fail('no lobby');
  console.log('lobby shown, code', $('#lobbyCode').textContent, 'cards', w.document.querySelectorAll('.coal-card').length);
  w.document.querySelector('[data-join="AMNAT"]').click();
  await wait(() => $('.coal-card.mine'));
  $('#startBtn').click();
  if (!(await wait(() => !$('#game').classList.contains('hidden') && w.document.querySelectorAll('path.country').length > 100))) fail('game/map did not render');
  console.log('map countries:', w.document.querySelectorAll('path.country').length, 'trigsits:', w.document.querySelectorAll('g.trig').length);
  console.log('scoreboard rows:', w.document.querySelectorAll('.sb-row').length, '| esc segs:', w.document.querySelectorAll('.seg').length, '| phase:', $('.phase.on')?.textContent);
  // click Russia, queue tactical strike
  const ru = [...w.document.querySelectorAll('path.country')].find((p) => p.__data__.id === '643');
  ru.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(() => $('#tacBtn'));
  console.log('target panel:', $('#tab-target h3').textContent);
  $('#tacBtn').click();
  // click Berlin trigsit, deploy
  const berlin = [...w.document.querySelectorAll('g.trig')].find((g) => g.__data__.id === 'berlin');
  berlin.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await wait(() => $('#comBtn'));
  $('#comBtn').click();
  // tabs
  for (const t of ['build', 'intel', 'diplo', 'comms', 'target']) w.document.querySelector(`[data-tab="${t}"]`).click();
  w.document.querySelector('[data-tab="build"]').click();
  w.document.querySelector('[data-inc="conv"]').click();
  w.document.querySelector('[data-tab="intel"]').click();
  w.document.querySelector('[data-reveal="SOVWAR"]').click();
  w.document.querySelector('[data-tab="diplo"]').click();
  w.document.querySelector('[data-prop="LATAM"]').click();
  w.document.querySelector('[data-tab="comms"]').click();
  $('#chatText').value = 'testing comms'; $('#chatSend').click();
  await wait(() => $('#chatLog').textContent.includes('testing comms'));
  console.log('orders queued:', [...w.document.querySelectorAll('.order')].map((o) => o.textContent.trim()).join(' | '));
  $('#submitBtn').click();
  if (!(await wait(() => !$('#reportBox').classList.contains('hidden'), 10000))) fail('no report');
  console.log('report lines:', w.document.querySelectorAll('#reportBox .le').length, '| phase:', $('.phase.on')?.textContent, '| esc:', $('#escLabel').textContent);
  await new Promise((r) => setTimeout(r, 300));
  console.log('nuke lines:', [...w.document.querySelectorAll('#reportBox .le.nuke, #reportBox .le.warn')].map((e) => e.textContent).join(' // '));
  console.log('tester log:', [...w.document.querySelectorAll('#logBar .le')].map((e) => e.textContent).filter((t) => /Tester|AMNAT/.test(t)).join(' // '));
  console.log('private:', [...w.document.querySelectorAll('#reportBox .le')].slice(-4).map((e) => e.textContent).join(' // '));
  console.log('esc after state:', $('#escLabel').textContent);
  console.log('chat ok:', $('#chatLog').textContent.includes('testing comms'), '| missiles drawn:', w.document.querySelectorAll('path.missile').length);
  if (errors.length) fail('runtime errors');
  console.log('PASS UI smoke test'); process.exit(0);
})().catch((e) => fail(e.stack));
