/* ============================================================================
   STARTER LIBRARY — 起手素材，不是强制规范。
   本片全部共享图形的唯一来源：麦穗、麦田、人物、手、点轴、时间轴、尘埃、
   地面光池。所有函数都是确定性的（种子随机，不用 Math.random）。
   换主题时：保留 HF.ground / HF.register / HF.rng 的契约，替换造型函数。
   新增函数必须是「只增不改」，否则会静默改掉已建好的帧。
   ========================================================================= *//* ============================================================================
   wheat.js — shared pictograms and helpers for every frame.
   Loaded INSIDE each frame's <template> via <script src="../../compositions/lib/wheat.js">.

   Everything here is deterministic: positions come from a seeded PRNG, never
   Math.random(), so a render is reproducible frame for frame.
   ========================================================================= */
(function () {
  'use strict';

  const HF = (window.HF = window.HF || {});

  /** mulberry32 — small, fast, seedable. */
  HF.rng = function (seed) {
    let a = (seed | 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const NS = 'http://www.w3.org/2000/svg';

  /** build an SVG element with attributes + children */
  HF.svg = function (tag, attrs, children) {
    const el = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) el.setAttribute(k, attrs[k]);
    if (children) for (const c of [].concat(children)) if (c) el.appendChild(c);
    return el;
  };

  /** colours per ear state — the film's gold/chosen vs slate/unobserved mapping */
  const EAR_STATES = {
    gold:    { g1: '#fbf1d2', g2: '#e0b45c', g3: '#b07e2e', stem: '#b07e2e', awn: 'rgba(242,217,146,0.55)' },
    goldDim: { g1: '#b07e2e', g2: '#8a6122', g3: '#5c3f13', stem: '#5c3f13', awn: 'rgba(176,126,46,0.35)' },
    slate:   { g1: '#a8b8c6', g2: '#6c8095', g3: '#3b4a5a', stem: '#3b4a5a', awn: 'rgba(108,128,149,0.35)' },
    slateDim:{ g1: '#6c8095', g2: '#3b4a5a', g3: '#1e2731', stem: '#1e2731', awn: 'rgba(59,74,90,0.30)' },
  };
  HF.EAR_STATES = EAR_STATES;

  /**
   * One wheat ear as an inline <svg>. Height `h` px, width h*0.34.
   * opts: { h, state, grains, glow, awns, id }
   * The ear is the film's single pictogram — never redraw it per frame.
   */
  HF.ear = function (opts) {
    const o = Object.assign({ h: 320, state: 'gold', grains: 6, glow: false, awns: true, id: null }, opts || {});
    const st = EAR_STATES[o.state] || EAR_STATES.gold;
    const H = 200, W = 70;                       // viewBox units
    const scale = o.h / H;
    const uid = 'e' + Math.floor(o.h) + (o.id || '') + o.state;
    const defs = HF.svg('defs', null, [
      HF.svg('linearGradient', { id: uid + 'g', x1: '0', y1: '1', x2: '0.5', y2: '0' }, [
        HF.svg('stop', { offset: '0%', 'stop-color': st.g3 }),
        HF.svg('stop', { offset: '52%', 'stop-color': st.g2 }),
        HF.svg('stop', { offset: '100%', 'stop-color': st.g1 }),
      ]),
      HF.svg('radialGradient', { id: uid + 'b', cx: '50%', cy: '62%', r: '50%' }, [
        HF.svg('stop', { offset: '0%', 'stop-color': st.g1, 'stop-opacity': '0.55' }),
        HF.svg('stop', { offset: '100%', 'stop-color': st.g2, 'stop-opacity': '0' }),
      ]),
    ]);

    const parts = [];
    // glow bed behind the ear
    if (o.glow) parts.push(HF.svg('ellipse', { cx: 35, cy: 118, rx: 22, ry: 62, fill: 'url(#' + uid + 'b)' }));
    // stem
    parts.push(HF.svg('path', {
      d: 'M35 200 C35 164 34.2 132 35 96',
      fill: 'none', stroke: st.stem, 'stroke-width': 2.6, 'stroke-linecap': 'round',
    }));
    // grains in opposed pairs up the stem
    for (let i = 0; i < o.grains; i++) {
      const t = i / Math.max(1, o.grains - 1);
      const y = 96 - t * 56;
      const spread = 9.2 - t * 1.4;
      const rx = 5.6 - t * 1.1, ry = 11.4 - t * 2.0;
      for (const dir of [-1, 1]) {
        parts.push(HF.svg('ellipse', {
          cx: 35 + dir * spread, cy: y, rx: rx, ry: ry,
          fill: 'url(#' + uid + 'g)',
          transform: 'rotate(' + dir * 30 + ' ' + (35 + dir * spread) + ' ' + y + ')',
        }));
        if (o.awns) {
          parts.push(HF.svg('path', {
            d: 'M' + (35 + dir * spread) + ' ' + (y - ry * 0.7) + ' l' + (dir * 7) + ' -22',
            stroke: st.awn, 'stroke-width': 1.1, fill: 'none', 'stroke-linecap': 'round',
          }));
        }
      }
    }
    // terminal grain
    parts.push(HF.svg('ellipse', { cx: 35, cy: 32, rx: 5.2, ry: 13.5, fill: 'url(#' + uid + 'g)' }));
    if (o.awns) parts.push(HF.svg('path', { d: 'M35 20 l0 -18', stroke: st.awn, 'stroke-width': 1.2, fill: 'none', 'stroke-linecap': 'round' }));

    return HF.svg('svg', {
      class: 'ear', width: Math.round(W * scale), height: Math.round(H * scale),
      viewBox: '0 0 ' + W + ' ' + H, 'aria-hidden': 'true',
    }, [defs].concat(parts));
  };

  /**
   * A field of ears standing on a baseline. Left-to-right, deterministic jitter.
   * opts: { count, seed, baseline, left, right, minH, maxH, state, glowEvery, z }
   * Returns the container element (already positioned absolutely).
   */
  HF.field = function (opts) {
    const o = Object.assign({
      count: 40, seed: 7, baseline: 700, left: -60, right: 1980,
      minH: 150, maxH: 340, state: 'slateDim', glowEvery: 0, opacity: 1, blur: 0,
    }, opts || {});
    const rnd = HF.rng(o.seed);
    const wrap = document.createElement('div');
    wrap.className = 'ear-field';
    wrap.style.cssText = 'position:absolute;inset:0;pointer-events:none;' +
      (o.opacity !== 1 ? 'opacity:' + o.opacity + ';' : '') +
      (o.blur ? 'filter:blur(' + o.blur + 'px);' : '');
    for (let i = 0; i < o.count; i++) {
      const t = o.count === 1 ? 0 : i / (o.count - 1);
      const x = o.left + t * (o.right - o.left) + (rnd() - 0.5) * 26;
      const h = o.minH + rnd() * (o.maxH - o.minH);
      const isGlow = o.glowEvery && i % o.glowEvery === 0;
      const el = HF.ear({ h: h, state: isGlow ? 'gold' : o.state, glow: !!isGlow, grains: 5 + Math.round(rnd() * 2) });
      const holder = document.createElement('div');
      holder.style.cssText = 'position:absolute;left:' + x.toFixed(1) + 'px;top:' + (o.baseline - h).toFixed(1) + 'px;';
      holder.appendChild(el);
      wrap.appendChild(holder);
    }
    return wrap;
  };

  /**
   * Dust motes in two parallax depths. Deterministic.
   * opts: { count, seed, minR, maxR, opacity }
   */
  HF.dust = function (opts) {
    const o = Object.assign({ count: 18, seed: 11, minR: 1, maxR: 4, opacity: 1 }, opts || {});
    const rnd = HF.rng(o.seed);
    const wrap = document.createElement('div');
    wrap.className = 'dust';
    if (o.opacity !== 1) wrap.style.opacity = o.opacity;
    for (let i = 0; i < o.count; i++) {
      const near = i % 2 === 0;
      const r = (near ? o.maxR * 0.55 : o.minR) + rnd() * (near ? o.maxR * 0.45 : o.maxR * 0.45);
      const d = document.createElement('i');
      d.style.cssText =
        'left:' + (rnd() * 100).toFixed(2) + '%;top:' + (rnd() * 100).toFixed(2) + '%;' +
        'width:' + r.toFixed(2) + 'px;height:' + r.toFixed(2) + 'px;' +
        'opacity:' + (0.10 + rnd() * 0.34).toFixed(3) + ';' +
        'filter:blur(' + (near ? 0.3 : 1.1).toFixed(2) + 'px);' +
        'box-shadow:0 0 ' + (r * 3).toFixed(1) + 'px rgba(242,217,146,0.45);';
      d.dataset.depth = near ? 'near' : 'far';
      wrap.appendChild(d);
    }
    return wrap;
  };

  /**
   * The mathematical stage: n points on a hairline, optional selection.
   * opts: { n, width, height, selected:[], passed:0, y, seed, spread }
   * Returns { el, dots } so a timeline can address individual dots.
   */
  HF.dotAxis = function (opts) {
    const o = Object.assign({ n: 40, width: 1500, height: 120, selected: [], passed: 0, seed: 3, spread: 1 }, opts || {});
    const rnd = HF.rng(o.seed);
    const wrap = document.createElement('div');
    wrap.className = 'dot-axis';
    wrap.style.cssText = 'position:relative;width:' + o.width + 'px;height:' + o.height + 'px;';
    const line = document.createElement('div');
    line.className = 'hairline-cool';
    line.style.cssText = 'position:absolute;left:0;right:0;top:' + (o.height / 2) + 'px;';
    wrap.appendChild(line);
    const sel = new Set(o.selected);
    const dots = [];
    for (let i = 0; i < o.n; i++) {
      const t = o.n === 1 ? 0 : i / (o.n - 1);
      const x = t * (o.width - 14) + 7;
      const jitter = o.spread ? (rnd() - 0.5) * o.height * 0.52 : 0;
      const d = document.createElement('i');
      const isSel = sel.has(i);
      const isPast = i < o.passed;
      const size = isSel ? 13 : 7;
      d.style.cssText =
        'position:absolute;left:' + x.toFixed(1) + 'px;top:' + (o.height / 2 + jitter - size / 2).toFixed(1) + 'px;' +
        'width:' + size + 'px;height:' + size + 'px;border-radius:50%;' +
        'background:' + (isSel ? 'var(--gold-500)' : isPast ? 'var(--slate-600)' : 'var(--slate-400)') + ';' +
        (isSel ? 'box-shadow:0 0 18px var(--glow-warm);' : '');
      d.dataset.i = String(i);
      dots.push(d);
      wrap.appendChild(d);
    }
    return { el: wrap, dots: dots };
  };

  /**
   * A timeline bar with an observation span and an action span.
   * opts: { width, split (0..1), height, ticks, markAt (0..1), labels:{left,right} }
   */
  HF.timelineBar = function (opts) {
    const o = Object.assign({ width: 1500, split: 0.37, height: 10, ticks: 21, markAt: null }, opts || {});
    const wrap = document.createElement('div');
    wrap.className = 'tl-bar';
    wrap.style.cssText = 'position:relative;width:' + o.width + 'px;height:' + (o.height + 46) + 'px;';
    const track = document.createElement('div');
    track.style.cssText = 'position:absolute;left:0;right:0;top:0;height:' + o.height + 'px;overflow:hidden;';
    const obs = document.createElement('div');
    obs.style.cssText = 'position:absolute;left:0;top:0;bottom:0;width:' + (o.split * 100).toFixed(3) + '%;background:var(--slate-600);';
    const act = document.createElement('div');
    act.style.cssText = 'position:absolute;right:0;top:0;bottom:0;left:' + (o.split * 100).toFixed(3) + '%;background:linear-gradient(to right,var(--gold-700),var(--gold-500));';
    obs.className = 'tl-obs'; act.className = 'tl-act';
    track.appendChild(obs); track.appendChild(act);
    wrap.appendChild(track);
    // the split marker
    const mk = document.createElement('div');
    mk.className = 'tl-split';
    mk.style.cssText = 'position:absolute;left:' + (o.split * 100).toFixed(3) + '%;top:-16px;width:1px;height:' + (o.height + 32) + 'px;background:var(--gold-300);box-shadow:0 0 14px var(--glow-warm);';
    wrap.appendChild(mk);
    // ticks below
    const trow = document.createElement('div');
    trow.style.cssText = 'position:absolute;left:0;right:0;top:' + (o.height + 6) + 'px;height:40px;';
    for (let i = 0; i < o.ticks; i++) {
      const t = i / (o.ticks - 1);
      const tk = document.createElement('div');
      tk.className = 'tick' + (i === 0 || i === o.ticks - 1 ? ' major' : '');
      tk.style.cssText = 'position:absolute;top:0;left:' + (t * 100).toFixed(3) + '%;height:' + (i % 5 === 0 ? 14 : 8) + 'px;';
      trow.appendChild(tk);
    }
    wrap.appendChild(trow);
    wrap.dataset.split = String(o.split);
    return wrap;
  };

  /**
   * Register a frame's one paused timeline.
   * The key MUST equal the root's data-composition-id.
   */
  HF.register = function (id, build) {
    const tl = window.gsap.timeline({ paused: true });
    if (typeof build === 'function') build(tl);
    window.__timelines[id] = tl;
    return tl;
  };

  /* ==========================================================================
     HF.figure / HF.hand — the film's two human silhouettes.

     Both exist because the shots that carry a body or a hand were rejected for
     assembling anatomy out of primitives (stacked capsules, ellipse joints) and
     for a figure whose proportions were invented per frame. The rule now is the
     one F04 already followed and the user approved: a body is a robe path plus a
     head circle, and a hand is ONE closed cubic outline — a palm mass wider at
     the knuckles than at the wrist, four graduated fingers with rounded tips and
     shallow webbed bases, and an opposed thumb with a real joint. Nothing below
     is a capsule, a rectangle or a circle standing in for a joint.
     ======================================================================== */

  const HC = 0.5522847498;                     // circular-arc cubic constant
  const hPt = (x, y) => [x, y];
  const hAdd = (p, v, s) => [p[0] + v[0] * s, p[1] + v[1] * s];
  const hLerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const hPol = (deg) => { const r = deg * Math.PI / 180; return [Math.cos(r), Math.sin(r)]; };

  /** One digit: base centre, axis angle (deg, 0 = east), length, base/tip half-widths. */
  function hDigit(B, ang, len, hw0, hw1) {
    const u = hPol(ang), n = [-u[1], u[0]];
    const tip = hAdd(B, u, len);
    return {
      B, u, n, len, hw0, hw1,
      baseN: hAdd(B, n, -hw0), baseS: hAdd(B, n, hw0),
      tipN: hAdd(tip, n, -hw1), tipS: hAdd(tip, n, hw1), apex: hAdd(tip, u, hw1),
    };
  }

  /** A thumb is two segments, so the outline changes direction at its joint. */
  function hThumb(root, ang, l1, l2, bend, hw0, hwJ, hw1) {
    const u1 = hPol(ang), n1 = [-u1[1], u1[0]];
    const J = hAdd(root, u1, l1);
    const u2 = hPol(ang + bend), n2 = [-u2[1], u2[0]];
    const tip = hAdd(J, u2, l2);
    return {
      root, J, tip, u1, n1, u2, n2, hw0, hwJ, hw1,
      rootN: hAdd(root, n1, -hw0), rootS: hAdd(root, n1, hw0),
      jN: hAdd(J, n1, -hwJ), jS: hAdd(J, n1, hwJ),
      tipN: hAdd(tip, n2, -hw1), tipS: hAdd(tip, n2, hw1), apex: hAdd(tip, u2, hw1),
    };
  }

  /** Emits cubic segments only, so every hand outline is one closed curve. */
  function hOutline() {
    const segs = [];
    const api = {
      moveTo: (p) => { segs.push(['M', p]); return api; },
      /** a cubic from P to Q, bowed by `k` along unit `dir` (a plain arc when k is 0) */
      bow: (P, Q, dir, k) => {
        segs.push(['C', k ? hAdd(hLerp(P, Q, 1 / 3), dir, k) : hLerp(P, Q, 1 / 3),
          k ? hAdd(hLerp(P, Q, 2 / 3), dir, k) : hLerp(P, Q, 2 / 3), Q]);
        return api;
      },
      /** the rounded tip of a digit: two quarter-arcs through the apex */
      cap: (g) => {
        const { tipN, apex, tipS, u, n, hw1 } = g;
        segs.push(['C', hAdd(tipN, u, HC * hw1), hAdd(apex, n, -HC * hw1), apex]);
        segs.push(['C', hAdd(apex, n, HC * hw1), hAdd(tipS, u, HC * hw1), tipS]);
        return api;
      },
      close: () => { segs.push(['Z']); return api; },
      /** rotate the whole outline about `o` — how the open hand is turned upright */
      turn: (deg, o) => {
        const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
        const f = (p) => [o[0] + (p[0] - o[0]) * c - (p[1] - o[1]) * s,
          o[1] + (p[0] - o[0]) * s + (p[1] - o[1]) * c];
        for (const seg of segs) if (seg[0] !== 'Z') for (let i = 1; i < seg.length; i++) seg[i] = f(seg[i]);
        return api;
      },
      d: () => segs.map((seg) => seg[0] === 'Z' ? 'Z'
        : seg[0] + seg.slice(1).map((p) => (Math.round(p[0] * 100) / 100) + ' ' + (Math.round(p[1] * 100) / 100)).join(' ')).join(' '),
      bbox: () => {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const seg of segs) {
          if (seg[0] === 'Z') continue;
          for (let i = 1; i < seg.length; i++) {
            x0 = Math.min(x0, seg[i][0]); x1 = Math.max(x1, seg[i][0]);
            y0 = Math.min(y0, seg[i][1]); y1 = Math.max(y1, seg[i][1]);
          }
        }
        return [x0, y0, x1, y1];
      },
    };
    return api;
  }

  /* The three poses. Each is authored as "arm leaves west", except the grip, whose
     forearm leaves east; `side` records that so HF.hand's `crop` can mirror it. */
  const HAND_DIGITS = {
    reach: { angs: [-28, -9, 10, 29], base: [[444, 182], [470, 288], [466, 392], [446, 484]],
      lens: [368, 418, 392, 282], hw0: [44, 47, 42, 35], hw1: [30, 32, 29, 24],
      webPush: [95, 100, 90], thumb: [205, 505, 48, 125, 165, 13, 64, 56, 39] },
    open: { angs: [-34, -11, 12, 34], base: [[444, 182], [470, 288], [466, 392], [446, 484]],
      lens: [368, 418, 392, 282], hw0: [44, 47, 42, 35], hw1: [30, 32, 29, 24],
      webPush: [98, 104, 94], thumb: [205, 505, 52, 128, 168, 14, 64, 56, 39] },
  };

  /** A hand whose forearm runs off the WEST edge of its box. */
  function hBuildHand(name) {
    const c = HAND_DIGITS[name];
    const FING = c.base.map((b, i) => hDigit(b, c.angs[i], c.lens[i], c.hw0[i], c.hw1[i]));
    const web = [0, 1, 2].map((i) => {
      const m = hLerp(FING[i].baseS, FING[i + 1].baseN, 0.5);
      return [m[0] + c.webPush[i], m[1]];
    });
    const TH = hThumb(c.thumb.slice(0, 2), c.thumb[2], c.thumb[3], c.thumb[4], c.thumb[5], c.thumb[6], c.thumb[7], c.thumb[8]);
    const WN = [0, 180], WS = [0, 480], palmLow = [437, 520];
    const p = hOutline();
    p.moveTo([-420, WN[1] - 6]);
    p.bow([-420, WN[1] - 6], WN, [0, -1], -3);            // the forearm, running off-frame
    p.bow(WN, [206, 168], [0, -1], -4);
    p.bow([206, 168], FING[0].baseN, [0, -1], -3);        // the palm widening to the knuckles
    for (let i = 0; i < 4; i++) {
      const g = FING[i];
      p.bow(i === 0 ? g.baseN : web[i - 1], g.tipN, g.n, -g.len * 0.022);
      p.cap(g);
      if (i < 3) p.bow(g.tipS, web[i], g.n, g.len * 0.016);   // a shallow V, never a slot
    }
    p.bow(FING[3].tipS, palmLow, FING[3].n, 5);
    const TV = hAdd(TH.rootN, TH.u1, (508 - TH.rootN[1]) / (TH.u1[1] || 1));
    p.bow(palmLow, TV, [0, 1], -5);
    p.bow(TV, TH.jN, TH.n1, -4);                          // the thumb, opposed and jointed
    p.bow(TH.jN, TH.tipN, TH.n2, -3);
    p.cap({ tipN: TH.tipN, apex: TH.apex, tipS: TH.tipS, u: TH.u2, n: TH.n2, hw1: TH.hw1 });
    p.bow(TH.tipS, TH.jS, TH.n2, 3);
    p.bow(TH.jS, TH.rootS, TH.n1, 4);
    p.bow(TH.rootS, WS, [0, 1], -5);
    p.bow(WS, [-420, WS[1] + 6], [0, 1], -3);
    p.close();
    if (name === 'open') p.turn(-50, [0, 330]);           // palm up, fingers up-and-right
    return p;
  }

  /** A fist closed round a vertical stem, forearm running off the EAST edge. */
  function hBuildGrip() {
    const TH = hThumb([520, 500], 118, 100, 100, 8, 52, 46, 40);
    const p = hOutline();
    p.moveTo([1460, 196]);
    p.bow([1460, 196], [1040, 186], [0, -1], -5);
    p.bow([1040, 186], [760, 176], [0, -1], -6);
    p.bow([760, 176], [560, 172], [-0.2, -1], -6);
    p.bow([560, 172], [438, 190], [-0.3, -1], -8);        // the back of the hand
    p.bow([438, 190], [296, 268], [-1, 0.15], 14);        // the curled fingers, one mass
    p.bow([296, 268], [300, 386], [-1, -0.1], 10);
    p.bow([300, 386], [386, 494], [-0.4, -0.9], -14);
    p.bow([386, 494], TH.rootS, [0, 1], 6);               // the heel, then the thumb across
    p.bow(TH.rootS, TH.jS, TH.n1, -4);
    p.bow(TH.jS, TH.tipS, TH.n2, -3);
    p.cap({ tipN: TH.tipN, apex: TH.apex, tipS: TH.tipS, u: TH.u2, n: TH.n2, hw1: TH.hw1 });
    p.bow(TH.tipN, TH.jN, TH.n2, 3);
    p.bow(TH.jN, TH.rootN, TH.n1, 4);
    p.bow(TH.rootN, [800, 552], [0, 1], 7);
    p.bow([800, 552], [1100, 528], [0, -1], -6);
    p.bow([1100, 528], [1460, 498], [0, 1], -5);
    p.close();
    return p;
  }

  const HAND_POSES = {
    reach: { build: () => hBuildHand('reach'), side: 'left' },
    open: { build: () => hBuildHand('open'), side: 'left' },
    grip: { build: hBuildGrip, side: 'right' },
  };
  // built once and cached: the outlines are pure geometry, so instances can share them
  const HAND_CACHE = {};
  function handPose(name) {
    const key = HAND_POSES[name] ? name : 'reach';
    if (!HAND_CACHE[key]) {
      const p = HAND_POSES[key].build();
      const b = p.bbox();
      const pad = 2;
      const x0 = b[0] - pad, y0 = b[1] - pad;
      const bw = b[2] - b[0] + pad * 2, bh = b[3] - b[1] + pad * 2;
      const r2 = (v) => Math.round(v * 100) / 100;
      HAND_CACHE[key] = {
        d: p.d(), side: HAND_POSES[key].side,
        vb: r2(x0) + ' ' + r2(y0) + ' ' + r2(bw) + ' ' + r2(bh),
        w: bw, h: bh, mx: 2 * x0 + bw,          // mirror axis = the viewBox centre
      };
    }
    return HAND_CACHE[key];
  }

  /**
   * A hand as one flat silhouette, rim-lit along the edge that faces the light.
   * opts: { w, pose: 'reach'|'open'|'grip', crop: 'left'|'right', rim, glow, id }
   *   w     rendered width in px (height follows the pose's own aspect)
   *   crop  the frame edge the forearm leaves through; the pose is mirrored when
   *         that is not the edge it was authored for. A hand is meant to be
   *         cropped by the frame — that is what makes a close-up read.
   */
  HF.hand = function (opts) {
    const o = Object.assign({ w: 720, pose: 'reach', crop: 'left', rim: true, glow: false, id: 'hand' }, opts || {});
    const P = handPose(o.pose);
    const uid = 'h' + String(o.id).replace(/[^A-Za-z0-9_-]/g, '');
    const flip = o.crop === 'right' ? P.side !== 'right' : P.side === 'right';
    const h = Math.round(o.w * P.h / P.w);
    const defs = HF.svg('defs', null, [
      HF.svg('linearGradient', { id: uid + 'f', x1: '0', y1: '0', x2: '0.9', y2: '1' }, [
        HF.svg('stop', { offset: '0%', 'stop-color': '#08070b' }),
        HF.svg('stop', { offset: '58%', 'stop-color': '#100e14' }),
        HF.svg('stop', { offset: '100%', 'stop-color': '#221c15' }),
      ]),
      // the rim: the key light landing on the contour, so it is always this film's warm
      HF.svg('linearGradient', { id: uid + 'r', x1: '1', y1: '0', x2: '0.15', y2: '1' }, [
        HF.svg('stop', { offset: '0%', 'stop-color': '#fbf1d2', 'stop-opacity': '0.74' }),
        HF.svg('stop', { offset: '34%', 'stop-color': '#e0b45c', 'stop-opacity': '0.30' }),
        HF.svg('stop', { offset: '72%', 'stop-color': '#b07e2e', 'stop-opacity': '0.10' }),
        HF.svg('stop', { offset: '100%', 'stop-color': '#b07e2e', 'stop-opacity': '0' }),
      ]),
    ]);
    const body = [HF.svg('path', { d: P.d, fill: 'url(#' + uid + 'f)' })];
    if (o.rim) body.push(HF.svg('path', {
      d: P.d, fill: 'none', stroke: 'url(#' + uid + 'r)', 'stroke-width': 2.2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));
    if (o.glow) body[0].style.filter = 'drop-shadow(0 0 18px rgba(224,180,92,0.30))';
    return HF.svg('svg', {
      class: 'hand', width: o.w, height: h, viewBox: P.vb, 'aria-hidden': 'true',
    }, [defs, flip ? HF.svg('g', { transform: 'translate(' + Math.round(P.mx * 100) / 100 + ' 0) scale(-1 1)' }, body) : HF.svg('g', null, body)]);
  };

  /* F04's approved silhouette, verbatim, plus an `arms` variant that keeps the
     same robe curves and hangs two open arms off the same shoulder line. */
  const FIG_ROBE = {
    wide: 'M10 336 C16 250 30 172 46 124 C50 106 56 88 68 74 L92 74 ' +
      'C104 88 110 106 114 124 C130 172 144 250 150 336 Z',
    narrow: 'M20 336 C25 252 36 176 50 128 C54 110 58 90 69 75 L91 75 ' +
      'C102 90 106 110 110 128 C124 176 135 252 140 336 Z',
  };
  // the wide robe with both arms open: F04's own cubics, split at the shoulder so
  // the arm excursion leaves the armpit and returns to the shoulder line
  function hFigureArms() {
    const ax = 80;
    const mx = (p) => [ax * 2 - p[0], p[1]];
    const START = [10, 336];
    const SEG = [
      [[16, 250], [30, 172], [46, 124]],          // F04's first robe cubic
      [[38, 134], [28, 152], [22, 172]],          // the arm, out and down
      [[19, 182], [17, 192], [16, 202]],
      [[8, 206], [3, 216], [8, 226]],             // the open palm
      [[13, 236], [27, 240], [35, 230]],
      [[37, 221], [37, 211], [39, 203]],
      [[42, 190], [46, 170], [50, 150]],          // back up the outside of the arm
      [[52, 132], [53, 112], [54, 97.5]],         // to the shoulder
      [[57.5, 89], [62, 81], [68, 74]],           // F04's second cubic, right half
    ];
    const f = (p) => (Math.round(p[0] * 100) / 100) + ' ' + (Math.round(p[1] * 100) / 100);
    let d = 'M' + f(START) + ' ' + SEG.map((s) => 'C' + f(s[0]) + ' ' + f(s[1]) + ' ' + f(s[2])).join(' ') + ' L92 74';
    for (let i = SEG.length - 1; i >= 0; i--) {
      const prev = i === 0 ? START : SEG[i - 1][2];
      d += ' C' + f(mx(SEG[i][1])) + ' ' + f(mx(SEG[i][0])) + ' ' + f(mx(prev));
    }
    return d + ' Z';
  }

  /**
   * The film's standing figure: a robe mass and a head, flat and rim-lit.
   * opts: { h, robe: 'wide'|'narrow', rim, halo, arms, id }
   *   h     rendered height of the 160x340 box; width follows at 160/340
   *   arms  true (or 'open') gives the robe two open arms, for a frame where the
   *         hands are the subject; this uses the wide robe's shoulder line. The
   *         default is F04's armless silhouette, which is bit-for-bit F04's path.
   * Gradient ids are derived from `id`, so two figures can share one page.
   */
  HF.figure = function (opts) {
    const o = Object.assign({ h: 620, robe: 'wide', rim: true, halo: true, arms: false, id: 'fig' }, opts || {});
    const wide = o.robe !== 'narrow';
    const uid = 'g' + String(o.id).replace(/[^A-Za-z0-9_-]/g, '');
    const robe = o.arms ? hFigureArms() : (wide ? FIG_ROBE.wide : FIG_ROBE.narrow);
    const head = wide ? [80, 52, 21] : [80, 53, 20];
    const halo = wide ? [96, 100, 62, 66] : [94, 98, 58, 62];
    const defs = HF.svg('defs', null, [
      HF.svg('radialGradient', { id: uid + 'h', cx: '62%', cy: '28%', r: '58%' }, [
        HF.svg('stop', { offset: '0%', 'stop-color': '#f2d992', 'stop-opacity': wide ? '0.34' : '0.30' }),
        HF.svg('stop', { offset: '55%', 'stop-color': '#e0b45c', 'stop-opacity': wide ? '0.12' : '0.10' }),
        HF.svg('stop', { offset: '100%', 'stop-color': '#e0b45c', 'stop-opacity': '0' }),
      ]),
      HF.svg('linearGradient', { id: uid + 'r', x1: '1', y1: '0.1', x2: '0.18', y2: '0.6' }, [
        HF.svg('stop', { offset: '0%', 'stop-color': '#fbf1d2', 'stop-opacity': wide ? '0.92' : '0.88' }),
        HF.svg('stop', { offset: '38%', 'stop-color': '#e0b45c', 'stop-opacity': wide ? '0.34' : '0.30' }),
        HF.svg('stop', { offset: '100%', 'stop-color': '#b07e2e', 'stop-opacity': '0' }),
      ]),
    ]);
    const body = [];
    if (o.halo) body.push(HF.svg('ellipse', {
      cx: halo[0], cy: halo[1], rx: halo[2], ry: halo[3], fill: 'url(#' + uid + 'h)', opacity: 0.18,
    }));
    body.push(HF.svg('path', { d: robe, fill: '#07070a' }));
    body.push(HF.svg('circle', { cx: head[0], cy: head[1], r: head[2], fill: '#07070a' }));
    if (o.rim) body.push(HF.svg('g', { class: 'fg-rim', opacity: 0.16 }, [
      HF.svg('path', { d: robe, fill: 'none', stroke: 'url(#' + uid + 'r)', 'stroke-width': 2.4 }),
      HF.svg('circle', { cx: head[0], cy: head[1], r: head[2], fill: 'none', stroke: 'url(#' + uid + 'r)', 'stroke-width': 2.2 }),
    ]));
    return HF.svg('svg', {
      class: 'figure', width: Math.round(o.h * 160 / 340), height: o.h, viewBox: '0 0 160 340', 'aria-hidden': 'true',
    }, [defs].concat(body));
  };

  /** Standard frame scaffold: ground (+pool, vignette, grain) and dust on top. */
  HF.ground = function (root, opts) {
    const o = Object.assign({ poolX: '50%', poolY: '42%', poolW: '78cqw', poolH: '88cqh', poolStrength: 0.5, rays: 0, dust: 18, dustSeed: 11 }, opts || {});
    root.style.setProperty('--pool-x', o.poolX);
    root.style.setProperty('--pool-y', o.poolY);
    root.style.setProperty('--pool-w', o.poolW);
    root.style.setProperty('--pool-h', o.poolH);
    root.style.setProperty('--pool-strength', String(o.poolStrength));
    const g = document.createElement('div');
    g.className = 'ground';
    g.innerHTML = '<div class="pool"></div><div class="vignette"></div><div class="grain"></div>';
    // z-order matters and is fixed here: ground goes BEHIND everything already in
    // the frame, rays sit just above the ground, dust floats in FRONT of the
    // subject. Frames therefore never have to think about layer order.
    root.insertBefore(g, root.firstChild);
    let after = g;
    if (o.rays) {
      const rays = document.createElement('div');
      rays.className = 'rays';
      const rnd = HF.rng(o.dustSeed + 5);
      for (let i = 0; i < o.rays; i++) {
        const r = document.createElement('div');
        r.className = 'ray';
        r.style.left = (18 + i * (64 / Math.max(1, o.rays)) + rnd() * 8).toFixed(1) + '%';
        r.style.transform = 'rotate(' + (-24 + i * 16 + rnd() * 6).toFixed(1) + 'deg)';
        r.style.opacity = (0.5 + rnd() * 0.5).toFixed(2);
        rays.appendChild(r);
      }
      root.insertBefore(rays, g.nextSibling);
      after = rays;
    }
    if (o.dust) root.appendChild(HF.dust({ count: o.dust, seed: o.dustSeed }));
    return g;
  };
})();

