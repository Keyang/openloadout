// sfx-engine.js — procedural sound-effect engine.
// Pure JavaScript, no DOM and no Web Audio: the same file runs on the browser
// main thread (offline render), inside an AudioWorklet (live), and in Node
// (agent-side validation). A sound is a JSON "patch": named parameters, a list
// of DSP nodes, and expressions that wire them together.

export const FORMAT = 'sfxpatch/0.1';
const TAU = Math.PI * 2;

export class PatchError extends Error {}

// ---------------------------------------------------------------- random

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(a, b) {
  let h = (a ^ 0x9E3779B9) >>> 0;
  h = Math.imul(h ^ (b + 0x7F4A7C15), 0x85EBCA6B) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35) >>> 0; h ^= h >>> 16;
  return h >>> 0;
}

// ---------------------------------------------------------------- expressions

const FUNCS = {
  sin: [1, Math.sin], cos: [1, Math.cos], tan: [1, Math.tan], abs: [1, Math.abs],
  sqrt: [1, (x) => Math.sqrt(Math.max(0, x))], floor: [1, Math.floor], ceil: [1, Math.ceil],
  round: [1, Math.round], sign: [1, Math.sign], tanh: [1, Math.tanh], exp: [1, Math.exp],
  log: [1, (x) => Math.log(Math.max(1e-12, x))],
  min: [2, Math.min], max: [2, Math.max], pow: [2, Math.pow],
  clamp: [3, (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x)],
  mix: [3, (a, b, t) => a + (b - a) * t],
  db: [1, (x) => Math.pow(10, x / 20)],
  midi: [1, (n) => 440 * Math.pow(2, (n - 69) / 12)],
  semi: [1, (n) => Math.pow(2, n / 12)],
  step: [2, (edge, x) => (x >= edge ? 1 : 0)],
  smooth: [3, (e0, e1, x) => { let u = (x - e0) / (e1 - e0); u = u < 0 ? 0 : u > 1 ? 1 : u; return u * u * (3 - 2 * u); }],
};
const BUILTIN_NAMES = ['t', 'dur', 'sr', 'pi', 'tau', 'rnd'];
export const EXPRESSION_FUNCTIONS = Object.keys(FUNCS).concat(['rnd']);
export const RESERVED = new Set([...BUILTIN_NAMES, ...Object.keys(FUNCS)]);

function tokenize(src) {
  const toks = []; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }
    const rest = src.slice(i);
    let m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(rest);
    if (m) { toks.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
    m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
    if (m) { toks.push({ t: 'id', v: m[0] }); i += m[0].length; continue; }
    const two = src.slice(i, i + 2);
    if (['<=', '>=', '==', '!=', '&&', '||'].includes(two)) { toks.push({ t: 'op', v: two }); i += 2; continue; }
    if ('+-*/%^()<>?:,'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
    throw new Error(`unexpected character '${c}'`);
  }
  return toks;
}

function parseExpr(src) {
  const toks = tokenize(src); let i = 0;
  const eat = (v) => { if (toks[i] && toks[i].t === 'op' && toks[i].v === v) { i++; return true; } return false; };
  const expect = (v) => { if (!eat(v)) throw new Error(`expected '${v}'`); };
  const binLevel = (ops, next) => () => {
    let a = next();
    for (;;) {
      const tk = toks[i];
      if (tk && tk.t === 'op' && ops.includes(tk.v)) { i++; a = { k: 'bin', op: tk.v, a, b: next() }; } else return a;
    }
  };
  function primary() {
    const tk = toks[i++];
    if (!tk) throw new Error('unexpected end of expression');
    if (tk.t === 'num') return { k: 'num', v: tk.v };
    if (tk.t === 'id') {
      if (eat('(')) {
        const args = [];
        if (!eat(')')) { do { args.push(ternary()); } while (eat(',')); expect(')'); }
        return { k: 'call', name: tk.v, args };
      }
      return { k: 'id', name: tk.v };
    }
    if (tk.v === '(') { const e = ternary(); expect(')'); return e; }
    throw new Error(`unexpected '${tk.v}'`);
  }
  function power() { const a = primary(); if (eat('^')) return { k: 'bin', op: '^', a, b: unary() }; return a; }
  function unary() { if (eat('-')) return { k: 'neg', a: unary() }; if (eat('+')) return unary(); return power(); }
  const mul = binLevel(['*', '/', '%'], unary);
  const add = binLevel(['+', '-'], mul);
  const cmp = binLevel(['<', '>', '<=', '>=', '==', '!='], add);
  const and = binLevel(['&&'], cmp);
  const or = binLevel(['||'], and);
  function ternary() {
    const c = or();
    if (eat('?')) { const a = ternary(); expect(':'); const b = ternary(); return { k: 'tern', c, a, b }; }
    return c;
  }
  const e = ternary();
  if (i < toks.length) throw new Error(`unexpected '${toks[i].v}'`);
  return e;
}

const BIN = {
  '+': (a, b) => () => a() + b(), '-': (a, b) => () => a() - b(),
  '*': (a, b) => () => a() * b(), '/': (a, b) => () => a() / b(),
  '%': (a, b) => () => { const y = b(); const x = a(); return x - y * Math.floor(x / y); },
  '^': (a, b) => () => Math.pow(a(), b()),
  '<': (a, b) => () => (a() < b() ? 1 : 0), '>': (a, b) => () => (a() > b() ? 1 : 0),
  '<=': (a, b) => () => (a() <= b() ? 1 : 0), '>=': (a, b) => () => (a() >= b() ? 1 : 0),
  '==': (a, b) => () => (a() === b() ? 1 : 0), '!=': (a, b) => () => (a() !== b() ? 1 : 0),
  '&&': (a, b) => () => (a() !== 0 && b() !== 0 ? 1 : 0), '||': (a, b) => () => (a() !== 0 || b() !== 0 ? 1 : 0),
};

