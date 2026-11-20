// The end of `die` on the top-down rig: a body lying down with whatever it wears and holds stays inside the frame,
// for every sprite built on the rig and every look a whole-bundle "shapes" theme can give it; and the held thing
// goes down with the body in one path, without jumping from one side to the other.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { INK } from '../../engine/color.js';
import { defaultParams, renderFrame } from '../../engine/sprite.js';
import { themedParams, defaultTheme } from '../../engine/theme.js';
import * as T from '../../rigs/topdown.js';
import { codeSprite, codeSpritesWhere } from '../helpers/library.mjs';

// The sprites built on the rig: code that imports rigs/topdown*.js, the frozen copies first (tests/helpers/library.mjs),
// so the rig keeps its test sprites when the library's are redrawn as data (docs/data-sprites.md section 7).
const onTheRig = () => codeSpritesWhere(/rigs\/topdown(-[\w-]+)?\.js/).map((s) => s.id);

const [W, H] = T.SIZE;
const LOOK = { skin: '#f6d3b0', top: '#3f6fd1', bottom: '#2c4a8a', boots: '#9a6a3e', hair: '#5a3a22', hairStyle: 'short' };
const DIE = Array.from({ length: 8 }, (_, f) => f / 7);

test('topdown rig: a lying body with something big on its back or arm never touches the frame edge, at any build, when frame() is told how far it reaches (far)', () => {
  for (const build of [0, 0.16, 0.5, 1]) for (const height of [0, 0.23, 1]) for (const wide of [6, 9, 12]) for (const side of [-1, 1]) for (const t of DIE) {
    // a block that sticks out `wide` px to one side of the body, from the shoulders to the hips (bigger than any real pack)
    const block = (J) => [Math.min(J.bx, J.bx + side * wide), J.shoulderY + 2, wide, J.hip[1] - J.shoulderY - 2];
    const F = T.frame('die', t, { height, build }, { far: (J) => { const [x, y, w, h] = block(J); return [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]; } });
    const g = new Surface(W, H);
    F.draw(g, LOOK, { behind: (gg, J) => gg.rect(...block(J), '#9aa6c0') });
    const b = F.finish(g).bounds();
    assert.ok(b.x0 > 0 && b.y0 > 0 && b.x1 < W - 1 && b.y1 < H - 1, `build ${build} height ${height}, ${wide} px to the ${side < 0 ? 'left' : 'right'}, frame ${Math.round(t * 7)}: ${JSON.stringify(b)}`);
  }
});

test('topdown rig: the lying layout is worked out when the pose is fitted: sockets are the same before and after drawing, and drawing does not change the pose', () => {
  let moved = 0;
  for (const kind of T.PACK_KINDS) for (const size of [0.65, 1, 1.35]) for (const build of [0, 0.16, 0.5, 1]) for (const height of [0, 0.5, 1]) for (const t of DIE) {
    const F = T.frame('die', t, { height, build }, { rise: T.packRise(kind, size), far: T.packFar(kind, size) });
    const before = JSON.stringify(F.sockets()), pose = JSON.stringify(F.P);
    const g = new Surface(W, H);
    F.draw(g, LOOK, { behind: (gg, J, P, d) => T.pack(gg, J, P, d, { kind, size }), front: (gg, J) => gg.rect(Math.floor(J.head[0]), Math.floor(J.head[1]), 1, 1, '#ff00ff') });
    assert.equal(JSON.stringify(F.P), pose, `${kind} ${size}: drawing changed the pose`);
    assert.equal(JSON.stringify(F.sockets()), before, `${kind} ${size}: sockets differ after drawing`);
    const b = F.finish(g).bounds();
    assert.ok(b.x0 > 0 && b.y0 > 0 && b.x1 < W - 1 && b.y1 < H - 1, `${kind} ${size} build ${build} height ${height} frame ${Math.round(t * 7)}: ${JSON.stringify(b)}`);
    if (!F.P.lie) continue;
    if (F.P.lieShift) moved++;
    // the head socket is level with the head that was drawn (a mark at its centre), wherever the body was moved to
    let mark = null;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g.get(x, y) === 0xffff00ff) mark = [x, y];
    assert.ok(mark && Math.abs(mark[1] + 0.5 - F.sockets().head.y) <= 1.5, `${kind} ${size}: the head socket (${F.sockets().head.y}) is not level with the head as drawn (${mark})`);
  }
  assert.ok(moved >= 4, `only ${moved} of these lying bodies had to be moved; the test needs some`);
  // with nothing described nothing is moved
  assert.equal(T.frame('die', 1, { build: 0 }, {}).P.lieShift, undefined);
});

