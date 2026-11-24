// Headless tutorial walkthrough: plays every coach step like a new player would.
const { JSDOM, VirtualConsole } = require('jsdom');
const URL = process.env.URL || 'http://localhost:3000';
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push(e.message));
const fail = (m) => { console.log('FAIL', m, errors); process.exit(1); };
setTimeout(() => fail('timeout'), 60000);
(async () => {
  const dom = await JSDOM.fromURL(URL + '/', { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.fetch = (u, o) => fetch(new globalThis.URL(u, URL), o);
      w.SVGElement.prototype.getTotalLength = () => 100;
      w.SVGElement.prototype.getPointAtLength = () => ({ x: 0, y: 0 });
      w.Element.prototype.getBoundingClientRect = () => ({ width: 1200, height: 700, left: 0, top: 0 });
      // jsdom lacks SVG viewBox (real browsers have it); d3-zoom reads it when flying the map
      Object.defineProperty(w.SVGSVGElement.prototype, 'viewBox', { get: () => ({ baseVal: { x: 0, y: 0, width: 1200, height: 700 } }) });
      w.localStorage.clear();
    } });
  const w = dom.window, d = w.document, $ = (s) => d.querySelector(s);
  const wait = async (fn, ms = 8000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) return false; await new Promise((r) => setTimeout(r, 100)); } return true; };
  const title = () => $('#coach h3')?.textContent;
  const expect = async (t) => { if (!(await wait(() => title() === t, 10000))) fail(`expected step "${t}", got "${title()}"`); console.log('  ✓', t, $('#coachRing').classList.contains('hidden') ? '' : '(ring)'); };
  const next = () => $('#coachNext').click();
  const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  await wait(() => w.io && $('[data-tutorial]'));
  await new Promise((r) => setTimeout(r, 400));
  $('[data-tutorial]').click();
  if (!(await wait(() => w.ESCH?.S?.tutorial))) fail('tutorial game did not start');
  const S = () => w.ESCH.S;
  console.log('tutorial game:', S().me.coalition, 'turnSeconds', S().turnSeconds, 'players', S().players.length);
  await expect('WELCOME, COMMANDER'); next();
  await expect('HOW YOU WIN'); next();
  await expect('IT STARTS SMALL'); next();
  console.log('    active crises at start:', S().trigsits.filter((t) => t.status === 'active').map((t) => t.id).join(','), '| threat', S().tier);
  await expect('ESCALATION & THREAT LEVEL'); next();
  await expect('YOUR RESOURCES'); next();
  await expect('OPEN YOUR CRISIS');
  await wait(() => $('g.trig[data-id="berlin"]')); click($('g.trig[data-id="berlin"]'));
  await expect('DEPLOY DIVISIONS'); $('#comBtn').click();
  await expect('THE ORDERS QUEUE'); next();
  await expect('BUILD SOMETHING'); $('[data-tab="build"]').click(); await wait(() => $('[data-inc="defense"]'));
  console.log('    locked builds at L1:', [...d.querySelectorAll('.unit.locked .nm')].map((n) => n.firstChild.textContent.trim()).join(', '));
  $('[data-inc="defense"]').click();
  await expect('SUBMIT YOUR ORDERS'); $('#submitBtn').click();
  await expect('RESOLUTION');
  await expect('NEGOTIATE'); console.log('    now turn', S().turn);
  $('[data-tab="target"]').click(); click($('g.trig[data-id="berlin"]')); await wait(() => $('#negBtn'));
  $('#negAmt').value = '3'; $('#negBtn').click();
  await expect('DIPLOMACY'); $('[data-tab="diplo"]').click();
  console.log('    pact buttons locked at L1:', [...d.querySelectorAll('[data-prop]')].filter((b) => b.disabled).map((b) => b.dataset.prop).join(','));
  if ($('[data-acc]')) { console.log('    SOVWAR already offered a pact -> accepting it'); $('[data-acc]').click(); } else $('[data-prop="SOVWAR"]').click();
  await expect('LOCKED CAPABILITIES'); next();
  await expect('SUBMIT AGAIN'); $('#submitBtn').click();
  await expect("YOU'RE READY");
  console.log('    orders resolved on turn 2:', S().log.filter((e) => e.turn === 2 && /Recruit|Tester/.test(e.text)).map((e) => e.text).join(' // '));
  $('#coachNext').click();
  await wait(() => $('#coach').classList.contains('hidden'));
  if (errors.length) fail('runtime errors');
  console.log('PASS tutorial walkthrough'); process.exit(0);
})().catch((e) => fail(e.stack));
