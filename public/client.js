/* ESCHATON client — renders server state, builds an order draft, sends it. */
(() => {
  const C = window.CONFIG;
  const COALS = Object.keys(C.coalitions);
  const UNITS = Object.keys(C.units);
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const col = (c) => C.coalitions[c]?.color || '#888';
  const fmt = (n) => (Math.round(n * 10) / 10).toString();
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

  const socket = io();
  let S = null;            // latest game view
  let L = null;            // latest lobby view
  let myId = null, roomCode = null;
  let draft = { builds: {}, actions: [] }, draftTurn = -1;
  let selected = null;     // {kind:'territory'|'trigsit', id}
  let tab = 'target';
  let clockOffset = 0;
  let chatMsgs = [];
  let lastReportTurn = -1;
  let mapReady = false;
  let pendingReport = null;

  // ======================================================== screens
  const show = (id) => { for (const s of ['landing', 'lobby', 'game']) $('#' + s).classList.toggle('hidden', s !== id); };
  const toast = (msg, ms = 2600) => { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), ms); };

  // how-to overlay
  $$('[data-howto]').forEach((b) => b.onclick = () => $('#howto').classList.remove('hidden'));
  $('#howtoClose').onclick = () => { $('#howto').classList.add('hidden'); ls.set('esch:howto', '1'); };
  if (!ls.get('esch:howto')) $('#howto').classList.remove('hidden');

  // ======================================================== landing
  const params = new URLSearchParams(location.search);
  $('#nameInput').value = ls.get('esch:name') || '';
  if (params.get('room')) $('#codeInput').value = params.get('room').toUpperCase();
  const myName = () => { const n = $('#nameInput').value.trim() || 'Commander'; ls.set('esch:name', n); return n; };
  $('#createBtn').onclick = () => socket.emit('create', { name: myName() });
  const startTutorial = () => { $('#howto').classList.add('hidden'); ls.set('esch:howto', '1'); socket.emit('tutorial', { name: myName() }); };
  $$('[data-tutorial]').forEach((b) => b.onclick = startTutorial);
  $('#simBtn').onclick = async () => {
    const b = $('#simBtn'); b.disabled = true; b.textContent = 'SIMULATING 21 HEADS OF STATE…';
    try {
      const r = await fetch('/api/simulate', { method: 'POST' }); const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      location.href = '/replay.html?id=' + j.id;
    } catch (e) { b.disabled = false; b.textContent = '☢ SIMULATE AI WAR'; $('#landingErr').textContent = e.message || 'Simulation failed'; }
  };
  $('#joinBtn').onclick = () => {
    const code = $('#codeInput').value.trim().toUpperCase();
    if (!code) return ($('#landingErr').textContent = 'Enter a room code.');
    socket.emit('join', { code, name: myName(), token: ls.get('esch:tok:' + code) });
  };
  $('#codeInput').addEventListener('keydown', (e) => e.key === 'Enter' && $('#joinBtn').click());

  // auto-rejoin after refresh
  const tryRejoin = () => {
    const code = roomCode || params.get('room')?.toUpperCase();
    const tok = code && ls.get('esch:tok:' + code);
    if (tok) socket.emit('join', { code, token: tok, name: myName() });
  };
  socket.on('connect', tryRejoin);

  socket.on('joined', ({ code, pid, token }) => {
    if (roomCode && roomCode !== code) { S = null; draftTurn = -1; lastReportTurn = -1; pendingReport = null; showGameOver.shown = false; }
    myId = pid; roomCode = code;
    $('#lost').classList.add('hidden');
    ls.set('esch:tok:' + code, token);
    history.replaceState(null, '', '?room=' + code);
  });
  socket.on('errorMsg', (m) => { $('#landingErr').textContent = m; toast(m); });

  // Server no longer has our game (restart / redeploy). Tell the player instead of failing silently.
  let lostWasTutorial = false;
  socket.on('gameLost', () => {
    if (roomCode) { try { localStorage.removeItem('esch:tok:' + roomCode); } catch {} }
    lostWasTutorial = !!S?.tutorial;
    if (!S && !L) { history.replaceState(null, '', '/'); return; } // stale link on the landing page: just stay there
    $('#lostRestart').textContent = lostWasTutorial ? '▶ RESTART TUTORIAL' : 'START A NEW GAME';
    $('#lost').classList.remove('hidden');
  });
  $('#lostMenu').onclick = () => { location.href = '/'; };
  $('#lostRestart').onclick = () => {
    if (lostWasTutorial) socket.emit('tutorial', { name: myName() });
    else socket.emit('create', { name: myName() });
  };

  // ======================================================== lobby
  $('#timerSel').innerHTML = C.turnSecondOptions.map((s) => `<option value="${s}">${s}s</option>`).join('');
  $('#timerSel').onchange = (e) => socket.emit('setTimer', Number(e.target.value));
  $('#startBtn').onclick = () => socket.emit('start');
  $('#copyLink').onclick = () => {
    const url = `${location.origin}/?room=${roomCode}`;
    navigator.clipboard?.writeText(url).then(() => toast('Invite link copied: ' + url), () => toast(url, 6000));
  };

  socket.on('lobby', (l) => {
    L = l; myId = l.you;
    show('lobby');
    $('#lobbyCode').textContent = l.code;
    const isHost = l.hostId === myId;
    $('#timerSel').value = l.turnSeconds;
    $('#timerSel').disabled = !isHost;
    $('#startBtn').classList.toggle('hidden', !isHost);
    $('#lobbyNote').textContent = isHost ? `${l.players.length} commander(s) connected. AI fills the rest.` : 'Waiting for host to launch…';
    const me = l.players.find((p) => p.id === myId);
    $('#coalGrid').innerHTML = COALS.map((c) => {
      const cc = C.coalitions[c];
      const mem = l.players.filter((p) => p.coalition === c);
      const mine = me?.coalition === c;
      return `<div class="coal-card ${mine ? 'mine' : ''}" style="--c:${cc.color}">
        <h3>${c}</h3><div class="full">${esc(cc.full)}</div>
        <div class="abil"><b>${esc(cc.ability.name)}</b>: ${esc(cc.ability.desc)}</div>
        <div class="dim small">${esc(cc.history)}</div>
        <div class="slots">${mem.map((p) => `<div class="slot ${p.id === myId ? 'you' : ''}">▸ ${esc(p.name)}${p.host ? ' ★' : ''}</div>`).join('') || '<div class="dim small">— AI controlled —</div>'}</div>
        ${mine ? '<button class="btn small ghost" data-leave>LEAVE</button>'
          : `<button class="btn small" data-join="${c}" ${mem.length >= C.maxPerCoalition ? 'disabled' : ''}>JOIN ${mem.length}/${C.maxPerCoalition}</button>`}
      </div>`;
    }).join('');
    $$('[data-join]').forEach((b) => b.onclick = () => socket.emit('setCoalition', b.dataset.join));
    $$('[data-leave]').forEach((b) => b.onclick = () => socket.emit('setCoalition', null));
    const un = l.players.filter((p) => !p.coalition);
    $('#unassigned').textContent = un.length ? `Unassigned (random coalition at launch): ${un.map((p) => p.name).join(', ')}` : '';
  });

  // ======================================================== game state
  socket.on('state', (s) => {
    const first = !S;
    S = s; clockOffset = s.now - Date.now();
    show('game');
    if (!mapReady) initMap();
    if (s.turn !== draftTurn) { draft = { builds: {}, actions: [] }; draftTurn = s.turn; }
    if (s.phase === 'orders') $('#reportBox').classList.add('hidden');
    if (first) { $('#tbCode').textContent = s.code; }
    renderAll();
    if (pendingReport) { const r = pendingReport; pendingReport = null; playAnims(r.anims); showReport(r); }
    if (s.phase === 'over' && !showGameOver.shown) { showGameOver.shown = true; showGameOver(); }
  });

  socket.on('report', (r) => {
    if (r.turn === lastReportTurn) return;
    lastReportTurn = r.turn;
    pendingReport = r; // played when the post-resolution state arrives (sent right after)
  });

  function renderAll() {
    if (!S) return;
    renderTop(); renderRes(); renderScore(); renderMapState(); renderTab(); renderOrders(); renderLog();
    const pending = S.treaties.some((t) => t.status === 'proposed' && t.b === S.me?.coalition);
    $('#diploBadge').classList.toggle('hidden', !pending);
    if (window.ESCH_onRender) window.ESCH_onRender();
  }

  // ======================================================== top bar
  function phaseKey() {
    if (!S) return 'orders';
    if (S.phase === 'report' || S.phase === 'over') return 'report';
    return S.me?.submitted ? 'locked' : 'orders';
  }
  function renderTop() {
    $('#tbTurn').textContent = S.turn;
    $$('.phase').forEach((p) => p.classList.toggle('on', p.dataset.ph === phaseKey()));
    const e = S.escalation, max = C.escalation.max;
    const segs = [];
    for (let i = 0; i < max; i++) {
      const fill = Math.max(0, Math.min(1, e - i));
      const hue = i < 4 ? '#4dff9a' : i < 7 ? '#ffb000' : '#ff3b3b';
      segs.push(`<div class="seg ${fill > 0 ? 'lit' : ''}" style="color:${hue}"><i style="width:${fill * 100}%;background:${hue}"></i></div>`);
    }
    $('#escMeter').innerHTML = segs.join('');
    $('#escLabel').textContent = `${C.escalation.labels[Math.min(max, Math.floor(e))]} · ${fmt(e)}/${max}`;
    $('#escBox').classList.toggle('hot', e >= 7);
    $('#escBox').title = `Damage x${fmt(1 + e * C.strike.escalationDamageMult)} · auto-retaliation ${Math.round((C.strike.retaliationBase + e * C.strike.retaliationPerLevel) * 100)}% · strike cost TAC ${S.strikeCost.tactical} / STR ${S.strikeCost.strategic} INF`;
    if (S.me) {
      const cc = C.coalitions[S.me.coalition];
      $('#meBadge').innerHTML = `<div style="--c:${cc.color}"><b>${S.me.coalition}</b></div><div class="dim small">${esc(S.me.name)} · ${esc(cc.ability.name)}</div>`;
    }
  }
  setInterval(() => {
    if (!S) return;
    const left = Math.max(0, Math.ceil((S.deadline - (Date.now() + clockOffset)) / 1000));
    const el = $('#tbTimer');
    el.textContent = S.phase === 'over' ? '--' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    $('.timer').classList.toggle('urgent', S.phase === 'orders' && left <= 10);
  }, 250);

  // ======================================================== resources / projections
  function draftCosts() {
    const out = { ind: 0, ura: 0, inf: 0 };
    if (!S?.me) return out;
    for (const [u, n] of Object.entries(draft.builds)) for (const [k, v] of Object.entries(S.me.costs[u])) out[k] += v * n;
    for (const a of draft.actions) {
      if (a.type === 'strike') out.inf += S.strikeCost[a.kind];
      if (a.type === 'negotiate') out.inf += a.amount;
    }
    return out;
  }
  function renderRes() {
    if (!S.me) return;
    const cost = draftCosts();
    $('#resBar').innerHTML = Object.entries(C.resources).map(([k, r]) => {
      const v = S.me.res[k], after = v - cost[k];
      return `<div class="res"><div class="k">${r.short}</div><div class="v">${Math.floor(v)}</div>
        <div class="inc">+${fmt(S.me.income[k])}/turn</div>
        <div class="proj ${after < 0 ? 'warn' : ''}">${cost[k] ? `after orders: ${fmt(after)}` : '&nbsp;'}</div></div>`;
    }).join('');
  }

  // ======================================================== scoreboard
  function renderScore() {
    const rows = S.scoreboard.slice().sort((a, b) => b.ratio - a.ratio);
    const maxR = Math.max(1, ...rows.map((r) => r.ratio));
    $('#scoreboard').innerHTML = `<h4>INDDIR / SUFDDIR · LIVE</h4>` + rows.map((r) => `
      <div class="sb-row ${r.c === S.me?.coalition ? 'me' : ''}" style="--c:${col(r.c)}">
        <span class="sw"></span><span class="nm">${r.c}</span>
        <span class="bar"><i style="width:${(r.ratio / maxR) * 100}%"></i></span><span class="rt">${r.ratio.toFixed(2)}</span>
        <span class="sub">dealt ${r.inflicted} · took ${r.suffered}</span>
      </div>`).join('') +
      `<div class="dim small" style="margin-top:4px">TRIGSITs active: ${S.trigsits.filter((t) => t.status === 'active').length}/${S.trigsits.length}</div>`;
  }

  // ======================================================== map
  let svg, gRoot, gCountries, gTrig, gFx, path, projection, features = [], centroids = {}, zoomK = 1;
  async function initMap() {
    mapReady = true;
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
    gCountries = gRoot.append('g');
    gTrig = gRoot.append('g');
    gFx = gRoot.append('g');

    for (const f of features) {
      let geom = f.geometry;
      if (geom.type === 'MultiPolygon') {
        const best = geom.coordinates.map((c) => ({ type: 'Polygon', coordinates: c })).sort((a, b) => d3.geoArea(b) - d3.geoArea(a))[0];
        geom = best;
      }
      centroids[f.id] = d3.geoCentroid(geom);
    }

    const tip = $('#tooltip');
    gCountries.selectAll('path').data(features).join('path')
      .attr('class', 'country').attr('d', path)
      .on('mousemove', (ev, f) => {
        const t = S?.territories[f.id];
        const r = $('#mapWrap').getBoundingClientRect();
        tip.innerHTML = t ? `<b style="color:${col(t.c)}">${esc(t.name)}</b> · ${t.c} · HP ${t.hp}/${t.maxHp}` : `${esc(f.properties.name)} · NON-ALIGNED`;
        tip.style.left = ev.clientX - r.left + 14 + 'px'; tip.style.top = ev.clientY - r.top + 10 + 'px';
        tip.classList.remove('hidden');
      })
      .on('mouseleave', () => tip.classList.add('hidden'))
      .on('click', (ev, f) => select({ kind: 'territory', id: f.id, name: f.properties.name }));

    const zoom = d3.zoom().scaleExtent([1, 8]).translateExtent([[0, 0], [width, height]]).on('zoom', (ev) => {
      gRoot.attr('transform', ev.transform); zoomK = ev.transform.k;
      gTrig.selectAll('.trig').attr('transform', (d) => `translate(${projection(d.lonlat)}) scale(${1 / Math.sqrt(zoomK)})`);
    });
    svg.call(zoom).on('dblclick.zoom', null);
    renderMapState();
  }

  function renderMapState() {
    if (!gCountries || !S) return;
    gCountries.selectAll('path.country')
      .attr('class', (f) => {
        const t = S.territories[f.id];
        return 'country' + (t ? '' : ' neutral') + (t && t.hp <= 0 ? ' dead' : '') + (selected?.kind === 'territory' && selected.id === f.id ? ' selected' : '');
      })
      .style('fill', (f) => { const t = S.territories[f.id]; return t ? col(t.c) : null; })
      .style('fill-opacity', (f) => { const t = S.territories[f.id]; return t ? 0.25 + 0.5 * (t.hp / t.maxHp) : null; })
      .attr('filter', (f) => (S.territories[f.id]?.c === S.me?.coalition ? 'url(#glow)' : null));

    const g = gTrig.selectAll('g.trig').data(S.trigsits, (d) => d.id).join((enter) => {
      const e = enter.append('g').attr('data-id', (d) => d.id).on('click', (ev, d) => { ev.stopPropagation(); select({ kind: 'trigsit', id: d.id }); });
      e.append('circle').attr('class', 'ring').attr('r', 7);
      e.append('circle').attr('class', 'core').attr('r', 4.5);
      e.append('text').attr('x', 8).attr('y', 3);
      return e;
    });
    g.attr('class', (d) => `trig ${d.status}${selected?.kind === 'trigsit' && selected.id === d.id ? ' selected' : ''}`)
      .attr('transform', (d) => `translate(${projection(d.lonlat)}) scale(${1 / Math.sqrt(zoomK)})`);
    g.select('text').text((d) => d.status === 'active' ? `⚠ ${d.name} [${d.turnsLeft}]` : `${d.name} ✓`);
  }

  function targetPoint(a) {
    if (a.to) return a.to;
    return centroids[a.toTerritory] || [0, 0];
  }

  function playAnims(anims) {
    if (!gFx || !anims?.length) return;
    let hitMe = false;
    anims.slice(0, 120).forEach((a, i) => {
      const from = a.from, to = targetPoint(a);
      const delay = Math.min(i * 280, 5000);
      const p = gFx.append('path').attr('class', 'missile').attr('d', path({ type: 'LineString', coordinates: [from, to] }))
        .style('stroke', col(a.coalition)).attr('filter', 'url(#glow)');
      const len = p.node().getTotalLength() || 1;
      p.attr('stroke-dasharray', `${len} ${len}`).attr('stroke-dashoffset', len)
        .transition().delay(delay).duration(1100).ease(d3.easeCubicIn)
        .attr('stroke-dashoffset', a.intercepted ? len * 0.15 : 0)
        .on('end', () => {
          const pt = a.intercepted ? p.node().getPointAtLength(len * 0.85) : (() => { const q = projection(to); return { x: q[0], y: q[1] }; })();
          const r = a.intercepted ? 5 : a.kind === 'strategic' ? 22 : 12;
          gFx.append('circle').attr('class', 'blast').attr('cx', pt.x).attr('cy', pt.y).attr('r', 1)
            .style('fill', a.intercepted ? '#9fdcff' : '#fff6c0').attr('filter', 'url(#glow)')
            .transition().duration(500).attr('r', r).style('fill', a.intercepted ? '#9fdcff' : '#ff5a1f')
            .transition().duration(1400).style('opacity', 0).remove();
          p.transition().duration(1800).style('opacity', 0).remove();
        });
      const tc = a.toTerritory ? S?.territories[a.toTerritory]?.c : null;
      if (tc && tc === S?.me?.coalition && !a.intercepted) hitMe = true;
    });
    if (hitMe) { const m = $('#mapWrap'); m.classList.remove('flash-red'); void m.offsetWidth; m.classList.add('flash-red'); }
  }

  function showReport(r) {
    const box = $('#reportBox');
    const mine = (S?.me?.private || []).filter((p) => p.turn === r.turn);
    box.innerHTML = `<h3>TURN ${r.turn} // RESOLUTION REPORT <button class="btn tiny ghost" style="float:right" id="closeRep">CLOSE</button></h3>` +
      r.events.filter((e) => !e.text.startsWith('──')).map((e) => `<div class="le ${e.cls}">${esc(e.text)}</div>`).join('') +
      (mine.length ? `<h3 style="margin-top:8px">EYES ONLY</h3>` + mine.map((e) => `<div class="le ${e.cls}">${esc(e.text)}</div>`).join('') : '') +
      (r.events.length <= 1 ? '<div class="dim">Quiet turn. The world holds its breath.</div>' : '');
    box.classList.remove('hidden');
    $('#closeRep').onclick = () => box.classList.add('hidden');
  }

  // ======================================================== selection & tabs
  function select(sel) {
    selected = sel; setTab('target'); renderMapState();
  }
  $$('#tabs button').forEach((b) => b.onclick = () => setTab(b.dataset.tab));
  function setTab(t) {
    tab = t;
    $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
    $$('.tab').forEach((el) => el.classList.toggle('hidden', el.id !== 'tab-' + t));
    if (t === 'comms') { $('#commsBadge').classList.add('hidden'); renderChat(); }
    renderTab();
  }
  function renderTab() {
    if (!S) return;
    if (tab === 'target') renderTarget();
    if (tab === 'build') renderBuild();
    if (tab === 'intel') renderIntel();
    if (tab === 'diplo') renderDiplo();
    if (tab === 'comms') renderChatTo();
  }

  // availability given current draft
  function avail() {
    const a = S.me.arsenal;
    const q = (fn) => draft.actions.filter(fn).length;
    const commits = draft.actions.filter((x) => x.type === 'commit').reduce((s, x) => s + x.amount, 0);
    return {
      actions: C.actionsPerTurn - draft.actions.length,
      tactical: a.tactical - q((x) => x.type === 'strike' && x.kind === 'tactical'),
      strategic: Math.min(a.strategic, a.delivery) - q((x) => x.type === 'strike' && x.kind === 'strategic'),
      spies: a.spies - q((x) => x.type === 'spy'),
      conv: a.conv - commits,
      inf: S.me.res.inf - draftCosts().inf,
    };
  }
  const canEdit = () => S && S.phase === 'orders' && S.me && !S.me.submitted;
  function addAction(a) {
    if (!canEdit()) return toast('Orders locked. Click REVISE to edit.');
    if (draft.actions.length >= C.actionsPerTurn) return toast(`Max ${C.actionsPerTurn} actions per turn.`);
    draft.actions.push(a); renderAll();
  }

  function renderTarget() {
    const el = $('#tab-target');
    if (!selected) {
      el.innerHTML = `<h3>NO TARGET</h3><p class="note">Click a country to inspect or strike it. Click a ⚠ TRIGSIT marker to deploy forces, negotiate, or nuke enemy divisions there.</p>
        <h4>ACTIVE TRIGSITs</h4>` + S.trigsits.filter((t) => t.status === 'active').map((t) =>
        `<div class="kv" style="cursor:pointer" data-trig="${t.id}"><span>⚠ ${t.name}</span><span>${t.sides.map((s) => `<span style="color:${col(s)}">${s}</span>`).join(' vs ')} · ${t.turnsLeft}t</span></div>`).join('');
      el.querySelectorAll('[data-trig]').forEach((d) => d.onclick = () => select({ kind: 'trigsit', id: d.dataset.trig }));
      return;
    }
    const av = avail();
    if (selected.kind === 'territory') {
      const t = S.territories[selected.id];
      if (!t) { el.innerHTML = `<h3>${esc(selected.name)}</h3><p class="note">NON-ALIGNED. Not part of any coalition and cannot be targeted.</p>`; return; }
      const own = t.c === S.me.coalition;
      const pact = S.treaties.find((x) => x.status === 'active' && [x.a, x.b].includes(t.c) && [x.a, x.b].includes(S.me.coalition));
      const mult = 1 + S.escalation * C.strike.escalationDamageMult;
      el.innerHTML = `<h3 style="color:${col(t.c)}">${esc(t.name)}</h3>
        <div class="dim small">${t.c} · ${esc(C.coalitions[t.c].full)}</div>
        <div class="hpbar" style="--c:${col(t.c)}"><i style="width:${(t.hp / t.maxHp) * 100}%"></i></div>
        <div class="kv"><span>Integrity</span><span>${t.hp} / ${t.maxHp}</span></div>
        <div class="kv"><span>Yield (full health)</span><span>IND ${t.y.ind} · URA ${t.y.ura} · INF ${t.y.inf}</span></div>
        <div class="kv"><span>Current output</span><span>${Math.round((t.hp / t.maxHp) * 100)}%</span></div>
        ${own ? '<p class="note">Your coalition\'s territory.</p>' : `
        <h4>STRIKE OPTIONS</h4>
        ${pact ? `<p class="warn small">⚠ You have a non-aggression pact with ${t.c}. Striking breaks it publicly (+${C.escalation.treatyBreak} escalation, −${C.treaty.breakInfPenalty} INF).</p>` : ''}
        <div class="actrow"><button class="btn danger" id="tacBtn" ${av.tactical < 1 || av.actions < 1 || av.inf < S.strikeCost.tactical ? 'disabled' : ''}>☢ TACTICAL</button>
          <span class="small">${Math.round(C.strike.tactical.damage * mult)} dmg · ${S.strikeCost.tactical} INF · +${C.strike.tactical.escalation} esc · ${av.tactical} left</span></div>
        <div class="actrow"><button class="btn danger" id="strBtn" ${av.strategic < 1 || av.actions < 1 || av.inf < S.strikeCost.strategic ? 'disabled' : ''}>☢ STRATEGIC</button>
          <span class="small">${Math.round(C.strike.strategic.damage * mult)} dmg · ${S.strikeCost.strategic} INF · +${C.strike.strategic.escalation} esc · ${av.strategic} launchable</span></div>
        <p class="note">Intercept and auto-retaliation odds rise with enemy ABMs and escalation. Retaliation chance now: ${Math.round((C.strike.retaliationBase + S.escalation * C.strike.retaliationPerLevel + (C.coalitions[t.c].ability.id === 'deadhand' ? C.coalitions[t.c].ability.value : 0)) * 100)}%.</p>`}`;
      if (!own) {
        $('#tacBtn').onclick = () => addAction({ type: 'strike', kind: 'tactical', target: { kind: 'territory', id: selected.id }, label: t.name });
        $('#strBtn').onclick = () => addAction({ type: 'strike', kind: 'strategic', target: { kind: 'territory', id: selected.id }, label: t.name });
      }
      return;
    }
    // trigsit
    const t = S.trigsits.find((x) => x.id === selected.id);
    if (!t) return;
    const [A, B] = t.sides;
    const party = t.sides.includes(S.me.coalition);
    const enemy = party ? t.sides.find((s) => s !== S.me.coalition) : null;
    const ctl = t.control / C.trigsit.winThreshold; // + favors A
    el.innerHTML = `<h3 style="color:var(--amber)">⚠ ${t.name}</h3>
      <div class="dim small">TRIGSIT · ${t.status === 'active' ? `${t.turnsLeft} turns until frozen` : `RESOLVED: ${t.how}${t.winner ? ' — ' + t.winner + ' victory' : ''}`}</div>
      <h4>MILITARY CONTROL</h4>
      <div class="tug-l"><span style="color:${col(A)}">${A} · ${t.forces[A]} div</span><span style="color:${col(B)}">${t.forces[B]} div · ${B}</span></div>
      <div class="tug"><span class="mid"></span>${ctl >= 0 ? `<i style="left:${50 - ctl * 50}%;width:${ctl * 50}%;background:${col(A)}"></i>` : `<i style="left:50%;width:${-ctl * 50}%;background:${col(B)}"></i>`}</div>
      <p class="note">Net divisions × ${C.trigsit.progressPerForce} shifts control each turn. Reaching either end wins it.</p>
      <h4>NEGOTIATION</h4>
      <div class="hpbar" style="--c:#79d9a8"><i style="width:${t.peace}%"></i></div>
      <div class="kv"><span>Peace progress</span><span>${Math.round(t.peace)} / ${C.trigsit.peaceThreshold}</span></div>
      ${t.status !== 'active' ? '' : `
      <div class="actrow"><input type="number" id="negAmt" min="1" value="${Math.max(1, Math.min(10, Math.floor(av.inf)))}" /> <button class="btn green" id="negBtn" ${av.actions < 1 ? 'disabled' : ''}>🕊 NEGOTIATE (INF)</button></div>
      <p class="note">Anyone can mediate. Each INF adds ${C.trigsit.peacePerInfluence}%${C.coalitions[S.me.coalition].ability.id === 'nonaligned' ? ' ×2 (Non-Aligned)' : ''}. Negotiators share the peace dividend.</p>
      ${party ? `
      <h4>FORCES (${S.me.coalition})</h4>
      <div class="kv"><span>Your divisions here</span><span>${t.mine}</span></div>
      <div class="actrow"><input type="number" id="comAmt" min="1" max="${av.conv}" value="${Math.max(1, Math.min(av.conv, 3))}" /> <button class="btn" id="comBtn" ${av.conv < 1 || av.actions < 1 ? 'disabled' : ''}>DEPLOY DIVISIONS</button> <span class="small dim">${av.conv} available</span></div>
      ${t.mine ? `<div class="actrow"><button class="btn small ghost" id="wdBtn" ${av.actions < 1 ? 'disabled' : ''}>WITHDRAW ALL</button></div>` : ''}
      <div class="actrow"><button class="btn danger" id="tnBtn" ${av.tactical < 1 || av.actions < 1 || av.inf < S.strikeCost.tactical || !t.forces[enemy] ? 'disabled' : ''}>☢ NUKE ${enemy} FORCES</button>
        <span class="small">kills ${Math.round(C.strike.tactical.trigsitKillPct * 100)}% · ${S.strikeCost.tactical} INF</span></div>` :
        '<p class="note">You are not a party to this crisis, but you can mediate.</p>'}`}`;
    if (t.status !== 'active') return;
    $('#negBtn').onclick = () => {
      const n = Math.floor(Number($('#negAmt').value));
      if (!(n > 0) || n > av.inf) return toast('Not enough influence.');
      addAction({ type: 'negotiate', trigsit: t.id, amount: n, label: t.name });
    };
    if (party) {
      $('#comBtn').onclick = () => {
        const n = Math.floor(Number($('#comAmt').value));
        if (!(n > 0) || n > av.conv) return toast('Not enough divisions.');
        addAction({ type: 'commit', trigsit: t.id, amount: n, label: t.name });
      };
      if ($('#wdBtn')) $('#wdBtn').onclick = () => addAction({ type: 'withdraw', trigsit: t.id, label: t.name });
      $('#tnBtn').onclick = () => addAction({ type: 'strike', kind: 'tactical', target: { kind: 'trigsit', id: t.id }, label: `${enemy} forces @ ${t.name}` });
    }
  }

  function costStr(c) { return Object.entries(c).map(([k, v]) => `${v} ${k.toUpperCase()}`).join(' + '); }
  function renderBuild() {
    const el = $('#tab-build');
    const proj = { ...S.me.res }; const dc = draftCosts(); for (const k in proj) proj[k] -= dc[k];
    el.innerHTML = `<h3>PRODUCTION</h3><p class="note">Builds complete at the end of the turn (after strikes) and are ready next turn.</p>` +
      UNITS.map((u) => {
        const U = C.units[u], cost = S.me.costs[u];
        const afford = Object.entries(cost).every(([k, v]) => proj[k] >= v);
        const n = draft.builds[u] || 0;
        return `<div class="unit"><div><div class="nm">${U.name} <span class="have">· have ${S.me.arsenal[u]}</span></div><div class="cost">${costStr(cost)}</div></div>
          <div class="stepper"><button class="btn tiny" data-dec="${u}" ${!n || !canEdit() ? 'disabled' : ''}>−</button><b>${n}</b><button class="btn tiny" data-inc="${u}" ${!afford || !canEdit() ? 'disabled' : ''}>+</button></div>
          <div class="desc">${U.desc}</div></div>`;
      }).join('') + `<h4>YOUR ARSENAL</h4>` + arsenalTable([{ name: 'You', arsenal: S.me.arsenal }]);
    el.querySelectorAll('[data-inc]').forEach((b) => b.onclick = () => { draft.builds[b.dataset.inc] = (draft.builds[b.dataset.inc] || 0) + 1; renderAll(); });
    el.querySelectorAll('[data-dec]').forEach((b) => b.onclick = () => { const u = b.dataset.dec; draft.builds[u] = Math.max(0, (draft.builds[u] || 0) - 1); if (!draft.builds[u]) delete draft.builds[u]; renderAll(); });
  }
  function arsenalTable(rows) {
    return `<table class="ars"><tr><th></th>${UNITS.map((u) => `<th>${C.units[u].short}</th>`).join('')}</tr>` +
      rows.map((r) => `<tr><td>${esc(r.name)}</td>${UNITS.map((u) => `<td>${r.arsenal[u] ?? '?'}</td>`).join('')}</tr>`).join('') + '</table>';
  }

  function renderIntel() {
    const el = $('#tab-intel');
    const av = avail();
    const fi = S.me.falseIntel;
    el.innerHTML = `<h3>INTELLIGENCE</h3>
      <div class="kv"><span>Spies available</span><span>${av.spies}</span></div>
      <p class="note">A spy op uses 1 action. Success falls with the target's spy count. Captured spies are lost and announced. Planted disinformation makes enemy spies see fake numbers. Intel may be false!</p>
      <h4>COALITION ARSENALS (ALLIES, TRUE)</h4>${arsenalTable(S.allies.map((a) => ({ name: a.name + (a.isAI ? ' (AI)' : ''), arsenal: a.arsenal })))}
      <h4>DISINFORMATION</h4>
      <div class="note">${fi && fi.until >= S.turn ? `ACTIVE: enemies see ${fi.mode.toUpperCase()}D numbers until turn ${fi.until}.` : 'None active.'}</div>
      <div class="actrow"><button class="btn small" data-plant="inflate" ${av.spies < 1 || av.actions < 1 ? 'disabled' : ''}>PLANT: INFLATE</button>
        <button class="btn small" data-plant="deflate" ${av.spies < 1 || av.actions < 1 ? 'disabled' : ''}>PLANT: DEFLATE</button></div>
      <h4>ENEMY DOSSIERS</h4>` +
      COALS.filter((c) => c !== S.me.coalition).map((c) => {
        const i = S.me.intel[c];
        return `<div class="intel-card" style="--c:${col(c)}"><div class="hd"><b>${c}</b>
          <button class="btn tiny" data-reveal="${c}" ${av.spies < 1 || av.actions < 1 ? 'disabled' : ''}>🕵 REVEAL</button></div>
          ${i ? `<div class="snap">STR ${i.arsenal.strategic} · TAC ${i.arsenal.tactical} · DLV ${i.arsenal.delivery} · ABM ${i.arsenal.defense} · CONV ${i.arsenal.conv} · SPY ${i.arsenal.spies}</div><div class="age">report from turn ${i.turn}${S.turn - i.turn > 2 ? ' (stale)' : ''}</div>` : '<div class="age">no intel</div>'}</div>`;
      }).join('');
    el.querySelectorAll('[data-reveal]').forEach((b) => b.onclick = () => addAction({ type: 'spy', mode: 'reveal', target: b.dataset.reveal, label: b.dataset.reveal }));
    el.querySelectorAll('[data-plant]').forEach((b) => b.onclick = () => addAction({ type: 'spy', mode: 'plant', fake: b.dataset.plant, label: b.dataset.plant }));
  }

  function renderDiplo() {
    const el = $('#tab-diplo');
    const me = S.me.coalition;
    const tr = S.treaties;
    const partner = (t) => (t.a === me ? t.b : t.a);
    const incoming = tr.filter((t) => t.status === 'proposed' && t.b === me);
    const outgoing = tr.filter((t) => t.status === 'proposed' && t.a === me);
    const active = tr.filter((t) => t.status === 'active' && (t.a === me || t.b === me));
    const broken = tr.filter((t) => t.status === 'broken').slice(-6);
    const busy = new Set([...active, ...incoming, ...outgoing].map(partner));
    el.innerHTML = `<h3>TREATIES</h3><p class="note">Non-aggression pacts act instantly (no action cost). Any member of the receiving coalition can accept. Breaking one, or nuking a partner, is announced to everyone: +${C.escalation.treatyBreak} escalation, −${C.treaty.breakInfPenalty} INF.</p>
      ${incoming.length ? '<h4>INCOMING OFFERS</h4>' + incoming.map((t) => `<div class="treaty"><span>NAP from <b style="color:${col(t.a)}">${t.a}</b> <span class="dim small">by ${esc(t.by)}</span></span>
        <span><button class="btn tiny green" data-acc="${t.id}">ACCEPT</button> <button class="btn tiny danger" data-rej="${t.id}">REJECT</button></span></div>`).join('') : ''}
      <h4>ACTIVE PACTS</h4>${active.map((t) => `<div class="treaty active"><span>⟷ <b style="color:${col(partner(t))}">${partner(t)}</b></span><button class="btn tiny danger" data-brk="${t.id}">BREAK</button></div>`).join('') || '<div class="note">None.</div>'}
      ${outgoing.length ? '<h4>AWAITING REPLY</h4>' + outgoing.map((t) => `<div class="treaty"><span>→ ${t.b}</span><span class="dim small">pending</span></div>`).join('') : ''}
      <h4>PROPOSE NON-AGGRESSION PACT</h4>` +
      COALS.filter((c) => c !== me).map((c) => `<div class="treaty"><b style="color:${col(c)}">${c}</b><button class="btn tiny" data-prop="${c}" ${busy.has(c) ? 'disabled' : ''}>PROPOSE</button></div>`).join('') +
      (broken.length ? '<h4>BROKEN PACTS (PUBLIC RECORD)</h4>' + broken.map((t) => `<div class="treaty broken"><span>${t.a} ⟷ ${t.b}</span><span class="small warn">broken by ${t.brokenBy}</span></div>`).join('') : '');
    el.querySelectorAll('[data-prop]').forEach((b) => b.onclick = () => socket.emit('treaty:propose', b.dataset.prop));
    el.querySelectorAll('[data-acc]').forEach((b) => b.onclick = () => socket.emit('treaty:respond', { id: b.dataset.acc, accept: true }));
    el.querySelectorAll('[data-rej]').forEach((b) => b.onclick = () => socket.emit('treaty:respond', { id: b.dataset.rej, accept: false }));
    el.querySelectorAll('[data-brk]').forEach((b) => b.onclick = () => { if (confirm('Break this pact? The whole world will know.')) socket.emit('treaty:break', b.dataset.brk); });
  }

  // ======================================================== orders box
  function actionLabel(a) {
    if (a.type === 'strike') return `☢ ${a.kind.toUpperCase()} → ${a.label}`;
    if (a.type === 'commit') return `DEPLOY ${a.amount} div → ${a.label}`;
    if (a.type === 'withdraw') return `WITHDRAW from ${a.label}`;
    if (a.type === 'negotiate') return `🕊 NEGOTIATE ${a.amount} INF @ ${a.label}`;
    if (a.type === 'spy') return a.mode === 'plant' ? `🕵 PLANT ${a.label.toUpperCase()}D INTEL` : `🕵 REVEAL ${a.label}`;
    return a.type;
  }
  function renderOrders() {
    const el = $('#ordersBox');
    if (!S.me) return;
    const submitted = S.me.submitted;
    const waiting = S.players.filter((p) => !p.isAI && p.connected && !p.submitted).length;
    const builds = Object.entries(draft.builds).map(([u, n]) => `${n} ${C.units[u].short}`).join(', ');
    el.innerHTML = `<h4><span>ORDERS · ${draft.actions.length}/${C.actionsPerTurn} ACTIONS</span><span>${builds ? 'BUILD: ' + builds : ''}</span></h4>` +
      (draft.actions.map((a, i) => `<div class="order ${a.type === 'strike' ? 'nuke' : ''}"><span>${esc(actionLabel(a))}</span>${canEdit() ? `<button class="btn tiny ghost" data-rm="${i}">✕</button>` : ''}</div>`).join('') || '<div class="note">No actions queued. Builds and actions are optional.</div>') +
      (S.phase === 'orders'
        ? (submitted
          ? `<button id="submitBtn" class="btn ghost">REVISE ORDERS</button><div class="locked-msg">ORDERS LOCKED · waiting on ${waiting} commander(s)</div>`
          : `<button id="submitBtn" class="btn primary">SUBMIT ORDERS</button>`)
        : `<div class="locked-msg">${S.phase === 'over' ? 'GAME OVER' : 'RESOLVING… next turn shortly'}</div>`);
    el.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { draft.actions.splice(Number(b.dataset.rm), 1); renderAll(); });
    const sb = $('#submitBtn');
    if (sb) sb.onclick = () => {
      if (submitted) return socket.emit('unsubmit');
      if (draftCosts().inf > S.me.res.inf + 1e-9) toast('Warning: orders exceed your influence. Some may fail.');
      sb.disabled = true; sb.textContent = 'TRANSMITTING…';
      let answered = false;
      const t = setTimeout(() => {
        if (answered) return;
        sb.disabled = false; sb.textContent = 'SUBMIT ORDERS';
        toast(socket.connected ? 'Server did not respond. Try again.' : 'Connection lost. Reconnecting… try again in a moment.', 4000);
      }, 5000);
      socket.emit('orders', { builds: draft.builds, actions: draft.actions.map(({ label, ...a }) => a) }, (res) => {
        answered = true; clearTimeout(t);
        if (!res?.ok) { sb.disabled = false; sb.textContent = 'SUBMIT ORDERS'; if (res?.reason && res.reason !== 'lost') toast(res.reason); }
      });
    };
  }

  // ======================================================== log
  function renderLog() {
    const el = $('#logBar');
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    el.innerHTML = S.log.map((e) => `<div class="le ${e.cls}"><span class="t">T${e.turn}</span>${esc(e.text)}</div>`).join('');
    if (atBottom || !renderLog.done) { el.scrollTop = el.scrollHeight; renderLog.done = true; }
  }

  // ======================================================== chat
  socket.on('chatHistory', (msgs) => { chatMsgs = msgs; renderChat(); });
  socket.on('chat', (m) => {
    chatMsgs.push(m); if (chatMsgs.length > 300) chatMsgs.shift();
    if (tab !== 'comms') $('#commsBadge').classList.remove('hidden');
    if (m.scope === 'pm' && m.from !== myId) toast(`PM from ${m.fromName}: ${m.text.slice(0, 60)}`);
    renderChat();
  });
  function renderChat() {
    const el = $('#chatLog');
    el.innerHTML = chatMsgs.map((m) => {
      const tag = m.scope === 'pm' ? (m.from === myId ? `[PM → ${esc(m.toName)}]` : '[PM]') : m.scope === 'coalition' ? `[${m.coalition}]` : '';
      return `<div class="msg ${m.scope}${m.ai ? ' ai' : ''}" style="--c:${col(m.coalition)}"><span class="tag">${m.ai ? '[LEADER]' : tag}</span> <span class="who">${esc(m.fromName)}</span>: ${esc(m.text)}</div>`;
    }).join('');
    el.scrollTop = el.scrollHeight;
  }
  function renderChatTo() {
    const sel = $('#chatTo'); const cur = sel.value;
    const others = (S?.players || []).filter((p) => !p.isAI && p.id !== myId);
    sel.innerHTML = `<option value="all">ALL</option><option value="coalition">COALITION</option>` +
      others.map((p) => `<option value="${p.id}">PM ${esc(p.name)} (${p.coalition})</option>`).join('');
    if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
  }
  const sendChat = () => {
    const text = $('#chatText').value.trim(); if (!text) return;
    socket.emit('chat', { to: $('#chatTo').value || 'all', text }); $('#chatText').value = '';
  };
  $('#chatSend').onclick = sendChat;
  $('#chatText').addEventListener('keydown', (e) => e.key === 'Enter' && sendChat());

  // ======================================================== game over
  function showGameOver() {
    const rows = S.scoreboard.slice().sort((a, b) => b.ratio - a.ratio);
    $('#gameoverBody').innerHTML = `<h2>${S.endReason?.startsWith('ESCHATON') ? '☢ ESCHATON ☢' : 'CEASEFIRE'}</h2>
      <p class="dim">${esc(S.endReason)} · turn ${S.turn}</p>
      <h3 style="color:${col(S.winner)};text-shadow:0 0 14px ${col(S.winner)}">${S.winner} PREVAILS</h3>
      ${rows.map((r, i) => `<div class="kv"><span style="color:${col(r.c)}">${i + 1}. ${r.c}</span><span>${r.ratio.toFixed(2)} (dealt ${r.inflicted} / took ${r.suffered})</span></div>`).join('')}
      <div class="row" style="margin-top:16px"><button class="btn ghost" id="goClose">VIEW MAP</button>${S.replayId ? `<a class="btn" href="/replay.html?id=${S.replayId}" target="_blank">▶ REPLAY &amp; SHARE</a>` : ''}<button class="btn primary" id="goNew">NEW GAME</button></div>`;
    $('#gameover').classList.remove('hidden');
    $('#goClose').onclick = () => $('#gameover').classList.add('hidden');
    $('#goNew').onclick = () => { location.href = '/'; };
  }

  // read-only hooks for the tutorial coach (public/tutorial.js)
  window.ESCH = { get S() { return S; }, get draft() { return draft; }, get selected() { return selected; }, get tab() { return tab; }, setTab: (t) => setTab(t), select: (s) => select(s) };

  window.addEventListener('resize', () => { /* keep it simple: viewBox scales the map */ });
})();
