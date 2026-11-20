// The cases migration batch C2's pixel records hold (tests/fixtures/redraw-pixels-c2/<id>.json, written by
// tools/redraw-pixels-c2.mjs from the code sprite before its file was deleted; tests/unit/redraws-c2.test.mjs holds the
// data redraw to them). The M4 record (tests/helpers/redraw-pixels.mjs redrawCases) draws every mix of every choice and
// toggle at 21 sizes: for these creatures that is 30,000 to 175,000 frames (the wyrm's 144 mixes of spines, wings, horns
// and tail at 21 sizes, 58 frames each), too many to keep or to draw in a test. So a C2 record draws every clip and frame
// at these settings instead, each on the defaults:
//   the defaults; each other option of each choice alone; each toggle the other way; each slider at its two ends
//   alone; every slider low together and every slider high together; every swatch of each colour alone; and
//   RANDOM_LOOKS mixes of every control, drawn from a fixed seed (each slider on its step, each choice, toggle and
//   colour one of its own)
// Controls are taken in the order of their keys; speed is left out (it changes no picture). Node and browser alike (no imports beyond engine/sprite.js and the
// frame hash of tests/helpers/redraw-pixels.mjs).
import { renderPixels, cleanParams, defaultParams } from '../../engine/sprite.js';
import { frameHash } from './redraw-pixels.mjs';

/** How many seeded mixes of every control a record holds besides the one-at-a-time cases. */
export const RANDOM_LOOKS = 8;

/** A number 0..1 from two integers (engine/motion.js hash's idea, written here so the cases never change with the engine). */
function unit(a, b) {
  let h = (Math.imul(a + 1, 374761393) + Math.imul(b + 7, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A slider value on its step between min and max, from a share u. */
const onStep = (d, u) => { const n = Math.round((d.max - d.min) / d.step); return Math.round((d.min + Math.round(u * n) * d.step) * 1e6) / 1e6; };

/** The settings a C2 record draws, without clips: [{ ... }] in a fixed order (each on the defaults when drawn). */
export function c2Mixes(sprite) {
  // by key, so a code sprite and its data file (whose controls list colours in another place) give the same cases
  const P = Object.entries(sprite.params ?? {}).filter(([k]) => k !== 'speed').sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const mixes = [{}];
  for (const [k, d] of P) {
    if (d.kind === 'choice') for (const o of d.options) { if (o.value !== d.def) mixes.push({ [k]: o.value }); }
    else if (d.kind === 'toggle') mixes.push({ [k]: !d.def });
    else if (d.kind === 'range') mixes.push({ [k]: d.min }, { [k]: d.max });
  }
  const ranges = P.filter(([, d]) => d.kind === 'range');
  mixes.push(Object.fromEntries(ranges.map(([k, d]) => [k, d.min])), Object.fromEntries(ranges.map(([k, d]) => [k, d.max])));
  for (const [k, d] of P) if (d.kind === 'color') for (const s of d.swatches ?? []) mixes.push({ [k]: s });
  for (let i = 0; i < RANDOM_LOOKS; i++) {
    const m = {};
    P.forEach(([k, d], j) => {
      const u = unit(i, j);
      if (d.kind === 'range') m[k] = onStep(d, u);
      else if (d.kind === 'choice') m[k] = d.options[Math.min(d.options.length - 1, Math.floor(u * d.options.length))].value;
      else if (d.kind === 'toggle') m[k] = u < 0.5;
      else if (d.kind === 'color') m[k] = d.swatches[Math.min(d.swatches.length - 1, Math.floor(u * d.swatches.length))];
    });
    mixes.push(m);
  }
  return mixes;
}

/** Every case of a C2 record: [{ clip, frame, params }], every clip and frame at every mix of c2Mixes, in that order. */
export function c2Cases(sprite) {
  const out = [];
  for (const params of c2Mixes(sprite)) for (const [clip, c] of Object.entries(sprite.clips)) for (let frame = 0; frame < (c.frames ?? 1); frame++) out.push({ clip, frame, params });
  return out;
}

/** The hash of one case, drawn as the site draws it at its settings on the defaults (tests/helpers/redraw-pixels.mjs frameHash). */
export const c2Hash = (sprite, c) => frameHash(renderPixels(sprite, c.clip, c.frame, cleanParams(sprite, { ...defaultParams(sprite), ...c.params })));
