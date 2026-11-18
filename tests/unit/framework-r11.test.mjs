// Framework additions of batch R11 (cottage, inn): building pieces seen from the south in
// three-quarter view (engine/buildings.js), swatch lists kept to a brightness band
// (swatchesBetween in engine/palettes.js) and a layer cleaned of stray pixels (despeckle in engine/surface.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface, despeckle } from '../../engine/surface.js';
import { col, ramp, brightness, INK } from '../../engine/color.js';
import { PALETTE, swatches, swatchesBetween } from '../../engine/palettes.js';
import { smoke } from '../../engine/fx.js';
import {
  ROOF_KINDS, roofShape, pitchedRoof, timberWall, plankDoor, paneWindow, lampGlow,
  chimneyStack, chimneySmoke, hangingSign, inkOver,
  doorSwing, doorStep, candleFlicker, litWindow, houseColours,
} from '../../engine/buildings.js';

const P = PALETTE.hearthvale;
const count = (g, hex) => { const c = col(hex); return g.data.reduce((n, v) => n + (v === c ? 1 : 0), 0); };
const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);
const draw = (fn, w = 96, h = 96) => { const g = new Surface(w, h); fn(g); return g; };

test('roofShape: every kind stays near its box, is widest at the eave, and has its own outline', () => {
  const box = { x: 10, y: 20, w: 70, h: 30 };
  const masks = {};
  for (const kind of ROOF_KINDS) {
    const s = roofShape({ ...box, kind });
    let n = 0, mask = '';
    const width = (py) => { let k = 0; for (let x = 0; x < 96; x++) if (s.inside(x + 0.5, py + 0.5)) k++; return k; };
    for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
      const on = s.inside(x + 0.5, y + 0.5);
      mask += on ? '1' : '0';
      if (!on) continue;
      n++;
      assert.ok(x >= box.x && x < box.x + box.w, `${kind}: column ${x} is outside the box`);
      assert.ok(y >= box.y - 4 && y < box.y + box.h + 3, `${kind}: row ${y} is more than a ridge cap or a tuft outside the box`);
    }
    assert.ok(n > box.w * box.h * 0.6, `${kind}: covers most of its box (${n})`);
    assert.ok(width(box.y + box.h - 4) > width(box.y + 2), `${kind}: wider at the eave than at the ridge`);
    assert.equal(width(box.y + box.h - 4), box.w, `${kind}: the eave spans the whole box`);
    const [ax, ay] = s.at(0.5, 0.5);
    assert.ok(s.inside(ax, ay), `${kind}: at(0.5, 0.5) is on the roof`);
    assert.ok(s.eave === box.y + box.h && s.ridge === box.y);
    masks[kind] = mask;
  }
  assert.equal(new Set(Object.values(masks)).size, ROOF_KINDS.length, 'every kind has a different outline');
  assert.throws(() => roofShape({ ...box, kind: 'glass' }), /thatch, tile, slate/);
});

test('pitchedRoof: three tones of its colour, a texture of its own per kind, ink only where it lies over something', () => {
  const tones = ramp(P.roof);
  const pictures = [];
  for (const kind of ROOF_KINDS) {
    const g = draw((g) => pitchedRoof(g, { x: 10, y: 20, w: 70, h: 30, kind, colour: P.roof }));
    for (const k of ['light', 'base', 'dark']) assert.ok(count(g, tones[k]) > 12, `${kind}: uses the ${k} tone`);
    assert.equal(count(g, INK), 0, `${kind}: no ink on an empty surface (the sprite's outline does the silhouette)`);
    assert.equal(lit(g), count(g, tones.light) + count(g, tones.base) + count(g, tones.dark), `${kind}: nothing but the three tones`);
    pictures.push(g);
    // over a wall: an ink line where the eave crosses it, and nowhere else
    const over = draw((g) => { g.rect(14, 40, 62, 40, P.cream); pitchedRoof(g, { x: 10, y: 20, w: 70, h: 30, kind, colour: P.roof }); });
    const ink = count(over, INK);
    assert.ok(ink >= 55 && ink <= 80, `${kind}: an ink line along the eave over the wall (${ink})`);
    for (let x = 0; x < 96; x++) for (let y = 0; y < 40; y++) assert.notEqual(over.get(x, y), col(INK), `${kind}: no ink above the wall at ${x}, ${y}`);
  }
  assert.ok(!same(pictures[0], pictures[1]) && !same(pictures[1], pictures[2]) && !same(pictures[0], pictures[2]));
});