// Compiles an AST to a closure. `dyn` is true when the value can change from
// sample to sample (it reads a node output or the time `t`).
function compileAst(n, scope) {
  switch (n.k) {
    case 'num': { const v = n.v; return { fn: () => v, dyn: false }; }
    case 'id': {
      const r = scope.resolve(n.name);
      if (!r) throw new Error(`unknown name '${n.name}'`);
      return r;
    }
    case 'neg': { const a = compileAst(n.a, scope); const f = a.fn; return { fn: () => -f(), dyn: a.dyn }; }
    case 'tern': {
      const c = compileAst(n.c, scope), a = compileAst(n.a, scope), b = compileAst(n.b, scope);
      const fc = c.fn, fa = a.fn, fb = b.fn;
      return { fn: () => (fc() !== 0 ? fa() : fb()), dyn: c.dyn || a.dyn || b.dyn };
    }
    case 'bin': {
      const a = compileAst(n.a, scope), b = compileAst(n.b, scope);
      return { fn: BIN[n.op](a.fn, b.fn), dyn: a.dyn || b.dyn };
    }
    case 'call': {
      const args = n.args.map((x) => compileAst(x, scope));
      const dyn = args.some((x) => x.dyn);
      if (n.name === 'rnd') {
        if (args.length !== 2) throw new Error('rnd(lo, hi) takes 2 arguments');
        const u = scope.rnd(); const lo = args[0].fn, hi = args[1].fn;
        return { fn: () => { const l = lo(); return l + u * (hi() - l); }, dyn };
      }
      const F = FUNCS[n.name];
      if (!F) throw new Error(`unknown function '${n.name}'`);
      if (args.length !== F[0]) throw new Error(`${n.name}() takes ${F[0]} argument(s), got ${args.length}`);
      const f = F[1];
      if (F[0] === 1) { const a = args[0].fn; return { fn: () => f(a()), dyn }; }
      if (F[0] === 2) { const a = args[0].fn, b = args[1].fn; return { fn: () => f(a(), b()), dyn }; }
      const a = args[0].fn, b = args[1].fn, c = args[2].fn;
      return { fn: () => f(a(), b(), c()), dyn };
    }
  }
  throw new Error('bad expression');
}

// ---------------------------------------------------------------- node library
// Field kinds: 'sig' = number or expression, may read node outputs (audio rate).
//              'con' = number or expression of parameters only.
//              'enum', 'points', 'list', 'flag' = see each node.

function shapeCurve(v0, v1, u, c) {
  if (c === undefined || c === 'lin') return v0 + (v1 - v0) * u;
  if (c === 'exp') {
    if (v0 > 0 && v1 > 0) return v0 * Math.pow(v1 / v0, u);
    return v0 + (v1 - v0) * (1 - Math.pow(1 - u, 3));
  }
  if (c === 'hold') return v0;
  if (typeof c === 'number') return v0 + (v1 - v0) * Math.pow(u, c);
  return v0 + (v1 - v0) * u;
}
function blep(p, dt) {
  if (dt <= 0) return 0;
  if (p < dt) { const x = p / dt; return x + x - x * x - 1; }
  if (p > 1 - dt) { const x = (p - 1) / dt; return x * x + x + x + 1; }
  return 0;
}
// Rising-edge detector shared by every node with a `trig` input. Without a
// trig expression the node fires once, on the first sample.
function trigger(h) {
  if (h.def.trig === undefined) { let first = true; return () => { if (first) { first = false; return true; } return false; }; }
  const tr = h.sig('trig', 0); let prev = 0;
  return () => { const x = tr(); const fire = x > 0 && prev <= 0; prev = x; return fire; };
}

