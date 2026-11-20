// Writes sprites/bg-starfield.json: the starfield of the code sprite (tests/fixtures/code-sprites/bg-starfield.js) as
// data (migration batch M10), from build item B14's redraw of its planet and ringed planet with the Wreckage style, the
// colour controls and the code's labels put back. Its colours were named exactly from the start (clear.of@1 with way
// lighter and floor: the code's lighterThan and noDarkerThan). What it starts from is its own data file,
// tools/backdrops/bg-starfield.base.json (the palette and each layer's things; copied from B14's redraw in M10b, the
// space bands and the dust already as the code drew them, the planet's tones named "$body", "$lit", "$night", "$pale"
// and "$dim" and worked out here as the code's rules): edit that file, or this one. See tools/backdrops/lib.mjs.
import { rec, own, controlsFrom, slotFrom, head, tone, mix, haze, apart, polyP, rect } from './lib.mjs';
import { spots, ridgeOutline } from '../../engine/gen/backdrop.js';
import { hash } from '../../engine/motion.js';

const W = 320, H = 180;
/** space.look's `at` for the code's middle band of space (its mix of 0.3); base.json names it too. */
const MIDDLE = 0.44444444444444436;
export function definition(root) {
  const r = rec(root, 'bg-starfield');
  // the planet's tones as the code's tones(p), planet() and rings() worked them out: base.json names each as "$<name>"
  const AIR = { rule: 'space.look', v: 1, of: 'sky', deep: 'void', what: 'air' }, band = (at) => ({ rule: 'space.look', v: 1, of: 'sky', deep: 'void', at });
  const B0 = band(0), B1 = band(MIDDLE), B2 = band(1);
  // land: lighterThan(recede(land, 0.1, air), [bands[2]], { also: [bands[1]] }), the planet's body
  const body = apart('land', { air: AIR, depth: 0.1, behind: [B2], also: [B1], night: false, way: 'lighter' });
  // cloud: standOut(recede(haze, 0.74, air), bands)
  const cloud = { rule: 'clear.of', v: 1, of: haze('haze', 0.74, AIR), behind: [B0, B1, B2] };
  // the rings: pale = lighterThan(recede(mix(land tone, cream, 0.45), 0.25, air), [bands[1], bands[2]], { also: [cloud] }),
  // dim = noDarkerThan(lighterThan(tone(pale, -0.9), [bands[2]], { also: [bands[1]], step: 0.05 }), 0.19)
  const pale = apart(mix(body, 'cream', 0.45), { air: AIR, depth: 0.25, behind: [B1, B2], also: [cloud], night: false, way: 'lighter' });
  const dim = { rule: 'clear.of', v: 1, of: tone(pale, -0.9), behind: [B2], also: [B1], step: 0.05, way: 'lighter', floor: 0.19 };
  // planet(): lit = tone(body, 0.6) as it is, night = noDarkerThan(standOut(tone(body, -1), [body]), 0.19)
  const TONES = { body, lit: tone(body, 0.6), night: { rule: 'clear.of', v: 1, of: tone(body, -1), behind: [body], floor: 0.19 }, pale, dim };
  const named = (v) => {
    if (typeof v === 'string' && v.startsWith('$')) { if (!Object.hasOwn(TONES, v.slice(1))) throw new Error(`bg-starfield.base.json: no tone ${v}`); return TONES[v.slice(1)]; }
    if (Array.isArray(v)) return v.map(named);
    return v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, named(x)])) : v;
  };
  const base = named(own('bg-starfield.base.json'));
  const r2 = (v) => Math.round(v * 100) / 100;
  // a straight bar `width` px thick from one point to another, as a polygon (a limb's `from` would read as a binding here)
  const bar = (from, to, width, paint) => {
    const dx = to[0] - from[0], dy = to[1] - from[1], len = Math.hypot(dx, dy) || 1, nx = (-dy / len) * width / 2, ny = (dx / len) * width / 2;
    return polyP([[r2(from[0] + nx), r2(from[1] + ny)], [r2(to[0] + nx), r2(to[1] + ny)], [r2(to[0] - nx), r2(to[1] - ny)], [r2(from[0] - nx), r2(from[1] - ny)]], paint);
  };

  const near = { draw: base.near };
  // the dust of the middle layer is the code's lighterThan(recede(haze, 0.86, air), [], { also: [the lowest band], step:
  // 0.06 }): only a step lighter than the lowest band of space, no palette test against it (as in base.mid)
  // space in three flat bands as the code's fillBands drew them: rows 0, 66 and 124, the code's spaceLook mixes 0.1,
  // 0.3 and 0.55 of the sky into the dark (space.look's `at` 0, 4/9 and 1; MIDDLE is the double nearest 4/9 for which
  // space.look's lerp(0.1, 0.55, at) is exactly 0.3, so no channel rounds the other way at any sky)
  const look = (share) => ({ rule: 'space.look', v: 1, of: 'sky', deep: 'void', at: share });
  const farDraw = [rect(0, 0, W, 66, look(0)), rect(0, 66, W, 58, look(MIDDLE)), rect(0, 124, W, H - 124, look(1)), ...base.far];
  const limb = near.draw.find((d) => d.id === 'limb');
  const lit = tone(body, 0.6);
  const dark = { rule: 'clear.of', v: 1, of: tone(body, -0.8), behind: [body], floor: 0.2 };
  const PLANETS = { style: ['planet', 'ringed'] };
  limb.height = { from: 'style', pick: { planet: 13, ringed: 10, wreckage: 13 } };
  for (const d of near.draw) if (!d.when) d.when = PLANETS;

  // ---- wreckage (sprites/bg-starfield.js wreckage): everything seen against space is the body or the lit tone; the dark
  // tone is only a shaded face, a window slot or the underside of the scrap
  const plate = (x, y, w, h, turn, dy, hh) => {
    const c = Math.cos(turn), s = Math.sin(turn);
    return [[-w / 2, dy], [w / 2, dy], [w / 2, dy + hh], [-w / 2, dy + hh]].map(([u, v]) => [r2(x + u * c - v * s), r2(y + u * s + v * c)]);
  };
  const wreck = [];
  // loose plates tumbling above the scrap: each a small tilted slab; the thicker ones show a shaded lower half
  for (const s of spots(7, 21, { stable: true }, W)) {
    const w = 5 + Math.round(s.u * 7), h = 3 + Math.round(s.w * 3), y = 118 + Math.round(s.v * 34), turn = (hash(s.i, 31) - 0.5) * 1.6;
    for (const x of [s.x, ...(s.x + w + 2 > W ? [s.x - W] : []), ...(s.x - w - 2 < 0 ? [s.x + W] : [])]) {
      wreck.push(polyP(plate(x, y, w, h, turn, -h / 2, h), body));
      if (h >= 6) wreck.push(polyP(plate(x, y, w, h, turn, 0, h / 2), dark));
    }
  }
  // the slab of hull: a long box seen edge on, tilted, its top lit, dark windows, a lattice mast
  {
    const x = 86, [ax, ay, bx, by] = [x + 14.5, 106, x + 26.5, 150], len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len, nx = -uy, ny = ux;
    const at = (s, d) => [r2(ax + ux * s + nx * d), r2(ay + uy * s + ny * d)];
    wreck.push(bar(at(0, -3.5), at(len, -3.5), 2, lit));
    wreck.push(bar(at(0, 3.5), at(len, 3.5), 2, body));
    for (let s = 0, k = 0; s + 6 <= len; s += 6, k++) wreck.push(bar(at(s, k % 2 ? 3 : -3), at(s + 6, k % 2 ? -3 : 3), 1, body));
    wreck.push(polyP([[x - 52, 152], [x + 44, 140], [x + 50, 158], [x + 30, 180], [x - 40, 180]], body));
    wreck.push(polyP([[x - 52, 152], [x + 44, 140], [x + 45, 144], [x - 51, 156]], lit));
    wreck.push(polyP([[x + 40, 146], [x + 46, 158], [x + 28, 180], [x + 22, 180], [x + 36, 160]], dark));
    for (let i = 0; i < 5; i++) wreck.push(rect(x - 38 + i * 14, 160 - Math.round(i * 1.75), 6, 4, dark));
  }
  // the length of a station's ring: an arc of a wheel standing out of the scrap on two spokes, shaded along its inner side
  {
    const x = 246, deg = (a) => r2((a * 180) / Math.PI);
    wreck.push(bar([x - 8, H], [x - 22, 132], 3, body));
    wreck.push(bar([x + 12, H], [x + 26, 126], 3, body));
    // the rim, 11 px thick, as two arcs (a written arc is at most 8 px thick)
    for (const [rr, th] of [[75, 5], [80, 6]]) wreck.push({ kind: 'arc', at: [x, 196], r: rr, a0: deg(Math.PI * 0.76), a1: deg(Math.PI * 1.2), thick: th, paint: body });
    wreck.push({ kind: 'arc', at: [x, 196], r: 82, a0: deg(Math.PI * 0.76), a1: deg(Math.PI * 1.2), thick: 3, paint: lit });
    wreck.push({ kind: 'arc', at: [x, 196], r: 76, a0: deg(Math.PI * 0.76), a1: deg(Math.PI * 1.2), thick: 3, paint: dark });
  }
  // the scrap field: a strip across the whole bottom edge, broken and sharp, with bigger plates stuck in it at all angles
  const scrapArgs = { base: 168, height: 10, seed: 12, peaks: 6, shape: 'jagged', rough: 0.9 };
  wreck.push({ gen: 'ridge', v: 1, ...scrapArgs, paint: body });
  const scrap = ridgeOutline(scrapArgs, W);
  for (const s of spots(6, 33, { jitter: 0.5 }, W)) {
    const w = 9 + Math.round(s.u * 7), h = 5 + Math.round(s.w * 3), y = Math.round(scrap(s.x)) + 1, turn = (s.v - 0.5) * 1.5;
    for (const x of [s.x, ...(s.x + w + 2 > W ? [s.x - W] : []), ...(s.x - w - 2 < 0 ? [s.x + W] : [])]) {
      wreck.push(polyP(plate(x, y, w, h, turn, -h / 2, h), body));
      wreck.push(polyP(plate(x, y, w, h, turn, -h / 2, 3), lit));
    }
  }
  wreck.push(rect(0, 175, W, 5, dark));
  near.draw.push({ gen: 'tidy', v: 1, when: { style: ['wreckage'] }, most: 300, draw: wreck });

  const palette = base.palette.map((p) => (r.params[p.id] ? { ...slotFrom(r, p.id, p.material) } : p));
  return {
    ...head(r),
    palette,
    controls: controlsFrom(r),
    body: { layers: [
      { name: 'far', label: 'Far', scroll: 0.1, draw: [{ gen: 'tidy', v: 1, most: 300, draw: farDraw }] },
      { name: 'mid', label: 'Middle', scroll: 0.4, draw: base.mid },
      { name: 'near', label: 'Near', scroll: 0.7, draw: near.draw },
    ] },
    clips: { far: { label: 'Far', frames: 1, fps: 4 }, mid: { label: 'Middle', frames: 8, fps: 4 }, near: { label: 'Near', frames: 1, fps: 4 } },
  };
}