test('timberWall: a solid plaster face framed by beams, with posts where asked', () => {
  const wood = ramp(P.wood);
  const g = draw((g) => timberWall(g, { x: 16, y: 50, w: 64, h: 40, wall: P.cream, wood: P.wood, posts: [40], rails: [70], braces: [[20, 68, 36, 54]] }));
  for (let y = 50; y < 90; y++) for (let x = 16; x < 80; x++) assert.ok(g.get(x, y), `hole at ${x}, ${y}`);
  assert.equal(lit(g), 64 * 40, 'nothing outside the box');
  assert.ok(count(g, P.cream) > 64 * 40 * 0.4, 'mostly plaster');
  for (const x of [17, 78, 41]) assert.equal(g.get(x, 60), col(wood.base), `a post at column ${x}`);
  assert.equal(g.get(30, 71), col(wood.base), 'the rail');
  assert.equal(g.get(30, 88), col(wood.base), 'the sill beam');
  const plain = draw((g) => timberWall(g, { x: 16, y: 50, w: 64, h: 40, wall: P.cream, wood: P.wood }));
  assert.ok(!same(g, plain));
  // the shadow under the eave
  const shaded = draw((g) => timberWall(g, { x: 16, y: 50, w: 64, h: 40, wall: P.cream, wood: P.wood, eave: 54 }));
  assert.equal(shaded.get(40, 55), col(ramp(P.cream).dark));
});

test('plankDoor: shut it is all wood; opening shows more and more of the dark doorway', () => {
  const dark = '#2a2440';
  const at = (open, leaves = 1) => draw((g) => plankDoor(g, { x: 30, y: 40, w: 18 + (leaves - 1) * 10, h: 30, wood: P.wood, open, leaves, inside: dark, floor: P.path, knob: P.gold }));
  const shut = at(0);
  assert.equal(count(shut, dark), 0, 'no doorway shows when shut');
  assert.equal(lit(shut), 18 * 30, 'fills its box');
  assert.ok(count(shut, P.gold) >= 2, 'a knob');
  let last = 0;
  for (const open of [0.25, 0.5, 0.75, 1]) {
    const n = count(at(open), dark);
    assert.ok(n > last, `open ${open} shows more doorway (${n}) than before (${last})`);
    last = n;
  }
  assert.ok(last > 14 * 28 * 0.55, `wide open is mostly doorway (${last})`);
  assert.ok(count(at(1), P.path) >= 8, 'the floor inside shows at the threshold');
  // two leaves part in the middle: the doorway is mirror-symmetric
  const two = at(1, 2);
  for (let y = 40; y < 70; y++) for (let k = 0; k < 14; k++) assert.equal(two.get(30 + k, y) === col(dark), two.get(30 + 27 - k, y) === col(dark), `double door symmetric at row ${y}, column ${k}`);
  const box = plankDoor(new Surface(96, 96), { x: 30, y: 40, w: 18, h: 30, wood: P.wood });
  assert.deepEqual(box, { x: 32, y: 42, w: 14, h: 28 });
});

test('paneWindow: dark glass by day, glowing panes when lit, and the light grows with `lit`', () => {
  const glass = P.slate;
  const day = draw((g) => paneWindow(g, { x: 20, y: 20, w: 13, h: 13, wood: P.wood, glass }));
  assert.ok(count(day, glass) >= 30, 'glass panes');
  assert.equal(count(day, P.thunder), 0);
  for (let y = 20; y < 33; y++) for (let x = 20; x < 33; x++) assert.ok(day.get(x, y), `hole at ${x}, ${y}`);
  const dim = draw((g) => paneWindow(g, { x: 20, y: 20, w: 13, h: 13, wood: P.wood, glass, lit: 0.4, glow: P.thunder }));
  const full = draw((g) => paneWindow(g, { x: 20, y: 20, w: 13, h: 13, wood: P.wood, glass, lit: 1, glow: P.thunder }));
  assert.equal(count(full, glass), 0, 'no dark glass left when lit');
  assert.ok(count(full, P.thunder) + count(dim, P.thunder) > 20, 'the glow colour shows');
  const mean = (g) => { let s = 0, n = 0; for (let y = 22; y < 31; y++) for (let x = 22; x < 31; x++) { const v = g.get(x, y); s += brightness('#' + [v & 255, (v >> 8) & 255, (v >> 16) & 255].map((c) => c.toString(16).padStart(2, '0')).join('')); n++; } return s / n; };
  assert.ok(mean(full) > mean(dim) && mean(dim) > mean(day) + 0.2, `lit panes are brighter: ${mean(day)} < ${mean(dim)} < ${mean(full)}`);
});

