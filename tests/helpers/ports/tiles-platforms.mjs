// The writer of tests/fixtures/v2/tiles/tiles-platforms.json (build item B15b): the code tileset sprites/tiles-platforms.js
// redrawn as data, kept here so the fixture can be audited and written again when the code tileset or the tiles layout
// changes (tests/unit/gen-tiles-ports.test.mjs holds the fixture equal to what this writes).
//
// What it is: a port by hand, not a material. Every piece is a picture (pictures per piece) of rects, cuts and two
// stamps, written below from reading the code; its numbers are bound to Thickness by tables exact at each whole step
// (byTh), its wear marks sit behind thresholds (the code's slice(0, round(wear * 5)) and wear > 0.35 / 0.75), the pixels
// the code clears are cuts. Two things are traced from the code's pixels rather than written: the vine (one stamp per
// piece, its leaf tones read from the default render) and the post's braces (Surface.limb drawn once, placed by a
// binding). No generator is called: the platform, ladder, vine and post have no material (fill and edge bands) to share.
//
// Usage: node tests/helpers/ports/tiles-platforms.mjs           (says whether the fixture is what this writes)
//        node tests/helpers/ports/tiles-platforms.mjs --write   (writes the fixture)
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { codeSprite } from '../library.mjs';
import { Surface } from '../../../engine/surface.js';
import { renderFrame, defaultParams } from '../../../engine/sprite.js';
import { PALETTE } from '../../../engine/palettes.js';
import { INK, col } from '../../../engine/color.js';
import { resolvePalette, paintHex } from '../../../engine/resolve.js';

/** The fixture this writes. */
export const FIXTURE = fileURLToPath(new URL('../../fixtures/v2/tiles/tiles-platforms.json', import.meta.url));
const code = await codeSprite('tiles-platforms');   // the frozen copy once the library's is redrawn
const P = PALETTE.thornwood;

// ---- numbers bound to Thickness (8..14, step 1): a table exact at every whole step -------------------------------
const TH = [8, 9, 10, 11, 12, 13, 14];
const byTh = (f) => { const ys = TH.map(f); return ys.every((y) => y === ys[0]) ? ys[0] : { from: 'thickness', map: TH.map((t, i) => [t, ys[i]]), round: 'px' }; };
const last = (t) => t - 2;
const R = (x, y, w, h, paint, when) => ({ kind: 'rect', at: [x, y], size: [w, h], paint, shade: 0, ...(when ? { when } : {}) });
const cut = (x, y, when) => ({ kind: 'cut', shape: { kind: 'rect', at: [x, y], size: [1, 1] }, ...(when ? { when } : {}) });
const style = (s) => ({ style: [s] });
const and = (...ws) => Object.assign({}, ...ws.filter(Boolean));

// the wear marks: the first round(wear * 5) of the list; mark k shows from wear (k + 0.5) / 5
const MARKS = [[18, 'nick'], [16, 'chip'], [28, 'nick'], [25, 'chip'], [4, 'nick']];
const markWhen = (k) => ({ wear: [{ atLeast: (k + 0.5) / 5 }] });

