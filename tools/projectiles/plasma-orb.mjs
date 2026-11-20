import { head, clip, build, B, pick, lin, clipWhen } from './lib.mjs';
const h = head('plasma-orb');
h.palette.push(
  { id: 'mid', material: 'light', derive: { rule: 'mix', of: 'core', with: 'glow', amount: 0.5 } },
  { id: 'rim', material: 'light', derive: { rule: 'tone', of: 'glow', by: -1 } },
  { id: 'shine', default: '#ffffff', material: 'light', detail: true });
// the ball's middle: ahead of the pivot by half the tail, so the whole shot sits about the pivot
const CX = B('length', 17, 20, 'px');
const R = B('size', 4.5, 7.5);
const RS = lin('size', 4.5, 7.5, 0.86);                   // a spiky ball is a little smaller: its spikes reach past it
const turnLoop = (deg) => [{ t: 0, ease: 'linear', nodes: { swirl: { turn: 0 }, spikes: { turn: 0 } } }, { t: 1, nodes: { swirl: { turn: -deg }, spikes: { turn: deg / 3 } } }];
const body = {
  nodes: [ { id: 'ball', parent: null, at: [CX, 16] }, { id: 'swirl', parent: 'ball', at: [0, 0] }, { id: 'spikes', parent: 'ball', at: [0, 0] } ],
  draw: [
    // spiky: a six-pointed star of the glow round the ball, turning a point a loop, rimmed in the glow's dark tone
    { id: 'star', clip: ['fly'], gen: 'star', v: 1, on: 'spikes', at: [0, 0], r: lin('size', 4.5, 7.5, 0.86, 3), points: 6, inner: 0.5, paint: 'glow', group: 'spikes', when: { style: ['spiky'] } },
    { kind: 'outline', paint: 'rim', only: 'spikes' },
    // ring: a hoop of the glow with its rim, the hot line inside it (two arcs chasing round with the swirl)
    { id: 'hoopRim', clip: ['fly'], kind: 'ring', on: 'ball', at: [0, 0], r: lin('size', 4.5, 7.5, 1, -1), thick: 5, paint: 'rim', when: { style: ['ring'] } },
    { id: 'hoop', clip: ['fly'], kind: 'ring', on: 'ball', at: [0, 0], r: lin('size', 4.5, 7.5, 1, -1), thick: 3, paint: 'glow', when: { style: ['ring'] } },
    { id: 'line', clip: ['fly'], kind: 'ring', on: 'ball', at: [0, 0], r: lin('size', 4.5, 7.5, 1, -1), thick: 1, paint: 'core', when: { style: ['ring'], swirl: [false] } },
    { id: 'chase1', clip: ['fly'], kind: 'arc', on: 'swirl', at: [0, 0], r: lin('size', 4.5, 7.5, 1, -1), a0: 0, a1: 110, thick: 1, paint: 'core', when: { style: ['ring'], swirl: [true] } },
    { id: 'chase2', clip: ['fly'], kind: 'arc', on: 'swirl', at: [0, 0], r: lin('size', 4.5, 7.5, 1, -1), a0: 180, a1: 290, thick: 1, paint: 'core', when: { style: ['ring'], swirl: [true] } },
    // orb and spiky: the swirl, two darker arms of the glow turning inside the ball, half a turn a loop
    { id: 'arm1', clip: ['fly'], kind: 'arc', on: 'swirl', at: [0, 0], r: lin('size', 4.5, 7.5, 0.4), a0: 20, a1: 130, thick: 2, paint: 'glow', z: 2, when: { style: ['orb', 'spiky'], swirl: [true] } },
    { id: 'arm2', clip: ['fly'], kind: 'arc', on: 'swirl', at: [0, 0], r: lin('size', 4.5, 7.5, 0.4), a0: 200, a1: 310, thick: 2, paint: 'glow', z: 2, when: { style: ['orb', 'spiky'], swirl: [true] } } ],
  emitters: [
    // the ball and its tail as one body of light, rim to core; the tail ripples more the wobblier it is
    { id: 'orb', gen: 'flame', v: 1, clip: ['fly'], on: 'ball', at: [0, 0], z: 1, when: { style: ['orb'] }, head: R, angle: -90,
      length: B('length', 8, 16), width: B('size', 3.2, 5.2), sway: B('wobble', 0, 2), cycles: 1, heat: 0.8, paints: ['core', 'mid', 'glow', 'glow', 'rim'] },
    { id: 'orbSpiky', gen: 'flame', v: 1, clip: ['fly'], on: 'ball', at: [0, 0], z: 1, when: { style: ['spiky'] }, head: RS, angle: -90,
      length: B('length', 8, 16), width: B('size', 3.2, 5.2), sway: B('wobble', 0, 2), cycles: 1, heat: 0.8, paints: ['core', 'mid', 'glow', 'glow', 'rim'] },
    { id: 'tail', gen: 'flame', v: 1, clip: ['fly'], on: 'ball', at: [lin('size', 4.5, 7.5, -1, 1), 0], z: -1, when: { style: ['ring'] }, angle: -90,
      length: B('length', 3, 8), width: B('size', 2, 3.5), sway: B('wobble', 0, 2), heat: 0.2, paints: ['glow', 'rim'] },
    // hit: a white flash that opens into a ring of the glow, cooling and breaking up, with embers thrown ahead of it
    { id: 'flash', gen: 'glow', v: 1, clip: ['hit'], at: [16, 16], r: lin('size', 4.5, 7.5, 1, 3), paints: ['shine', 'core', 'mid', 'glow', 'rim'] },
    { id: 'shock', gen: 'ring', v: 1, clip: ['hit'], at: [16, 16], r0: R, r1: B('size', 9, 13), thick: 4, seed: 3, paints: ['core', 'mid', 'glow', 'glow', 'rim'] },
    { id: 'embers', gen: 'particles', v: 1, clip: ['hit'], at: [16, 16], loop: false, count: pick('style', { orb: 8, ring: 8, spiky: 12 }), seed: 6, stagger: 0.15, angle: 180, arc: 360,
      dist: B('size', 11.7, 14), size: 2.4, paints: ['mid', 'glow', 'glow', 'rim'] } ] };
const clips = {
  fly: clip(h, 'fly', 12, { keys: turnLoop(180) }),
  hit: clip(h, 'hit', 16, { keys: [ { t: 0, ease: 'hold', emit: { flash: { amount: 1, scale: 1 } } }, { t: 0.2, ease: 'hold', emit: { flash: { amount: 1, scale: 0.68 } } }, { t: 0.4, emit: { flash: { amount: 0, scale: 0.68 } } } ] }),
};
body.draw = clipWhen(body.draw);
/** The definition this writer gives (tools/projectiles/write.mjs writes it as sprites/plasma-orb.json). */
export const definition = () => build(h, body, clips);