test('lampGlow: tints only the pixels of one colour near a box, more of them when brighter', () => {
  const base = (g) => { g.rect(0, 0, 60, 60, P.cream); g.rect(20, 20, 12, 12, P.wood); };
  const none = draw(base);
  const glowAt = (r) => draw((g) => { base(g); lampGlow(g, { x: 20, y: 20, w: 12, h: 12, r, over: P.cream, colour: P.thunder }); });
  const a = glowAt(1), b = glowAt(3);
  assert.equal(count(a, P.wood), count(none, P.wood), 'the window itself is untouched');
  const changed = (g) => g.data.reduce((n, v, i) => n + (v !== none.data[i] ? 1 : 0), 0);
  assert.ok(changed(a) >= 40 && changed(b) > changed(a));
  for (let i = 0; i < b.data.length; i++) if (b.data[i] !== none.data[i]) assert.ok(none.data[i] === col(P.cream));
});

test('chimneyStack: a stone stack with a cap, inked where it stands on the roof; it returns where the smoke starts', () => {
  const g = draw((g) => { g.rect(10, 30, 70, 30, P.roof); });
  const top = chimneyStack(g, { x: 60, y: 20, w: 8, h: 20, stone: P.cobble });
  assert.deepEqual(top, { x: 60, y: 20 });
  assert.ok(count(g, P.cobble) > 30);
  assert.ok(count(g, INK) >= 12, 'inked over the roof');
  for (let y = 0; y < 30; y++) for (let x = 0; x < 96; x++) assert.notEqual(g.get(x, y), col(INK), 'no ink above the roof: the outline does that');
  for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) if (g.get(x, y) && y < 30) assert.ok(x >= 55 && x < 65, `column ${x}`);
});

test('chimneySmoke: a loop that closes, keeps off the frame edge and is never the same two frames running', () => {
  const at = (t) => draw((g) => chimneySmoke(g, { t, x: 60, y: 18, colour: P.cobble }));
  assert.ok(same(at(0), at(1)), 't = 0 and t = 1 match');
  let seen = 0;
  for (let i = 0; i < 8; i++) {
    const g = at(i / 8);
    seen += lit(g) > 0 ? 1 : 0;
    assert.ok(!same(g, at((i + 1) / 8)), `frame ${i} differs from the next`);
    for (let k = 0; k < 96; k++) assert.ok(!g.get(k, 0) && !g.get(0, k) && !g.get(95, k) && !g.get(k, 95));
  }
  assert.ok(seen >= 7, 'smoke in nearly every frame');
});

test('hangingSign: a board on a bracket; it swings from its top, and its picture is drawn on it', () => {
  let called = 0;
  const sign = (swing, picture = (s, cx, cy) => { called++; s.rect(cx - 2, cy - 2, 4, 4, P.cream); }) => draw((g) => {
    g.rect(0, 0, 96, 96, P.cream);
    hangingSign(g, { x: 40, y: 30, arm: 12, w: 11, h: 10, swing, iron: P.slate, board: P.gold, frame: P.wood, picture });
  });
  const still = sign(0), right = sign(2), left = sign(-2);
  assert.ok(called >= 3);
  assert.ok(count(still, P.gold) > 30 && count(still, P.slate) >= 12 && count(still, P.wood) >= 14);
  assert.ok(count(still, INK) >= 30, 'inked against the wall behind it');
  assert.ok(!same(still, right) && !same(right, left));
  const xs = (g, y) => { const r = []; for (let x = 0; x < 96; x++) if (g.get(x, y) === col(P.gold)) r.push(x); return r; };
  const bottom = (g) => { for (let y = 95; y >= 0; y--) if (xs(g, y).length) return y; return -1; };
  assert.ok(Math.min(...xs(right, bottom(right))) > Math.min(...xs(left, bottom(left))), 'the bottom edge moves with the swing');
  // nothing drawn outside what is already there gets an ink rim: on an empty surface there is no ink
  const bare = draw((g) => hangingSign(g, { x: 40, y: 30, arm: 12, w: 11, h: 10, iron: P.slate, board: P.gold, frame: P.wood }));
  assert.equal(count(bare, INK), 0);
});

