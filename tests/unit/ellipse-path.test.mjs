// engine/ellipse-path.js: points spaced evenly along an ellipse by distance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ellipseTurn, ellipseLength } from '../../engine/ellipse-path.js';
import { TAU } from '../../engine/motion.js';

const at = (rx, ry, u) => { const a = ellipseTurn(rx, ry, u); return [Math.cos(a) * rx, Math.sin(a) * ry]; };

test('ellipseTurn starts at angle 0, passes the quarter points at quarters, and wraps', () => {
  assert.ok(Math.abs(ellipseTurn(8, 2, 0)) < 1e-9);
  for (const q of [0.25, 0.5, 0.75]) assert.ok(Math.abs(ellipseTurn(8, 2, q) - TAU * q) < 0.02, `u=${q}`);
  assert.ok(Math.abs(ellipseTurn(8, 2, 1.3) - ellipseTurn(8, 2, 0.3)) < 1e-9);
  assert.ok(Math.abs(ellipseTurn(8, 2, -0.7) - ellipseTurn(8, 2, 0.3)) < 1e-9);
});

test('ellipseTurn on a circle is the plain angle', () => {
  for (const u of [0, 0.1, 0.37, 0.9]) assert.ok(Math.abs(ellipseTurn(5, 5, u) - TAU * u) < 1e-12);
});

test('even steps of u give even gaps along a flat ellipse, unlike even steps of angle', () => {
  const rx = 10, ry = 2, n = 12;
  const gaps = (pt) => { const g = []; for (let i = 0; i < n; i++) { const [x0, y0] = pt(i / n), [x1, y1] = pt((i + 1) / n); g.push(Math.hypot(x1 - x0, y1 - y0)); } return g; };
  const even = gaps((u) => at(rx, ry, u));
  const byAngle = gaps((u) => [Math.cos(TAU * u) * rx, Math.sin(TAU * u) * ry]);
  const spread = (g) => Math.max(...g) / Math.min(...g);
  assert.ok(spread(even) < 1.1, `even spread ${spread(even)}`);
  assert.ok(spread(byAngle) > 2, `angle spread ${spread(byAngle)}`);
});

test('ellipseLength matches the circle and a known flat ellipse', () => {
  assert.ok(Math.abs(ellipseLength(4, 4) - TAU * 4) < 1e-9);
  // Ramanujan's approximation for rx 10, ry 2: about 42.01
  assert.ok(Math.abs(ellipseLength(10, 2) - 42.01) < 0.1, String(ellipseLength(10, 2)));
  assert.equal(ellipseLength(0, 3), 0);
});
