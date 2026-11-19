// Framework addition made with batch K18 fix round 1 (bundles/specs/core-sprites-2.md, icons-map "badge"
// style at low Size): iconBadgeStem in engine/icons-badge-stem.js, a badge pin whose point can be shortened
// so a small badge keeps its head (and the picture on it) big enough to read at 1x.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { PALETTE } from '../../engine/palettes.js';
import { iconPen } from '../../engine/icons.js';
import { iconBadgePin } from '../../engine/icons-badge.js';
import { iconBadgeStem, BADGE_STEM_TIP } from '../../engine/icons-badge-stem.js';

const T = PALETTE.thornwood;
const pen = () => iconPen({ tilt: false, angle: 0, shade: false, shine: true, cx: 16, cy: 16, scale: 1, span: [1, 1] });
const lowest = (g) => g.bounds().y1;
const rowsAbove = (g, y) => Array.from(g.data.slice(0, y * g.w), (v) => (v ? 1 : 0));

test('iconBadgeStem with the default tip draws exactly what iconBadgePin draws', () => {
  const a = new Surface(32, 32), b = new Surface(32, 32);
  const pa = iconBadgePin(a, pen(), { colour: T.crimson, face: T.cream });
  const pb = iconBadgeStem(b, pen(), { colour: T.crimson, face: T.cream });
  assert.deepEqual(b.data, a.data);
  assert.deepEqual(pb.plate, pa.plate);
  assert.equal(BADGE_STEM_TIP, 11.5);
});

test('a shorter tip shortens only the point: the head and plate stay as they are', () => {
  const a = new Surface(32, 32), b = new Surface(32, 32);
  const pa = iconBadgeStem(a, pen(), { colour: T.crimson, face: T.cream });
  const pb = iconBadgeStem(b, pen(), { colour: T.crimson, face: T.cream, tip: 8 });
  assert.deepEqual(pb.plate, pa.plate);
  assert.ok(lowest(b) < lowest(a), 'the point ends higher');
  // the shape above the head's bottom row is the same (its shading follows the whole body, so may shift a tone)
  const head = Math.floor(16 + (pa.plate.y + 9));
  assert.deepEqual(rowsAbove(b, head), rowsAbove(a, head));
});

test('iconBadgeStem refuses a tip inside the head and missing colours', () => {
  assert.throws(() => iconBadgeStem(new Surface(32, 32), pen(), { colour: T.crimson, face: T.cream, tip: 6 }), /tip/);
  assert.throws(() => iconBadgeStem(new Surface(32, 32), pen(), { colour: T.crimson }), /colour/);
});
