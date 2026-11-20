import { head, clip, build, B, pick, lin, clipWhen } from './lib.mjs';
const h = head('micro-rocket', { body: 'metal', accent: 'paint', glow: 'fire' });
h.palette.push(
  { id: 'hot', default: '#f0ead8', material: 'fire', detail: true },
  { id: 'rim', material: 'fire', derive: { rule: 'tone', of: 'glow', by: -1 } },
  { id: 'shine', default: '#ffffff', material: 'light', detail: true });
// in the rocket node's frame: x 0 is its tail end, y 0 its centre line; the straight tube ends at LS
const LS = B('length', 7, 11, 'px');
const at = (dx) => B('length', [[0, 7 + dx], [1, 11 + dx]], 'px');
const fly = ['fly'];
const finRows = { small: [[0, 3, 0]], swept: [[-1, 5, 0], [-2, 3, 1]] };
const fins = [];
for (const [kind, rows] of Object.entries(finRows)) for (const [fx, fw, k] of rows) {
  fins.push({ id: `fin${kind}${k}t`, kind: 'rect', clip: fly, on: 'rocket', at: [fx, -3 - k], size: [fw, 1], paint: 'body', group: 'fins', when: { fins: [kind] } });
  fins.push({ id: `fin${kind}${k}b`, kind: 'rect', clip: fly, on: 'rocket', at: [fx, 2 + k], size: [fw, 1], paint: 'body', group: 'fins', when: { fins: [kind] } });
}
const draw = [
  ...fins,
  { id: 'tube', kind: 'rect', clip: fly, on: 'rocket', at: [0, -2], size: [LS, 4], paint: 'body', shade: 1, light: 1, group: 'hull' },
  { id: 'dome', kind: 'ellipse', clip: fly, on: 'rocket', at: [LS, 0], r: [2, 2], paint: 'body', shade: 1, light: 1, group: 'hull', when: { shape: ['round'] } },
  { id: 'cone', kind: 'poly', clip: fly, on: 'rocket', points: [[LS, -2], [at(3), -1], [at(4), -1], [at(4), 0], [at(3), 0], [LS, 2]], paint: 'body', shade: 1, light: 1, group: 'hull', when: { shape: ['pointed'] } },
  // the stripe: a band two px wide round the tube with a seam of the tube's dark tone behind it
  { id: 'seam', kind: 'rect', clip: fly, on: 'rocket', at: [B('length', 2, 4, 'px'), -2], size: [1, 4], paint: 'body.dark' },
  { id: 'stripe', kind: 'rect', clip: fly, on: 'rocket', at: [B('length', 3, 5, 'px'), -2], size: [2, 4], paint: 'accent.base' },
  { kind: 'outline', paint: 'ink' } ];
const body = { pictures: {
  nodes: [ { id: 'rocket', parent: null, at: [B('length', 16, 14, 'px'), 8] }, { id: 'nozzle', parent: null, at: [B('length', 16, 14, 'px'), 8] } ],
  draw: clipWhen(draw),
  motion: [ { gen: 'pickup.bob', v: 1, node: 'rocket', clip: fly, height: B('wobble', 0, 1.7) } ],
  emitters: [
    // behind it, un-inked: smoke first (it stays on the line of flight), then the flame, which weaves with the rocket
    { id: 'smoke', gen: 'trail.puffs', v: 1, clip: fly, on: 'nozzle', at: [-3.5, 0], when: { smoke: [true] }, count: 3, seed: 4, dist: 6.5, size: 5, spread: 1.2, paints: ['body', 'body.dark'] },
    { id: 'flame', gen: 'flame', v: 1, clip: fly, on: 'rocket', at: [-1, 0], head: 0, angle: -90, length: B('length', 4.4, 5.2), width: 2, sway: B('wobble', 0.4, 0.9), cycles: 2, heat: 0.75, paints: ['hot', 'glow', 'rim'] },
    // hit: a white-hot flash gone in two frames, a ring of the flame's colour, embers and a little pale smoke
    { id: 'puff', gen: 'puffs', v: 1, clip: ['hit'], at: [18, 8], when: { smoke: [true] }, loop: false, count: 4, seed: 8, stagger: 0.1, angle: 180, arc: 360, dist: 6, rise: 2, size: 2.6, paints: ['body.light', 'body', 'body'] },
    { id: 'ring', gen: 'ring', v: 1, clip: ['hit'], at: [18, 8], r0: 3, r1: 6.5, thick: 3, seed: 2, paints: ['hot', 'glow', 'glow', 'rim'] },
    { id: 'embers', gen: 'particles', v: 1, clip: ['hit'], at: [18, 8], loop: false, count: 6, seed: 5, stagger: 0.15, angle: 180, arc: 360, dist: 9, size: 2.2, paints: ['hot', 'glow', 'rim'] },
    { id: 'flash', gen: 'glow', v: 1, clip: ['hit'], at: [18, 8], r: 6, paints: ['shine', 'hot', 'glow', 'rim'] } ] } };
const clips = {
  fly: clip(h, 'fly', 12),
  hit: clip(h, 'hit', 16, { keys: [ { t: 0, ease: 'hold', emit: { flash: { amount: 1, scale: 1 }, embers: { amount: 0 } } }, { t: 0.2, ease: 'hold', emit: { flash: { amount: 1, scale: 0.56 }, embers: { amount: 0 } } },
    { t: 0.4, emit: { flash: { amount: 0, scale: 0.56 }, embers: { amount: 1 } } } ] }),
};
/** The definition this writer gives (tools/projectiles/write.mjs writes it as sprites/micro-rocket.json). */
export const definition = () => build(h, body, clips);
