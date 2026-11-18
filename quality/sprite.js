// The sprite quality bar as code. Pure JavaScript: no file, DOM or Node access,
// so the same checks run in the site build, in the command-line checker and in a
// browser (an asset an agent makes through the live site meets the same bar).
//
//   checkSprite(def, { soundIndex, validateMeta }) -> { errors: [...], warnings: [...], metrics: {...} }
//
// def           what defineSprite() returned (defineSprite already refuses a bad `parts` declaration)
// soundIndex    Map (or plain object) of sound id -> patch; when missing, sound cues are not checked
// validateMeta  (meta, kind) -> { ok, errors } from catalog/schema.js; when missing, metadata is not checked
//
// One message per cause: a fault seen in many frames or looks is reported once, naming
// the first place it was seen, "and N more". Every threshold is in THRESHOLDS and is
// written down in docs/quality-bar.md.

import { renderFrame, defaultParams, cleanParams, randomParams, clipFps, inEffect, partList } from '../engine/sprite.js';
import { brightness, hexToRgb } from '../engine/color.js';

export const THRESHOLDS = {
  randomLooks: 12,          // seeded random looks drawn on top of default, all-low, all-high, every choice option and every toggle flipped
  strengthPer: 100,         // N = clamp(round(opaque pixels of the default first frame / strengthPer), strengthMin, strengthMax)
  strengthMin: 2, strengthMax: 8,
  fillWarn: 1 / 3,          // smallest look, longer side: warn below this share of the frame
  fillError: 1 / 4,         // ... error below this
  colours: { character: 32, creature: 32, tileset: 24, prop: 24, pickup: 16, projectile: 12, effect: 24, background: 32, ui: 16, icon: 16 },
  minControls: 4,           // warn below this many controls in all
  maxControls: 16,          // warn above this many controls outside parts
  maxPartControls: 6,       // warn above this many controls in one part (selector included)
  feetSlack: 2,             // lowest pixel of the first clip may sit this far from the pivot line
  loopSeamFactor: 2.5, loopSeamSlack: 8,
  seamBreakFloor: 1, seamJumpFloor: 0.08,    // tile and background seams: see seamCheck()
  sampleFrames: 4,          // frames per clip used when testing what a control does
  tileSizes: [16, 32],
};

// def.kind (older sprites) -> meta.type, used when a sprite has no meta yet
const KIND_TO_TYPE = { Character: 'character', Creature: 'creature', Item: 'pickup', Effect: 'effect' };
const MAY_STAND_STILL = new Set(['prop', 'icon', 'tileset', 'ui', 'background']);
const MUST_MOVE = new Set(['character', 'creature']);
const FILLS_FRAME = new Set(['tileset', 'background']);
const EDGE_FREE = new Set(['tileset', 'background', 'ui', 'icon']);
const NO_GROUND = new Set(['tileset', 'background', 'ui', 'icon']);

export function spriteType(def) {
  return (def.meta && typeof def.meta.type === 'string' && def.meta.type) || KIND_TO_TYPE[def.kind] || String(def.kind || 'character').toLowerCase();
}

const lookup = (index, id) => (!index ? undefined : typeof index.get === 'function' ? index.get(id) : index[id]);
const now = () => (typeof performance !== 'undefined' ? performance : Date).now();

function diff(a, b, cap = Infinity) {
  const x = a.data, y = b.data;
  let n = 0;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i] && ++n > cap) return n;
  return n;
}

const lum = (v) => ((v & 255) * 0.299 + ((v >>> 8) & 255) * 0.587 + ((v >>> 16) & 255) * 0.114) / 255;

