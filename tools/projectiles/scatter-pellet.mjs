// Writes sprites/scatter-pellet.json (migration batch E3). Round and spark are behaviours (shot.bar tails, glow,
// starburst); the shard is the code's dart drawn as it drew it (engine/shots.js lightShape on a four-point kite): the
// kite in the glow, its core (the kite less one pixel above and below, which is what lightShape's bands leave on a
// dart three to five rows tall) over it, then a rim round both. shot.bar kept its ends 3 px inside the frame, so a long
// or flickering dart could not reach where the code drew it (review of E3 round 2, issue 2). Every number of a point is
// a table on Length, worked out from the code's own sums for each of its three dart widths (Size), each tail beat
// (frames 0 and 2 at rest, 1 out, 3 in) and each flicker step (Flicker 1 or 2 px, and the paler flare of a wild dart).
import { head, clip, build, B, pick, lin, oneEach } from './lib.mjs';
import { polyIn } from '../../engine/surface.js';
const h = head('scatter-pellet');
h.palette.push(
  { id: 'mid', material: 'light', derive: { rule: 'mix', of: 'core', with: 'glow', amount: 0.5 } },
  { id: 'rim', material: 'light', derive: { rule: 'tone', of: 'glow', by: -1 } },
  { id: 'shine', default: '#ffffff', material: 'light', detail: true });
const L = B('length', 4.5, 8.5);
const HX = B('length', [[0, 9.5], [0.249, 9.5], [0.25, 10.5], [0.749, 10.5], [0.75, 11.5], [1, 11.5]]);                     // the head's middle: the tail grows back from it
const tailBars = (when) => [
  // the tail: a one-row streak that flickers in and out, cooling to the rim colour at its far end
  { id: 'tail', gen: 'shot.bar', v: 1, clip: ['fly'], when, at: [6, 8], length: L, thick: 1, style: 'bolt', lead: 0, flicker: B('flicker', 0, 3, 'px'), paints: ['rim'] },
  { id: 'warm', gen: 'shot.bar', v: 1, clip: ['fly'], when, at: [6, 8], length: B('length', 2.5, 4.5), thick: 1, style: 'bolt', lead: B('length', 1, 2, 'px'), paints: ['glow'] } ];
const emitters = [
  ...tailBars({ shape: ['round', 'spark'] }),
  // round: a ball of light, rim to core
  { id: 'ball', gen: 'glow', v: 1, clip: ['fly'], when: { shape: ['round'] }, at: [HX, 7.5], r: B('size', [[0, 2.3], [0.5, 3.2], [1, 3.4]]), paints: ['core', 'glow', 'rim'] },
  { id: 'hot', gen: 'glow', v: 1, clip: ['fly'], when: { shape: ['round'] }, at: [HX, 7.5], r: B('size', [[0, 1.1], [0.5, 1.5], [1, 1.6]]), paints: ['core'] },
  // spark: a four-pointed star of the core, rimmed in the glow
  { id: 'star', gen: 'starburst', v: 1, clip: ['fly'], when: { shape: ['spark'] }, at: [HX, 7.5], points: 4, r: [0, B('size', 3.5, 4.5)], width: B('size', 1.4, 2), turn: 0, paints: ['core', 'glow'] },
  // hit: a white pop, then four sparks that fly out, thin and cool
  { id: 'pop', gen: 'glow', v: 1, clip: ['hit'], at: [7.5, 7.5], r: B('size', 3.1, 4.1), paints: ['shine', 'shine', 'core', 'glow'] },
  { id: 'spark1', gen: 'starburst', v: 1, clip: ['hit'], at: [7.5, 7.5], points: 4, turn: 45, r: [0, lin('size', 4.5, 6.4, 0.8)], width: 0.9, paints: ['core', 'glow'] },
  { id: 'spark2', gen: 'starburst', v: 1, clip: ['hit'], at: [7.5, 7.5], points: 4, turn: 45, r: [lin('size', 4.5, 6.4, 0.45), lin('size', 4.5, 6.4)], width: 0.4, paints: ['mid'] },
  { id: 'spark3', gen: 'starburst', v: 1, clip: ['hit'], at: [7.5, 7.5], points: 4, turn: 45, r: [lin('size', 4.5, 6.4, 1, -1.2), lin('size', 4.5, 6.4)], width: 0.4, paints: ['rim'] } ];

// ---- the shard -----------------------------------------------------------------------------------------------------
const lerp = (a, b, t) => a + (b - a) * t, r4 = (v) => Math.round(v * 1e4) / 1e4;
const SIZES = [{ d: 3, when: [{ below: 0.25 }] }, { d: 4, when: [{ atLeast: 0.25, below: 0.75 }] }, { d: 5, when: [{ atLeast: 0.75 }] }];
const AMP1 = 0.35715;                                         // round(lerp(1, 2.4, flicker)) is 1 below it, 2 from it
// the dart's variants: [name, beat, flicker steps, paint of its edge]; frames 0 and 2 rest, 1 is out, 3 is in
const VARIANTS = [['rest', 0, null, 'glow'],
  ['out1', 1, [{ below: AMP1 }], 'glow'], ['out2', 1, [{ atLeast: AMP1, below: 0.4 }], 'glow'], ['outF', 1, [{ atLeast: 0.4 }], 'mid'],
  ['in1', -1, [{ below: AMP1 }], 'glow'], ['in2', -1, [{ atLeast: AMP1, below: 0.8 }], 'glow'], ['inF', -1, [{ atLeast: 0.8 }], 'mid']];