test('inkOver: inks the rim of a shape only where something is already drawn', () => {
  const g = draw((g) => g.rect(0, 0, 20, 96, P.cream));
  const n = inkOver(g, 10, 10, 40, 30, (px, py) => px >= 10 && px < 40 && py >= 10 && py < 30, INK);
  assert.equal(count(g, INK), n);
  assert.ok(n >= 20 + 10 * 2 && n <= 20 + 10 * 2 + 2, `left side and the two runs to column 19 (${n})`);
  for (let y = 0; y < 96; y++) for (let x = 20; x < 96; x++) assert.equal(g.get(x, y), 0);
});

test('swatchesBetween: palette colours first, all inside the brightness band, 4 to 8 of them', () => {
  const walls = swatchesBetween('hearthvale', ['stone', 'haze'], { lead: 'cream', min: 0.6 });
  const beams = swatchesBetween('hearthvale', ['wood', 'roof'], { lead: 'wood', max: 0.5 });
  assert.equal(walls[0], P.cream);
  assert.equal(beams[0], P.wood);
  for (const list of [walls, beams]) {
    assert.ok(list.length >= 4 && list.length <= 8, `${list.length} swatches`);
    assert.equal(new Set(list).size, list.length);
  }
  for (const c of walls) assert.ok(brightness(c) >= 0.6, `${c} is light enough`);
  for (const c of beams) assert.ok(brightness(c) <= 0.5 && brightness(c) >= 0.18, `${c} is dark enough and not an outline`);
  for (const c of walls) assert.ok(!beams.includes(c), 'two touching materials never share a swatch');
  // one material and no band is plain swatches()
  assert.deepEqual(swatchesBetween('hearthvale', 'roof', { lead: 'wheat' }), swatches('hearthvale', 'roof', { lead: 'wheat' }));
  assert.throws(() => swatchesBetween('hearthvale', ['stone'], { min: 0.99 }), /fewer than 3/);
  assert.throws(() => swatchesBetween('hearthvale', ['stone'], { lead: 'slate', min: 0.6 }), /outside/);
});

// ---- fix round 1: what cottage and inn both did by hand now lives in the framework ----

// the sizes of the groups of touching pixels (side by side or one above the other) on a Surface
function groups(g) {
  const seen = new Uint8Array(g.w * g.h), sizes = [];
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    if (seen[y * g.w + x] || !g.get(x, y)) continue;
    let n = 0;
    const todo = [[x, y]];
    seen[y * g.w + x] = 1;
    while (todo.length) {
      const [a, b] = todo.pop();
      n++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const u = a + dx, v = b + dy;
        if (u < 0 || v < 0 || u >= g.w || v >= g.h || seen[v * g.w + u] || !g.get(u, v)) continue;
        seen[v * g.w + u] = 1;
        todo.push([u, v]);
      }
    }
    sizes.push(n);
  }
  return sizes;
}

test('despeckle: groups of touching pixels smaller than `min` are left out; the rest and the source are untouched', () => {
  const src = draw((g) => {
    g.dot(5, 5, P.cobble);                                   // 1 px
    g.rect(10, 5, 2, 1, P.cobble); g.dot(10, 6, P.cobble);   // 3 px in an L
    g.rect(20, 5, 2, 2, P.cobble);                           // 4 px
    g.rect(30, 5, 5, 5, P.wood);                             // 25 px
    g.dot(35, 10, P.cobble);                                 // touches the block only at a corner: on its own
  });
  const before = src.data.slice();
  const out = despeckle(src, 4);
  assert.deepEqual([...src.data], [...before], 'the source is not changed');
  assert.deepEqual(groups(out).sort((a, b) => a - b), [4, 25]);
  assert.equal(out.get(20, 5), col(P.cobble));
  assert.equal(out.get(32, 7), col(P.wood));
  assert.equal(out.get(35, 10), 0, 'a pixel that touches only at a corner is a speck');
  assert.ok(same(despeckle(src, 1), src), 'min 1 keeps everything');
  assert.deepEqual(groups(despeckle(src)).sort((a, b) => a - b), [4, 25], 'min is 4 when left out');
  assert.deepEqual(groups(despeckle(src, 5)), [25]);
});

test('doorSwing: shut at 0, open at 1, slow to start, a little too far before it settles', () => {
  assert.equal(doorSwing(0), 0);
  assert.equal(doorSwing(1), 1);
  assert.ok(doorSwing(0.2) < 0.3, 'it creaks before it moves');
  let top = 0, last = 0;
  for (let i = 0; i <= 80; i++) {
    const v = doorSwing(i / 100);
    assert.ok(v >= last, `still opening at t = ${i / 100}`);
    last = v;
  }
  for (let i = 0; i <= 100; i++) top = Math.max(top, doorSwing(i / 100));
  assert.ok(top > 1.04 && top <= 1.1, `swings past open, within what plankDoor draws (${top})`);
});

