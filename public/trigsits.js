/* TRIGSIT dossier browser: map + 7x7 pair matrix + briefing cards. Static data from CONFIG. */
(() => {
  const C = window.CONFIG;
  const COALS = Object.keys(C.coalitions);
  const TR = C.trigsits;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const col = (c) => C.coalitions[c]?.color || '#888';
  const pairOf = (a, b) => TR.find((t) => t.sides.includes(a) && t.sides.includes(b));
  let selected = null, focus = null; // focus = coalition filter
  let terr = {}, svg, gRoot, gCountries, gTrig, projection, path, zoom, W, H, zoomK = 1;

  async function init() {
    terr = await (await fetch('/api/territories')).json();
    const topo = await (await fetch('/vendor/countries-110m.json')).json();
    const features = topojson.feature(topo, topo.objects.countries).features.filter((f) => f.properties.name !== 'Antarctica');
    svg = d3.select('#map');
    ({ width: W, height: H } = $('#mapWrap').getBoundingClientRect());
    projection = d3.geoNaturalEarth1().fitExtent([[10, 10], [W - 10, H - 10]], { type: 'FeatureCollection', features });
    path = d3.geoPath(projection);
    svg.attr('viewBox', `0 0 ${W} ${H}`);
    const defs = svg.append('defs');
    const glow = defs.append('filter').attr('id', 'glow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
    glow.append('feGaussianBlur').attr('stdDeviation', 2.2).attr('result', 'b');
    const m = glow.append('feMerge'); m.append('feMergeNode').attr('in', 'b'); m.append('feMergeNode').attr('in', 'SourceGraphic');
    gRoot = svg.append('g');
    gRoot.append('path').attr('class', 'sphere').attr('d', path({ type: 'Sphere' }));
    gRoot.append('path').attr('class', 'grat').attr('d', path(d3.geoGraticule10()));
    gCountries = gRoot.append('g');
    gTrig = gRoot.append('g');
    const tip = $('#tooltip');
    gCountries.selectAll('path').data(features).join('path').attr('class', (f) => 'country' + (terr[f.id] ? '' : ' neutral')).attr('d', path)
      .on('mousemove', (ev, f) => {
        const r = $('#mapWrap').getBoundingClientRect();
        tip.innerHTML = terr[f.id] ? `<b style="color:${col(terr[f.id])}">${esc(f.properties.name)}</b> · ${terr[f.id]}` : `${esc(f.properties.name)} · NON-ALIGNED`;
        tip.style.left = ev.clientX - r.left + 14 + 'px'; tip.style.top = ev.clientY - r.top + 10 + 'px'; tip.classList.remove('hidden');
      })
      .on('mouseleave', () => tip.classList.add('hidden'))
      .on('click', (ev, f) => { if (terr[f.id]) setFocus(focus === terr[f.id] ? null : terr[f.id]); });

    // two-tone markers: left half = side A, right half = side B
    const half = (r, side) => d3.arc()({ innerRadius: 0, outerRadius: r, startAngle: side ? 0 : Math.PI, endAngle: side ? Math.PI : 2 * Math.PI });
    const g = gTrig.selectAll('g.trig').data(TR, (d) => d.id).join((enter) => {
      const e = enter.append('g').attr('class', 'trig').attr('data-id', (d) => d.id).on('click', (ev, d) => { ev.stopPropagation(); select(d.id, true); })
        .on('mousemove', (ev, d) => {
          const r = $('#mapWrap').getBoundingClientRect();
          tip.innerHTML = `<b style="color:var(--amber)">⚠ ${esc(d.name)}</b> · ${d.year}<br><span style="color:${col(d.sides[0])}">${d.sides[0]}</span> vs <span style="color:${col(d.sides[1])}">${d.sides[1]}</span>`;
          tip.style.left = ev.clientX - r.left + 14 + 'px'; tip.style.top = ev.clientY - r.top + 10 + 'px'; tip.classList.remove('hidden');
        })
        .on('mouseleave', () => tip.classList.add('hidden'));
      e.append('circle').attr('class', 'ring').attr('r', 8);
      e.append('path').attr('d', half(6, 0)).style('fill', (d) => col(d.sides[0])).attr('class', 'half');
      e.append('path').attr('d', half(6, 1)).style('fill', (d) => col(d.sides[1])).attr('class', 'half');
      e.append('circle').attr('r', 6).attr('class', 'outline');
      e.append('text').attr('x', 9).attr('y', 3).text((d) => d.name);
      return e;
    });
    zoom = d3.zoom().scaleExtent([1, 8]).translateExtent([[0, 0], [W, H]]).on('zoom', (ev) => {
      gRoot.attr('transform', ev.transform); zoomK = ev.transform.k;
      g.attr('transform', (d) => `translate(${projection(d.lonlat)}) scale(${1 / Math.sqrt(zoomK)})`);
      labels();
    });
    svg.call(zoom).on('dblclick.zoom', null);
    g.attr('transform', (d) => `translate(${projection(d.lonlat)})`);
    renderFilters(); renderMatrix(); renderList(); render();
    const hash = location.hash.slice(1);
    if (hash && TR.some((t) => t.id === hash)) select(hash, true); else renderCard();
  }

  function labels() {
    gTrig.selectAll('g.trig text').style('display', (d) => (zoomK >= 2 || d.id === selected || (focus && d.sides.includes(focus)) ? null : 'none'));
  }

  function render() {
    const sel = TR.find((t) => t.id === selected);
    const hot = sel ? sel.sides : focus ? [focus] : null;
    gCountries.selectAll('path.country')
      .style('fill', (f) => (terr[f.id] ? col(terr[f.id]) : null))
      .style('fill-opacity', (f) => (!terr[f.id] ? null : !hot ? 0.55 : hot.includes(terr[f.id]) ? 0.85 : 0.12))
      .attr('filter', (f) => (hot && hot.includes(terr[f.id]) ? 'url(#glow)' : null));
    gTrig.selectAll('g.trig')
      .classed('selected', (d) => d.id === selected)
      .style('opacity', (d) => (!focus || d.sides.includes(focus) ? 1 : 0.18));
    labels();
    document.querySelectorAll('.mx-cell[data-id]').forEach((el) => {
      el.classList.toggle('on', el.dataset.id === selected);
      const t = TR.find((x) => x.id === el.dataset.id);
      el.classList.toggle('dimmed', !!focus && !t.sides.includes(focus));
    });
    document.querySelectorAll('.td-row').forEach((el) => {
      el.classList.toggle('on', el.dataset.id === selected);
      const t = TR.find((x) => x.id === el.dataset.id);
      el.classList.toggle('hidden', !!focus && !t.sides.includes(focus));
    });
    document.querySelectorAll('[data-focus]').forEach((b) => b.classList.toggle('on', (b.dataset.focus || null) === (focus || null) || (!focus && b.dataset.focus === '')));
  }

  function renderFilters() {
    $('#tdFilters').innerHTML = `<button class="chip" data-focus="">ALL 21</button>` +
      COALS.map((c) => `<button class="chip" data-focus="${c}" style="--c:${col(c)}">${c}</button>`).join('');
    document.querySelectorAll('[data-focus]').forEach((b) => b.onclick = () => setFocus(b.dataset.focus || null));
  }
  function setFocus(c) { focus = c; if (selected && focus && !TR.find((t) => t.id === selected).sides.includes(focus)) selected = null; render(); renderCard(); }

  function renderMatrix() {
    let h = `<div class="mx" style="grid-template-columns: 62px repeat(${COALS.length}, 1fr)"><div></div>` +
      COALS.map((c) => `<div class="mx-h" style="color:${col(c)}" title="${esc(C.coalitions[c].full)}">${c.slice(0, 3)}</div>`).join('');
    for (const a of COALS) {
      h += `<div class="mx-h mx-row" style="color:${col(a)}">${a}</div>`;
      for (const b of COALS) {
        if (a === b) { h += `<div class="mx-cell self" style="--c:${col(a)}"></div>`; continue; }
        const t = pairOf(a, b);
        h += `<div class="mx-cell" data-id="${t.id}" title="${esc(t.name)} (${t.year})" style="--a:${col(a)};--b:${col(b)}"><span>${t.year}</span></div>`;
      }
    }
    $('#tdMatrix').innerHTML = h + '</div>';
    document.querySelectorAll('.mx-cell[data-id]').forEach((el) => el.onclick = () => select(el.dataset.id, true));
  }

  function renderList() {
    $('#tdList').innerHTML = TR.slice().sort((a, b) => a.year - b.year).map((t) => `
      <div class="td-row" data-id="${t.id}"><span class="td-y">${t.year}</span><span class="td-n">⚠ ${esc(t.name)}</span>
        <span class="td-s"><span style="color:${col(t.sides[0])}">${t.sides[0]}</span> vs <span style="color:${col(t.sides[1])}">${t.sides[1]}</span></span></div>`).join('');
    document.querySelectorAll('.td-row').forEach((el) => el.onclick = () => select(el.dataset.id, true));
  }

  function renderCard() {
    const t = TR.find((x) => x.id === selected);
    if (!t) {
      $('#tdCard').innerHTML = `<div class="td-card"><h3>SELECT A TRIGSIT</h3><p class="note">Every pair of coalitions shares exactly one crisis, so the matrix above is the whole board: row × column = their flashpoint. Filter by coalition to see its six fronts.</p>
        <p class="note">A TRIGSIT resolves one of three ways, and <b>the game ends when all 21 have resolved</b>.</p></div>`;
      return;
    }
    const T = C.trigsit;
    const side = (c) => `<div class="td-side" style="--c:${col(c)}"><b>${c}</b> <span class="dim">${esc(C.coalitions[c].full)}</span><div class="small">◆ ${esc(C.coalitions[c].ability.name)}: ${esc(C.coalitions[c].ability.desc)}</div></div>`;
    $('#tdCard').innerHTML = `<div class="td-card">
      <div class="td-kicker">TRIGSIT DOSSIER · ${t.year} · FILE ${t.id.toUpperCase()}</div>
      <h3>⚠ ${esc(t.name)}</h3>
      <p class="td-blurb">${esc(t.blurb)}</p>
      <div class="td-vs">${side(t.sides[0])}<div class="td-vs-x">VS</div>${side(t.sides[1])}</div>
      <h4>HOW IT RESOLVES</h4>
      <div class="kv"><span>🕊 Negotiation</span><span>peace meter reaches ${T.peaceThreshold}% (${T.peacePerInfluence}% per INF, anyone can mediate)</span></div>
      <div class="kv"><span>⚔ Military</span><span>control bar pushed to either end (net divisions × ${T.progressPerForce}/turn)</span></div>
      <div class="kv"><span>⌛ Timer</span><span>freezes after ${t.timer} turns with no victor</span></div>
      <div class="actrow"><button class="btn small" id="tdFly">⌖ SHOW ON MAP</button><button class="btn small ghost" id="tdLink">🔗 COPY LINK</button></div>
    </div>`;
    $('#tdFly').onclick = () => flyTo(t);
    $('#tdLink').onclick = () => { const u = `${location.origin}/trigsits.html#${t.id}`; navigator.clipboard?.writeText(u).then(() => toast('Link copied'), () => toast(u)); };
  }

  function select(id, fly) {
    selected = id; history.replaceState(null, '', '#' + id);
    const t = TR.find((x) => x.id === id);
    if (focus && !t.sides.includes(focus)) focus = null;
    render(); renderCard();
    document.querySelector(`.td-row[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
    if (fly) flyTo(t);
  }
  function flyTo(t) {
    const [x, y] = projection(t.lonlat), k = 3.2;
    svg.transition().duration(900).call(zoom.transform, d3.zoomIdentity.translate(W / 2 - x * k, H / 2 - y * k).scale(k));
  }
  function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.remove('hidden'); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.add('hidden'), 2200); }
  window.ESCH_TRIG = { select, setFocus, get selected() { return selected; } };
  init();
})();