function platform(part) {
  const L = part === 'l', Rt = part === 'r';
  const x0 = L ? 1 : 0, x1 = Rt ? 30 : 31;
  const out = [];
  const span = (a, b, y, h, c, when) => { if (b >= a) out.push(R(a, y, b - a + 1, h, c, when)); };
  // planks
  { const w = style('planks');
    span(x0, x1, 1, 3, 'wood', w); span(x0, x1, 1, 1, 'wood.light', w);
    for (let x = 7; x < 32; x += 8) if (x > x0 && x < x1) out.push(R(x, 1, 1, 3, 'wood.dark', w));
    const b0 = L ? 4 : 0, b1 = Rt ? 27 : 31;
    span(b0, b1, 4, byTh((t) => last(t) - 3), 'shade', w);
    span(b0, b1, 4, 1, 'wood.dark', w);
    const deep = and(w, { thickness: [{ atLeast: 9 }] });   // last >= 7
    span(Math.max(b0, 9), 14, byTh((t) => last(t) - 1), 1, 'wood.dark', deep);
    span(21, Math.min(b1, 26), byTh((t) => last(t) - 2), 1, 'wood.dark', deep); }
  // logs
  { const w = style('logs');
    const mid = (t) => Math.floor(last(t) / 2);
    const t0 = x0, t1 = x1, u0 = L ? 3 : 0, u1 = Rt ? 28 : 31;
    span(t0, t1, 1, byTh(mid), 'wood', w); span(t0, t1, 1, 1, 'wood.light', w); span(t0, t1, byTh(mid), 1, 'wood.dark', w);
    span(u0, u1, byTh((t) => mid(t) + 1), byTh((t) => last(t) - mid(t)), 'wood', w); span(u0, u1, byTh(last), 1, 'wood.dark', w);
    for (const [on, tx, ux, lx] of [[L, t0, u0, t0 + 1], [Rt, t1, u1, t1 - 1]]) {
      if (!on) continue;
      out.push(cut(tx, 1, w), cut(tx, byTh(mid), w), cut(ux, byTh(last), w));
      out.push(R(lx, 2, 1, byTh((t) => Math.max(1, mid(t) - 2)), 'wood.light', w));
    }
    for (const x of [6, 22]) { out.push(R(x, 1, 2, byTh(last), 'rope', w)); out.push(R(x, 1, 1, byTh(last), 'rope.dark', w)); }
    span(11, 15, 2, 1, 'wood.dark', w); span(26, 29, byTh((t) => (mid(t) + 2 <= last(t) - 1 ? mid(t) + 2 : mid(t) + 1)), 1, 'wood.dark', w); }
  // slab: its ends cut back underneath, column by column (the cut is 3 at Thickness 8, else 4)
  { const w = style('slab');
    const cutOf = (t) => Math.min(4, last(t) - 3);
    const back = (x, t) => Math.max(0, cutOf(t) - (L ? x - x0 : Rt ? x1 - x : 99));
    const ramped = new Set();
    for (let x = x0; x <= x1; x++) if (TH.some((t) => back(x, t) > 0)) ramped.add(x);
    const flat = [...Array(x1 - x0 + 1).keys()].map((i) => x0 + i).filter((x) => !ramped.has(x));
    const runs = [];
    for (const x of flat) { const r = runs[runs.length - 1]; if (r && r[1] === x - 1) r[1] = x; else runs.push([x, x]); }
    const deep = and(w, { thickness: [{ atLeast: 10 }] });   // last > 7 (and then last - back - 1 > 2 always)
    for (const [a, b] of runs) {
      span(a, b, 1, byTh(last), 'wood', w); span(a, b, 1, 1, 'wood.light', w); span(a, b, byTh(last), 1, 'wood.dark', w);
      span(a, b, byTh((t) => last(t) - 1), 1, 'shade', deep);
    }
    for (const x of [...ramped].sort((a, b) => a - b)) {
      out.push(R(x, 1, 1, byTh((t) => last(t) - back(x, t)), 'wood', w)); out.push(R(x, 1, 1, 1, 'wood.light', w));
      out.push(R(x, byTh((t) => last(t) - back(x, t)), 1, 1, 'wood.dark', w));
      out.push(R(x, byTh((t) => last(t) - back(x, t) - 1), 1, 1, 'shade', deep));
    }
    span(Math.max(x0 + 4, 5), 12, 3, 1, 'wood.dark', w); span(17, Math.min(x1 - 4, 27), byTh((t) => Math.min(5, last(t) - 2)), 1, 'wood.dark', w); }
  // wear: nicks and chips
  MARKS.forEach(([x, kind], k) => {
    const w = markWhen(k);
    if (kind === 'nick') { out.push(R(x, 1, 1, 2, 'wood.dark', w)); out.push(R(x + 1, 1, 1, 1, 'wood', w)); }
    else { out.push(cut(x, byTh(last), w), cut(x + 1, byTh(last), w), cut(x, byTh((t) => last(t) - 1), and(w, { thickness: [{ atLeast: 10 }] }))); }
  });
  // the bracket under an end piece
  if (L || Rt) for (let i = 0; i < 3; i++) span(L ? 3 : 22 + 2 * i, L ? 9 - 2 * i : 28, byTh((t) => t - 1 + i), 1, i === 2 ? 'wood.dark' : 'shade');
  return out;
}