test('topdown rig: in die the held thing goes down with the body in one path: no jump in where it is or the way it points between any two frames', () => {
  for (const [kind, carry] of [['sword', 'up'], ['spear', 'up'], ['gun', 'low'], ['cane', 'low'], ['staff', 'upright']]) for (const dimsOf of [{}, { height: 1, build: 1 }, { height: 0, build: 0 }]) {
    const at = DIE.map((t) => T.frame('die', t, dimsOf, { item: T.itemSize(kind, 1), carry }).sockets());
    for (let f = 1; f < 8; f++) {
      const a = at[f - 1], b = at[f];
      const turn = Math.abs(((b.hand.angle - a.hand.angle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI);
      const move = Math.hypot(b.hand.x - a.hand.x, b.hand.y - a.hand.y), tip = Math.hypot(b.muzzle.x - a.muzzle.x, b.muzzle.y - a.muzzle.y);
      assert.ok(turn <= 1.0, `${kind} ${JSON.stringify(dimsOf)} frame ${f - 1} to ${f}: it turns ${turn.toFixed(2)} rad`);
      assert.ok(move <= 12 && tip <= 14, `${kind} ${JSON.stringify(dimsOf)} frame ${f - 1} to ${f}: the hand moves ${move.toFixed(1)} px and the tip ${tip.toFixed(1)} px`);
    }
    // and it ends beside the body, not across it: the tip is clear of the head-to-feet line by at least 3 px
    const end = at[7];
    assert.ok(Math.abs(end.muzzle.y - end.back.y) >= 3, `${kind}: it ends lying across the body`);
  }
});

test('every sprite on the top-down rig: die stays inside the frame for 50 whole-bundle "shapes" looks', async () => {
  const onRig = onTheRig();
  assert.ok(onRig.includes('hero-walker'));
  for (const id of onRig) {
    const s = await codeSprite(id);
    if (!s.clips.die) continue;
    for (let seed = 0; seed < 50; seed++) {
      const p = themedParams(s, defaultParams(s), { ...defaultTheme(), seed, shapes: true });
      for (let f = 0; f < s.clips.die.frames; f++) {
        const b = renderFrame(s, 'die', f, p).bounds();
        assert.ok(b && b.x0 > 0 && b.y0 > 0 && b.x1 < W - 1 && b.y1 < H - 1, `${s.id} seed ${seed} die frame ${f} touches the edge: ${JSON.stringify(b)}`);
      }
    }
  }
});

test('every sprite on the top-down rig, 50 "shapes" looks: exported sockets do not depend on drawing first, and in die the hand socket is on the held thing', async () => {
  const { frameSockets, partList, partRemoved } = await import('../../engine/sprite.js');
  const onRig = onTheRig();
  assert.ok(onRig.length >= 9, `${onRig.length} sprites on the rig`);
  let held = 0;
  for (const id of onRig) {
    const s = await codeSprite(id);
    const hand = partList(s).find((part) => part.socket === 'hand');
    for (let seed = 0; seed < 50; seed++) {
      const p = themedParams(s, defaultParams(s), { ...defaultTheme(), seed, shapes: true });
      // every clip, three frames each: asked before the frame is drawn and again after it
      for (const clip of Object.keys(s.clips)) for (const f of new Set([0, Math.floor(s.clips[clip].frames / 2), s.clips[clip].frames - 1])) {
        const before = JSON.stringify(frameSockets(s, clip, f, p));
        renderFrame(s, clip, f, p);
        assert.equal(JSON.stringify(frameSockets(s, clip, f, p)), before, `${s.id} seed ${seed} ${clip} ${f}: sockets changed after drawing`);
      }
      if (!s.clips.die || !hand || partRemoved(s, hand.name, p) || hand.none === undefined) continue;
      const bare = { ...p, [hand.selector]: Array.isArray(hand.none) ? hand.none[0] : hand.none };
      for (let f = 1; f < s.clips.die.frames; f++) {
        const k = frameSockets(s, 'die', f, p), g = renderFrame(s, 'die', f, p), u = renderFrame(s, 'die', f, bare);
        assert.ok(g.get(Math.floor(k.hand.x), Math.floor(k.hand.y)) !== 0, `${s.id} seed ${seed} die ${f}: the hand socket is on nothing`);
        // the held thing is drawn from the hand towards the muzzle: near that line the picture differs from the empty-handed one
        let on = 0;
        for (const q of [0.3, 0.5, 0.7]) {
          const x = k.hand.x + (k.muzzle.x - k.hand.x) * q, y = k.hand.y + (k.muzzle.y - k.hand.y) * q;
          let hit = false;
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const X = Math.floor(x) + dx, Y = Math.floor(y) + dy; if (g.get(X, Y) !== 0 && g.get(X, Y) !== u.get(X, Y)) hit = true; }
          if (hit) on++;
        }
        assert.ok(on >= 2, `${s.id} seed ${seed} die ${f}: the held thing is not along the exported hand-to-muzzle line (${JSON.stringify(k.hand)})`);
        held++;
      }
    }
  }
  assert.ok(held >= 100, `${held} frames with something held were looked at`);
});