export const NODE_TYPES = {
  osc: {
    doc: 'Oscillator. Band-limited saw/square/pulse.',
    fields: {
      wave: ['enum', 'sine', 'sine | tri | saw | square | pulse', ['sine', 'tri', 'saw', 'square', 'pulse']],
      freq: ['sig', 440, 'Frequency in Hz. Multiply by an env for pitch sweeps.'],
      pm: ['sig', 0, 'Phase modulation in cycles (FM): pm: "mod * index".'],
      width: ['sig', 0.5, 'Pulse width 0..1 (wave: pulse only).'],
      phase: ['con', 0, 'Start phase 0..1.'],
    },
    make(h) {
      const freq = h.sig('freq', 440), pm = h.sig('pm', 0), width = h.sig('width', 0.5);
      const wave = h.def.wave || 'sine', sr = h.sr;
      let ph = h.con('phase', 0)(); ph -= Math.floor(ph);
      return () => {
        const f = freq(); const dt = Math.min(Math.abs(f) / sr, 0.5);
        let p = ph + pm(); p -= Math.floor(p);
        let y;
        if (wave === 'sine') y = Math.sin(TAU * p);
        else if (wave === 'tri') y = p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4;
        else if (wave === 'saw') y = 2 * p - 1 - blep(p, dt);
        else {
          let w = wave === 'square' ? 0.5 : width(); w = w < 0.02 ? 0.02 : w > 0.98 ? 0.98 : w;
          let p2 = p - w; if (p2 < 0) p2 += 1;
          y = (p < w ? 1 : -1) + blep(p, dt) - blep(p2, dt) - (2 * w - 1); // last term removes the DC of narrow pulses
        }
        ph += f / sr; ph -= Math.floor(ph);
        return y;
      };
    },
  },
  noise: {
    doc: 'Noise source, -1..1.',
    fields: { color: ['enum', 'white', 'white | pink | brown', ['white', 'pink', 'brown']] },
    make(h) {
      const r = h.rng(), color = h.def.color || 'white';
      if (color === 'white') return () => r() * 2 - 1;
      if (color === 'pink') {
        let b0 = 0, b1 = 0, b2 = 0;
        return () => {
          const w = r() * 2 - 1;
          b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913;
          return (b0 + b1 + b2 + w * 0.1848) * 0.22;
        };
      }
      let b = 0;
      return () => { b = (b + 0.02 * (r() * 2 - 1)) / 1.02; return b * 3.5; };
    },
  },
  dust: {
    doc: 'Random impulses (crackle, debris, rain). Also usable as a random trigger.',
    fields: {
      density: ['sig', 20, 'Average impulses per second.'],
      spread: ['sig', 0, '0 = every impulse is 1.0; 1 = random height 0..1.'],
    },
    make(h) {
      const r = h.rng(), density = h.sig('density', 20), spread = h.sig('spread', 0), sr = h.sr;
      return () => (r() < density() / sr ? 1 - spread() * r() : 0);
    },
  },
  clock: {
    doc: 'Periodic trigger: outputs 1 for one sample at each tick, else 0. First tick at `delay`.',
    fields: {
      rate: ['sig', 8, 'Ticks per second.'],
      jitter: ['sig', 0, '0..1 random variation of each interval.'],
      delay: ['con', 0, 'Seconds before the first tick.'],
      count: ['con', 1e9, 'Stop after this many ticks.'],
    },
    make(h) {
      const r = h.rng(), rate = h.sig('rate', 8), jitter = h.sig('jitter', 0), sr = h.sr;
      const count = h.con('count', 1e9);
      let wait = h.con('delay', 0)() * sr, fired = 0;
      return () => {
        let out = 0;
        if (wait <= 0 && fired < count()) {
          wait += (sr / Math.max(rate(), 0.01)) * (1 + jitter() * (r() * 2 - 1));
          fired++; out = 1;
        }
        wait -= 1;
        return out;
      };
    },
  },
  env: {
    doc: 'Breakpoint envelope. points: [[time, value, curve?], ...] with times in seconds from the trigger. ' +
      'Before the first point the value is `start`; after the last it holds. curve: "lin" (default), ' +
      '"exp" (geometric when both values > 0 — use for pitch; otherwise fast-then-slow), "hold", or a number k (u^k).',
    fields: {
      points: ['points', null, 'e.g. [[0, 1], ["decay", 0, "exp"]]. Times and values are numbers or parameter expressions.'],
      start: ['con', 0, 'Value at time 0 when the first point is later than 0.'],
      trig: ['sig', undefined, 'Optional. Restart on each rising edge; idle (last value) until the first one.'],
    },
    make(h) {
      const def = h.def;
      const pts = def.points.map((p, i) => ({ t: h.conOf(p[0], `points[${i}] time`), v: h.conOf(p[1], `points[${i}] value`), c: p[2] }));
      const start = h.con('start', 0), fire = trigger(h), sr = h.sr, last = pts[pts.length - 1];
      let te = -1, seg = 0;
      return () => {
        if (fire()) { te = 0; seg = 0; }
        if (te < 0) return last.v();
        const ts = te / sr; te++;
        if (seg > 0 && ts < pts[seg - 1].t()) seg = 0;
        while (seg < pts.length && ts >= pts[seg].t()) seg++;
        if (seg >= pts.length) return last.v();
        const t1 = pts[seg].t(), v1 = pts[seg].v();
        const t0 = seg === 0 ? 0 : pts[seg - 1].t(), v0 = seg === 0 ? start() : pts[seg - 1].v();
        return shapeCurve(v0, v1, (ts - t0) / (t1 - t0), pts[seg].c);
      };
    },
  },
  ad: {
    doc: 'Attack/decay envelope 0 → 1 → 0. The workhorse amplitude envelope.',
    fields: {
      attack: ['con', 0.002, 'Seconds to rise to 1.'],
      hold: ['con', 0, 'Seconds held at 1.'],
      decay: ['con', 0.2, 'Seconds to fall to 0.'],
      curve: ['con', 2.5, 'Decay shape: 1 = linear, 2–4 = natural percussive tail.'],
      trig: ['sig', undefined, 'Optional. Restart on each rising edge; silent until the first one.'],
    },
    make(h) {
      const attack = h.con('attack', 0.002), hold = h.con('hold', 0), decay = h.con('decay', 0.2), curve = h.con('curve', 2.5);
      const fire = trigger(h), sr = h.sr;
      let te = -1;
      return () => {
        if (fire()) te = 0;
        if (te < 0) return 0;
        const ts = te / sr; te++;
        const a = attack();
        if (ts < a) return ts / a;
        const u = (ts - a - hold()) / Math.max(decay(), 1e-5);
        if (u <= 0) return 1;
        return u >= 1 ? 0 : Math.pow(1 - u, curve());
      };
    },
  },
  seq: {
    doc: 'Step sequence of values (arpeggios, melodies, chord roots). Advances at `rate`, or on each `trig` if given.',
    fields: {
      steps: ['steps', null, 'List of numbers / parameter expressions, e.g. [1, 1.25, 1.5, 2], or a string of tokens "0 _ 3 _ | 7 7 5 _" ("_" repeats the previous value, "|" is ignored).'],
      every: ['con', 1, 'With trig: advance one step every N triggers (16 = once per bar on a 16th-note clock).'],
      rate: ['con', 10, 'Steps per second (ignored when trig is set).'],
      trig: ['sig', undefined, 'Optional. Advance one step per rising edge.'],
      loop: ['flag', false, 'true = wrap around, false = hold the last step.'],
    },
    make(h) {
      let raw = h.def.steps;
      if (typeof raw === 'string') raw = raw.replace(/\|/g, ' ').trim().split(/\s+/);
      if (!Array.isArray(raw) || !raw.length || raw[0] === '') throw new PatchError(`node '${h.def.id}' (seq): steps must be a non-empty list or string`);
      const steps = [];
      raw.forEach((x, i) => {
        if (x === '_') steps.push(i ? steps[i - 1] : () => 0);
        else steps.push(h.conOf(typeof x === 'string' && x.trim() !== '' && !Number.isNaN(Number(x)) ? Number(x) : x, `steps[${i}]`));
      });
      const rate = h.con('rate', 10), every = h.con('every', 1), loop = !!h.def.loop, st = h.st, n = steps.length;
      const wrap = (i) => (i < 0 ? 0 : loop ? i % n : i >= n ? n - 1 : i);
      if (h.def.trig === undefined) return () => steps[wrap(Math.floor(st.t * rate() + 1e-9))]();
      const fire = trigger(h); let cnt = -1;
      return () => { if (fire()) cnt++; return steps[wrap(cnt < 0 ? 0 : Math.floor(cnt / Math.max(1, every())))](); };
    },
  },
  pattern: {
    doc: 'Drum-machine row. Counts ticks of a clock and outputs a one-sample pulse on every step that has a hit: ' +
      '"X" = accent (1.0), "x" = hit (0.7), "o" = ghost (0.4), "." = rest. Spaces and "|" are ignored. Always loops. ' +
      'Use it as the trig of an ad/env/pluck; its value is the hit strength.',
    fields: {
      trig: ['sig', undefined, 'The clock to count — share one 16th-note clock across the whole piece.'],
      steps: ['steps', null, 'e.g. "X...x...X...x.x." or a list of numbers 0..1.'],
      every: ['con', 1, 'Move one step every N clock ticks.'],
    },
    make(h) {
      const raw = h.def.steps, id = h.def.id;
      const MAP = { X: 1, x: 0.7, o: 0.4, '.': 0, '-': 0 };
      const vals = typeof raw === 'string' ? [...raw.replace(/[\s|]/g, '')].map((c) => MAP[c]) : Array.isArray(raw) ? raw.map(Number) : [];
      if (!vals.length || vals.some((v) => !Number.isFinite(v))) throw new PatchError(`node '${id}' (pattern): steps must be a string of X x o . characters, or a list of numbers`);
      if (h.def.trig === undefined) throw new PatchError(`node '${id}' (pattern): needs a trig (a clock)`);
      const fire = trigger(h), every = h.con('every', 1); let cnt = -1;
      return () => {
        if (!fire()) return 0;
        cnt++;
        const e = Math.max(1, Math.round(every()));
        return cnt % e === 0 ? vals[Math.floor(cnt / e) % vals.length] : 0;
      };
    },
  },
  rand: {
    doc: 'Random value in [lo, hi], re-drawn on each trigger (once at start without trig). Per-grain pitch/level variation.',
    fields: {
      lo: ['con', 0, 'Lower bound.'], hi: ['con', 1, 'Upper bound.'],
      trig: ['sig', undefined, 'Optional. Draw a new value on each rising edge.'],
    },
    make(h) {
      const r = h.rng(), lo = h.con('lo', 0), hi = h.con('hi', 1), fire = trigger(h);
      let u = r();
      return () => { if (fire()) u = r(); const l = lo(); return l + u * (hi() - l); };
    },
  },
  sah: {
    doc: 'Sample-and-hold: captures `in` on each trigger.',
    fields: { in: ['sig', 0, 'Signal to sample.'], trig: ['sig', undefined, 'Rising edge samples the input.'] },
    make(h) {
      const inp = h.sig('in', 0), fire = trigger(h); let v = 0;
      return () => { if (fire()) v = inp(); return v; };
    },
  },
  filter: {
    doc: 'State-variable filter, 12 dB/oct. Safe to modulate at audio rate.',
    fields: {
      in: ['sig', 0, 'Input signal.'],
      mode: ['enum', 'lp', 'lp | hp | bp | notch', ['lp', 'hp', 'bp', 'notch']],
      freq: ['sig', 1000, 'Cutoff / centre frequency in Hz.'],
      q: ['sig', 0.707, 'Resonance. 0.5–1 gentle, 2–8 vocal/whistly, >10 ringing.'],
    },
    make(h) {
      const inp = h.sig('in', 0), freq = h.sig('freq', 1000), q = h.sig('q', 0.707);
      const mode = h.def.mode || 'lp', sr = h.sr, fmax = sr * 0.49;
      let ic1 = 0, ic2 = 0, lf = -1, lq = -1, k = 1, a1 = 0, a2 = 0, a3 = 0;
      return () => {
        let f = freq(); const qq = q();
        if (f !== lf || qq !== lq) {
          lf = f; lq = qq;
          f = f < 10 ? 10 : f > fmax ? fmax : f;
          const g = Math.tan((Math.PI * f) / sr);
          k = 1 / (qq < 0.05 ? 0.05 : qq);
          a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2;
        }
        const x = inp();
        const v3 = x - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
        ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
        if (mode === 'lp') return v2;
        if (mode === 'bp') return v1;
        if (mode === 'hp') return x - k * v1 - v2;
        return x - k * v1;
      };
    },
  },
  delay: {
    doc: 'Delay line with feedback: echoes, flanging, comb resonance.',
    fields: {
      in: ['sig', 0, 'Input signal.'],
      time: ['sig', 0.12, 'Delay in seconds (modulate for flange/chorus).'],
      feedback: ['sig', 0, '-0.97..0.97.'],
      mix: ['sig', 0.5, '0 = dry, 1 = delayed only.'],
      max: ['con', 1, 'Longest delay in seconds (buffer size).'],
    },
    make(h) {
      const inp = h.sig('in', 0), time = h.sig('time', 0.12), fb = h.sig('feedback', 0), mix = h.sig('mix', 0.5), sr = h.sr;
      const size = Math.ceil(Math.min(Math.max(h.con('max', 1)(), 0.01), 10) * sr) + 4;
      const buf = new Float32Array(size); let w = 0;
      return () => {
        const x = inp();
        let d = time() * sr; d = d < 1 ? 1 : d > size - 3 ? size - 3 : d;
        let rp = w - d; if (rp < 0) rp += size;
        const i0 = rp | 0, i1 = i0 + 1 === size ? 0 : i0 + 1;
        const dl = buf[i0] + (buf[i1] - buf[i0]) * (rp - i0);
        let f = fb(); f = f > 0.97 ? 0.97 : f < -0.97 ? -0.97 : f;
        buf[w] = x + dl * f; if (++w === size) w = 0;
        const m = mix();
        return x * (1 - m) + dl * m;
      };
    },
  },
  pluck: {
    doc: 'Karplus-Strong string/tine: plucked strings, twangs, metallic pings, bouncy boings.',
    fields: {
      freq: ['sig', 220, 'Pitch in Hz.'],
      decay: ['sig', 1, 'Ring time in seconds (to -60 dB).'],
      damp: ['sig', 0.3, '0 = bright/metallic, 0.9 = dull/muted.'],
      in: ['sig', undefined, 'Optional extra excitation signal.'],
      trig: ['sig', undefined, 'Optional. Re-pluck on each rising edge.'],
    },
    make(h) {
      const r = h.rng(), freq = h.sig('freq', 220), decay = h.sig('decay', 1), damp = h.sig('damp', 0.3), sr = h.sr;
      const inp = h.def.in !== undefined ? h.sig('in', 0) : null, fire = trigger(h);
      const size = Math.ceil(sr / 20) + 4, buf = new Float32Array(size);
      let w = 0, lp = 0, burst = 0, lf = -1, ld = -1, fbk = 0;
      return () => {
        let f = freq(); f = f < 20 ? 20 : f > sr * 0.45 ? sr * 0.45 : f;
        const dc = decay();
        if (f !== lf || dc !== ld) { lf = f; ld = dc; fbk = Math.pow(0.001, 1 / (f * Math.max(dc, 0.005))); }
        if (fire()) burst = Math.round(sr / f);
        let rp = w - (sr / f - 0.5); if (rp < 0) rp += size;
        const i0 = rp | 0, i1 = i0 + 1 === size ? 0 : i0 + 1;
        const dl = buf[i0] + (buf[i1] - buf[i0]) * (rp - i0);
        let dm = damp(); dm = dm < 0 ? 0 : dm > 0.98 ? 0.98 : dm;
        lp = dl + (lp - dl) * dm;
        let exc = inp ? inp() : 0;
        if (burst > 0) { burst--; exc += r() * 2 - 1; }
        const y = exc + lp * fbk;
        buf[w] = y; if (++w === size) w = 0;
        return y;
      };
    },
  },
  modal: {
    doc: 'Bank of ringing resonators excited by `in` (feed it a click or noise burst). Bells, glass, metal, wood, coins.',
    fields: {
      in: ['sig', 0, 'Excitation: a short env * noise, an impulse (clock/dust), or any signal.'],
      freq: ['sig', 440, 'Base frequency in Hz.'],
      ratios: ['list', [1, 2.76, 5.4, 8.93], 'Mode frequency ratios. Harmonic [1,2,3,4] = pitched; inharmonic = metal/glass.'],
      gains: ['list', undefined, 'Per-mode level (default 1 each).'],
      decay: ['sig', 0.8, 'Ring time of the lowest mode, seconds.'],
      tilt: ['con', 0.7, 'Higher modes die faster: decay / ratio^tilt.'],
    },
    make(h) {
      const def = h.def, inp = h.sig('in', 0), freq = h.sig('freq', 440), decay = h.sig('decay', 0.8), tilt = h.con('tilt', 0.7), sr = h.sr;
      const ratios = (def.ratios || [1, 2.76, 5.4, 8.93]).map((x, i) => h.conOf(x, `ratios[${i}]`));
      const gains = ratios.map((_, i) => (def.gains && def.gains[i] !== undefined ? h.conOf(def.gains[i], `gains[${i}]`) : () => 1));
      const n = ratios.length;
      const a1 = new Float64Array(n), a2 = new Float64Array(n), b0 = new Float64Array(n), y1 = new Float64Array(n), y2 = new Float64Array(n);
      let lf = -1, ld = -1, tick = 0;
      return () => {
        const f = freq(), dc = decay();
        if (f !== lf || dc !== ld || (tick++ & 255) === 0) {
          lf = f; ld = dc;
          for (let i = 0; i < n; i++) {
            const ra = ratios[i](), fi = f * ra;
            if (fi <= 0 || fi > sr * 0.45) { b0[i] = 0; a1[i] = 0; a2[i] = 0; continue; }
            const T = Math.max(dc, 0.002) / Math.pow(Math.max(ra, 0.01), tilt());
            const R = Math.pow(0.001, 1 / (T * sr)), w = (TAU * fi) / sr;
            a1[i] = 2 * R * Math.cos(w); a2[i] = R * R; b0[i] = Math.sin(w) * gains[i]();
          }
        }
        const x = inp(); let sum = 0;
        for (let i = 0; i < n; i++) {
          const y = a1[i] * y1[i] - a2[i] * y2[i] + b0[i] * x;
          y2[i] = y1[i]; y1[i] = y; sum += y;
        }
        return sum;
      };
    },
  },
  shaper: {
    doc: 'Distortion / saturation.',
    fields: {
      in: ['sig', 0, 'Input signal.'],
      drive: ['sig', 2, 'Input gain before shaping; 1 = clean, 10+ = heavy.'],
      mode: ['enum', 'tanh', 'tanh (warm) | clip (hard) | fold (metallic, buzzy)', ['tanh', 'clip', 'fold']],
    },
    make(h) {
      const inp = h.sig('in', 0), drive = h.sig('drive', 2), mode = h.def.mode || 'tanh';
      if (mode === 'clip') return () => { const x = inp() * drive(); return x > 1 ? 1 : x < -1 ? -1 : x; };
      if (mode === 'fold') return () => Math.sin(inp() * drive() * (Math.PI / 2));
      return () => Math.tanh(inp() * drive());
    },
  },
  crush: {
    doc: 'Bit-crusher: lo-fi / retro console grit.',
    fields: {
      in: ['sig', 0, 'Input signal.'],
      bits: ['sig', 6, 'Bit depth 1..16.'],
      rate: ['sig', 8000, 'Sample-and-hold rate in Hz.'],
    },
    make(h) {
      const inp = h.sig('in', 0), bits = h.sig('bits', 6), rate = h.sig('rate', 8000), sr = h.sr;
      let acc = 1, held = 0;
      return () => {
        const x = inp();
        acc += Math.min(rate(), sr) / sr;
        if (acc >= 1) { acc -= 1; const q = Math.pow(2, Math.max(1, Math.min(16, bits())) - 1); held = Math.round(x * q) / q; }
        return held;
      };
    },
  },
  reverb: {
    doc: 'Small algorithmic reverb (space, tail). Extend the patch duration to leave room for the tail.',
    fields: {
      in: ['sig', 0, 'Input signal.'],
      size: ['sig', 0.6, '0..1 room size / tail length.'],
      damp: ['sig', 0.4, '0..1 high-frequency absorption.'],
      mix: ['sig', 0.25, '0 = dry, 1 = wet only.'],
    },
    make(h) {
      const inp = h.sig('in', 0), size = h.sig('size', 0.6), damp = h.sig('damp', 0.4), mix = h.sig('mix', 0.25);
      const k = h.sr / 44100;
      const combs = [1116, 1188, 1277, 1356, 1422, 1491].map((n) => ({ b: new Float32Array(Math.round(n * k)), i: 0, lp: 0 }));
      const aps = [556, 441, 341].map((n) => ({ b: new Float32Array(Math.round(n * k)), i: 0 }));
      return () => {
        const x = inp();
        let sz = size(); sz = sz < 0 ? 0 : sz > 1 ? 1 : sz;
        let dm = damp(); dm = dm < 0 ? 0 : dm > 1 ? 1 : dm;
        const fb = 0.7 + 0.28 * sz, d = dm * 0.4;
        let wet = 0;
        for (let c = 0; c < combs.length; c++) {
          const cb = combs[c], y = cb.b[cb.i];
          cb.lp = y * (1 - d) + cb.lp * d;
          cb.b[cb.i] = x * 0.06 + cb.lp * fb;
          if (++cb.i === cb.b.length) cb.i = 0;
          wet += y;
        }
        for (let a = 0; a < aps.length; a++) {
          const ap = aps[a], bo = ap.b[ap.i], y = bo - wet;
          ap.b[ap.i] = wet + bo * 0.5;
          if (++ap.i === ap.b.length) ap.i = 0;
          wet = y;
        }
        const m = mix();
        return x * (1 - m) + wet * m;
      };
    },
  },
  lag: {
    doc: 'One-pole smoother: glides, slewed random LFOs, softened triggers.',
    fields: { in: ['sig', 0, 'Input signal.'], time: ['sig', 0.05, 'Smoothing time in seconds.'] },
    make(h) {
      const inp = h.sig('in', 0), time = h.sig('time', 0.05), sr = h.sr; let y = 0, first = true;
      return () => {
        const x = inp();
        if (first) { first = false; y = x; return y; }
        y += (x - y) * (1 - Math.exp(-1 / (Math.max(time(), 1e-4) * sr)));
        return y;
      };
    },
  },
  expr: {
    doc: 'Named sub-expression, for mixing or reusing a signal.',
    fields: { expr: ['sig', 0, 'Any expression.'] },
    make(h) { return h.sig('expr', 0); },
  },
};