function ladder(part) {
  const out = [];
  const y0 = part === 'cap' ? 2 : 0, y1 = part === 'foot' ? 30 : 31;
  const rung = (y, crack, when) => {
    out.push(R(9, y, 14, 2, 'wood', when), R(9, y, 14, 1, 'wood.light', when));
    for (const [x, w] of crack) out.push(R(x, y, 1, 2, 'wood.dark', and(when, w)), R(x + 1, y + 1, 1, 1, 'wood.dark', and(when, w)));
  };
  for (const [rungs, pitch] of [['wide', 16], ['close', 8]]) {
    let n = 0;
    for (let y = pitch / 2 - 1; y < 32; y += pitch, n++) {
      if (part === 'cap' && y < 9) continue;
      if (part === 'foot' && y > 22) continue;
      // even rungs crack at 13 + n above wear 0.35; odd ones at 17 above wear 0.75
      rung(y, n % 2 === 0 ? [[13 + n, { wear: [{ above: 0.35 }] }]] : [[17, { wear: [{ above: 0.75 }] }]], { rungs: [rungs] });
    }
  }
  if (part === 'cap') out.push(R(9, 2, 14, 3, 'wood'), R(9, 2, 14, 1, 'wood.light'), R(9, 4, 14, 1, 'wood.dark'));
  if (part === 'foot') rung(27, []);
  for (const x of [9, 21]) {
    out.push(R(x, y0, 1, y1 - y0 + 1, 'rope.dark'), R(x + 1, y0, 1, y1 - y0 + 1, 'rope'));
    for (let y = y0; y <= y1; y++) if (y % 4 === 1) out.push(R(x + 1, y, 1, 1, 'rope.dark'));
  }
  return out;
}

// the vine draws the same at every setting but its colour: traced once from the code, its outline left to the layout
const def0 = {
  format: 'loadout-sprite', version: 2, id: 'tiles-platforms', name: code.name, blurb: code.blurb, size: [32, 32], pivot: [16, 16], grounded: false, preview: 'plank-thin-l', styles: ['pixel'],
  meta: code.meta,
  palette: [
    { id: 'wood', label: 'Wood', default: P.wood, material: 'wood', swatches: code.params.wood.swatches },
    { id: 'rope', label: 'Rope', default: P.cream, material: 'cloth', swatches: code.params.rope.swatches },
    { id: 'leaf', label: 'Leaf', default: P.leaf, material: 'plant', swatches: code.params.leaf.swatches },
    { id: 'shade', material: 'wood', derive: { rule: 'mix', of: 'wood', with: 'wood.dark', amount: 0.5 } },
  ],
  controls: [
    { key: 'style', kind: 'choice', label: 'Style', options: ['planks', 'logs', 'slab'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })), default: 'planks' },
    { key: 'thickness', kind: 'range', label: 'Thickness', lo: 'Thin', hi: 'Chunky', min: 8, max: 14, step: 1, default: 11 },
    { key: 'rungs', kind: 'choice', label: 'Rungs', options: [{ value: 'wide', label: 'Wide apart' }, { value: 'close', label: 'Close together' }], default: 'wide' },
    { key: 'wear', kind: 'range', label: 'Wear', lo: 'New', hi: 'Worn', default: 0.3 },
    { key: 'wood', kind: 'colour', label: 'Wood' }, { key: 'rope', kind: 'colour', label: 'Rope' }, { key: 'leaf', kind: 'colour', label: 'Leaf' },
  ],
  body: { tiles: { tile: 32, groups: [] } },
  made: { in: 'library', from: 'code:tiles-platforms', by: 'B15b: written by tests/helpers/ports/tiles-platforms.mjs' },
};
const pal = resolvePalette(def0, {});
const leafRefs = ['leaf', 'leaf.light', 'leaf.dark', 'leaf.deep'].map((r) => [r, col(paintHex(r, pal, {}))]);
const ink = col(INK);
function traceVine(clip) {
  const g = renderFrame(code, clip, 0, defaultParams(code));
  const keys = {}, rows = [];
  for (let y = 0; y < 32; y++) {
    let row = '';
    for (let x = 0; x < 32; x++) {
      const v = g.data[y * 32 + x];
      if (!(v >>> 24) || v === ink) { row += '.'; continue; }
      const hit = leafRefs.find(([, c]) => c === v);
      if (!hit) throw new Error(`${clip} ${x},${y}: a colour that is no tone of the leaf`);
      const ch = 'abcd'[leafRefs.indexOf(hit)];
      keys[ch] = hit[0]; row += ch;
    }
    rows.push(row);
  }
  let y0 = rows.findIndex((r) => /[^.]/.test(r)), y1 = rows.length - 1 - [...rows].reverse().findIndex((r) => /[^.]/.test(r));
  const cutRows = rows.slice(y0, y1 + 1);
  const xs0 = Math.min(...cutRows.map((r) => r.search(/[^.]/)).filter((i) => i >= 0)), xs1 = Math.max(...cutRows.map((r) => r.length - 1 - [...r].reverse().join('').search(/[^.]/)));
  return { kind: 'stamp', at: [xs0, y0], rows: cutRows.map((r) => r.slice(xs0, xs1 + 1).replace(/\./g, '.')), key: keys };
}

