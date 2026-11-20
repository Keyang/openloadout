// engine/gen/port-surface.js, the paint-ref grid the M9 port generators draw on (review M9 round 1, issue 9): a tile of
// a grid that holds more paints than one stamp's key can name must fail loudly, never come back with pixels dropped;
// and engine/gen/ports/ui.js desaturate (issue 8) means what its name says: the grey of a colour, as a colour rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PortSurface, withPaintTable } from '../../engine/gen/port-surface.js';
import { desaturate, ungreyed } from '../../engine/gen/ports/ui.js';

const paints = (n) => Array.from({ length: n }, (_, i) => ({ rule: 'tone', of: 'body', by: Math.round((i / n) * 200) / 100 - 1 }));

test('a tile with at most 62 paints comes back whole, every painted pixel in the stamp', () => {
  withPaintTable(() => {
    const g = new PortSurface(32, 32);
    paints(62).forEach((p, i) => g.dot(i % 32, Math.floor(i / 32), p));
    const out = g.stamps();
    assert.equal(out.length, 1);
    const painted = out[0].rows.join('').replace(/\./g, '').length;
    assert.equal(painted, 62);
    assert.equal(Object.keys(out[0].key).length, 62);
  });
});

test('a tile with a 63rd paint throws, naming the limit, instead of dropping pixels', () => {
  withPaintTable(() => {
    const g = new PortSurface(32, 32);
    paints(63).forEach((p, i) => g.dot(i % 32, Math.floor(i / 32), p));
    assert.throws(() => g.stamps(), /62 paints/);
  });
  // the same 63 paints spread over two tiles are fine: the limit is per stamp
  withPaintTable(() => {
    const g = new PortSurface(64, 32);
    paints(63).forEach((p, i) => g.dot(i < 40 ? i % 32 : 32 + (i % 32), i < 40 ? Math.floor(i / 32) : 5, p));
    assert.equal(g.stamps().length, 2);
  });
});

test('desaturate gives the grey colour rule of its paint; ungreyed is the explicit no-op the version 1 card keeps', () => {
  assert.deepEqual(desaturate('face'), { rule: 'grey', of: 'face' });
  assert.deepEqual(desaturate({ rule: 'tone', of: 'face', by: 0.3 }), { rule: 'grey', of: { rule: 'tone', of: 'face', by: 0.3 } });
  assert.deepEqual(desaturate('#ffffff'), { rule: 'grey', of: { rule: 'mix', of: '#ffffff', with: '#ffffff', amount: 0 } });
  assert.equal(desaturate('clear'), 'clear');
  assert.equal(ungreyed('face'), 'face');
});

// review M9 round 2, issue 2: a port's attach points come with its measure, moved with `at` and worked out per frame
test('a port measure gives its attach points moved by `at`, per frame (the battle menu cursor slides), and none where the code had none', async () => {
  const { movePoints } = await import('../../engine/gen/port-sprite.js');
  const { PORT_MEASURES } = await import('../../engine/gen/port-measures.js');
  assert.deepEqual(movePoints({ tip: { x: 1, y: 2, angle: 0.5 }, bad: { x: NaN, y: 0 } }, [10, -1]), { tip: { x: 11, y: 1, angle: 0.5 } });
  const m = PORT_MEASURES['battle.menu@1'];
  const call = (picture, at, frame) => m({ at, picture, style: 'plain', corner: 0.5, border: 0.5, face: 'face', frame: 'frame', accent: 'accent' }, { frame });
  const tips = [0, 1, 2, 3, 4, 5, 6, 7].map((f) => call('cursor', [48, 32], f).points.tip);
  assert.ok(new Set(tips.map((t) => t.x)).size > 1, 'the tip slides with the arrow');
  assert.ok(tips.every((t) => t.y === 32.5 && Math.abs(t.angle - Math.PI / 2) < 1e-12));
  assert.deepEqual(call('cursor', [58, 30], 3).points.tip, { ...tips[3], x: tips[3].x + 10, y: tips[3].y - 2 });
  assert.equal(call('panel', [48, 32], 0).points, undefined);
});