// ---------------------------------------------------------------- voice

// Loadout additions (not in experiment/procedural-sfx): a parameter may be a set of
// choices instead of a slider — "step": n snaps it to min, min+n, ...; "options": [names]
// makes it 0..names.length-1 with a name per value (a melody instrument, say).
// Longest render: 30 s for sound effects, 120 s for music (Loadout addition; the experiment caps both at 30).
export const maxSecondsFor = (patch) => (patch && patch.category === 'music' ? 120 : 30);
const isStepped = (p) => !!(p.options || p.step);
function clampParam(p, v) {
  v = Number(v);
  if (!Number.isFinite(v)) v = p.default;
  if (p.options) v = Math.round(v);
  else if (p.step) v = p.min + Math.round((v - p.min) / p.step) * p.step;
  return v < p.min ? p.min : v > p.max ? p.max : v;
}

export function defaultParams(patch) {
  const o = {};
  for (const p of patch.params || []) o[p.id] = p.default;
  return o;
}

// Builds a playable instance of a patch. tick() returns one mono sample.
export function createVoice(patch, opts = {}) {
  const sr = opts.sampleRate || 44100;
  const seed = (opts.seed === undefined ? 1 : opts.seed) >>> 0;
  const pdefs = patch.params || [], nodes = patch.nodes || [];
  const pidx = new Map(pdefs.map((p, i) => [p.id, i]));
  const nidx = new Map(nodes.map((n, i) => [n.id, i]));
  const pv = new Float64Array(pdefs.length), target = new Float64Array(pdefs.length);
  pdefs.forEach((p, i) => { pv[i] = target[i] = clampParam(p, opts.params && opts.params[p.id] !== undefined ? opts.params[p.id] : p.default); });
  const vals = new Float64Array(nodes.length);
  const st = { n: 0, t: 0, dur: 1 };
  const refreshers = [];
  let rndCount = 0, allowDur = false, allowDyn = true;

  const scope = {
    resolve(name) {
      if (name === 't') return allowDyn ? { fn: () => st.t, dyn: true } : null;
      if (name === 'dur') return allowDur ? { fn: () => st.dur, dyn: false } : null;
      if (name === 'sr') return { fn: () => sr, dyn: false };
      if (name === 'pi') return { fn: () => Math.PI, dyn: false };
      if (name === 'tau') return { fn: () => TAU, dyn: false };
      if (pidx.has(name)) { const i = pidx.get(name); return { fn: () => pv[i], dyn: false }; }
      if (nidx.has(name)) { const i = nidx.get(name); return { fn: () => vals[i], dyn: true }; }
      return null;
    },
    rnd() { return mulberry32(hash2(seed, 7919 + rndCount++))(); },
  };

  // number | expression → getter. Expressions that only read parameters are
  // evaluated once and re-evaluated when a parameter changes.
  function getter(v, dflt, where, constOnly) {
    if (v === undefined || v === null) v = dflt;
    if (typeof v === 'number') { if (!Number.isFinite(v)) throw new PatchError(`${where}: not a finite number`); return () => v; }
    if (typeof v !== 'string') throw new PatchError(`${where}: expected a number or an expression string, got ${JSON.stringify(v)}`);
    let c;
    try { c = compileAst(parseExpr(v), scope); } catch (e) { throw new PatchError(`${where}: ${e.message} in "${v}"`); }
    if (c.dyn) {
      if (constOnly) throw new PatchError(`${where}: "${v}" must use parameters only (no node outputs, no t)`);
      return c.fn;
    }
    let cache = c.fn();
    refreshers.push(() => { cache = c.fn(); });
    return () => cache;
  }

  allowDyn = false;
  const durFn = getter(patch.duration, patch.loop ? 4 : 1, 'duration', true);
  st.dur = durFn();
  allowDyn = true; allowDur = true;

  const ticks = nodes.map((def, i) => {
    const type = NODE_TYPES[def.type];
    if (!type) throw new PatchError(`node '${def.id}': unknown type '${def.type}'`);
    let k = 0;
    const where = `node '${def.id}' (${def.type})`;
    const h = {
      def, sr, st,
      sig: (field, dflt) => getter(def[field], dflt, `${where}.${field}`, false),
      con: (field, dflt) => getter(def[field], dflt, `${where}.${field}`, true),
      conOf: (v, label) => getter(v, undefined, `${where}.${label}`, true),
      rng: () => mulberry32(hash2(seed, i * 16 + k++)),
    };
    return type.make(h);
  });
  const stereo = Array.isArray(patch.out);
  const outFn = getter(stereo ? patch.out[0] : patch.out, 0, 'out', false);
  const outRFn = stereo ? getter(patch.out[1], 0, 'out[1]', false) : null;
  let right = 0;
  const gain = typeof patch.gain === 'number' ? patch.gain : 1;
  const nn = ticks.length;
  let smoothing = false;

  function refresh() { st.dur = durFn(); for (let i = 0; i < refreshers.length; i++) refreshers[i](); st.dur = durFn(); }

  return {
    sampleRate: sr,
    get duration() { return st.dur; },
    loop: !!patch.loop,
    stereo,
    get right() { return right; }, // right-channel sample of the last tick() (stereo patches)
    nodeIds: nodes.map((n) => n.id),
    nodeValues: vals, // live view of every node's current output (debugging, meters)
    setParam(id, value, smooth) {
      const i = pidx.get(id); if (i === undefined) return;
      target[i] = clampParam(pdefs[i], value);
      if (smooth) smoothing = true; else { pv[i] = target[i]; refresh(); }
    },
    tick() {
      if (smoothing && (st.n & 31) === 0) {
        let active = false;
        for (let i = 0; i < pv.length; i++) {
          const d = target[i] - pv[i];
          if (d !== 0) {
            if (isStepped(pdefs[i]) || Math.abs(d) < 1e-4 * (pdefs[i].max - pdefs[i].min)) pv[i] = target[i]; else { pv[i] += d * 0.08; active = true; }
          }
        }
        refresh(); smoothing = active;
      }
      for (let i = 0; i < nn; i++) vals[i] = ticks[i]();
      const y = outFn() * gain;
      if (outRFn) right = outRFn() * gain;
      st.n++; st.t = st.n / sr;
      return y;
    },
  };
}

