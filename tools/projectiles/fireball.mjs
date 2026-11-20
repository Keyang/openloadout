import { head, clip, build, B, pick, lin, clipWhen } from './lib.mjs';
const h = head('fireball', { core: 'fire', glow: 'fire' });
h.palette.push(
  { id: 'mid', material: 'fire', derive: { rule: 'mix', of: 'core', with: 'glow', amount: 0.5 } },
  { id: 'rim', material: 'fire', derive: { rule: 'tone', of: 'glow', by: -1 } },
  { id: 'shine', default: '#ffffff', material: 'light', detail: true });
const R = B('size', 3.5, 6.5);
const BIG = [{ atLeast: 0.25 }], SMALL = [{ below: 0.25 }];
const skull = { style: ['skull'] };
const flameArgs = { on: 'ball', at: [0, 0], head: R, angle: -90, length: B('length', 10, 18), width: lin('size', 3.5, 6.5, 0.8), sway: B('flicker', 0.4, 2.2), cycles: 1 };
const body = {
  nodes: [ { id: 'ball', parent: null, at: [B('length', 18, 22, 'px'), 16] }, { id: 'jaw', parent: 'ball', at: [0, 0] } ],
  draw: [
    // the skull in the hot core: a round cranium over a short jaw, two dark sockets, facing right
    { id: 'cranium', kind: 'ellipse', clip: ['fly'], on: 'ball', at: [0.5, B('size', [[0, -0.5], [0.249, -0.5], [0.25, -1], [1, -1]])], r: [lin('size', 3.5, 6.5, 0.756, 0.4), lin('size', 3.5, 6.5, 0.756)], paint: 'core', shade: 1, group: 'bone', when: skull },
    { id: 'jawSmall', kind: 'rect', clip: ['fly'], on: 'jaw', at: [-1, 1], size: [3, 2], paint: 'core', group: 'bone', when: { ...skull, size: SMALL } },
    { id: 'jawBig', kind: 'rect', clip: ['fly'], on: 'jaw', at: [-1, B('size', 1, 2.5, 'px')], size: [5, 3], paint: 'core', group: 'bone', when: { ...skull, size: BIG } },
    { id: 'eyesSmall', kind: 'stamp', clip: ['fly'], on: 'ball', at: [-1, -1], rows: ['a.a'], key: { a: 'rim' }, when: { ...skull, size: SMALL } },
    { id: 'eyesBig', kind: 'stamp', clip: ['fly'], on: 'ball', at: [-2, B('size', -2, -3, 'px')], rows: ['aa..aa', 'aa..aa', '......', '...a..'], key: { a: 'rim' }, when: { ...skull, size: BIG } },
    { id: 'teeth', kind: 'stamp', clip: ['fly'], on: 'jaw', at: [0, B('size', 2, 3.5, 'px')], rows: ['a.a'], key: { a: 'rim' }, when: { ...skull, size: BIG } } ],
  emitters: [
    // sparks first, so the flame covers the ones still inside it
    { id: 'sparks', gen: 'particles', v: 1, clip: ['fly'], on: 'ball', at: [lin('size', 3.5, 6.5, -0.6), 0], z: -2, when: { sparks: [true] }, count: 8, seed: 3, angle: -90, arc: 126,
      dist: B('length', 12, 22), gravity: -2, size: 2.4, lifespan: 0.8, paints: ['core', 'mid', 'glow', 'rim'] },
    // ball: one main tail and two shorter licks high and low; comet: one long tongue; skull: two, streaming off the back of the skull like hair
    { id: 'ball', gen: 'flame', v: 1, clip: ['fly'], z: -1, when: { style: ['ball'] }, ...flameArgs, tongues: 3, spread: lin('size', 3.5, 6.5, 0.52), fan: 8, shorten: 0.35, slim: 0.4, heat: 0.55, paints: ['core', 'mid', 'glow', 'rim'] },
    { id: 'comet', gen: 'flame', v: 1, clip: ['fly'], z: -1, when: { style: ['comet'] }, ...flameArgs, length: B('length', 11, 22), width: lin('size', 3.5, 6.5, 0.83), head: lin('size', 3.5, 6.5, 0.92), sway: B('flicker', 0.3, 1.5), tongues: 1, heat: 0.55, paints: ['core', 'mid', 'glow', 'rim'] },
    { id: 'hair', gen: 'flame', v: 1, clip: ['fly'], z: -1, when: skull, ...flameArgs, head: lin('size', 3.5, 6.5, 1.08), tongues: 2, spread: lin('size', 3.5, 6.5, 0.6), fan: 25, shorten: 0.38, slim: 0.3, heat: 0.05, paints: ['mid', 'mid', 'glow', 'rim'] },
    // hit: the white-hot flash, then a ring of embers that opens, cools and breaks up
    { id: 'flash', gen: 'glow', v: 1, clip: ['hit'], at: [18, 16], r: B('size', 7.25, 11.75), paints: ['shine', 'core', 'mid', 'glow', 'rim'] },
    { id: 'burst', gen: 'ring', v: 1, clip: ['hit'], at: [18, 16], r0: B('size', 4.5, 7.5), r1: B('size', 9, 13.5), thick: 4, seed: 2, paints: ['core', 'mid', 'glow', 'glow', 'rim'] },
    { id: 'embers', gen: 'particles', v: 1, clip: ['hit'], at: [18, 16], loop: false, count: pick('sparks', { true: 10, false: 5 }), seed: 5, stagger: 0.15, angle: 180, arc: 360,
      dist: B('size', 14, 20.3), gravity: 3, size: 2.4, paints: ['mid', 'glow', 'glow', 'rim'] } ] };
body.draw = clipWhen(body.draw);
const clips = {
  // the jaw chatters: open on the frames where the code's wave was high
  fly: clip(h, 'fly', 12, { keys: [ { t: 0, ease: 'hold', nodes: { jaw: { move: [0, 1] } } }, { t: 0.25, ease: 'hold', nodes: { jaw: { move: [0, 0] } } }, { t: 0.5, ease: 'hold', nodes: { jaw: { move: [0, 1] } } }, { t: 0.75, ease: 'hold', nodes: { jaw: { move: [0, 0] } } } ] }),
  hit: clip(h, 'hit', 16, { keys: [ { t: 0, ease: 'hold', emit: { flash: { amount: 1, scale: 1 } } }, { t: 0.2, ease: 'hold', emit: { flash: { amount: 1, scale: 0.52 } } }, { t: 0.4, emit: { flash: { amount: 0, scale: 0.52 } } } ] }),
};
/** The definition this writer gives (tools/projectiles/write.mjs writes it as sprites/fireball.json). */
export const definition = () => build(h, body, clips);
