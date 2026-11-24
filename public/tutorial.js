/* ESCHATON training coach. Runs only in tutorial games (S.tutorial).
   Each step highlights a UI element and either waits for "NEXT" (info)
   or waits until the player actually does the thing (action). */
(() => {
  const $ = (s) => document.querySelector(s);
  const E = () => window.ESCH;
  const S = () => E()?.S;
  const me = () => S()?.me;
  const draft = () => E()?.draft || { builds: {}, actions: [] };
  const hasAction = (type) => draft().actions.some((a) => a.type === type);
  const hasBuild = () => Object.keys(draft().builds).length > 0;
  const tabIs = (t) => E()?.tab === t;

  const STEPS = [
    {
      title: 'WELCOME, COMMANDER',
      text: `This is a <b>training game</b>: just you against AI heads of state, with relaxed timers, so take your time.<br><br>
        You lead the <b>United States</b> for <b style="color:#4da3ff">AMNAT</b> (US/NATO, the blue countries). Six AI coalitions control the other colours.<br><br>
        I'll point at things. Gold-ringed items are what to look at or click.`,
    },
    {
      title: 'THE WORLD SUMMIT',
      target: '#summit .sm-grid',
      action: true,
      text: `Before any crisis, the world's leaders meet.<br>
        <b>🤝 NAP</b>: a non-aggression pact. Breaking it is announced to everyone and ignites a crisis between you.<br>
        <b>💱 TRADE</b>: +1 IND +1 INF every turn for both coalitions, until someone nukes the other.<br><br>
        <b>Propose a 💱 TRADE agreement</b> to any coalition. (If someone offers you one, ACCEPT counts too.)`,
      done: () => (S()?.treaties || []).some((t) => t.kind === 'trade' && (t.a === me()?.coalition || (t.b === me()?.coalition && t.status === 'active'))),
    },
    {
      title: 'CLOSE THE SUMMIT',
      target: '#readyBtn',
      action: true,
      text: `AI leaders answer offers after a moment of thought. Watch the feed at the bottom.<br><br>
        When you're done dealing, press <b>READY</b>. The summit closes and <b>the first TRIGSIT ignites.</b>`,
      done: () => S()?.phase && S().phase !== 'summit',
    },
    {
      title: 'HOW YOU WIN',
      target: '#scoreboard',
      text: `This is the live <b>scoreboard</b>. Your score is <b>INDDIR ÷ SUFDDIR</b>: damage you inflict directly, divided by damage you suffer directly.<br><br>
        Hit others hard, avoid getting hit, and you climb. The best ratio when the game ends wins.`,
    },
    {
      title: 'ONE CRISIS, FOR NOW',
      target: '#rail',
      text: `A <b>TRIGSIT</b> (triggering situation) has ignited: the <b>Berlin Blockade</b>, AMNAT vs SOVWAR. The camera is focused on it.<br><br>
        This <b>rail</b> lists all 21 TRIGSITs: active, resolved, and 🔒 dormant. Defeats, nukes, betrayals, proxy aid and mobilization <b>spill over</b> and ignite dormant ones. As they do, <b>the map zooms out and more options unlock</b>.<br><br>
        The game ends when no TRIGSIT is left active (after turn 8).`,
    },
    {
      title: 'ESCALATION & THREAT LEVEL',
      target: '#escBox',
      text: `Fighting, spillover and nukes push the <b>escalation meter</b> up. Peace deals and calm turns bring it down.<br><br>
        As it rises, the <b>THREAT LEVEL</b> (under the meter) ratchets up and <b>unlocks more dangerous options</b>: spies, then tactical nukes, then homeland strikes, then strategic warheads.<br><br>
        At <b>10</b> it's <b style="color:#ff3b3b">ESCHATON</b>: every silo fires and the game ends.`,
    },
    {
      title: 'YOUR RESOURCES',
      target: '#resBar',
      text: `<b>IND</b> (industry), <b>URA</b> (uranium) and <b>INF</b> (influence) pay for everything. The green number is what you earn each turn from your coalition's countries.<br><br>
        Damaged countries produce less, so getting hit hurts your economy as well as your score.`,
    },
    {
      title: 'OPEN YOUR CRISIS',
      target: '#rail [data-cr="berlin"]',
      action: true,
      text: `<b>Click BERLIN BLOCKADE</b> in the rail (or its ⚠ marker in Germany) to see your options.`,
      done: () => E()?.selected?.kind === 'trigsit' && E().selected.id === 'berlin',
    },
    {
      title: 'DEPLOY DIVISIONS',
      target: '#tab-target',
      action: true,
      text: `These are your <b>option cards</b> for this crisis. The <b>tug-of-war bar</b> is military control: AMNAT pulls one way, SOVWAR the other. Reaching the end wins it.<br><br>
        In the <b>⚔ DEPLOY DIVISIONS</b> card, set a number and press <b>DEPLOY</b>. <i>But fighting raises escalation.</i> (Coalitions outside a crisis get different cards: mediate, or back a side.)`,
      done: () => hasAction('commit'),
    },
    {
      title: 'THE ORDERS QUEUE',
      target: '#ordersBox',
      text: `Your order was <b>queued</b> here. Nothing happens yet: everyone plans in secret, then <b>all orders resolve at once</b>.<br><br>
        You get <b>3 actions per turn</b>. Building is free and doesn't use an action. Click ✕ to cancel an order.`,
    },
    {
      title: 'BUILD SOMETHING',
      target: () => (tabIs('build') ? '#tab-build' : '[data-tab="build"]'),
      action: true,
      text: `Open the <b>BUILD</b> tab and press <b>+</b> on <b>Conventional Forces</b> or <b>Missile Defense</b>.<br><br>
        Notice the <b>🔒</b> items: warheads and spies are locked until the threat level rises. Units you build are ready next turn.`,
      done: () => hasBuild(),
    },
    {
      title: 'SUBMIT YOUR ORDERS',
      target: '#ordersBox',
      action: true,
      text: `Press <b>SUBMIT ORDERS</b>. Once everyone has submitted (or the timer runs out), the turn resolves.`,
      done: () => me()?.submitted || S()?.phase === 'report' || S()?.turn > 1,
    },
    {
      title: 'RESOLUTION',
      target: () => ($('#reportBox') && !$('#reportBox').classList.contains('hidden') ? '#reportBox' : '#logBar'),
      action: true,
      text: `The <b>resolution report</b> lists what everyone did. Watch for <b style="color:#ff8a3d">🔥 SPILLOVER</b> lines (a new crisis igniting) and <b style="color:#ff3b3b">⚠ THREAT LEVEL</b> lines (new capabilities unlocking).<br><br>
        The full history is always in the log at the bottom. <i>Waiting for turn 2…</i>`,
      done: () => S()?.turn >= 2 && S()?.phase === 'orders',
    },
    {
      title: 'NEGOTIATE',
      target: () => (tabIs('target') && E()?.selected?.id === 'berlin' ? '#tab-target' : '#rail [data-cr="berlin"]'),
      action: true,
      text: `War isn't the only way out. Click <b>BERLIN BLOCKADE</b> again and press <b>🕊 NEGOTIATE</b> to spend influence.<br><br>
        When the peace bar reaches 100%, the crisis resolves, escalation drops, and every negotiator earns a peace dividend.`,
      done: () => hasAction('negotiate'),
    },
    {
      title: 'DIPLOMACY',
      target: () => (tabIs('diplo') ? '#tab-diplo' : '[data-tab="diplo"]'),
      action: true,
      text: `Open <b>TREATIES</b> and <b>PROPOSE</b> a non-aggression pact to <b style="color:#ff4b4b">SOVWAR</b>. If SOVWAR already sent you an offer, <b>ACCEPT</b> it instead. At threat level 1 you can only deal with coalitions you face in a crisis.<br><br>
        Pacts take effect instantly. Breaking one is announced to the world and <b>ignites a new crisis</b> between you.`,
      done: () => (S()?.treaties || []).some((t) => t.a === me()?.coalition || (t.b === me()?.coalition && t.status === 'active')),
    },
    {
      title: 'LOCKED CAPABILITIES',
      target: '#threatLine',
      text: `You start with your full historical arsenal, but it's <b>locked</b>:<br>
        <b>L2 CONFRONTATION</b>: spies, disinformation, mediating any crisis<br>
        <b>L3 BRINKMANSHIP</b>: tactical nukes on enemy troops at your crises<br>
        <b>L4 NUCLEAR THRESHOLD</b>: strikes on the homelands of coalitions you face<br>
        <b>L5 GENERAL WAR</b>: strategic warheads, anyone is a target<br><br>
        A big banner announces each new level.`,
    },
    {
      title: 'SUBMIT AGAIN',
      target: '#ordersBox',
      action: true,
      text: `Press <b>SUBMIT ORDERS</b> to lock in this turn.`,
      done: () => me()?.submitted || S()?.turn > 2,
    },
    {
      title: "YOU'RE READY",
      text: `That's the whole game:<br>
        <b>1.</b> Fight or negotiate at your crises<br>
        <b>2.</b> Every decision can <b>spill over</b> and ignite new ones<br>
        <b>3.</b> Escalation unlocks deadlier tools for <i>everyone</i><br>
        <b>4.</b> Nuke only when it improves your ratio, because they fire back<br><br>
        This training game continues as a normal match. When you're ready, start a real game and invite friends with the room code.`,
      final: true,
    },
  ];

  let step = 0, active = false, code = null, lastStep = -1;
  const key = () => 'esch:tut:' + code;
  const save = () => { try { localStorage.setItem(key(), String(step)); } catch {} };

  function targetEl(s) {
    const sel = typeof s.target === 'function' ? s.target() : s.target;
    return sel ? document.querySelector(sel) : null;
  }

  function render() {
    const s = STEPS[step];
    const box = $('#coach');
    if (lastStep !== step) {
      lastStep = step;
      box.innerHTML = `<div class="coach-head"><span>TRAINING · ${step + 1}/${STEPS.length}</span><button class="btn tiny ghost" id="coachExit">EXIT</button></div>
        <h3>${s.title}</h3><div class="coach-text">${s.text}</div>
        <div class="coach-foot">${s.action
          ? `<span class="coach-wait">▶ waiting for you…</span><button class="btn tiny ghost" id="coachSkip">${s.skipLabel || 'SKIP STEP'}</button>`
          : `${step > 0 ? '<button class="btn small ghost" id="coachBack">BACK</button>' : '<span></span>'}<button class="btn small primary" id="coachNext">${s.final ? 'FINISH TRAINING' : 'NEXT ▸'}</button>`}</div>`;
      $('#coachExit').onclick = finish;
      if ($('#coachNext')) $('#coachNext').onclick = () => (s.final ? finish() : go(step + 1));
      if ($('#coachBack')) $('#coachBack').onclick = () => go(step - 1);
      if ($('#coachSkip')) $('#coachSkip').onclick = () => go(step + 1);
      box.classList.remove('hidden');
      box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
    }
    placeRing(s);
  }

  function placeRing(s) {
    const ring = $('#coachRing');
    const el = targetEl(s);
    const r = el?.getBoundingClientRect();
    if (!r || (r.width === 0 && r.height === 0)) return ring.classList.add('hidden');
    const pad = 6;
    Object.assign(ring.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    ring.classList.remove('hidden');
    // if the coach box sits on top of what it's pointing at, move it to the other end of the screen
    // (deterministic: compare against where the box sits when docked at the bottom, so it never flickers)
    const box = $('#coach');
    const b = box.getBoundingClientRect();
    const bottomDock = { left: b.left, right: b.right, top: window.innerHeight - 136 - box.offsetHeight, bottom: window.innerHeight - 136 };
    if (window.innerWidth <= 900) { bottomDock.top = window.innerHeight - 8 - box.offsetHeight; bottomDock.bottom = window.innerHeight; }
    const hits = !(bottomDock.right < r.left || bottomDock.left > r.right || bottomDock.bottom < r.top || bottomDock.top > r.bottom);
    box.classList.toggle('coach-top', hits && r.height < window.innerHeight * 0.6);
    // on small screens, bring the target into view once per step
    if (placeRing.scrolled !== step && (r.bottom > window.innerHeight || r.top < 0)) { placeRing.scrolled = step; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }

  function go(n) { step = Math.max(0, Math.min(STEPS.length - 1, n)); save(); render(); }
  function finish() {
    active = false; step = STEPS.length; save();
    $('#coach').classList.add('hidden'); $('#coachRing').classList.add('hidden');
  }

  function check() {
    const st = S();
    if (!st || !st.tutorial || st.phase === 'over') {
      if (active) { $('#coach').classList.add('hidden'); $('#coachRing').classList.add('hidden'); active = false; }
      return;
    }
    if (active && st.code !== code) { active = false; } // a new tutorial game (e.g. after a restart)
    if (!active) {
      code = st.code;
      let saved = null;
      try { saved = localStorage.getItem(key()); } catch {}
      step = saved !== null ? Number(saved) : 0;
      if (step >= STEPS.length) return; // finished or exited
      active = true; lastStep = -1;
    }
    const s = STEPS[step];
    if (s.action && s.done && s.done()) { go(step + 1); return; }
    render();
  }

  window.ESCH_onRender = check;
  setInterval(check, 300); // keeps the ring glued to moving targets (zoom, tab switches)
})();