test('doorStep: a slab two rows deep on the ground line, wider than the door, lit along its top', () => {
  const stone = ramp(P.cobble);
  const g = draw((g) => doorStep(g, { x: 39, w: 18, ground: 92, stone: P.cobble }));
  assert.equal(lit(g), 2 * 22);
  assert.deepEqual(g.bounds(), { x0: 37, y0: 90, x1: 58, y1: 91 });
  assert.equal(count(g, stone.light), 22);
  assert.equal(count(g, stone.base), 22);
  assert.equal(g.get(40, 90), col(stone.light), 'the top row catches the light');
  const wide = draw((g) => doorStep(g, { x: 39, w: 18, ground: 92, stone: P.cobble, out: 4 }));
  assert.deepEqual(wide.bounds(), { x0: 35, y0: 90, x1: 60, y1: 91 });
});

test('candleFlicker: two beats per loop that close, never dark, and each window on its own beat', () => {
  for (const beat of [0, 1, 2, 5]) {
    assert.ok(Math.abs(candleFlicker(0, beat) - candleFlicker(1, beat)) < 1e-9, 'the loop closes');
    assert.ok(Math.abs(candleFlicker(0.1, beat) - candleFlicker(0.6, beat)) < 1e-9, 'two whole beats per loop');
    for (let i = 0; i < 16; i++) { const v = candleFlicker(i / 16, beat); assert.ok(v >= 0.55 && v <= 1.0001, `${v}`); }
  }
  assert.ok(Math.abs(candleFlicker(0.125, 0) - candleFlicker(0.125, 1)) > 0.1, 'two windows are out of step');
  assert.ok(Math.abs(candleFlicker(0, 0) - 0.78) < 1e-9, 'beat 0 starts in the middle of its range');
});

test('litWindow: by day exactly a paneWindow; at night glowing panes and light on the wall round it, and on nothing else', () => {
  const box = { x: 30, y: 30, w: 13, h: 13, wood: P.wood, glass: P.slate, glow: P.thunder };
  const wall = (g) => g.rect(10, 10, 60, 60, P.cream);
  const day = draw((g) => { wall(g); assert.equal(litWindow(g, { ...box, over: P.cream, t: 0.3 }), 0); });
  assert.ok(same(day, draw((g) => { wall(g); paneWindow(g, box); })), 'day');
  assert.equal(count(day, P.thunder), 0);
  for (const [t, beat] of [[0, 0], [0.125, 0], [0.625, 1], [0.375, 3]]) {
    const lvl = candleFlicker(t, beat);
    const night = draw((g) => { wall(g); assert.equal(litWindow(g, { ...box, over: P.cream, night: true, t, beat }), lvl); });
    const byHand = draw((g) => { wall(g); lampGlow(g, { x: 30, y: 30, w: 13, h: 14, r: lvl > 0.8 ? 2 : 1, over: P.cream, colour: P.thunder }); paneWindow(g, { ...box, lit: lvl }); });
    assert.ok(same(night, byHand), `night at t = ${t}, beat ${beat}`);
    assert.equal(count(night, P.slate), 0, 'no dark glass left');
    let spilled = 0;
    for (let i = 0; i < night.data.length; i++) {
      const x = i % 96, y = Math.floor(i / 96), inBox = x >= 29 && x < 44 && y >= 30 && y < 44;   // the window and its sill
      if (inBox || night.data[i] === day.data[i]) continue;
      assert.equal(day.data[i], col(P.cream), `only wall pixels are tinted (${x}, ${y})`);
      spilled++;
    }
    assert.ok(spilled >= 20, `light spills on the wall (${spilled})`);
  }
  // the light reaches further on a bright beat than on a dim one
  const spill = (t) => { const g = draw((g) => { wall(g); litWindow(g, { ...box, over: P.cream, night: true, t }); }); return 60 * 60 - 13 * 14 - 2 - count(g, P.cream); };
  assert.ok(candleFlicker(0.125) > 0.8 && candleFlicker(0.375) < 0.8);
  assert.ok(spill(0.125) > spill(0.375), `${spill(0.125)} > ${spill(0.375)}`);
  // without a sill the light starts from the box itself
  const bare = draw((g) => { wall(g); litWindow(g, { ...box, over: P.cream, night: true, sill: false }); });
  assert.ok(same(bare, draw((g) => { wall(g); lampGlow(g, { x: 30, y: 30, w: 13, h: 13, r: 1, over: P.cream, colour: P.thunder }); paneWindow(g, { ...box, lit: 0.78, sill: false }); })));
});

