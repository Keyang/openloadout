// PORT (build item T2): the drawing of sprites/tiles-meadow.js (frozen at tests/fixtures/code-sprites/tiles-meadow.js)
// for the tile.meadow@1 generator (engine/gen/tile-ports.js). Word for word the code's, except where it worked a
// colour out: those colours come in as C (each one a stand-in colour engine/gen/tile-ports.js maps back to the paint
// the asset names: the code's own colour rule, written in sprites/tiles-meadow.json), and the code's PALETTE.hearthvale
// cobble is C.cobble. The joins are engine/tiles.js drawBlock and drawSoftBlock, the code's and the tiles layout's own.
// Never change what a released generator version draws through it: a different look is a new version.
//
//   C: grass, blade (textureTone of grass), tip (textureLight of grass), path, sand (raisedGround of path), grain
//      (textureTone of sand), cobble (the pebbles' stone), flowers
//
// Pure: no DOM, no clock, no randomness; runs the same in Node and the browser.
import { ramp } from '../../color.js';
import { pieceOf, drawBlock, drawSoftBlock, bandStone, patternFill, scatter } from '../../tiles.js';

// ---- the path's outline -----------------------------------------------------------------------------------
const DIPS = {
  top: [0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 2, 2, 1, 1, 1, 0, 0, 0, 0, 0, 0],
  bottom: [0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 2, 2, 2, 2, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0],
  left: [0, 0, 0, 0, 1, 1, 2, 2, 2, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
  right: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 1, 2, 2, 2, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0],
};
const BLADES = {
  top: [[9, 0.3], [10, 0.3], [23, 0.3], [27, 0.2]],
  bottom: [[3, 0.4], [7, 0.9], [8, 0.4], [13, 0.6], [14, 1], [20, 0.7], [25, 0.5], [26, 0.9]],
  left: [[5, 0.4], [6, 0.4], [12, 0.5], [13, 0.3], [24, 0.4], [25, 0.4]],
  right: [[9, 0.4], [10, 0.4], [16, 0.3], [22, 0.5], [23, 0.4]],
};
const PEBBLES = {
  top: [[14, 4, 3]],
  bottom: [[21, 3, 2]],
  left: [[17, 2, 3]],
  right: [[5, 3, 3]],
};
const SHADE = [1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1];

// ---- marks inside the fills ------------------------------------------------------------------------------
const TUFTS = [
  [[0, 2], [2, 3], [4, 2]],
  [[0, 2], [1, 3]],
  [[0, 1], [2, 2], [3, 3]],
  [[0, 3], [2, 2]],
];
function drawTuft(s, x, y, kind, lit, shade) {
  for (const [dx, h] of TUFTS[kind % TUFTS.length]) {
    if (h > 1) s.rect(x + dx, y - h + 2, 1, h - 1, shade);
    s.dot(x + dx, y - h + 1, lit);
  }
}
const SPRINKLE = {
  1: { count: [2, 3, 5], at: [[5, 24], [9, 6], [24, 9], [21, 21], [14, 28]] },
  2: { count: [2, 3, 5], at: [[26, 16], [16, 6], [11, 21], [23, 28], [6, 12]] },
};
const RUT = [0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 2, 2, 1, 1, 1, 0, 0];

// Everything the helper needs to draw the floor and the path, from the controls (C: the colours, see the top).
function materials(p, C) {
  const blade = C.blade, tip = C.tip;
  const road = ramp(C.path);
  const sand = C.sand, grain = C.grain;
  const stone = ramp(C.cobble);
  const E = Math.round(p.edge), busy = p.texture, worn = p.wear;

  const count = (version) => SPRINKLE[version].count[Math.round(busy * 2)];
  const sprinkle = (version) => (s) => SPRINKLE[version].at.slice(0, count(version)).forEach(([x, y], i) => drawTuft(s, x - 2, y, i + version, tip, blade));
  const floor = lazyList(3, (v) => [
    () => patternFill(C.grass),
    () => patternFill(C.grass, sprinkle(1)),
    () => patternFill(C.grass, sprinkle(2)),
  ][v]());

  const grains = Math.round(1 + busy * 4), ruts = Math.round(worn * 3);
  const speck = (s, m, i) => (i % 3 === 0 ? s.rect(m.x, m.y, 2, 1, grain) : s.dot(m.x, m.y, grain));
  const specks = (seed, count) => (s) => scatter(seed, 6, { margin: 5, gap: 7 }).slice(0, count).forEach((m, i) => speck(s, m, i + seed));
  const rut = (s, x, y, len) => RUT.slice(0, len).forEach((dy, i) => s.dot(x + i, y + dy, grain));
  const pit = (s, x, y) => { s.rect(x, y, 3, 1, grain); s.rect(x + 1, y + 1, 3, 1, grain); };
  const middle = lazyList(3, (v) => [
    () => patternFill(sand, (s) => { specks(53, Math.max(1, Math.round(grains / 2)))(s); if (ruts >= 2) rut(s, 9, 20, 11); }),
    () => patternFill(sand, (s) => { specks(61, grains)(s); if (ruts >= 1) { rut(s, 6, 10, 17); rut(s, 10, 22, 13); } if (ruts >= 3) pit(s, 21, 15); }),
    () => patternFill(sand, (s) => { specks(79, grains)(s); if (ruts >= 1) pit(s, 9, 20); if (ruts >= 2) rut(s, 12, 9, 14); if (ruts >= 3) rut(s, 7, 25, 9); }),
  ][v]());

  const edge = (which, shaded) => {
    const lift = E >= 6 ? 1.5 : E >= 4 ? 1 : 0.5;
    const reach = new Array(32).fill(0);
    for (const [u, k] of BLADES[which]) reach[u] = Math.max(1, Math.round(k * (E - 1)));
    const inset = (u) => Math.round(DIPS[which][u] * lift) + reach[u];
    const d0 = Math.min(E, 4);
    const stones = p.stones ? PEBBLES[which].map(([u0, along, across]) => [u0, d0, along, across]) : [];
    return {
      depth: d0 + 3,
      inset,
      paint: (d, u) => bandStone(which, d, u, stones, stone) ?? (shaded ? (d === 1 ? road.deep : d === 2 && SHADE[u] ? road.dark : null) : d === 1 ? road.dark : null),
    };
  };

  return {
    grass: { fill: (x, y, t, v) => floor[v ?? 0](x, y) },
    path: {
      ink: null,
      round: E + 2,
      fill: (x, y, t, v) => middle[v ?? 0](x, y),
      top: edge('top', true), right: edge('right', true), bottom: edge('bottom', false), left: edge('left', false),
    },
  };
}