// the post: its braces are a limb from (8, th - 1) to (13, th + 5), moved down with Thickness: drawn once, placed by a binding
function braceStamp() {
  const s = new Surface(32, 32);
  s.limb(8, 10, 13, 16, 2, '#010203'); s.limb(24, 10, 19, 16, 2, '#010203');
  const rows = [];
  for (let y = 0; y < 32; y++) { let r = ''; for (let x = 0; x < 32; x++) r += s.data[y * 32 + x] >>> 24 ? 'a' : '.'; rows.push(r); }
  const y0 = rows.findIndex((r) => r.includes('a')), y1 = rows.length - 1 - [...rows].reverse().findIndex((r) => r.includes('a'));
  const cutRows = rows.slice(y0, y1 + 1);
  const x0 = Math.min(...cutRows.map((r) => r.indexOf('a')).filter((i) => i >= 0)), x1 = Math.max(...cutRows.map((r) => r.lastIndexOf('a')));
  return { kind: 'stamp', at: [x0, byTh((t) => y0 + (t - 1 - 10))], rows: cutRows.map((r) => r.slice(x0, x1 + 1)), key: { a: 'shade' } };
}
function post(part) {
  const out = [];
  const y0 = part === 'cap' ? 3 : 0;
  if (part === 'cap') out.push(braceStamp());
  out.push(R(13, y0, 6, 32 - y0, 'wood'), R(13, y0, 1, 32 - y0, 'wood.dark'), R(18, y0, 1, 32 - y0, 'wood.light'));
  out.push(R(15, 6, 1, 5, 'wood.dark'), R(16, 19, 1, 6, 'wood.dark'));
  out.push(R(14, 12, 1, 4, 'wood.dark', { wear: [{ above: 0.3 }] }));
  out.push(R(17, 26, 1, 4, 'wood.dark', { wear: [{ above: 0.65 }] }), R(16, 27, 1, 1, 'wood.dark', { wear: [{ above: 0.65 }] }));
  if (part === 'cap') out.push(R(12, 3, 8, 3, 'wood'), R(12, 3, 8, 1, 'wood.light'), R(12, 5, 8, 1, 'wood.dark'));
  return out;
}

def0.body.tiles.groups = [
  { name: 'plank', kind: 'platform', label: 'Platform', pictures: { 'thin-l': platform('l'), 'thin-m': platform('m'), 'thin-r': platform('r') } },
  { name: 'ladder', kind: 'stack', label: 'Ladder', pieces: ['cap', 'mid', 'foot'], pictures: { cap: ladder('cap'), mid: ladder('mid'), foot: ladder('foot') } },
  { name: 'vine', kind: 'stack', label: 'Vine', pieces: ['cap', 'mid', 'foot'], pictures: { cap: [traceVine('vine-cap')], mid: [traceVine('vine-mid')], foot: [traceVine('vine-foot')] } },
  { name: 'post', kind: 'stack', label: 'Post', pieces: ['cap', 'mid'], pictures: { cap: post('cap'), mid: post('mid') } },
];
// the code's labels for every tile
def0.clips = Object.fromEntries(Object.entries(code.clips).map(([n, c]) => [n, { label: c.label }]));
/** The port as a definition (a fresh copy each call). */
export const tilesPlatformsPort = () => structuredClone(def0);

/** The text of a fixture as these ports write it: a value that fits on one line of 120 characters stays on one line, else one entry a line, indented one space a level (the fixture as indented JSON is over the 128 KB cap). Arguments: def. */
export function fixtureText(def) {
  const pretty = (v, ind = '') => {
    const one = JSON.stringify(v);
    if (one.length + ind.length <= 120 || v === null || typeof v !== 'object') return one;
    const next = `${ind} `;
    if (Array.isArray(v)) return `[\n${v.map((x) => next + pretty(x, next)).join(',\n')}\n${ind}]`;
    return `{\n${Object.entries(v).map(([k, x]) => `${next}${JSON.stringify(k)}: ${pretty(x, next)}`).join(',\n')}\n${ind}}`;
  };
  return `${pretty(def)}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const text = fixtureText(def0);
  if (process.argv.includes('--write')) { fs.writeFileSync(FIXTURE, text); console.log('wrote', FIXTURE, Buffer.byteLength(text), 'bytes'); }
  else { const same = fs.existsSync(FIXTURE) && fs.readFileSync(FIXTURE, 'utf8') === text; console.log(same ? 'the fixture is what this writes' : 'the fixture differs from what this writes (--write to write it)'); process.exitCode = same ? 0 : 1; }
}