test('houseColours: glass, doorway and floor darker than what they come from; plaster and beam swatches that never meet', () => {
  const C = houseColours('hearthvale');
  assert.ok(brightness(C.glass) < brightness(P.slate), 'glass is dark slate');
  assert.ok(brightness(C.doorway) < brightness(C.glass) && brightness(C.doorway) > brightness(INK), 'the doorway is darker than glass, lighter than ink');
  assert.ok(brightness(C.floor) < brightness(P.path) && brightness(C.floor) > brightness(C.doorway), 'the floor shows against the doorway');
  assert.deepEqual(C.walls, swatchesBetween('hearthvale', ['stone', 'haze'], { lead: 'cream', min: 0.6 }));
  assert.deepEqual(C.beams, swatchesBetween('hearthvale', ['wood', 'roof'], { lead: 'wood', max: 0.5 }));
  assert.equal(C.walls[0], P.cream);
  assert.equal(C.beams[0], P.wood);
  for (const c of C.walls) assert.ok(!C.beams.includes(c) && brightness(c) >= 0.6);
  for (const c of C.beams) assert.ok(brightness(c) <= 0.5);
  assert.deepEqual(houseColours(), C, 'hearthvale when no palette is named');
  assert.deepEqual(houseColours('kit-rpg-fantasy'), C, 'a bundle id works');
  assert.notEqual(houseColours('hearthvale'), C, 'a new object each call');
  // another palette names its own colours
  const T = PALETTE.thornwood, W = houseColours('thornwood', { ground: 'soil', timber: ['wood', 'ground'] });
  assert.ok(brightness(W.glass) < brightness(T.slate) && brightness(W.floor) < brightness(T.soil));
  assert.equal(W.walls[0], T.cream);
  assert.equal(W.beams[0], T.wood);
  assert.throws(() => houseColours('hearthvale', { dark: 'soot' }), /"soot" is not a hearthvale colour/);
  assert.throws(() => houseColours('hearthvale', { ground: 'lava' }), /"lava" is not a hearthvale colour/);
});

test('chimneySmoke minSize: no stray pixels, nothing else changed, and the loop still closes', () => {
  const opt = { x: 60, y: 30, colour: P.cobble, count: 6, size: 4, rise: 15, drift: -5 };
  const plain = (t) => draw((g) => chimneySmoke(g, { t, ...opt }));
  const clean = (t) => draw((g) => chimneySmoke(g, { t, ...opt, minSize: 4 }));
  let specks = 0, drawn = 0;
  for (let i = 0; i < 16; i++) {
    const a = plain(i / 16), b = clean(i / 16);
    specks += groups(a).filter((n) => n < 4).length;
    assert.deepEqual(groups(b).filter((n) => n < 4), [], `frame ${i}: no group of fewer than 4 pixels`);
    for (let k = 0; k < a.data.length; k++) if (b.data[k]) assert.equal(b.data[k], a.data[k], 'what is kept is drawn as before');
    assert.ok(same(b, despeckle(a, 4)), `frame ${i}: only the specks are gone`);
    drawn += lit(b) > 0 ? 1 : 0;
  }
  assert.ok(specks > 0, 'without minSize this smoke does leave stray pixels (or the test tests nothing)');
  assert.ok(drawn >= 14, 'smoke in nearly every frame');
  assert.ok(same(clean(0), clean(1)), 't = 0 and t = 1 match');
  // left out, the helper is exactly engine/fx.js smoke as before
  for (const t of [0, 0.3, 0.7]) assert.ok(same(plain(t), draw((g) => smoke(g, { t, x: 60, y: 29, count: 6, seed: 0, loop: true, cycles: 1, rise: 15, drift: -5, size: 4, colour: P.cobble }))));
  // a wisp is judged by the smoke it touches, not by what is behind it: over a roof the same smoke pixels are drawn
  for (const t of [0, 0.125, 0.5]) {
    const roof = (g) => g.rect(30, 5, 50, 40, P.roof);
    const over = draw((g) => { roof(g); chimneySmoke(g, { t, ...opt, minSize: 4 }); });
    assert.ok(same(over, draw((g) => { roof(g); g.blit(clean(t)); })));
  }
});