// ---------------------------------------------------------------- render

// Renders a patch. One-shots get a short fade-out. Loops are rendered so the
// buffer repeats cleanly: by default the seam is crossfaded; with "wrap": true
// (music) two passes are rendered and the second is kept, so echoes and reverb
// tails wrap around the loop point and the timing stays bar-exact.
// Returns { samples (mono mix), channels ([mono] or [left, right]), ... }.
export function renderPatch(patch, opts = {}) {
  const sr = opts.sampleRate || 44100;
  const voice = createVoice(patch, { sampleRate: sr, params: opts.params, seed: opts.seed });
  const dur = Math.min(Math.max(voice.duration, 0.01), opts.maxSeconds || maxSecondsFor(patch));
  const n = Math.max(16, Math.round(dur * sr));
  const run = (len) => {
    const a = new Float32Array(len), b = voice.stereo ? new Float32Array(len) : null;
    for (let i = 0; i < len; i++) { a[i] = voice.tick(); if (b) b[i] = voice.right; }
    return b ? [a, b] : [a];
  };
  let channels;
  if (patch.loop && patch.wrap) {
    const x = Math.min(Math.round(0.008 * sr), n >> 2);
    channels = run(2 * n + x).map((raw) => {
      const o = raw.slice(n, 2 * n);
      for (let i = 0; i < x; i++) { const u = i / x; o[i] = raw[n + i] * u + raw[2 * n + i] * (1 - u); }
      return o;
    });
  } else if (patch.loop) {
    const x = Math.min(Math.round(0.3 * sr), n >> 2);
    channels = run(n + x).map((raw) => {
      const o = raw.slice(0, n);
      for (let i = 0; i < x; i++) { const u = i / x; o[i] = raw[i] * Math.sqrt(u) + raw[n + i] * Math.sqrt(1 - u); }
      return o;
    });
  } else {
    channels = run(n);
    const f = Math.min(Math.round(0.004 * sr), n >> 3);
    for (const o of channels) for (let i = 0; i < f; i++) o[n - 1 - i] *= i / f;
  }
  let bad = 0, peak = 0;
  for (const o of channels) for (let i = 0; i < n; i++) {
    const v = o[i];
    if (!Number.isFinite(v)) { o[i] = 0; bad++; } else { const a = v < 0 ? -v : v; if (a > peak) peak = a; }
  }
  let appliedGain = 1;
  if (patch.normalize !== false && peak > 1e-5) {
    appliedGain = 0.89 / peak;
    for (const o of channels) for (let i = 0; i < n; i++) o[i] *= appliedGain;
  } else if (peak > 1) {
    for (const o of channels) for (let i = 0; i < n; i++) o[i] = Math.tanh(o[i]);
  }
  let samples = channels[0];
  if (channels.length === 2) { samples = new Float32Array(n); for (let i = 0; i < n; i++) samples[i] = (channels[0][i] + channels[1][i]) * 0.5; }
  return { samples, channels, sampleRate: sr, duration: n / sr, rawPeak: peak, appliedGain, badSamples: bad, loop: !!patch.loop };
}