const FRAME_BEAT = [0, 1, 0, -1];
/** The code's dart at one Length: the kite (cut to the box lightShape drew in, x 1 to 15) and its core, 6 points each. */
const DARTS = new Map();
function dartAt(len, d, beat, amp) {
  const key = `${len} ${d} ${beat} ${amp}`;
  if (!DARTS.has(key)) DARTS.set(key, dartOf(len, d, beat, amp));
  return DARTS.get(key);
}
/** dartAt, worked out. */
function dartOf(len, d, beat, amp) {
  const base = lerp(4.5, 8.5, len), cx = 7.5 + Math.round((base - d / 2) / 2), cy = 7.5, half = [1.1, 1.6, 2.2][d - 3];
  const tail = Math.min(cx - 1, base + beat * amp), nose = cx + d / 2 + 1.8, tx = cx - tail;
  const hw = (x) => (x <= cx - 0.5 ? (half * (x - tx)) / (cx - 0.5 - tx) : (half * (nose - x)) / (nose - (cx - 0.5)));
  const xr = Math.min(nose, 15), hr = Math.max(0, hw(xr));
  const kite = [[xr, cy - hr], [cx - 0.5, cy - half], [tx, cy], [cx - 0.5, cy + half], [xr, cy + hr], [xr, cy + hr]];
  // the core: the pixels lightShape gave the core colour (every pixel beside it, across or down, inside the dart and
  // inside x 1 to 14, y 1 to 14), one run on each of rows 6, 7 and 8, as an 8-point outline round those pixel centres
  const inQ = polyIn([[nose, cy], [cx - 0.5, cy - half], [tx, cy], [cx - 0.5, cy + half]]);
  const inBox = (x, y) => x >= 1 && x < 15 && y >= 1 && y < 15 && inQ(x + 0.5, y + 0.5);
  const run = (y) => { const xs = []; for (let x = 1; x < 15; x++) if (inBox(x, y) && inBox(x - 1, y) && inBox(x + 1, y) && inBox(x, y - 1) && inBox(x, y + 1)) xs.push(x); return xs.length ? [xs[0], xs.at(-1)] : null; };
  const r7 = run(7) ?? [cx - 0.5, cx - 1.5], r6 = run(6), r8 = run(8);
  const [a7, b7] = r7, [a6, b6] = r6 ?? [a7, b7 - 0], [a8, b8] = r8 ?? [a7, b7], y6 = r6 ? 6.4 : 7.4, y8 = r8 ? 8.6 : 7.6;
  const core = [[a6 + 0.4, y6], [b6 + 0.6, y6], [b7 + 0.6, 7.4], [b7 + 0.6, 7.6], [b8 + 0.6, y8], [a8 + 0.4, y8], [a7 + 0.4, 7.6], [a7 + 0.4, 7.4]];
  return { kite, core };
}
/** One number of a point as a table on Length: the code's value sampled every 1/4000 of the slider, kept only where its slope changes (a rounding step becomes a ramp 1/4000 wide). */
function onLength(f) {
  const N = 4000, pts = Array.from({ length: N + 1 }, (_, k) => [k / N, r4(f(k / N))]);
  const keep = [pts[0]];
  for (let k = 1; k < N; k++) { const [a, va] = pts[k - 1], [b, vb] = pts[k], [c, vc] = pts[k + 1]; if (Math.abs((vb - va) - (vc - vb)) > 2e-4) keep.push(pts[k]); }
  keep.push(pts[N]);
  return keep.every(([, v]) => v === keep[0][1]) ? keep[0][1] : { from: 'length', map: keep };
}
const dartItems = [];
for (const { d, when: sz } of SIZES) for (const [name, beat, flick, edge] of VARIANTS) {
  const amp = flick && flick[0].below !== undefined && flick[0].below <= AMP1 ? 1 : 2;
  const when = { shape: ['shard'], size: sz, ...(flick ? { flicker: flick } : {}), clip: ['fly'] };
  const pts = (key) => Array.from({ length: key === 'kite' ? 6 : 8 }, (_, j) => [0, 1].map((ax) => onLength((len) => dartAt(len, d, beat, amp)[key][j][ax])));
  dartItems.push({ id: `dart${d}${name}`, kind: 'poly', points: pts('kite'), paint: `${edge}.base`, shade: 0, hidden: true, when },
    { id: `dart${d}${name}Core`, kind: 'poly', points: pts('core'), paint: 'core.base', shade: 0, hidden: true, when });
}
const shownOn = (f) => dartItems.filter((it) => VARIANTS.find((v) => it.id.slice(5).replace(/Core$/, '') === v[0])[1] === FRAME_BEAT[f]).map((it) => it.id);
// the rim round the dart, then x 0 and x 15 cleared: lightShape drew inside the frame less its 1 px border
const body = { pictures: { draw: [...dartItems, { kind: 'outline', paint: 'rim.base' }, { kind: 'cut', shape: { kind: 'rect', at: [0, 0], size: [1, 16] } }, { kind: 'cut', shape: { kind: 'rect', at: [15, 0], size: [1, 16] } }], emitters } };
const beat = (b) => ({ tail: { beat: b } });
const clips = {
  fly: clip(h, 'fly', 12, { keys: [0, 1, 0, -1].map((b, f) => ({ t: f / 4, emit: beat(b), show: shownOn(f), hide: dartItems.map((it) => it.id).filter((id) => !shownOn(f).includes(id)) })) }),
  hit: clip(h, 'hit', 16, { keys: oneEach(4, ['pop', 'spark1', 'spark2', 'spark3']) }),
};
/** The definition this writer gives (tools/projectiles/write.mjs writes it as sprites/scatter-pellet.json). */
export const definition = () => build(h, body, clips);