// One line of pixels: a column (axis 'x', index i) or a row (axis 'y').
function line(g, axis, i) {
  const out = new Uint32Array(axis === 'x' ? g.h : g.w);
  if (axis === 'x') for (let y = 0; y < g.h; y++) out[y] = g.data[y * g.w + i];
  else for (let x = 0; x < g.w; x++) out[x] = g.data[i * g.w + x];
  return out;
}
// How two neighbouring lines of pixels differ: `breaks` = positions where one side is
// drawn and the other is see-through; `jump` = mean brightness step where both are drawn.
function step(a, b) {
  let breaks = 0, both = 0, jump = 0;
  for (let i = 0; i < a.length; i++) {
    const pa = a[i] !== 0, pb = b[i] !== 0;
    if (pa !== pb) breaks++;
    else if (pa) { both++; jump += Math.abs(lum(a[i]) - lum(b[i])); }
  }
  return { breaks, jump: both ? jump / both : 0 };
}
function largestStep(g, axis) {
  const n = axis === 'x' ? g.w : g.h;
  let breaks = 0, jump = 0;
  for (let i = 0; i + 1 < n; i++) { const s = step(line(g, axis, i), line(g, axis, i + 1)); breaks = Math.max(breaks, s.breaks); jump = Math.max(jump, s.jump); }
  return { breaks, jump };
}
/**
 * Seam test, used for tiles and background layers. A is on the left (or on top), B on
 * the right (or below). The step across the seam (A's last column or row against B's
 * first) must be no bigger than the largest step between neighbouring columns (rows)
 * inside the tile: inside A when A and B are the same tile, otherwise the smaller of
 * A's and B's largest steps. Floors: 1 gap and a brightness step of 0.08.
 */
export function seamCheck(A, B, axis) {
  const T = THRESHOLDS;
  const s = step(line(A, axis, (axis === 'x' ? A.w : A.h) - 1), line(B, axis, 0));
  const ma = largestStep(A, axis), mb = A === B ? ma : largestStep(B, axis);
  const maxBreaks = Math.max(T.seamBreakFloor, Math.min(ma.breaks, mb.breaks)), maxJump = Math.max(T.seamJumpFloor, Math.min(ma.jump, mb.jump));
  return { ok: s.breaks <= maxBreaks && s.jump <= maxJump, breaks: s.breaks, jump: s.jump, maxBreaks, maxJump };
}

