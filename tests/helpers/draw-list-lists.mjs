// Lists for engine/draw-list.js tests, built to the top of the section 4.2 budgets (docs/data-sprites.md): a 64x64
// character, a 32x32 tile, a 32x32 icon and a 320x180 background layer. Used by draw-list-speed and draw-list-budget.

export const palette = { skin: '#e0a878', cloth: '#3a6ea5', metal: '#b8c4cc', hair: '#5a3a22', eye: { hex: '#231b33', detail: true }, fire: '#ffb347',
  grass: '#4f9d57', soil: '#7a5230', sky: '#6fa3e0', rock: '#6b6f7d', leaf: '#3f7f46', cloud: '#eef2f8' };
const hash = (i) => { let x = (i + 1) * 2654435761 >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; };

/** A 64x64 character at the top of its budget: 160 shapes (limbs, capsules, turned ellipses, polygons) and 40 stamps. */
export function characterList() {
  const list = [], kinds = ['limb', 'capsule', 'ellipse', 'poly'], paints = ['skin', 'cloth', 'metal', 'hair'];
  for (let i = 0; i < 160; i++) {
    const x = 14 + hash(i) * 36, y = 10 + hash(i + 500) * 44, a = hash(i + 900) * Math.PI * 2, len = 3 + hash(i + 77) * 7;
    const tx = x + Math.sin(a) * len, ty = y + Math.cos(a) * len;
    const common = { paint: paints[i % 4], z: (i % 8) * 2, group: i % 3 ? `g${i % 8}` : undefined };
    const k = kinds[i % 4];
    if (k === 'limb') list.push({ kind: 'limb', from: [x, y], to: [tx, ty], width: 1 + (i % 3), ...common });
    else if (k === 'capsule') list.push({ kind: 'capsule', from: [x, y], to: [tx, ty], r: [2 + (i % 3), 1.5], ...common });
    else if (k === 'ellipse') list.push({ kind: 'ellipse', at: [x, y], r: [2 + (i % 4), 1.5 + (i % 3)], turn: a * 57.3, ...common });
    else list.push({ kind: 'poly', points: [[x, y], [tx, ty], [tx + 3, ty + 2], [x + 2, y + 4]], ...common });
  }
  for (let i = 0; i < 40; i++) list.push({ kind: 'stamp', at: [8 + (i * 7) % 48, 8 + (i * 11) % 48], rows: ['ab.', 'bba', '.a.'], key: { a: 'eye', b: 'metal.light' }, z: 30 });
  list.push({ kind: 'outline' });
  list.push({ kind: 'ellipse', at: [50, 12], r: [3, 3], paint: 'fire', glow: true }, { kind: 'dot', at: [47, 9], paint: 'fire', glow: true });
  return list;
}

/** A 32x32 tile: a soil body in bands, a dithered patch, a grass cap polygon, 20 clod stamps. */
export function tileList() {
  const list = [
    { kind: 'bands', area: { kind: 'rect', at: [0, 0], size: [32, 32] }, dir: 'down', stops: ['soil.light', 'soil', 'soil.dark'], edges: 'dither' },
    { kind: 'dither', area: { kind: 'ellipse', at: [16, 20], r: [10, 6] }, pattern: 'bayer4', amount: 0.3, paint: 'soil.dark' },
    { kind: 'poly', points: [[0, 0], [32, 0], [32, 6], [26, 8], [20, 5], [14, 9], [8, 6], [0, 8]], paint: 'grass', shade: 2 },
  ];
  for (let i = 0; i < 20; i++) list.push({ kind: 'stamp', at: [2 + (i * 5) % 28, 12 + (i * 7) % 18], rows: ['ab', 'b.'], key: { a: 'soil.light', b: 'soil.deep' } });
  list.push({ kind: 'line', from: [0, 0], to: [31, 0], paint: 'grass.light' });
  return list;
}

/** A 32x32 icon: a gem-like body of polygons and ellipses with stamps, an outline and a glint. */
export function iconList() {
  return [
    { kind: 'poly', points: [[16, 4], [27, 13], [16, 28], [5, 13]], paint: 'metal', group: 'gem', light: 1 },
    { kind: 'ellipse', at: [16, 13], r: [9, 4], paint: 'metal', group: 'gem' },
    { kind: 'poly', points: [[16, 6], [22, 13], [16, 24], [10, 13]], paint: 'metal.light', z: 2 },
    { kind: 'stamp', at: [12, 9], rows: ['aa', 'a.'], key: { a: 'cloud' }, z: 3 },
    { kind: 'outline' },
    { kind: 'ring', at: [24, 7], r: 3, thick: 1, paint: 'fire', glow: true },
  ];
}

/** A 320x180 background layer: sky bands, two ridges of 48-point polygons, 40 clouds in groups, a dithered mist. */
export function layerList() {
  const list = [{ kind: 'bands', area: { kind: 'rect', at: [0, 0], size: [320, 180] }, dir: 'down', stops: ['sky.light', 'sky', 'sky.dark', 'sky.deep'], edges: 'dither' }];
  for (let c = 0; c < 40; c++) {
    const x = (c * 37) % 320, y = 14 + (c * 13) % 50;
    list.push({ kind: 'ellipse', at: [x, y], r: [6 + (c % 5), 3 + (c % 3)], paint: 'cloud', group: `c${c % 10}`, z: 1 });
  }
  for (const [base, amp, paint, z] of [[120, 40, 'rock', 2], [150, 24, 'leaf', 3]]) {
    const pts = [[0, 180]];
    for (let i = 0; i <= 46; i++) pts.push([(i * 320) / 46, base - amp * hash(i + base)]);
    pts.push([320, 180]);
    list.push({ kind: 'poly', points: pts, paint, z, shade: 2 });
  }
  list.push({ kind: 'dither', area: { kind: 'rect', at: [0, 128], size: [320, 20] }, pattern: 'bayer4', amount: 0.4, paint: 'cloud', z: 4 });
  return list;
}
