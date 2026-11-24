/* ESCHATON replay viewer + after-action report + share card. */
(() => {
  const C = window.CONFIG;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const col = (c) => C.coalitions[c]?.color || '#888';
  const toast = (msg, ms = 2600) => { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), ms); };
  const ARCH_ICON = { HAWK: '🦅', DOVE: '🕊', GAMBLER: '🎲', PARANOID: '👁', SCHEMER: '🐍', ZEALOT: '🔥', PRAGMATIST: '📊', SHOWMAN: '🎭', HUMAN: '👤', COALITION: '🏚' };

  const id = new URLSearchParams(location.search).get('id');
  let R = null, frame = 0, playing = false, timer = null;
  let terrIdx = {}, terrInfo = {}, playersById = {};
  let svg, gRoot, gCountries, gTrig, gFx, path, projection, features = [], centroids = {}, zoomK = 1;

  // ======================================================== load
  async function load() {
    if (!id) return noReplay('No replay selected.');
    const res = await fetch('/api/replay/' + encodeURIComponent(id));
    if (!res.ok) return noReplay((await res.json().catch(() => ({}))).error || 'Replay not found.');
    R = await res.json();
    R.terr.forEach(([tid, c, maxHp, name], i) => { terrIdx[tid] = i; terrInfo[tid] = { c, maxHp, name }; });
    for (const p of R.players) playersById[p.id] = p;
    $('#rpMode').textContent = R.mode === 'ai' ? `AI WAR · ${R.players.length} LEADERS` : 'GAME REPLAY';
    $('#rpHeadline').textContent = R.summary.headline;
    document.title = `ESCHATON: ${R.summary.headline}`;
    $('#rpSlider').max = R.frames.length - 1;
    await initMap();
    renderLeaders();
    show(0, false);
    setTimeout(() => play(), 900);
  }
  function noReplay(msg) {
    $('#rpHeadline').textContent = msg;
    $('#aarBody').innerHTML = `<h2>REPLAY UNAVAILABLE</h2><p class="dim">${esc(msg)} Replays are kept in server memory, so a server restart (or a sleeping free-tier instance) clears them.</p>
      <div class="row"><a class="btn" href="/">HOME</a><button class="btn primary" id="simAgain">☢ SIMULATE AN AI WAR</button></div>`;
    $('#aar').classList.remove('hidden');
    $('#simAgain').onclick = simulateNew;
  }
  async function simulateNew() {
    toast('Simulating 21 heads of state…');
    const r = await fetch('/api/simulate', { method: 'POST' });
    const j = await r.json();
    if (!r.ok) return toast(j.error || 'Simulation failed');
    location.href = '/replay.html?id=' + j.id;
  }

  // ======================================================== map
  async function initMap() {
    const topo = await (await fetch('/vendor/countries-110m.json')).json();
    features = topojson.feature(topo, topo.objects.countries).features.filter((f) => f.properties.name !== 'Antarctica');
    svg = d3.select('#map');
    const { width, height } = $('#mapWrap').getBoundingClientRect();
    projection = d3.geoNaturalEarth1().fitExtent([[10, 10], [width - 10, height - 10]], { type: 'FeatureCollection', features });
    path = d3.geoPath(projection);
    svg.attr('viewBox', `0 0 ${width} ${height}`);
    const defs = svg.append('defs');
    const glow = defs.append('filter').attr('id', 'glow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
    glow.append('feGaussianBlur').attr('stdDeviation', 2.2).attr('result', 'b');
    const m = glow.append('feMerge'); m.append('feMergeNode').attr('in', 'b'); m.append('feMergeNode').attr('in', 'SourceGraphic');
    gRoot = svg.append('g');
    gRoot.append('path').attr('class', 'sphere').attr('d', path({ type: 'Sphere' }));
    gRoot.append('path').attr('class', 'grat').attr('d', path(d3.geoGraticule10()));
    gCountries = gRoot.append('g'); gTrig = gRoot.append('g'); gFx = gRoot.append('g');
    for (const f of features) {
      let g = f.geometry;
      if (g.type === 'MultiPolygon') g = g.coordinates.map((c) => ({ type: 'Polygon', coordinates: c })).sort((a, b) => d3.geoArea(b) - d3.geoArea(a))[0];
      centroids[f.id] = d3.geoCentroid(g);
    }
    const tip = $('#tooltip');
    gCountries.selectAll('path').data(features).join('path').attr('class', 'country').attr('d', path)
      .on('mousemove', (ev, f) => {
        const t = terrInfo[f.id]; const fr = R.frames[frame];
        const r = $('#mapWrap').getBoundingClientRect();
        tip.innerHTML = t ? `<b style="color:${col(t.c)}">${esc(t.name)}</b> · ${t.c} · HP ${fr.hp[terrIdx[f.id]]}/${t.maxHp}` : `${esc(f.properties.name)} · NON-ALIGNED`;
        tip.style.left = ev.clientX - r.left + 14 + 'px'; tip.style.top = ev.clientY - r.top + 10 + 'px';
        tip.classList.remove('hidden');
      })
      .on('mouseleave', () => tip.classList.add('hidden'));
    const zoom = d3.zoom().scaleExtent([1, 8]).translateExtent([[0, 0], [width, height]]).on('zoom', (ev) => {
      gRoot.attr('transform', ev.transform); zoomK = ev.transform.k;
      gTrig.selectAll('.trig').attr('transform', (d) => `translate(${projection(d.lonlat)}) scale(${1 / Math.sqrt(zoomK)})`);
      if (R) renderMap(R.frames[frame]);
    });
    svg.call(zoom).on('dblclick.zoom', null);
  }

  function renderMap(fr) {
    gCountries.selectAll('path.country')
      .attr('class', (f) => { const t = terrInfo[f.id]; const hp = t ? fr.hp[terrIdx[f.id]] : 1; return 'country' + (t ? '' : ' neutral') + (t && hp <= 0 ? ' dead' : ''); })
      .style('fill', (f) => (terrInfo[f.id] ? col(terrInfo[f.id].c) : null))
      .style('fill-opacity', (f) => { const t = terrInfo[f.id]; return t ? 0.25 + 0.5 * (fr.hp[terrIdx[f.id]] / t.maxHp) : null; });
    const data = R.trigsits.map((t, i) => ({ ...t, ...fr.trig[i] }));
    const g = gTrig.selectAll('g.trig').data(data, (d) => d.id).join((enter) => {
      const e = enter.append('g');
      e.append('circle').attr('class', 'ring').attr('r', 7);
      e.append('circle').attr('class', 'core').attr('r', 4.5);
      e.append('text').attr('x', 8).attr('y', 3);
      return e;
    });
    g.style('display', (d) => (d.s === 'dormant' ? 'none' : null));
    g.attr('class', (d) => `trig ${d.s}`).attr('transform', (d) => `translate(${projection(d.lonlat)}) scale(${1 / Math.sqrt(zoomK)})`);
    g.select('text').text((d) => {
      const full = zoomK >= 2.2; // 21 crises: names only when zoomed in
      if (d.s === 'active') return full ? `⚠ ${d.name} [${d.left}]` : `[${d.left}]`;
      const icon = d.how === 'peace' ? '🕊' : d.how === 'military' ? '⚔' : '⌛';
      return full ? `${d.name} ${icon}${d.how === 'military' ? ' ' + d.win : ''}` : icon;
    });
  }

  function playAnims(anims, budgetMs) {
    if (!anims?.length) return;
    const step = Math.min(280, (budgetMs * 0.55) / anims.length);
    anims.forEach((a, i) => {
      if (a.flare) {
        const [x, y] = projection(a.to);
        for (let k = 0; k < 3; k++) gFx.append('circle').attr('cx', x).attr('cy', y).attr('r', 2).style('fill', 'none').style('stroke', '#ff8a3d').style('stroke-width', 2).attr('filter', 'url(#glow)')
          .transition().delay(i * step + k * 300).duration(1300).attr('r', 34).style('opacity', 0).remove();
        return;
      }
      const to = a.to || centroids[a.toTerritory] || [0, 0];
      const p = gFx.append('path').attr('class', 'missile').attr('d', path({ type: 'LineString', coordinates: [a.from, to] }))
        .style('stroke', col(a.coalition)).attr('filter', 'url(#glow)');
      const len = p.node().getTotalLength() || 1;
      p.attr('stroke-dasharray', `${len} ${len}`).attr('stroke-dashoffset', len)
        .transition().delay(i * step).duration(Math.min(1100, budgetMs * 0.35)).ease(d3.easeCubicIn)
        .attr('stroke-dashoffset', a.intercepted ? len * 0.15 : 0)
        .on('end', () => {
          const pt = a.intercepted ? p.node().getPointAtLength(len * 0.85) : (() => { const q = projection(to); return { x: q[0], y: q[1] }; })();
          gFx.append('circle').attr('class', 'blast').attr('cx', pt.x).attr('cy', pt.y).attr('r', 1)
            .style('fill', a.intercepted ? '#9fdcff' : '#fff6c0').attr('filter', 'url(#glow)')
            .transition().duration(450).attr('r', a.intercepted ? 5 : a.kind === 'strategic' ? 22 : 12).style('fill', a.intercepted ? '#9fdcff' : '#ff5a1f')
            .transition().duration(1300).style('opacity', 0).remove();
          p.transition().duration(1500).style('opacity', 0).remove();
        });
    });
  }

  // ======================================================== frame display
  function frameMs() { return 4200 / Number($('#rpSpeed').value); }
  function show(i, animate) {
    frame = Math.max(0, Math.min(R.frames.length - 1, i));
    const fr = R.frames[frame];
    $('#rpSlider').value = frame;
    $('#rpTurn').textContent = frame === 0 ? 'START' : `TURN ${fr.turn} / ${R.final.turn}`;
    if (!animate) gFx.selectAll('*').remove();
    renderMap(fr);
    renderEsc(fr.esc);
    renderScore(fr);
    renderFeed(fr);
    if (animate) playAnims(fr.anims, frameMs());
    // banner for big moments
    const big = R.summary.moments.filter((m) => m.turn === fr.turn && m.weight >= 8 && frame > 0);
    const b = $('#rpBanner');
    if (animate && big.length) {
      b.innerHTML = big.map((m) => `<div><span class="bn-ic">${m.icon}</span> ${esc(m.title)}</div>`).join('');
      b.classList.remove('hidden'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
      clearTimeout(b._t); b._t = setTimeout(() => b.classList.add('hidden'), Math.max(1600, frameMs() * 0.8));
    } else if (!animate) b.classList.add('hidden');
    if (fr.esc >= C.escalation.max && animate) { const m = $('#mapWrap'); m.classList.remove('flash-red'); void m.offsetWidth; m.classList.add('flash-red'); }
  }

  function renderEsc(e) {
    const max = C.escalation.max, segs = [];
    for (let i = 0; i < max; i++) {
      const fill = Math.max(0, Math.min(1, e - i));
      const hue = i < 4 ? '#4dff9a' : i < 7 ? '#ffb000' : '#ff3b3b';
      segs.push(`<div class="seg ${fill > 0 ? 'lit' : ''}" style="color:${hue}"><i style="width:${fill * 100}%;background:${hue}"></i></div>`);
    }
    $('#escMeter').innerHTML = segs.join('');
    $('#escLabel').textContent = `${C.escalation.labels[Math.min(max, Math.floor(e))]} · ${e}/${max}`;
    $('#escBox').classList.toggle('hot', e >= 7);
  }

  function renderScore(fr) {
    const rows = R.coalitions.map((c, i) => { const [inf, suf] = fr.scores[i]; return { c, inf, suf, ratio: inf / Math.max(suf, C.ratioFloor) }; }).sort((a, b) => b.ratio - a.ratio);
    const maxR = Math.max(1, ...rows.map((r) => r.ratio));
    $('#scoreboard').innerHTML = `<h4>INDDIR / SUFDDIR</h4>` + rows.map((r) => `
      <div class="sb-row" style="--c:${col(r.c)}"><span class="sw"></span><span class="nm">${r.c}</span>
        <span class="bar"><i style="width:${(r.ratio / maxR) * 100}%"></i></span><span class="rt">${r.ratio.toFixed(2)}</span>
        <span class="sub">dealt ${r.inf} · took ${r.suf}</span></div>`).join('') +
      `<div class="dim small" style="margin-top:4px">TRIGSITs: ${fr.trig.filter((t) => t.s === 'active').length} active · ${fr.trig.filter((t) => t.s === 'resolved').length} resolved · ${fr.trig.filter((t) => t.s === 'dormant').length} dormant</div>`;
  }

  function quoteCard(q) {
    const p = playersById[q.pid];
    return `<div class="quote" style="--c:${col(q.coalition)}"><div class="q-who">${ARCH_ICON[q.archetype] || ''} ${esc(q.name)} <span>${q.coalition}</span></div><div class="q-text">“${esc(q.text)}”</div></div>`;
  }
  function renderFeed(fr) {
    const el = $('#tab-feed');
    if (frame === 0) {
      el.innerHTML = `<h3>THE WORLD, TURN ZERO</h3><p class="note">${R.players.length} heads of state. ${fr.trig.filter((t) => t.s === 'active').length} live crises, ${fr.trig.filter((t) => t.s === 'dormant').length} more waiting to ignite. Every arsenal at its historical peak, locked behind the threat level.</p>` +
        fr.quotes.map(quoteCard).join('') + `<p class="note">Press ▶ PLAY, or step through turns with ◀ ▶▶.</p>`;
      return;
    }
    el.innerHTML = `<h3>TURN ${fr.turn} DISPATCHES</h3>` + fr.quotes.map(quoteCard).join('') +
      fr.events.map(([t, cls]) => `<div class="le ${cls}">${esc(t)}</div>`).join('') +
      (fr.events.length ? '' : '<div class="note">Quiet turn. The world holds its breath.</div>');
    el.scrollTop = 0;
  }

  function renderLeaders() {
    $('#tab-leaders').innerHTML = R.coalitions.map((c) => {
      const mem = R.players.filter((p) => p.coalition === c);
      return `<h4 style="color:${col(c)}">${c} · ${esc(C.coalitions[c].full)}</h4>` + mem.map((p) => `
        <div class="leader" style="--c:${col(c)}">
          <div class="l-name">${ARCH_ICON[p.persona?.archetype || 'HUMAN']} ${esc(p.persona ? p.persona.title + ' ' + p.name : p.name)}</div>
          <div class="l-arch">${p.persona ? p.persona.archetype : 'HUMAN COMMANDER'}</div>
          ${p.persona ? `<div class="l-motto">“${esc(p.persona.motto)}”</div>` : ''}
          <div class="l-stats">dealt ${p.stats.dealt} · ☢ ${p.stats.nukes} · 🕊 ${Math.round(p.stats.negotiated)} · 🗡 ${p.stats.betrayals}</div>
        </div>`).join('');
    }).join('');
  }

  // ======================================================== playback
  function play() {
    if (frame >= R.frames.length - 1) show(0, false);
    playing = true; $('#rpPlay').textContent = '⏸ PAUSE';
    tick();
  }
  function pause() { playing = false; clearTimeout(timer); $('#rpPlay').textContent = '▶ PLAY'; }
  function tick() {
    if (!playing) return;
    if (frame >= R.frames.length - 1) { pause(); setTimeout(openAAR, 1200); return; }
    show(frame + 1, true);
    timer = setTimeout(tick, frameMs() + (R.frames[frame].anims.length > 40 ? 1500 : 0));
  }
  $('#rpPlay').onclick = () => (playing ? pause() : play());
  $('#rpNext').onclick = () => { pause(); show(frame + 1, true); };
  $('#rpPrev').onclick = () => { pause(); show(frame - 1, false); };
  $('#rpFirst').onclick = () => { pause(); show(0, false); };
  $('#rpLast').onclick = () => { pause(); show(R.frames.length - 1, false); };
  $('#rpSlider').oninput = (e) => { pause(); show(Number(e.target.value), false); };
  $$('#tabs button').forEach((b) => b.onclick = () => {
    $$('#tabs button').forEach((x) => x.classList.toggle('active', x === b));
    $$('.tab').forEach((t) => t.classList.toggle('hidden', t.id !== 'tab-' + b.dataset.tab));
  });
  $('#aarBtn').onclick = () => { pause(); openAAR(); };

  // ======================================================== after-action report
  function openAAR() {
    const S = R.summary, st = S.stats, fin = R.final;
    const maxR = Math.max(1, ...fin.scoreboard.map((r) => r.ratio));
    $('#aarBody').innerHTML = `
      <div class="stamp ${S.stamp === 'MUTUALLY ASSURED' ? 'red' : ''}">${esc(S.stamp)}</div>
      <div class="dos-kicker">ESCHATON // AFTER-ACTION REPORT // ${R.mode === 'ai' ? 'AI WAR SIMULATION' : 'COMMANDERS’ GAME'} // FILE ${esc(R.id).toUpperCase()}</div>
      <h1 class="dos-head">${esc(S.headline)}</h1>
      <p class="dos-dek">${esc(S.dek)}</p>
      <div class="dos-winner" style="--c:${col(fin.winner)}">🏆 <b>${fin.winner}</b> PREVAILS · INDDIR/SUFDDIR <b>${fin.scoreboard[0].ratio.toFixed(2)}</b> · ${esc(fin.reason)} · ${fin.turn} turns</div>
      <div class="dos-stats">
        ${[['☢', st.nukes, 'WARHEADS LAUNCHED'], ['🛡', st.intercepted, 'INTERCEPTED'], ['🔥', st.glassed, 'TERRITORIES GLASSED'], ['🗡', st.betrayals, 'BETRAYALS'], ['🕊', st.peace, 'PEACE DEALS'], ['📈', st.peakEsc + '/10', 'PEAK ESCALATION']]
          .map(([i, v, k]) => `<div class="dstat"><div class="dv">${i} ${v}</div><div class="dk">${k}</div></div>`).join('')}
      </div>
      <div class="dos-cols">
        <div>
          <h4>KEY MOMENTS</h4>
          <div class="timeline">${S.moments.map((m) => `<div class="tl"><span class="tl-t">T${m.turn}</span><span class="tl-ic">${m.icon}</span><div><b>${esc(m.title)}</b><div>${esc(m.text)}</div></div></div>`).join('') || '<div class="note">Nothing of note. Suspicious.</div>'}</div>
        </div>
        <div>
          <h4>FINAL STANDINGS</h4>
          ${fin.scoreboard.map((r, i) => `<div class="sb-row" style="--c:${col(r.c)}"><span class="sw"></span><span class="nm">${i + 1}. ${r.c}</span><span class="bar"><i style="width:${(r.ratio / maxR) * 100}%"></i></span><span class="rt">${r.ratio.toFixed(2)}</span></div>`).join('')}
          <h4>DECORATIONS</h4>
          ${S.awards.map((a) => `<div class="award" style="--c:${col(a.coalition)}"><div class="aw-t">${esc(a.title)}</div><div class="aw-w">${ARCH_ICON[a.archetype] || ''} ${esc(a.who)} <span>${a.coalition}</span></div><div class="aw-y">${esc(a.why)}</div>${a.quote ? `<div class="aw-q">“${esc(a.quote)}”</div>` : ''}</div>`).join('')}
        </div>
      </div>
      ${S.quotes.length ? `<h4>ON THE RECORD</h4><div class="dos-quotes">${S.quotes.map((q) => `<div class="quote" style="--c:${col(q.coalition)}"><div class="q-text">“${esc(q.text)}”</div><div class="q-who">${esc(q.who)} <span>${q.coalition} · T${q.turn}</span></div></div>`).join('')}</div>` : ''}
      <p class="dos-epitaph">${esc(S.epitaph)}</p>
      <div class="dos-actions">
        <button class="btn primary" id="dlCard">⬇ DOWNLOAD SHARE CARD</button>
        <button class="btn" id="cpText">📋 COPY TEXT FOR GROUP CHAT</button>
        <button class="btn" id="cpLink">🔗 COPY REPLAY LINK</button>
        <button class="btn danger" id="simNew">☢ SIMULATE ANOTHER WAR</button>
        <button class="btn ghost" id="aarClose">▶ BACK TO REPLAY</button>
      </div>`;
    $('#aar').classList.remove('hidden');
    $('#aarClose').onclick = () => $('#aar').classList.add('hidden');
    $('#simNew').onclick = simulateNew;
    $('#cpText').onclick = () => copy(`${S.shareText}\n\nWatch the replay: ${location.href}`, 'Summary copied. Paste it in the group chat.');
    $('#cpLink').onclick = () => copy(location.href, 'Replay link copied.');
    $('#dlCard').onclick = downloadCard;
  }
  function copy(text, ok) {
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast(ok), () => fallbackCopy(text, ok));
    else fallbackCopy(text, ok);
  }
  function fallbackCopy(text, ok) {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast(ok); } catch { toast('Copy failed. Select the text manually.'); }
    ta.remove();
  }

  // ======================================================== share card (canvas → PNG)
  function wrap(ctx, text, x, y, maxW, lh, maxLines = 99) {
    const words = String(text).split(' '); let line = '', lines = 0;
    for (let i = 0; i < words.length; i++) {
      const test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) {
        lines++;
        if (lines >= maxLines) { ctx.fillText(line.replace(/\s*\S*$/, '') + '…', x, y); return y + lh; }
        ctx.fillText(line, x, y); y += lh; line = words[i];
      } else line = test;
    }
    if (line) { ctx.fillText(line, x, y); y += lh; }
    return y;
  }
  function drawCard() {
    const cv = $('#card'), ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height, S = R.summary, st = S.stats, fin = R.final;
    const MONO = 'ui-monospace, "Cascadia Mono", Menlo, Consolas, "Courier New", monospace';
    const last = R.frames[R.frames.length - 1];
    ctx.fillStyle = '#04070a'; ctx.fillRect(0, 0, W, H);
    // scanlines
    ctx.fillStyle = 'rgba(255,255,255,0.018)'; for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    ctx.strokeStyle = '#ffb000'; ctx.lineWidth = 3; ctx.strokeRect(24, 24, W - 48, H - 48);
    ctx.strokeStyle = '#1b2a34'; ctx.lineWidth = 1; ctx.strokeRect(36, 36, W - 72, H - 72);
    // header
    ctx.fillStyle = '#ffb000'; ctx.font = `bold 30px ${MONO}`; ctx.fillText('ESCHATON', 64, 92);
    ctx.fillStyle = '#5f7380'; ctx.font = `18px ${MONO}`; ctx.fillText(`AFTER-ACTION REPORT · ${R.mode === 'ai' ? 'AI WAR' : 'COMMANDERS'} · FILE ${R.id.toUpperCase()}`, 64, 122);
    // stamp
    ctx.save(); ctx.translate(W - 220, 96); ctx.rotate(-0.12);
    const red = S.stamp === 'MUTUALLY ASSURED';
    ctx.strokeStyle = red ? '#ff3b3b' : '#4dff9a'; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 4;
    ctx.font = `bold 24px ${MONO}`; const sw = ctx.measureText(S.stamp).width + 32;
    ctx.strokeRect(-sw / 2, -26, sw, 46); ctx.textAlign = 'center'; ctx.fillText(S.stamp, 0, 6); ctx.restore(); ctx.textAlign = 'left';
    // headline
    ctx.fillStyle = '#ffffff'; ctx.font = `bold 62px ${MONO}`;
    ctx.shadowColor = red ? 'rgba(255,59,59,0.6)' : 'rgba(255,176,0,0.5)'; ctx.shadowBlur = 24;
    let y = wrap(ctx, S.headline, 64, 210, W - 128, 70, 2);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#b9c8cf'; ctx.font = `24px ${MONO}`;
    y = wrap(ctx, S.dek, 64, y + 10, W - 128, 34, 3);
    // map
    const mapTop = y + 16, mapH = 400;
    ctx.fillStyle = '#060b10'; ctx.fillRect(64, mapTop, W - 128, mapH);
    const proj = d3.geoNaturalEarth1().fitExtent([[70, mapTop + 6], [W - 70, mapTop + mapH - 6]], { type: 'FeatureCollection', features });
    const gp = d3.geoPath(proj, ctx);
    for (const f of features) {
      const t = terrInfo[f.id];
      ctx.beginPath(); gp(f);
      if (t) {
        const hp = last.hp[terrIdx[f.id]];
        ctx.globalAlpha = hp <= 0 ? 1 : 0.3 + 0.55 * (hp / t.maxHp);
        ctx.fillStyle = hp <= 0 ? '#000' : col(t.c);
      } else { ctx.globalAlpha = 1; ctx.fillStyle = '#141c23'; }
      ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = '#04070a'; ctx.lineWidth = 0.6; ctx.stroke();
    }
    // all missile arcs of the war
    const arcs = R.frames.flatMap((f) => f.anims).slice(0, 400);
    ctx.save(); ctx.beginPath(); gp({ type: 'Sphere' }); ctx.clip();
    ctx.lineWidth = 1.4;
    for (const a of arcs) {
      if (a.flare) continue;
      const to = a.to || centroids[a.toTerritory]; if (!to) continue;
      ctx.beginPath(); gp({ type: 'LineString', coordinates: [a.from, to] });
      ctx.strokeStyle = col(a.coalition); ctx.globalAlpha = 0.55; ctx.stroke(); ctx.globalAlpha = 1;
      if (!a.intercepted) { const [px, py] = proj(to); const g = ctx.createRadialGradient(px, py, 0, px, py, 10); g.addColorStop(0, 'rgba(255,240,180,0.9)'); g.addColorStop(1, 'rgba(255,90,31,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 10, 0, 7); ctx.fill(); }
    }
    ctx.restore();
    ctx.strokeStyle = '#1b2a34'; ctx.lineWidth = 1; ctx.strokeRect(64, mapTop, W - 128, mapH);
    // stats row
    y = mapTop + mapH + 28;
    const tiles = [['WARHEADS', st.nukes], ['GLASSED', st.glassed], ['BETRAYALS', st.betrayals], ['PEACE DEALS', st.peace], ['PEAK ESC', `${st.peakEsc}/10`]];
    const tw = (W - 128 - 4 * 12) / 5;
    tiles.forEach(([k, v], i) => {
      const x = 64 + i * (tw + 12);
      ctx.fillStyle = '#0a1016'; ctx.fillRect(x, y, tw, 88); ctx.strokeStyle = '#1b2a34'; ctx.strokeRect(x, y, tw, 88);
      ctx.fillStyle = '#ffb000'; ctx.font = `bold 38px ${MONO}`; ctx.fillText(String(v), x + 14, y + 48);
      ctx.fillStyle = '#5f7380'; ctx.font = `15px ${MONO}`; ctx.fillText(k, x + 14, y + 74);
    });
    // standings + awards
    y += 122;
    const colW = (W - 128 - 32) / 2;
    ctx.fillStyle = '#5f7380'; ctx.font = `16px ${MONO}`; ctx.fillText('FINAL STANDINGS · INDDIR/SUFDDIR', 64, y);
    ctx.fillText('DECORATIONS', 64 + colW + 32, y);
    const maxR = Math.max(1, ...fin.scoreboard.map((r) => r.ratio));
    fin.scoreboard.forEach((r, i) => {
      const yy = y + 22 + i * 30;
      ctx.fillStyle = col(r.c); ctx.font = `${i === 0 ? 'bold ' : ''}19px ${MONO}`; ctx.fillText(`${i + 1}. ${r.c}`, 64, yy + 16);
      ctx.fillStyle = '#121c24'; ctx.fillRect(64 + 170, yy + 4, colW - 250, 14);
      ctx.fillStyle = col(r.c); ctx.fillRect(64 + 170, yy + 4, (colW - 250) * (r.ratio / maxR), 14);
      ctx.fillStyle = '#e9f1f4'; ctx.textAlign = 'right'; ctx.fillText(r.ratio.toFixed(2), 64 + colW, yy + 17); ctx.textAlign = 'left';
    });
    let ay = y + 22;
    for (const a of S.awards.slice(0, 3)) {
      ctx.fillStyle = '#ffb000'; ctx.font = `bold 17px ${MONO}`; ctx.fillText(a.title, 64 + colW + 32, ay + 14);
      ctx.fillStyle = col(a.coalition); ctx.font = `17px ${MONO}`;
      ay = wrap(ctx, `${a.who} · ${a.coalition}`, 64 + colW + 32, ay + 36, colW, 22, 1);
      ctx.fillStyle = '#5f7380'; ctx.font = `14px ${MONO}`; ctx.fillText(a.why, 64 + colW + 32, ay); ay += 18;
    }
    // quote + epitaph
    y = Math.max(y + 22 + 7 * 30, ay) + 26;
    const q = S.quotes[0];
    if (q && y < H - 140) {
      ctx.fillStyle = '#e6e6e6'; ctx.font = `italic 24px ${MONO}`;
      y = wrap(ctx, `“${q.text}”`, 64, y, W - 128, 32, 2);
      ctx.fillStyle = col(q.coalition); ctx.font = `17px ${MONO}`; ctx.fillText(`${q.who}, ${q.coalition}`, 64, y + 2); y += 46;
    }
    ctx.fillStyle = '#5f7380'; ctx.font = `18px ${MONO}`;
    wrap(ctx, S.epitaph, 64, Math.min(y + 8, H - 92), W - 128, 24, 1);
    ctx.fillStyle = '#ffb000'; ctx.font = `bold 18px ${MONO}`; ctx.fillText(`★ ${fin.winner} PREVAILS · RATIO ${fin.scoreboard[0].ratio.toFixed(2)}`, 64, H - 56);
    ctx.fillStyle = '#5f7380'; ctx.font = `16px ${MONO}`; ctx.textAlign = 'right'; ctx.fillText(`${location.host} · ESCHATON`, W - 64, H - 56); ctx.textAlign = 'left';
    return cv;
  }
  function downloadCard() {
    const cv = drawCard();
    cv.toBlob((blob) => {
      if (!blob) return toast('Could not render card.');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `eschaton-${R.id}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast('Share card downloaded.');
    }, 'image/png');
  }
  window.ESCH_REPLAY = { drawCard, get R() { return R; }, show, openAAR }; // test hooks

  load().catch((e) => noReplay('Failed to load replay: ' + e.message));
})();