function farthestPair(swatches) {
  let best = null, bd = -1;
  const rgb = swatches.map((c) => (/^#[0-9a-f]{6}$/i.test(c) ? hexToRgb(c) : [0, 0, 0]));
  for (let i = 0; i < rgb.length; i++) for (let j = i + 1; j < rgb.length; j++) {
    const d = (rgb[i][0] - rgb[j][0]) ** 2 + (rgb[i][1] - rgb[j][1]) ** 2 + (rgb[i][2] - rgb[j][2]) ** 2;
    if (d > bd) { bd = d; best = [swatches[i], swatches[j]]; }
  }
  return best;
}

const fmt = (v) => (typeof v === 'string' ? v : JSON.stringify(v));
const lit = (v) => (typeof v === 'string' ? `'${v}'` : JSON.stringify(v));

/** A control's `when` as a list of alternatives ("any of these"), each { key: [values] }. */
export function whenAlternatives(when) {
  if (when === undefined || when === null) return [];
  return (Array.isArray(when) ? when : [when]).map((alt) => Object.fromEntries(Object.entries(alt).map(([k, v]) => [k, Array.isArray(v) ? v : [v]])));
}

/**
 * The `when` that matches where a control worked, from the tested settings: a key whose
 * values split into some where the control changed the picture and some where it did not.
 * res: { deadIn, aliveIn } (setting names such as 'default', 'hat=none'); dflt: default values.
 * Alive at the default: every split key must hold, so one object. Dead at the default and
 * alive with either of several keys: any one is enough, so a list. Null when no key explains it.
 */
export function whenHint(res, params, dflt) {
  const status = new Map();                       // key -> Map(value -> alive?)
  const note = (bn, alive) => {
    const m = /^([^=]+)=(.*)$/.exec(bn);
    if (!m || !params[m[1]]) return;
    const d = params[m[1]];
    const v = d.kind === 'toggle' ? m[2] === 'true' : d.options?.find((o) => fmt(o.value) === m[2])?.value;
    if (v === undefined) return;
    if (!status.has(m[1])) status.set(m[1], new Map());
    status.get(m[1]).set(v, alive);
  };
  res.deadIn.forEach((bn) => note(bn, false));
  res.aliveIn.forEach((bn) => note(bn, true));
  const defaultAlive = res.aliveIn.includes('default');
  for (const [key, m] of status) if (params[key].kind === 'toggle' && !m.has(dflt[key])) m.set(dflt[key], defaultAlive);
  const split = [];
  for (const [key, m] of status) {
    const alive = [...m].filter(([, a]) => a).map(([v]) => v);
    if (alive.length && [...m].some(([, a]) => !a)) split.push(`${key}: [${alive.map(lit).join(', ')}]`);
  }
  if (!split.length) return null;
  return defaultAlive || split.length === 1 ? `when: { ${split.join(', ')} }` : `when: [${split.map((x) => `{ ${x} }`).join(', ')}]`;
}
const settingName = (bn) => (bn === 'default' ? 'everything else is at its default' : bn === 'all-low' ? 'all sliders low' : bn === 'all-high' ? 'all sliders high' : bn);

export function checkSprite(def, { soundIndex, validateMeta } = {}) {
  const t0 = now();
  const T = THRESHOLDS;
  const issues = new Map();     // one entry per cause: key -> { level, msg, n }
  const issue = (level, key, msg) => { const i = issues.get(key); if (i) i.n++; else issues.set(key, { level, msg, n: 1 }); };
  const error = (msg, key = msg) => issue('error', key, msg);
  const warn = (msg, key = msg) => issue('warn', key, msg);
  const type = spriteType(def);
  const metrics = { type, typeFrom: def.meta && def.meta.type ? 'meta' : 'kind', metaChecked: false, renders: 0, looks: 0 };
  const params = def.params || {}, clips = def.clips || {};
  const clipNames = Object.keys(clips), keys = Object.keys(params);
  const [W, H] = def.size;
  const parts = partList(def);
  metrics.parts = parts.map((p) => p.name);
  const partOf = (k) => parts.find((p) => p.controls.includes(k)) ?? null;
  const effective = (k, p) => { try { return inEffect(def, k, p); } catch { return true; } };

  // ---- definition ---------------------------------------------------------------
  let paramsOk = true;
  for (const [k, d] of Object.entries(params)) {
    if (!d || !d.kind) { error(`param "${k}" is not built with range/choice/color/toggle`); paramsOk = false; continue; }
    if (!d.label) error(`param "${k}" has no label`);
    if (d.kind === 'color' && !(d.swatches?.length >= 3)) error(`color param "${k}" needs at least 3 swatches`);
    if (d.kind === 'color') for (const c of d.swatches ?? []) if (brightness(c) < 0.14) warn(`color param "${k}": swatch ${c} is almost as dark as the outline, so shapes in it merge into a black blob`);
    if (d.kind === 'choice' && !(d.options?.length >= 2)) error(`choice "${k}" needs at least 2 options`);
  }
  const inParts = new Set(parts.flatMap((p) => p.params));
  const outside = keys.filter((k) => !inParts.has(k)).length;
  if (keys.length < T.minControls) warn(`only ${keys.length} parameters: give people more to play with`);
  if (outside > T.maxControls) warn(`${outside} controls outside parts: too many for a simple panel (aim for 8-15; part settings are not counted)`);
  for (const p of parts) if (p.params.length > T.maxPartControls) warn(`part "${p.name}" has ${p.params.length} controls: more than ${T.maxPartControls} is hard to use; drop some or split the part`);

  // ---- metadata (Contract 1) --------------------------------------------------------
  if (typeof validateMeta === 'function') {
    metrics.metaChecked = true;
    if (!def.meta) error('no meta: every asset needs metadata (docs/architecture.md, Contract 1)');
    else {
      const r = validateMeta(def.meta, 'sprite') || {};
      if (!r.ok) for (const e of r.errors ?? ['invalid']) error(`meta: ${e}`);
    }
  }

  // ---- sound cues: every entry, whatever its `when` ------------------------------------
  if (soundIndex) for (const [cname, list] of Object.entries(def.sounds ?? {})) for (const c of list) {
    const patch = lookup(soundIndex, c.sound);
    if (!patch) { error(`sound "${c.sound}" on clip ${cname} is not in sounds/`); continue; }
    if (patch.category === 'music') error(`"${c.sound}" on clip ${cname} is a music track; sprite animations take sound effects`);
    if (c.preset && !(patch.presets && patch.presets[c.preset])) error(`sound "${c.sound}" on clip ${cname}: no preset "${c.preset}" (it has: ${Object.keys(patch.presets ?? {}).join(', ') || 'none'})`);
    if (patch.loop && !clips[cname]?.loop) warn(`looping sound "${c.sound}" on one-shot clip ${cname}: it only plays while that clip is on screen`);
  }

  if (!paramsOk) return finish();

  // ---- rendering with a cache ---------------------------------------------------------------
  const cache = new Map();
  const lookKey = (p) => keys.map((k) => fmt(p[k])).join('\u0001');
  const draw = (clip, f, p) => { metrics.renders++; try { return renderFrame(def, clip, f, p); } catch (e) { return e instanceof Error ? e : new Error(String(e)); } };
  const render = (clip, f, p, pk = lookKey(p)) => {
    const key = `${clip}\u0002${f}\u0002${pk}`;
    let g = cache.get(key);
    if (g === undefined) { g = draw(clip, f, p); cache.set(key, g); }
    return g;
  };
  const fpsOf = (clip, p) => { try { return clipFps(def, clip, p); } catch { return NaN; } };

  // ---- looks: every frame of every clip ------------------------------------------------------------
  const dflt = defaultParams(def);
  const lo = {}, hi = {};
  for (const [k, d] of Object.entries(params)) if (d.kind === 'range') { lo[k] = d.min; hi[k] = d.max; }
  const allLow = cleanParams(def, lo), allHigh = cleanParams(def, hi);
  const bases = [['default', dflt], ['all-low', allLow], ['all-high', allHigh]];
  for (const [k, d] of Object.entries(params)) {
    if (d.kind === 'choice') for (const o of d.options) bases.push([`${k}=${fmt(o.value)}`, { ...dflt, [k]: o.value }]);
    if (d.kind === 'toggle') bases.push([`${k}=${!dflt[k]}`, { ...dflt, [k]: !dflt[k] }]);
  }
  const looks = [...bases];
  for (let i = 0; i < T.randomLooks; i++) looks.push([`random#${i}`, randomParams(def, 1000 + i * 7919)]);
  metrics.bases = bases.length;
  metrics.looks = looks.length;

  const isBase = new Set(bases.map(([n]) => n));
  const maxColoursAllowed = T.colours[type] ?? 32;
  let maxColours = 0;
  for (const [lname, p] of looks) {
    const pk = lookKey(p);
    for (const cname of clipNames) {
      const clip = clips[cname];
      const frames = [];
      for (let f = 0; f < clip.frames; f++) {
        const g = isBase.has(lname) ? render(cname, f, p, pk) : draw(cname, f, p);   // random looks are not reused
        if (g instanceof Error) { error(`${cname} frame ${f} / ${lname}: render threw ${g.message}`, `threw:${g.message}`); frames.length = 0; break; }
        frames.push(g);
      }
      if (!frames.length) continue;
      const colours = new Set();
      let groundLow = -1;
      frames.forEach((g, f) => {
        const b = g.bounds();
        if (!b) {
          if (type === 'effect' && f === clip.frames - 1 && f > 0) warn(`${cname}: last frame is empty (fine for an effect that ends by vanishing; check that it does not pop)`, `empty-last:${cname}`);
          else error(`${cname} frame ${f} / ${lname}: nothing drawn`, `empty:${cname}`);
          return;
        }
        if (!EDGE_FREE.has(type) && (b.x0 === 0 || b.y0 === 0 || b.x1 === W - 1 || b.y1 === H - 1)) error(`${cname} frame ${f} / ${lname}: drawing touches the frame edge (clipped), box ${b.x0},${b.y0}..${b.x1},${b.y1}`, 'edge');
        if (type === 'background' && (b.x0 !== 0 || b.x1 !== W - 1)) error(`${cname}: layer does not span the full width (frame ${f} / ${lname} covers x ${b.x0}..${b.x1} of 0..${W - 1})`, `bg-width:${cname}`);
        for (const v of g.data) if (v) colours.add(v);
        groundLow = Math.max(groundLow, b.y1);
        if (lname === 'default') {
          const again = draw(cname, f, p);
          if (again instanceof Error || diff(g, again, 0)) error(`${cname} frame ${f}: two renders differ — do not use Math.random(), Date or state kept between calls; use hash()/rng()`, `repeat:${cname}`);
        }
      });
      maxColours = Math.max(maxColours, colours.size);
      if (colours.size > maxColoursAllowed) warn(`${cname} / ${lname}: ${colours.size} colours in one clip (a ${type} should use at most ${maxColoursAllowed})`, 'colours');
      if (lname === 'default') {
        if (clip.frames === 1) {
          if (MUST_MOVE.has(type)) error(`clip "${cname}" has one frame: a ${type} must move in every clip`);
          else if (!MAY_STAND_STILL.has(type)) warn(`clip "${cname}" has one frame: a ${type} usually moves`);
        } else {
          const steps = [];
          for (let f = 1; f < frames.length; f++) steps.push(diff(frames[f - 1], frames[f]));
          const avg = steps.reduce((a, b) => a + b, 0) / Math.max(1, steps.length);
          if (avg === 0) (MAY_STAND_STILL.has(type) ? warn : error)(`${cname}: all frames are identical`);
          else if (steps.filter((s) => s === 0).length > clip.frames / 2) warn(`${cname}: more than half the frames repeat the previous one`);
          if (clip.loop && avg > 0) {
            const wrap = diff(frames[frames.length - 1], frames[0]);
            if (wrap > avg * T.loopSeamFactor + T.loopSeamSlack) warn(`${cname}: loop seam — last→first frame changes ${wrap}px vs ${avg.toFixed(0)}px between other frames`);
            if (wrap === 0) warn(`${cname}: last frame equals first frame (a loop should not repeat its first pose)`);
          }
        }
        if (def.grounded !== false && !NO_GROUND.has(type) && cname === clipNames[0] && groundLow >= 0) {
          if (Math.abs(groundLow - def.pivot[1]) > T.feetSlack) warn(`${cname}: lowest pixel is at y=${groundLow} but pivot y=${def.pivot[1]} — feet should rest on the pivot line (set grounded: false for flying things)`);
        }
      }
    }
  }
  metrics.maxColours = maxColours;

  // ---- smallest look fills the frame ------------------------------------------------------------
  if (!FILLS_FRAME.has(type) && clipNames.length) {
    const c0 = clipNames[0], shares = [];
    for (let f = 0; f < clips[c0].frames; f++) {
      const g = render(c0, f, allLow);
      const b = g instanceof Error ? null : g.bounds();
      if (!b) continue;
      const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
      shares.push(bw >= bh ? bw / W : bh / H);
    }
    shares.sort((a, b) => a - b);
    if (shares.length) {
      const fill = shares[Math.floor(shares.length / 2)];
      metrics.smallestFill = Math.round(fill * 1000) / 1000;
      const msg = `smallest look (all sliders low) fills ${Math.round(fill * 100)}% of the frame along its longer side in ${c0}`;
      if (fill < T.fillError) error(`${msg}; at least ${Math.round(T.fillError * 100)}% needed (raise the slider minimums or use a smaller frame)`);
      else if (fill < T.fillWarn) warn(`${msg}; aim for at least ${Math.round(T.fillWarn * 100)}%`);
    }
  }

  // ---- controls: each one changes the picture whenever it is in effect -----------------------------
  // N, the smallest change a person sees at 1x, scales with the size of the drawing.
  let opaque = 0;
  if (clipNames.length) { const g = render(clipNames[0], 0, dflt); if (!(g instanceof Error)) for (const v of g.data) if (v) opaque++; }
  const N = Math.min(T.strengthMax, Math.max(T.strengthMin, Math.round(opaque / T.strengthPer)));
  metrics.opaquePixels = opaque;
  metrics.strength = N;

  const sampled = {};
  for (const c of clipNames) {
    const n = clips[c].frames, s = new Set();
    for (let i = 0; i < T.sampleFrames; i++) s.add(Math.floor((i * n) / T.sampleFrames));
    sampled[c] = [...s];
  }
  // Biggest per-frame pixel change between looks a and b over the sampled frames, capped at
  // N + 1. A speed change counts as visible (a Speed slider changes no pixels). Frames that
  // fail to render are skipped; `compared` says whether any pair could be compared at all.
  const change = (a, b) => {
    const cap = N + 1, ka = lookKey(a), kb = lookKey(b);
    let best = 0, compared = false;
    for (const c of clipNames) {
      const fa = fpsOf(c, a), fb = fpsOf(c, b);
      if (Number.isFinite(fa) && Number.isFinite(fb) && fa !== fb) return { d: cap, compared: true };
      for (const f of sampled[c]) {
        const ga = render(c, f, a, ka), gb = render(c, f, b, kb);
        if (ga instanceof Error || gb instanceof Error) continue;
        compared = true;
        best = Math.max(best, diff(ga, gb, cap));
        if (best >= cap) return { d: cap, compared };
      }
    }
    return { d: best, compared };
  };

  const controls = {};
  for (const [k, d] of Object.entries(params)) {
    const res = { kind: d.kind, maxChange: 0, tested: 0, deadIn: [], aliveIn: [] };
    controls[k] = res;
    const settings = d.kind === 'range' ? (d.min === d.max ? [] : [d.min, d.max])
      : d.kind === 'toggle' ? [false, true]
        : d.kind === 'color' ? farthestPair(d.swatches ?? []) ?? []
          : d.options.map((o) => o.value);
    if (settings.length < 2) continue;
    const pairMax = new Map();                    // choice: "i|j" -> biggest change seen while in effect
    let leftBehind = null;
    for (const [bname, base] of bases) {
      if (d.kind === 'choice' && bname.startsWith(`${k}=`)) continue;   // the control itself is varied below
      const variants = settings.map((v) => ({ ...base, [k]: v }));
      if (!effective(k, base)) {
        if (!leftBehind && change(variants[0], variants[1]).d > 0) leftBehind = bname;
        continue;
      }
      let most = 0, compared = false;
      if (d.kind === 'choice') {
        for (let i = 0; i < variants.length; i++) for (let j = i + 1; j < variants.length; j++) {
          const pk = `${i}|${j}`;
          if ((pairMax.get(pk) ?? 0) > N) { most = N + 1; compared = true; continue; }
          const c = change(variants[i], variants[j]);
          if (!c.compared) continue;
          compared = true;
          pairMax.set(pk, Math.max(pairMax.get(pk) ?? 0, c.d));
          most = Math.max(most, c.d);
        }
      } else ({ d: most, compared } = change(variants[0], variants[1]));
      if (!compared) { res.untestable = true; continue; }   // nothing rendered here: the render error says why
      res.tested++;
      res.maxChange = Math.max(res.maxChange, most);
      (most === 0 ? res.deadIn : res.aliveIn).push(bname);
    }
    const part = partOf(k);
    const who = part ? `part "${part.name}": "${k}"` : `"${k}"`;
    if (!res.tested && !res.untestable) {
      // In effect at no tested setting (a `when` that needs two settings away from the default,
      // say). Build a setting where it applies, from its `when` and its part, and test there.
      const built = settingWhereItApplies(k);
      if (!built) { error(`${who} can never apply: no setting puts it in effect (check its \`when\` and its part)`); continue; }
      const variants = settings.map((v) => ({ ...built, [k]: v }));
      let most = 0, compared = false;
      for (let i = 0; i < variants.length; i++) for (let j = i + 1; j < variants.length; j++) {
        if (d.kind !== 'choice' && (i || j !== 1)) continue;
        const c = change(variants[i], variants[j]);
        if (!c.compared) continue;
        compared = true; most = Math.max(most, c.d);
        if (d.kind === 'choice') pairMax.set(`${i}|${j}`, c.d);
      }
      if (!compared) continue;
      res.tested++;
      res.builtAt = describe(built);
      res.maxChange = most;
      if (most === 0) { error(`${who} does nothing at the only setting where it applies (${res.builtAt}): make it change the picture there, or correct its \`when\``); continue; }
      res.aliveIn.push(res.builtAt);
    }
    if (!res.tested) continue;
    if (res.maxChange === 0) { error(`${who} never changes the picture (no pixel and no speed changes at any tested setting where it is in effect)`); continue; }
    if (res.maxChange <= N) (d.kind === 'range' ? error : warn)(`${who} changes at most ${res.maxChange} pixel${res.maxChange === 1 ? '' : 's'} in any frame; more than ${N} are needed to be seen at 1x`);
    if (d.kind === 'choice') for (let i = 0; i < settings.length; i++) for (let j = i + 1; j < settings.length; j++) {
      if (!pairMax.has(`${i}|${j}`)) continue;
      const c = pairMax.get(`${i}|${j}`), a = fmt(settings[i]), b = fmt(settings[j]);
      if (c === 0) error(`choice "${k}": options "${a}" and "${b}" look the same at every tested setting`);
      else if (c <= N) warn(`choice "${k}": options "${a}" and "${b}" differ by at most ${c} pixel${c === 1 ? '' : 's'}; more than ${N} are needed to tell them apart at 1x`);
    }
    if (res.deadIn.length) {
      const where = res.deadIn.map(settingName).join(', ');
      if (res.deadIn.every((bn) => bn === 'all-low' || bn === 'all-high')) warn(`${who} does nothing when ${where}; fine if that is a deliberate limit for the extreme look`);
      else error(`${who} does nothing when ${where} (${res.deadIn.length} of ${res.tested} tested settings); ${remedy(res)}`);
    }
    if (leftBehind) warn(`${who} still changes the picture when ${settingName(leftBehind)}, where it is declared not in effect`);
  }
  metrics.controls = controls;

  function remedy(res) {
    const dead = res.deadIn.filter((bn) => bn !== 'all-low' && bn !== 'all-high');
    const fix = `make it do something when ${dead.map(settingName).join(', ')}`;
    const hint = whenHint(res, params, dflt);
    return hint ? `${fix}, or declare \`${hint}\` (the values where it works)` : `${fix} (no single other control explains where it is dead)`;
  }

  // A setting where control `key` is in effect: the defaults, with each key of one of its
  // `when` alternatives at its first listed value (and, in turn, whatever that key needs),
  // and its part's selector at an option that is not `none`. Null when no alternative works.
  function settingWhereItApplies(key) {
    const enable = (k2, p, depth) => {
      if (depth > 8) return;
      const alt = whenAlternatives(params[k2]?.when)[0];
      if (alt) for (const [k3, vals] of Object.entries(alt)) { p[k3] = vals[0]; enable(k3, p, depth + 1); }
      const part = parts.find((x) => x.controls.includes(k2));
      if (part && part.none !== undefined) {
        const none = Array.isArray(part.none) ? part.none : [part.none];
        if (none.includes(p[part.selector])) {
          const sel = params[part.selector];
          p[part.selector] = sel.kind === 'toggle' ? true : sel.options.map((o) => o.value).find((v) => !none.includes(v));
          enable(part.selector, p, depth + 1);
        }
      }
    };
    const alts = whenAlternatives(params[key]?.when);
    for (const alt of alts.length ? alts : [{}]) {
      const p = { ...dflt };
      for (const [k2, vals] of Object.entries(alt)) { p[k2] = vals[0]; enable(k2, p, 1); }
      const part = parts.find((x) => x.controls.includes(key));
      if (part && part.none !== undefined) {
        const none = Array.isArray(part.none) ? part.none : [part.none];
        if (none.includes(p[part.selector])) { const sel = params[part.selector]; p[part.selector] = sel.kind === 'toggle' ? true : sel.options.map((o) => o.value).find((v) => !none.includes(v)); enable(part.selector, p, 1); }
      }
      if (effective(key, p)) return p;
    }
    return null;
  }
  function describe(p) {
    return keys.filter((x) => fmt(p[x]) !== fmt(dflt[x])).map((x) => `${x}=${fmt(p[x])}`).join(', ') || 'the defaults';
  }

  // ---- kind-specific rules (Contract 2) ---------------------------------------------------------
  const joinLooks = [['default', dflt], ['all-low', allLow], ['all-high', allHigh]];
  if (type === 'tileset') {
    if (W !== H || !T.tileSizes.includes(W)) warn(`tiles are ${W}x${H}; tilesets use 16x16 or 32x32`);
    const named = (re) => clipNames.filter((c) => re.test(c));
    const fills = named(/(^|-)fill$/), tops = named(/(^|-)top$/), lefts = named(/-left$/), rights = named(/-right$/);
    const prefix = (c) => c.replace(/-?(fill|top|left|right)$/, '');
    const partner = (c, list) => list.find((x) => prefix(x) === prefix(c)) ?? list[0];
    const joins = [];
    for (const f of fills) joins.push([f, 'x', f], [f, 'y', f]);
    for (const t of tops) { joins.push([t, 'x', t]); if (fills.length) joins.push([t, 'y', partner(t, fills)]); }
    for (const l of lefts) if (tops.length) joins.push([l, 'x', partner(l, tops)]);
    for (const r of rights) if (tops.length) joins.push([partner(r, tops), 'x', r]);
    if (!fills.length) warn('tileset has no fill tile (a clip named "...-fill"), so nothing checks that it repeats');
    metrics.joins = joins.map(([a, ax, b]) => `${a} ${ax === 'x' ? 'left of' : 'above'} ${b}`);
    for (const [lname, p] of joinLooks) {
      for (const f of fills) for (let i = 0; i < clips[f].frames; i++) {
        const g = render(f, i, p);
        if (!(g instanceof Error) && g.data.some((v) => (v >>> 24) !== 255)) error(`${f}: fill tile is not fully opaque (frame ${i} / ${lname})`, `opaque:${f}`);
      }
      for (const [a, axis, b] of joins) {
        const n = Math.min(clips[a].frames, clips[b].frames);
        for (let i = 0; i < n; i++) {
          const A = render(a, i, p), B = render(b, i, p);
          if (A instanceof Error || B instanceof Error) continue;
          const s = seamCheck(A, B, axis);
          if (!s.ok) {
            const ea = axis === 'x' ? 'right edge' : 'bottom edge', eb = axis === 'x' ? 'left edge' : 'top edge';
            error(`seam: ${a} ${ea} → ${b} ${eb} does not join (${lname}, frame ${i}: ${s.breaks} gaps vs ${s.maxBreaks} allowed, brightness step ${s.jump.toFixed(2)} vs ${s.maxJump.toFixed(2)} allowed)`, `seam:${a}:${axis}:${b}`);
          }
        }
      }
    }
  }
  if (type === 'background') {
    for (const [lname, p] of joinLooks) for (const c of clipNames) for (let i = 0; i < clips[c].frames; i++) {
      const g = render(c, i, p);
      if (g instanceof Error) continue;
      const s = seamCheck(g, g, 'x');
      if (!s.ok) error(`${c}: left and right edges do not continue into each other (${lname}, frame ${i}: ${s.breaks} gaps vs ${s.maxBreaks} allowed, brightness step ${s.jump.toFixed(2)} vs ${s.maxJump.toFixed(2)} allowed)`, `wrap:${c}`);
    }
    const far = clipNames[0];
    if (far) { const g = render(far, 0, dflt); if (!(g instanceof Error) && g.data.some((v) => (v >>> 24) !== 255)) warn(`${far}: the farthest layer has see-through pixels; a game needs a solid colour behind it`); }
  }

  return finish();

  function finish() {
    const errors = [], warnings = [];
    for (const { level, msg, n } of issues.values()) (level === 'error' ? errors : warnings).push(n > 1 ? `${msg} (and ${n - 1} more)` : msg);
    metrics.ms = Math.round((now() - t0) * 10) / 10;
    return { errors, warnings, metrics };
  }
}
