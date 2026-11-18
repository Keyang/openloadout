// The end of `die` on the top-down rig: a body lying down with whatever it wears and holds stays inside the frame,
// for every sprite built on the rig and every look a whole-bundle "shapes" theme can give it; and the held thing
// goes down with the body in one path, without jumping from one side to the other.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Surface } from '../../engine/surface.js';
import { INK } from '../../engine/color.js';
import { defaultParams, renderFrame } from '../../engine/sprite.js';
import { themedParams, defaultTheme } from '../../engine/theme.js';
import * as T from '../../rigs/topdown.js';

const [W, H] = T.SIZE;
const LOOK = { skin: '#f6d3b0', top: '#3f6fd1', bottom: '#2c4a8a', boots: '#9a6a3e', hair: '#5a3a22', hairStyle: 'short' };
const DIE = Array.from({ length: 8 }, (_, f) => f / 7);

test('topdown rig: a lying body with something big on its back or arm (a pack, a shield) never touches the frame edge, at any build', () => {
  for (const build of [0, 0.16, 0.5, 1]) for (const height of [0, 0.23, 1]) for (const wide of [6, 9, 12]) for (const side of [-1, 1]) for (const t of DIE) {
    const F = T.frame('die', t, { height, build }, {});
    const g = new Surface(W, H);
    // a block that sticks out `wide` px to one side of the body, from the shoulders to the hips (bigger than any real pack)
    F.draw(g, LOOK, { behind: (gg, J) => gg.rect(Math.min(J.bx, J.bx + side * wide), J.shoulderY + 2, wide, J.hip[1] - J.shoulderY - 2, '#9aa6c0') });
    const b = F.finish(g).bounds();
    assert.ok(b.x0 > 0 && b.y0 > 0 && b.x1 < W - 1 && b.y1 < H - 1, `build ${build} height ${height}, ${wide} px to the ${side < 0 ? 'left' : 'right'}, frame ${Math.round(t * 7)}: ${JSON.stringify(b)}`);
  }
});

test('topdown rig: sockets asked of the frame that was drawn follow a lying body that had to be moved into the frame', () => {
  const F = T.frame('die', 1, { height: 0.23, build: 0.16 }, {}), g = new Surface(W, H);
  const before = T.frame('die', 1, { height: 0.23, build: 0.16 }, {}).sockets();
  F.draw(g, LOOK, { behind: (gg, J) => gg.rect(J.bx, J.shoulderY + 2, 12, 8, '#9aa6c0'), front: (gg, J) => gg.rect(Math.floor(J.head[0]), Math.floor(J.head[1]), 1, 1, '#ff00ff') });
  const s = F.sockets();
  assert.ok(s.head.y < before.head.y, 'the body was lifted, and its sockets with it');
  let mark = null;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g.get(x, y) === (0xff000000 | (0xff << 16) | 0xff) >>> 0) mark = [x, y];
  assert.ok(mark, 'the mark on the head is drawn');
  assert.ok(Math.abs(mark[1] + 0.5 - s.head.y) <= 1.5, `the head socket (${s.head.y}) is not level with the head that was drawn (${mark[1]})`);
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
  const dir = new URL('../../sprites/', import.meta.url);
  const onRig = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && /rigs\/topdown(-[\w-]+)?\.js/.test(fs.readFileSync(new URL(f, dir), 'utf8')));
  assert.ok(onRig.includes('hero-walker.js'));
  for (const file of onRig) {
    const s = (await import(new URL(file, dir).href)).default;
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
