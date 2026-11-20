import { head, clip, build, B, clipWhen } from './lib.mjs';
const h = head('arrow', { wood: 'wood', metal: 'metal', accent: 'cloth' });
h.palette.push({ id: 'shine', default: '#ffffff', material: 'light', detail: true });
// the half length h = round(lerp(7, 11, length)) as a table of steps, so every node and rect lands on the code's pixels
const STEPS = [[0, 7], [0.125, 8], [0.375, 9], [0.625, 10], [0.875, 11]];
const byH = (f) => { const pts = []; STEPS.forEach(([s, v], i) => { if (i) pts.push([s - 0.0001, f(STEPS[i - 1][1])]); pts.push([s, f(v)]); }); pts.push([1, f(11)]); return B('length', pts, undefined, 'px'); };
const fly = ['fly'], hit = ['hit'];
// heads, as half-heights column by column from the tip backward; barbs are columns behind the head with only their outermost pixels
const HEADS = { broad: { cols: [0, 1, 1, 2, 2] }, needle: { cols: [0, 0, 0, 1, 1, 1] }, barbed: { cols: [0, 1, 2, 3], barbs: [3, 3] }, blunt: { cols: [1, 2, 2, 2, 1] } };
function headStamp(style) {
  const { cols, barbs = [] } = HEADS[style], hl = cols.length, w = hl + barbs.length, K = Math.max(...cols, ...barbs);
  const grid = (sunk) => {
    const g = Array.from({ length: 2 * K + 1 }, () => Array(w).fill('.'));
    const sink = Math.max(2, Math.round(hl * 0.6));
    cols.forEach((k, i) => { const c = w - 1 - i; if (sunk && i < sink) { g[K][c] = 'c'; return; } for (let r = 1; r <= k; r++) { g[K - r][c] = 'm'; g[K + r][c] = 'l'; } g[K][c] = 'h'; });
    barbs.forEach((k, j) => { const c = w - 1 - hl - j; g[K - k][c] = 'm'; g[K + k][c] = 'l'; });
    return g.map((r) => r.join(''));
  };
  return { id: `head-${style}`, kind: 'stamp', on: 'head', at: [-w, -1 - K], anchor: 'tl', rows: grid(false), variants: { sunk: grid(true) }, key: { m: 'metal.base', l: 'metal.dark', h: 'metal.light', c: 'clear' }, when: { style: [style] } };
}
// one feather above (colour a) or below (colour d) the shaft, swept back: rest, pressed flat, flared
function vane(side, ch) {
  const spans = (state) => { const s = [[1, 1, 4]]; s.push(state >= 0 ? [2, 0, 3] : [2, 1, 2]); if (state > 0) s.push([3, -1, 2]); return s; };
  const grid = (state) => {
    const g = Array.from({ length: 3 }, () => Array(6).fill('.'));
    for (const [k, x, n] of spans(state)) for (let c = x; c < x + n; c++) g[side < 0 ? 3 - k : k - 1][c + 1] = ch;
    return g.map((r) => r.join(''));
  };
  return { id: side < 0 ? 'vaneUp' : 'vaneDown', kind: 'stamp', on: 'tail', at: [-1, side < 0 ? -4 : 0], anchor: 'tl', rows: grid(0), variants: { rest: grid(0), flat: grid(-1), flared: grid(1) },
    key: { [ch]: ch === 'a' ? 'accent.base' : 'accent.dark' } };
}
const draw = [
  // the shaft: its back two thirds ride the tail node (which sways), the front third stays with the head
  { id: 'shaftBack', kind: 'rect', on: 'tail', at: [0, -1], size: [byH((v) => v - Math.round(v / 3)), 1], paint: 'wood.base' },
  { id: 'shaftFront', kind: 'rect', on: 'arrow', at: [byH((v) => -Math.round(v / 3)), -1], size: [byH((v) => v + Math.round(v / 3)), 1], paint: 'wood.base' },
  vane(-1, 'a'), vane(1, 'd'),
  ...Object.keys(HEADS).map(headStamp),
  { kind: 'outline', paint: 'ink' } ];
const body = { pictures: {
  nodes: [ { id: 'arrow', parent: null, at: [16, 8] }, { id: 'tail', parent: 'arrow', at: [byH((v) => -v), 0] }, { id: 'head', parent: 'arrow', at: [byH((v) => v), 0] } ],
  draw: clipWhen(draw),
  motion: [ { gen: 'pickup.bob', v: 1, node: 'tail', clip: fly, height: B('wobble', 0, 1.2) } ],
  emitters: [
    // white speed lines: one straight behind the nock, two streaming back past the feathers
    { id: 'trail1', gen: 'streaks', v: 1, clip: fly, on: 'tail', at: [-2, 0.5], when: { trail: [true] }, count: 1, seed: 1, length: 5, reach: 3, spread: 0, paints: ['shine'] },
    { id: 'trail2', gen: 'streaks', v: 1, clip: fly, on: 'tail', at: [2, 0.5], when: { trail: [true] }, count: 2, seed: 2, length: 6, reach: 4, spread: 4, paints: ['shine'] },
    // splinters jump back from where it went in, and are gone before it stops quivering
    { id: 'splinters', gen: 'particles', v: 1, clip: hit, at: [byH((v) => 15 + v), 7.5], loop: false, count: 5, seed: 2, stagger: 0.2, angle: -90, arc: 149, dist: 6, gravity: 2, size: 1.6, spread: 1.5, end: 0.7, paints: ['shine', 'wood'] } ] } };
const st = ['rest', 'flared', 'rest', 'flat'], sb = ['flared', 'rest', 'flat', 'rest'];
const heads = Object.fromEntries(Object.keys(HEADS).map((s) => [`head-${s}`, 'sunk']));
const QUIVER = [0, -1, 1, -1, 1, 0];
const clips = {
  fly: clip(h, 'fly', 12, { keys: st.map((u, f) => ({ t: f / 4, ease: 'hold', swap: { vaneUp: u, vaneDown: sb[f] } })) }),
  hit: clip(h, 'hit', 16, { keys: QUIVER.map((q, f) => ({ t: f / 5, ease: 'hold', swap: heads, nodes: { tail: { move: [0, q] } } })) }),
};
/** The definition this writer gives (tools/projectiles/write.mjs writes it as sprites/arrow.json). */
export const definition = () => build(h, body, clips);
