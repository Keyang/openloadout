// Framework additions of the K17 fix round, in engine/icons-craft.js: second takes on icon shapes that read
// poorly at 1x in their first takes (engine/icons-more.js, unchanged), and iconApart for metal on a handle.
//   iconMushroomPlain, iconRoll, iconPelt, iconNuggets, iconAxe, iconApart
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { INK, brightness, col, ramp } from '../../engine/color.js';
import { PALETTE } from '../../engine/palettes.js';
import { ICON_SIZE, ICON_LEAN, ICON_DIAGONAL, iconFit, iconTidy } from '../../engine/icons.js';
import { iconMushroomPlain, iconRoll, iconPelt, iconNuggets, iconAxe, iconApart } from '../../engine/icons-craft.js';

const T = PALETTE.thornwood, H = PALETTE.hearthvale;
const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const colours = (g) => new Set([...g.data].filter(Boolean)).size;
function fit(draw, { size = 0.5, tilt = true, angle = ICON_LEAN, shade = true, shine = true } = {}) {
  const g = new Surface(...ICON_SIZE);
  iconFit(g, { size, tilt, angle, shade, shine }, (s, pen) => { draw(s, pen); iconTidy(s).outline(INK); });
  return g;
}
const shapes = {
  mushroom: (g, pen) => iconMushroomPlain(g, pen, { cap: T.soil, stem: T.cream }),
  roll: (g, pen) => iconRoll(g, pen, { cloth: T.hero, core: T.wood }),
  pelt: (g, pen) => iconPelt(g, pen, { hide: T.hero }),
  ore: (g, pen) => iconNuggets(g, pen, { stone: T.stone, metal: T.steel }),
  axe: (g, pen) => iconAxe(g, pen, { metal: T.steel, wood: T.wood, grip: T.crimson }),
};

test('every shape fits the icon sizes, keeps the empty border and stays within ten colours', () => {
  for (const [name, draw] of Object.entries(shapes)) for (const tilt of [true, false]) for (const [size, want] of [[0, 20], [0.5, 23], [1, 26]]) {
    const g = fit(draw, { size, tilt, angle: name === 'axe' ? ICON_DIAGONAL : ICON_LEAN }), b = g.bounds();
    assert.ok(Math.abs(Math.max(b.x1 - b.x0, b.y1 - b.y0) + 1 - want) <= 1, `${name} size ${size}`);
    assert.ok(b.x0 >= 1 && b.y0 >= 1 && b.x1 <= 30 && b.y1 <= 30, `${name} touches the border`);
    assert.ok(colours(g) <= 10 && colours(g) >= 3, `${name}: ${colours(g)} colours`);
  }
});

test('same arguments, same pixels; shine changes the picture', () => {
  for (const [name, draw] of Object.entries(shapes)) {
    assert.deepEqual(fit(draw).data, fit(draw).data, name);
    const a = fit(draw), b = fit(draw, { shine: false });
    assert.ok(a.data.some((v, i) => v !== b.data[i]), `${name}: shine does nothing`);
  }
});

test('the roll and the pelt have different silhouettes', () => {
  const a = fit(shapes.roll), b = fit(shapes.pelt);
  let differ = 0;
  for (let i = 0; i < a.data.length; i++) if (!!a.data[i] !== !!b.data[i]) differ++;
  assert.ok(differ >= 0.15 * Math.max(lit(a), lit(b)), `only ${differ} pixels differ`);
});

test('the ore nuggets are brighter than the rock and need both colours', () => {
  assert.throws(() => iconNuggets(new Surface(32, 32), {}, { stone: T.stone }), /needs/);
  const g = fit(shapes.ore), metal = [col(T.steel), col(ramp(T.steel).light)];
  assert.ok(g.data.filter((v) => metal.includes(v)).length >= 12, 'three nuggets of at least 4 px each');
  assert.ok(brightness(ramp(T.steel).light) > brightness(T.stone) + 0.15);
});

test('iconApart leaves a metal that already stands apart and moves one that does not', () => {
  assert.equal(iconApart(T.steel, T.wood), T.steel);
  const r = iconApart(H.rust, T.wood);
  assert.notEqual(r, H.rust);
  assert.ok(Math.abs(brightness(r) - brightness(T.wood)) >= 0.16);
  for (const h of [T.wood, T.soil, '#a8612a', '#c98a4a', T.cream]) for (const m of [T.steel, T.gold, T.slate, H.rust, '#e6c545']) {
    assert.ok(Math.abs(brightness(iconApart(m, h)) - brightness(h)) >= 0.16 || brightness(iconApart(m, h)) >= 0.22, `${m} on ${h}`);
  }
});
