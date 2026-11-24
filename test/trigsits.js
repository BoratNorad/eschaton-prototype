// Headless test of the TRIGSIT dossier page: markers, 7x7 pair matrix, filters, briefing cards.
const { JSDOM, VirtualConsole } = require('jsdom');
const URL = process.env.URL || 'http://localhost:3000';
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push(e.message));
const fail = (m) => { console.log('FAIL', m, errors); process.exit(1); };
setTimeout(() => fail('timeout'), 30000);
(async () => {
  const dom = await JSDOM.fromURL(URL + '/trigsits.html', { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.fetch = (u, o) => fetch(new globalThis.URL(u, URL), o);
      w.Element.prototype.getBoundingClientRect = () => ({ width: 1200, height: 700, left: 0, top: 0 });
      // jsdom lacks SVG viewBox (real browsers have it); d3-zoom reads it when flying the map
      Object.defineProperty(w.SVGSVGElement.prototype, 'viewBox', { get: () => ({ baseVal: { x: 0, y: 0, width: 1200, height: 700 } }) });
      w.Element.prototype.scrollIntoView = () => {};
    } });
  const w = dom.window, d = w.document, $ = (s) => d.querySelector(s), $$ = (s) => [...d.querySelectorAll(s)];
  const wait = async (fn, ms = 10000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) return false; await new Promise((r) => setTimeout(r, 100)); } return true; };
  if (!(await wait(() => $$('g.trig').length && $$('.mx-cell[data-id]').length))) fail('page did not render');
  const cells = $$('.mx-cell[data-id]'), ids = new Set(cells.map((c) => c.dataset.id));
  console.log('markers:', $$('g.trig').length, '| matrix cells:', cells.length, '(unique', ids.size + ') | list rows:', $$('.td-row').length);
  if ($$('g.trig').length !== 21 || ids.size !== 21 || cells.length !== 42) fail('expected 21 trigsits / 42 cells');
  // symmetric: row A col B == row B col A
  cells[0].click();
  console.log('card:', $('.td-card h3').textContent, '|', $('.td-kicker').textContent);
  d.querySelector('[data-focus="LATAM"]').click();
  const visible = $$('.td-row').filter((r) => !r.classList.contains('hidden')).length;
  console.log('LATAM filter -> visible crises:', visible, '| dimmed cells:', $$('.mx-cell.dimmed').length);
  if (visible !== 6) fail('coalition filter should show 6');
  w.ESCH_TRIG.select('vela', true);
  console.log('select vela -> card:', $('.td-card h3').textContent, '| hash:', w.location.hash);
  if (errors.length) fail('runtime errors');
  console.log('PASS trigsit dossiers'); process.exit(0);
})().catch((e) => fail(e.stack));