// HAND CHANGE (speed only, no pixel changes): every version of a fill is made on first use, so a tile does not make
// the versions it does not show (the code made them all for every tile); each version is drawn on its own as before
function lazyList(n, make) {
  const out = [], made = [];
  for (let i = 0; i < n; i++) Object.defineProperty(out, i, { get: () => (made[i] ??= make(i)) });
  return out;
}

// ---- the decals ------------------------------------------------------------------------------------------------

function tuft(g, p, C) {
  const grass = ramp(C.grass), blade = C.blade;
  for (const [x, h] of [[10, 2], [11, 4], [12, 3], [13, 6], [14, 4], [15, 7], [16, 5], [17, 8], [18, 5], [19, 6], [20, 3], [21, 4], [22, 2]]) {
    g.rect(x, 21 - h, 1, h, x % 3 === 1 ? grass.deep : blade);
    g.dot(x, 21 - h, grass.light);
    if (h >= 6) g.dot(x, 22 - h, grass.light);
  }
  g.rect(11, 21, 11, 1, grass.deep);
}
function flowers(g, p, C) {
  const grass = ramp(C.grass), petal = ramp(C.flowers), blade = C.blade;
  for (const [x, y, big] of [[8, 9, 0], [20, 7, 1], [13, 15, 1], [24, 17, 0], [7, 22, 1], [18, 24, 0]]) {
    g.rect(x, y + 1, 1, big ? 4 : 3, blade);
    g.dot(x + 1, y + (big ? 3 : 2), grass.deep);
    if (big) {
      g.rect(x - 1, y - 1, 3, 3, petal.base);
      g.dot(x + 1, y - 1, petal.light); g.dot(x, y - 1, petal.light); g.dot(x - 1, y + 1, petal.dark);
      g.dot(x, y, petal.light);
    } else {
      g.rect(x - 1, y, 3, 1, petal.base); g.rect(x, y - 1, 1, 3, petal.base);
      g.dot(x, y - 1, petal.light); g.dot(x, y, petal.light);
    }
  }
}
function pebbles(g, p, C) {
  const stone = ramp(C.cobble), under = C.blade;
  for (const [x, y, w, h] of [[7, 10, 7, 5], [18, 15, 6, 4], [10, 20, 4, 3]]) {
    g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, stone, { shade: 1 });
    g.rect(x + 2, y, w - 3, 1, stone.light);
    g.rect(x + 1, y + h, w - 2, 1, under);
  }
}
function tallGrass(g, p, C) {
  const grass = ramp(C.grass), blade = C.blade;
  for (const [x0, x1, h, lit] of [[13, 7, 11, 0], [14, 11, 15, 1], [15, 14, 18, 0], [16, 17, 20, 1], [17, 20, 16, 0], [18, 23, 13, 1], [19, 26, 9, 0], [12, 5, 7, 1]]) {
    for (let i = 0; i < h; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i * i) / (h * h));
      g.dot(x, 27 - i, i < 3 ? grass.deep : lit ? (i > h - 4 ? grass.light : C.grass) : blade);
    }
  }
  g.rect(11, 27, 9, 1, grass.deep);
}
const DECALS = { 'grass-deco-a': tuft, 'grass-deco-b': flowers, 'grass-deco-c': pebbles, 'grass-deco-d': tallGrass };

/** The tiles of the meadow, in the code tileset's clip order (its clips' names): what tile.meadow@1's `piece` names. */
export const MEADOW_PIECES = Object.freeze(['grass-fill', 'grass-fill-b', 'grass-fill-c',
  ...['left', 'top', 'right', 'side-l', 'fill', 'fill-b', 'fill-c', 'side-r', 'bottom-l', 'bottom', 'bottom-r', 'inner-tl', 'inner-tr', 'inner-bl', 'inner-br',
    'strip-l', 'strip-m', 'strip-r', 'col-t', 'col-m', 'col-b', 'single'].map((k) => `path-${k}`),
  'grass-deco-a', 'grass-deco-b', 'grass-deco-c', 'grass-deco-d']);

/** Draws one tile of the meadow on a 32 x 32 Surface, as sprites/tiles-meadow.js rendered it: clip (a MEADOW_PIECES name), t, p (edge, texture, wear, stones), C (the colours, see the top). */
export function drawMeadow(g, { clip, t, p, C }) {
  const k = pieceOf(clip);
  if (k.kind === 'deco') return DECALS[clip](g, p, C);
  const m = materials(p, C);
  if (k.prefix === 'grass') return drawBlock(g, k.piece, m.grass, t);
  return drawSoftBlock(g, k.piece, m.path, t);
}