// ---------------------------------------------------------------- validation

const TOP_FIELDS = new Set(['format', 'id', 'name', 'category', 'tags', 'description', 'duration', 'loop', 'params', 'nodes', 'out', 'gain', 'normalize', 'wrap', 'presets', 'author']);
const PARAM_FIELDS = new Set(['id', 'label', 'min', 'max', 'default', 'unit', 'scale', 'step', 'hint', 'options']);
const ID_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function validatePatch(patch) {
  const errors = [], warnings = [];
  const err = (m) => errors.push(m), warn = (m) => warnings.push(m);
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { ok: false, errors: ['patch must be a JSON object'], warnings };
  for (const k of Object.keys(patch)) if (!TOP_FIELDS.has(k)) warn(`unknown top-level field '${k}' (ignored)`);
  if (patch.format !== FORMAT) warn(`format should be "${FORMAT}"`);
  if (typeof patch.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(patch.id)) err('id: required, lowercase letters, digits and hyphens (e.g. "laser-shot")');
  if (typeof patch.name !== 'string' || !patch.name) err('name: required');
  if (patch.out === undefined) err('out: required (expression that mixes node outputs, or [left, right] for stereo)');
  if (Array.isArray(patch.out) && patch.out.length !== 2) err('out: a stereo out is exactly two expressions, [left, right]');
  if (patch.duration === undefined) err('duration: required (seconds; number or parameter expression)');
  if (!Array.isArray(patch.nodes) || !patch.nodes.length) err('nodes: required, non-empty array');
  if (patch.params !== undefined && !Array.isArray(patch.params)) err('params: must be an array');
  const seen = new Set();
  for (const p of patch.params || []) {
    const w = `param '${p && p.id}'`;
    if (!p || typeof p.id !== 'string' || !ID_RE.test(p.id)) { err(`${w}: id must be an identifier (letters, digits, _)`); continue; }
    if (RESERVED.has(p.id)) err(`${w}: '${p.id}' is a reserved name`);
    if (seen.has(p.id)) err(`${w}: duplicate id`);
    seen.add(p.id);
    for (const k of Object.keys(p)) if (!PARAM_FIELDS.has(k)) err(`${w}: unknown field '${k}' (allowed: ${[...PARAM_FIELDS].join(', ')})`);
    if (![p.min, p.max, p.default].every((x) => typeof x === 'number' && Number.isFinite(x))) { err(`${w}: min, max and default must be numbers`); continue; }
    if (!(p.min < p.max)) err(`${w}: min must be below max`);
    if (p.default < p.min || p.default > p.max) err(`${w}: default ${p.default} is outside ${p.min}..${p.max}`);
    if (p.scale !== undefined && p.scale !== 'lin' && p.scale !== 'log') err(`${w}: scale must be "lin" or "log"`);
    if (p.scale === 'log' && p.min <= 0) err(`${w}: log scale needs min > 0`);
    if (p.step !== undefined && !(typeof p.step === 'number' && p.step > 0)) err(`${w}: step must be a positive number`);
    if (p.options !== undefined) {
      if (!Array.isArray(p.options) || p.options.some((o) => typeof o !== 'string' || !o)) err(`${w}: options must be a list of names`);
      else if (p.min !== 0 || p.max !== p.options.length - 1) err(`${w}: with ${p.options.length} options, min must be 0 and max ${p.options.length - 1}`);
    }
    if (!p.label) warn(`${w}: add a human-readable label`);
  }
  for (const n of Array.isArray(patch.nodes) ? patch.nodes : []) {
    const w = `node '${n && n.id}'`;
    if (!n || typeof n.id !== 'string' || !ID_RE.test(n.id)) { err(`${w}: id must be an identifier (letters, digits, _)`); continue; }
    if (RESERVED.has(n.id)) err(`${w}: '${n.id}' is a reserved name`);
    if (seen.has(n.id)) err(`${w}: id already used by another node or parameter`);
    seen.add(n.id);
    const type = NODE_TYPES[n.type];
    if (!type) { err(`${w}: unknown type '${n.type}' (available: ${Object.keys(NODE_TYPES).join(', ')})`); continue; }
    for (const k of Object.keys(n)) {
      if (k === 'id' || k === 'type') continue;
      const f = type.fields[k];
      if (!f) { err(`${w}: '${n.type}' has no field '${k}' (fields: ${Object.keys(type.fields).join(', ')})`); continue; }
      if (f[0] === 'enum' && !f[3].includes(n[k])) err(`${w}.${k}: must be one of ${f[3].join(' | ')}`);
      if (f[0] === 'list' && !Array.isArray(n[k])) err(`${w}.${k}: must be an array`);
      if (f[0] === 'steps' && !Array.isArray(n[k]) && typeof n[k] !== 'string') err(`${w}.${k}: must be an array or a string`);
      if (f[0] === 'points') {
        if (!Array.isArray(n[k]) || !n[k].length || !n[k].every((p) => Array.isArray(p) && p.length >= 2 && p.length <= 3)) err(`${w}.${k}: must be a non-empty array of [time, value, curve?]`);
        else for (const p of n[k]) if (p[2] !== undefined && typeof p[2] !== 'number' && !['lin', 'exp', 'hold'].includes(p[2])) err(`${w}.${k}: curve must be "lin", "exp", "hold" or a number`);
      }
    }
    if ((n.type === 'env' && !n.points) || ((n.type === 'seq' || n.type === 'pattern') && !n.steps)) err(`${w}: missing required field '${n.type === 'env' ? 'points' : 'steps'}'`);
  }
  for (const [name, set] of Object.entries(patch.presets || {})) {
    for (const k of Object.keys(set || {})) if (!(patch.params || []).some((p) => p.id === k)) err(`preset '${name}': unknown parameter '${k}'`);
  }
  if (errors.length) return { ok: false, errors, warnings };
  // Build it and run a little audio at the defaults and at every parameter
  // extreme: catches bad expressions, NaN and blow-ups.
  const corners = [['defaults', {}]];
  for (const p of patch.params || []) { corners.push([`${p.id}=min`, { [p.id]: p.min }]); corners.push([`${p.id}=max`, { [p.id]: p.max }]); }
  for (const [label, set] of corners) {
    try {
      const v = createVoice(patch, { params: set });
      const d = v.duration;
      if (!(d > 0) || !Number.isFinite(d)) { err(`duration evaluates to ${d} at ${label}`); continue; }
      if (d > maxSecondsFor(patch)) err(`duration is ${d.toFixed(1)} s at ${label} (limit ${maxSecondsFor(patch)} s)`);
      if (!patch.loop && d > 6) warn(`duration is ${d.toFixed(1)} s at ${label} — long for a one-shot effect`);
      const n = Math.min(Math.round(d * 44100), 22050);
      for (let i = 0; i < n; i++) {
        const y = v.tick();
        if (!Number.isFinite(y)) { err(`output is not a finite number at ${label}, t=${(i / 44100).toFixed(4)} s (division by zero or runaway feedback?)`); break; }
        if (Math.abs(y) > 1e4) { err(`output blows up (>1e4) at ${label}, t=${(i / 44100).toFixed(4)} s — reduce feedback, q or drive`); break; }
      }
    } catch (e) {
      err(e instanceof PatchError ? e.message : `${label}: ${e.message}`);
      if (label === 'defaults') break;
    }
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)], warnings };
}
