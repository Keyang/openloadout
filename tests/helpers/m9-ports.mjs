// Migration batch M9 (the interface pieces redrawn as data): each redraw names a port generator that draws what its code
// sprite drew, so each is held pixel for pixel to the frozen code sprite (tests/fixtures/code-sprites/<id>.js, read
// through tests/helpers/library.mjs codeSprite) at many settings: the defaults, every slider at each end and between,
// every choice option, every toggle the other way, colours off the swatches, and every ready-made version, in every
// clip and frame. Node only.
import { codeSprite, librarySprite } from './library.mjs';
import { cleanParams, defaultParams, renderFrame, frameSockets } from '../../engine/sprite.js';

/** Colours off every swatch list, to hold the ports' worked-out tones (colour rules) to the code's at any colour. */
// (the near-blacks: review M9 round 1 issue 6 found the shoulder button's face off by a tone just there)
export const OFF_SWATCH = Object.freeze(['#2a9d8f', '#e9c46a', '#8a3b12', '#c8c8c8', '#14141e', '#f4f1de', '#050505', '#081000']);

/** The settings a port is compared at: [{ label, params }] built from the code sprite's controls (cleaned by it). */
export function portSettings(old, { more = [] } = {}) {
  const base = defaultParams(old);
  const out = [{ label: 'defaults', params: base }];
  const keys = Object.entries(old.params);
  const set = (label, change) => out.push({ label, params: cleanParams(old, { ...base, ...change }) });
  set('all low', Object.fromEntries(keys.filter(([, o]) => o.kind === 'range').map(([k, o]) => [k, o.min])));
  set('all high', Object.fromEntries(keys.filter(([, o]) => o.kind === 'range').map(([k, o]) => [k, o.max])));
  for (const [k, o] of keys) {
    if (o.kind === 'range') for (const u of [0, 0.3, 0.7, 1]) { const st = o.step > 0 ? o.step : 0.01; set(`${k}=${u}`, { [k]: o.min + Math.round(((o.max - o.min) * u) / st) * st }); }
    else if (o.kind === 'choice') for (const x of o.options) set(`${k}=${x.value ?? x}`, { [k]: x.value ?? x });
    else if (o.kind === 'toggle') set(`${k}=${!o.def}`, { [k]: !o.def });
    else if (o.kind === 'color') {
      for (const c of o.swatches.slice(0, 3)) set(`${k}=${c}`, { [k]: c });
      for (const c of OFF_SWATCH) set(`${k}=${c}`, { [k]: c });
    }
  }
  // every choice option together with every other choice's options (two at a time), where the choices are few
  const choices = keys.filter(([, o]) => o.kind === 'choice' || o.kind === 'toggle');
  for (let i = 0; i < choices.length; i++) for (let j = i + 1; j < choices.length; j++) {
    const [a, A] = choices[i], [b, B] = choices[j];
    const va = A.kind === 'toggle' ? [true, false] : A.options.map((x) => x.value ?? x);
    const vb = B.kind === 'toggle' ? [true, false] : B.options.map((x) => x.value ?? x);
    if (va.length * vb.length > 36) continue;
    for (const x of va) for (const y of vb) set(`${a}=${x}, ${b}=${y}`, { [a]: x, [b]: y });
  }
  for (const v of old.versions ?? []) set(`version ${v.name}`, v.params);
  for (const m of more) set(m.label, m.params);
  return out;
}

/**
 * Every place the data sprite's pictures differ from the frozen code sprite's: [{ label, clip, frame, pixels }] (empty
 * when they match pixel for pixel). Options: { more: extra [{ label, params }], data: a loaded sprite to use instead of
 * the library's, limit: at most this many places, near: { clip: n }: in these clips the same pixels must be painted and
 * each colour channel may differ by at most n (a picture the panel layout greys whole, where the code greyed each colour
 * before working out its tones) }.
 */
export async function portDifferences(id, { more = [], data = null, limit = 40, near = {} } = {}) {
  const old = await codeSprite(id);
  const now = data ?? await librarySprite(id);
  const out = [];
  for (const { label, params } of portSettings(old, { more })) {
    const p = cleanParams(now, params);
    for (const [clip, c] of Object.entries(old.clips)) {
      for (let f = 0; f < c.frames; f++) {
        const a = renderFrame(old, clip, f, params), b = renderFrame(now, clip, f, p);
        let n = 0;
        const tol = Object.hasOwn(near, clip) ? near[clip] : 0;
        for (let i = 0; i < a.data.length; i++) {
          const x = a.data[i], y = b.data[i];
          if (x === y) continue;
          if (!tol || !x !== !y) { n++; continue; }
          for (let sh = 0; sh < 32; sh += 8) if (Math.abs(((x >>> sh) & 255) - ((y >>> sh) & 255)) > tol) { n++; break; }
        }
        if (n) { out.push({ label, clip, frame: f, pixels: n }); if (out.length >= limit) return out; }
      }
    }
  }
  return out;
}

/**
 * Every place the data sprite's slice or text area (Contract 8) differs from the frozen code sprite's, at the same
 * settings as portDifferences: [{ label, clip, what, old, now }]. A clip the code marked noText has no text area to keep.
 */
export async function measureDifferences(id, { more = [], data = null, limit = 40 } = {}) {
  const old = await codeSprite(id);
  const now = data ?? await librarySprite(id);
  const out = [];
  const of = (s, field, clip, p) => {
    const v = s[field];
    if (typeof v === 'function') return v.call(s, clip, p);
    return v?.[clip];
  };
  for (const { label, params } of portSettings(old, { more })) {
    const p = cleanParams(now, params);
    for (const [clip, c] of Object.entries(old.clips)) {
      for (const what of ['slice', 'textArea']) {
        if (what === 'textArea' && c.noText) continue;
        const a = JSON.stringify(of(old, what, clip, params) ?? null), b = JSON.stringify(of(now, what, clip, p) ?? null);
        if (a !== b) { out.push({ label, clip, what, old: a, now: b }); if (out.length >= limit) return out; }
      }
    }
  }
  return out;
}

/**
 * Every place the data sprite's attach points (Contract 3 sockets, engine/sprite.js frameSockets) differ from the frozen
 * code sprite's, at the same settings as portDifferences, in every clip and frame: [{ label, clip, frame, old, now }]
 * (review M9 round 2, issue 2: the crosshair's, the cursor's, the tails' and the card's points were dropped). Numbers are
 * compared to 1e-6. Options as measureDifferences.
 */
export async function socketDifferences(id, { more = [], data = null, limit = 40 } = {}) {
  const old = await codeSprite(id);
  const now = data ?? await librarySprite(id);
  const out = [];
  const say = (v) => JSON.stringify(v, (k, x) => (typeof x === 'number' ? Math.round(x * 1e6) / 1e6 : x));
  for (const { label, params } of portSettings(old, { more })) {
    const p = cleanParams(now, params);
    for (const [clip, c] of Object.entries(old.clips)) {
      for (let f = 0; f < c.frames; f++) {
        const a = say(frameSockets(old, clip, f, params)), b = say(frameSockets(now, clip, f, p));
        if (a !== b) { out.push({ label, clip, frame: f, old: a, now: b }); if (out.length >= limit) return out; }
      }
    }
  }
  return out;
}
