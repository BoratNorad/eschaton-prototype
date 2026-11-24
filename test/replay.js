// Headless replay test: simulate an AI war via the API, load the replay viewer,
// step every turn, open the after-action report, render the share card to PNG.
// Usage: node test/replay.js [out.png]
const { JSDOM, VirtualConsole } = require('jsdom');
const { createCanvas } = require('@napi-rs/canvas');
const fs = require('fs');
const URL = process.env.URL || 'http://localhost:3000';
const OUT = process.argv[2] || 'share-card-test.png';
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => { if (!/Not implemented: navigation/.test(e.message)) errors.push(e.message); });
const fail = (m) => { console.log('FAIL', m, errors); process.exit(1); };
setTimeout(() => fail('timeout'), 60000);
(async () => {
  const sim = await (await fetch(URL + '/api/simulate', { method: 'POST' })).json();
  if (!sim.id) fail('simulate failed: ' + JSON.stringify(sim));
  console.log('simulated:', sim.id, '·', sim.headline);
  const dom = await JSDOM.fromURL(`${URL}/replay.html?id=${sim.id}`, { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.fetch = (u, o) => fetch(new globalThis.URL(u, URL), o);
      w.SVGElement.prototype.getTotalLength = () => 100;
      w.SVGElement.prototype.getPointAtLength = () => ({ x: 0, y: 0 });
      w.Element.prototype.getBoundingClientRect = () => ({ width: 1200, height: 700, left: 0, top: 0 });
      w.HTMLCanvasElement.prototype.getContext = function () { if (!this._c) this._c = createCanvas(this.width, this.height); return this._c.getContext('2d'); };
    } });
  const w = dom.window, d = w.document, $ = (s) => d.querySelector(s);
  const wait = async (fn, ms = 10000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) return false; await new Promise((r) => setTimeout(r, 100)); } return true; };
  if (!(await wait(() => w.ESCH_REPLAY?.R && d.querySelectorAll('path.country').length > 100))) fail('replay did not load');
  const R = w.ESCH_REPLAY.R;
  console.log('frames:', R.frames.length, '| leaders:', d.querySelectorAll('.leader').length, '| headline:', $('#rpHeadline').textContent);
  $('#rpPlay').click(); $('#rpPlay').click(); // play/pause toggles
  for (let i = 0; i < R.frames.length; i++) w.ESCH_REPLAY.show(i, true);
  console.log('last frame turn label:', $('#rpTurn').textContent, '| feed items:', d.querySelectorAll('#tab-feed .le, #tab-feed .quote').length);
  $('#aarBtn').click();
  await wait(() => !$('#aar').classList.contains('hidden'));
  console.log('AAR:', $('.dos-head').textContent, '| moments', d.querySelectorAll('.tl').length, '| awards', d.querySelectorAll('.award').length, '| quotes', d.querySelectorAll('.dos-quotes .quote').length);
  const cv = w.ESCH_REPLAY.drawCard();
  fs.writeFileSync(OUT, cv._c.toBuffer('image/png'));
  console.log('share card written:', OUT);
  if (errors.length) fail('runtime errors');
  console.log('PASS replay viewer'); process.exit(0);
})().catch((e) => fail(e.stack));
