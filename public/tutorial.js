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
      text: `This is a <b>training game</b>: just you against AI, with 10 minutes per turn, so take your time.<br><br>
        You lead <b style="color:#4da3ff">AMNAT</b> (US/NATO, the blue countries). Six AI coalitions control the other colours.<br><br>
        I'll point at things. Gold-ringed items are what to look at or click.`,
    },
    {
      title: 'HOW YOU WIN',
      target: '#scoreboard',
      text: `This is the live <b>scoreboard</b>. Your score is <b>INDDIR ÷ SUFDDIR</b>: damage you inflict directly, divided by damage you suffer directly.<br><br>
        Hit others hard, avoid getting hit, and you climb. The best ratio when the game ends wins.`,
    },
    {
      title: 'WHEN THE GAME ENDS',
      target: '#map',
      text: `The gold <b>⚠ markers</b> on the map are <b>TRIGSITs</b>, live crises like Berlin and Korea. The number in [brackets] is how many turns until it freezes.<br><br>
        The game ends when <b>every TRIGSIT is resolved</b>: by negotiation, by one side winning militarily, or by its timer running out.<br><br>
        There are <b>21</b>, one for every pair of coalitions, and you're in <b>6</b> of them. The <b>CRISES</b> tab lists them all.`,
    },
    {
      title: 'THE ESCALATION METER',
      target: '#escBox',
      text: `Every nuclear strike pushes this meter up. Higher escalation means <b>more damage</b>, <b>pricier strikes</b>, and a <b>bigger chance the enemy automatically retaliates</b>.<br><br>
        If it reaches <b>10</b> it's <b style="color:#ff3b3b">ESCHATON</b>: every silo fires and the game ends. Quiet turns cool it down.`,
    },
    {
      title: 'YOUR RESOURCES',
      target: '#resBar',
      text: `<b>IND</b> (industry), <b>URA</b> (uranium) and <b>INF</b> (influence) pay for everything. The green number is what you earn each turn from your coalition's countries.<br><br>
        Damaged countries produce less, so getting nuked hurts your economy as well as your score.`,
    },
    {
      title: 'OPEN A CRISIS',
      target: 'g.trig[data-id="berlin"]',
      action: true,
      text: `Let's fight for Berlin. <b>Click the ⚠ BERLIN BLOCKADE marker</b> in Germany (zoom in with the scroll wheel if needed).`,
      done: () => E()?.selected?.kind === 'trigsit' && E().selected.id === 'berlin',
    },
    {
      title: 'DEPLOY DIVISIONS',
      target: '#tab-target',
      action: true,
      text: `This panel shows the crisis. The <b>tug-of-war bar</b> is military control: AMNAT pulls one way, SOVWAR the other. Reaching the end wins the crisis.<br><br>
        Set a number and press <b>DEPLOY DIVISIONS</b>. More divisions than the enemy means you pull the bar your way every turn.`,
      done: () => hasAction('commit'),
    },
    {
      title: 'THE ORDERS QUEUE',
      target: '#ordersBox',
      text: `Your order was <b>queued</b> here. Nothing happens yet: everyone plans in secret, then <b>all orders resolve at once</b>.<br><br>
        You get <b>3 actions per turn</b> (deploy, strike, spy, negotiate). Building is free and doesn't use an action. Click ✕ to cancel an order.`,
    },
    {
      title: 'BUILD SOMETHING',
      target: () => (tabIs('build') ? '#tab-build' : '[data-tab="build"]'),
      action: true,
      text: `Open the <b>BUILD</b> tab and press <b>+</b> on any unit. Good first picks:<br>
        • <b>Conventional Forces</b>: more divisions for crises<br>
        • <b>Missile Defense</b>: a chance to shoot down incoming nukes<br>
        Units are ready next turn.`,
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
      text: `Watch the <b>resolution report</b>: it lists what every coalition did this turn. Battles at crises cost both sides divisions (that counts as damage too).<br><br>
        The full history is always in the log at the bottom. <i>Waiting for turn 2…</i>`,
      done: () => S()?.turn >= 2 && S()?.phase === 'orders',
    },
    {
      title: 'SPY ON AN ENEMY',
      target: () => (tabIs('intel') ? '#tab-intel' : '[data-tab="intel"]'),
      action: true,
      text: `Knowledge is power. Open <b>INTEL</b> and press <b>🕵 REVEAL</b> on any enemy (SOVWAR is a good choice).<br><br>
        Beware: enemies can <b>plant false intel</b>, so the numbers you get might be fake. You can do the same to them.`,
      done: () => hasAction('spy'),
    },
    {
      title: 'THE NUCLEAR OPTION',
      target: '#map',
      action: true,
      skipLabel: 'STAY PEACEFUL (SKIP)',
      text: `Click any <b style="color:#ff4b4b">red SOVWAR country</b> (Russia, Poland…). The panel shows the <b>damage</b>, the <b>INF cost</b>, and the <b>retaliation chance</b>.<br><br>
        Press <b>☢ TACTICAL</b> to queue a strike, or skip if you'd rather keep the peace. Strategic warheads hit 3× harder but escalate 3× more.`,
      done: () => hasAction('strike'),
    },
    {
      title: 'DIPLOMACY',
      target: () => (tabIs('diplo') ? '#tab-diplo' : '[data-tab="diplo"]'),
      action: true,
      text: `Open <b>TREATIES</b> and <b>PROPOSE</b> a non-aggression pact to any coalition. Treaties happen instantly and don't use an action.<br><br>
        Pacts can be broken, but the whole world is told, and escalation jumps.`,
      done: () => (S()?.treaties || []).some((t) => t.a === me()?.coalition),
    },
    {
      title: 'NEGOTIATE PEACE',
      target: () => (E()?.selected?.kind === 'trigsit' ? '#tab-target' : '#map'),
      text: `Any player can spend <b>INF</b> to <b>🕊 NEGOTIATE</b> at a crisis, even one you're not part of. When the peace bar hits 100%, the crisis resolves and every negotiator earns a peace dividend.<br><br>
        Tip: if you're ahead on the scoreboard, <b>ending crises ends the game sooner</b>.`,
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
        <b>1.</b> Deploy divisions and negotiate to resolve crises<br>
        <b>2.</b> Build, spy and bluff<br>
        <b>3.</b> Nuke only when it improves your ratio, because the enemy may fire back<br>
        <b>4.</b> Watch the escalation meter<br><br>
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
