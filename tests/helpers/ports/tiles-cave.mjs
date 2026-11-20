// Writer of sprites/tiles-cave.json (migration batch M5), kept for audit as B15b kept
// tests/helpers/ports/tiles-platforms.mjs; tests/unit/library-tiles-m5.test.mjs holds the library file to what this writes.
// Usage: node tests/helpers/ports/tiles-cave.mjs [--write]   (says whether the library file is what this writes; writes it)
//
// B15's cave redraw (tests/fixtures/v2/tiles/tiles-cave.json) with its fill pictures traced from the code tileset (exact at every Texture, Wear and Damp step), the rim's nicks and the code's
// crease and lit-facet tones.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const L = new URL('../../../', import.meta.url).href;   // the project folder
const { codeSprite } = await import(L + 'tests/helpers/library.mjs');
const { defaultParams } = await import(L + 'engine/sprite.js');
const { col } = await import(L + 'engine/color.js');
const { fixtureText } = await import(L + 'tests/helpers/ports/tiles-platforms.mjs');
const { refMap, traceGrid } = await import('./tiles-trace.mjs');
const code = await codeSprite('tiles-cave');
const D = defaultParams(code);
const def = JSON.parse(fs.readFileSync(new URL('tests/fixtures/v2/tiles/tiles-cave.json', L), 'utf8'));
delete def.made;
def.palette = def.palette.filter((s) => s.id !== 'lit');
def.palette.push(
  { id: 'facet', material: 'stone', derive: { rule: 'textureLight', of: 'rock', against: 'rock', from: 0.5 } },
  { id: 'crease', material: 'stone', derive: { rule: 'textureTone', of: 'rock' } },
  { id: 'mark', material: 'stone', derive: { rule: 'textureTone', of: 'shade' } });
const [rockG, darkG] = def.body.tiles.groups;
const third = (n) => [[0, null], ...[...Array(n).keys()].map((k) => [(k + 1) / n, [{ atLeast: (k + 0.5) / n }]])];
// rock: busy = round(texture * 2), wear = round(wear * 3), damp
const rockAxes = [{ key: 'texture', levels: third(2) }, { key: 'wear', levels: third(3) }, { key: 'damp', levels: [[false, null], [true, [true]]] }];
const rockRefs = refMap(def, ['rock', 'facet', 'crease', 'rock.light', 'wet']);
rockG.material.fill.versions = ['rock-fill', 'rock-fill-b', 'rock-fill-c'].map((c) => traceGrid(code, c, D, rockAxes, rockRefs, col(D.rock)));
// the back wall: 1 + round(texture * 2) strokes
const darkRefs = refMap(def, ['shade', 'mark']);
darkG.material.fill.versions = ['dark-fill', 'dark-fill-b', 'dark-fill-c'].map((c) => traceGrid(code, c, D, [{ key: 'texture', levels: third(2) }], darkRefs, col(D.shade)));
// the rim's nicks where the rock has cracked at its edge: Wear step 2 (from 0.5) at columns 11 and 12, step 3 at 20 and 21
const top = rockG.material.edges.top;
def.body.tiles.profiles.nick = [...Array(32).keys()].map((u) => ({ 11: 1, 12: 2, 20: 3, 21: 4 })[u] ?? 0);
top.bands.unshift(
  { rows: [1, 2], where: { profile: 'nick', in: [1] }, paint: 'crease', when: { wear: [{ atLeast: 0.5 }] } },
  { rows: [2, 99], where: { profile: 'nick', in: [2] }, paint: 'crease', when: { wear: [{ atLeast: 0.5 }] } },
  { rows: [1, 99], where: { profile: 'nick', in: [3] }, paint: 'crease', when: { wear: [{ atLeast: 5 / 6 }] } },
  { rows: [1, 1], where: { profile: 'nick', in: [4] }, paint: 'crease', when: { wear: [{ atLeast: 5 / 6 }] } });
// the top rim's broken inner edge: min(round(BROKEN x min(1, 1.5 jagged)), edge - 2) px shorter. BROKEN is 1 or 2, so
// that is its last row (from Edges 1/6 where BROKEN is 2, 1/3 where it is 1) and the row above (from 0.5 where it is 2,
// and Edge 4 up): band rules that leave those rows to the fill, ahead of the others
delete top.ragged;
const brokenRules = (deep) => [
  { rows: 'last', where: { profile: 'broken', in: [2] }, paint: 'clear', when: { jagged: [{ atLeast: 1 / 6 }], ...(deep[0] ? { edge: [{ atLeast: deep[0] }] } : {}) } },
  { rows: 'last', where: { profile: 'broken', in: [1] }, paint: 'clear', when: { jagged: [{ atLeast: 1 / 3 }], ...(deep[0] ? { edge: [{ atLeast: deep[0] }] } : {}) } },
  { rows: 'last-1', where: { profile: 'broken', in: [2] }, paint: 'clear', when: { jagged: [{ atLeast: 0.5 }], edge: [{ atLeast: deep[1] }] } },
];
top.bands.unshift(...brokenRules([null, 3.5]));
rockG.material.round = { from: 'jagged', map: [[0, 1], [0.6, 1], [0.60001, 2], [1, 2]], round: 'px' };
// the right side's broken rim: min(round(BROKEN x min(1, 1.5 jagged)), edge - 3) px shorter, as the top's
const right = rockG.material.edges.right;
right.bands.unshift(...brokenRules([3.5, 4.5]));
// the ledge's tidier underside: min(1, round(UNDER x 3 x jagged)) px in. As profile x amount (rounded): the amount
// steps 0, 1, 1.5, 2, 2.5 at the Edges values where each depth of hollow first shows, the profile picks its step
const UNDER = [0, 0.33, 0.67, 1, 1, 1, 0.67, 0.33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.33, 0.67, 1, 1, 0.67, 0, 0.5, 1, 0.67, 0];
const T = [1, 0.67, 0.5, 0.33].map((u) => 0.5 / (u * 3)), A = [1, 1.5, 2, 2.5], P = { 1: 0.55, 0.67: 0.4, 0.5: 0.3, 0.33: 0.22, 0: 0 };
const map = [[0, 0]];
T.forEach((t, k) => { map.push([t - 1e-6, k ? A[k - 1] : 0], [t, A[k]]); });
map.push([1, 2.5]);
def.body.tiles.profiles.lip = UNDER.map((u) => P[u]);
for (const u of [0, 0.33, 0.5, 0.67, 1]) for (let j = 0; j <= 1.0001; j += 0.01) {
  const a = (() => { let y = 0; for (const [x, v] of map) if (j >= x) y = v; return y; })();
  if (Math.min(1, Math.round(u * 3 * j)) !== Math.round(P[u] * a)) throw new Error(`lip ${u} at ${j}`);
}
rockG.under.inset = { profile: 'lip', amount: { from: 'jagged', map } };
// damp: water drops on the stalactites (after the outline), wet streaks on the stalagmites
const [dA, dB] = rockG.decals;
// the crease down each big spike: the code's textureTone of the rock, the crease slot (B15 wrote the rock's dark tone,
// the same at every swatch but not for every colour: review round 2 issue 2 saw 6 px each at Rock #4216b0)
for (const d of [dA, dB]) for (const st of d.draw) for (const [k, v] of Object.entries(st.key ?? {})) if (v === 'rock.dark') st.key[k] = 'crease';
dA.draw = dA.draw.filter((x) => !x.when);
dA.draw.push({ kind: 'stamp', at: [17, 22], rows: ['a', 'b'], key: { a: 'water', b: 'water.light' }, glow: true, when: { damp: [true] } },
  { kind: 'stamp', at: [11, 9], rows: ['a'], key: { a: 'water' }, glow: true, when: { damp: [true] } });
dB.draw.push({ kind: 'stamp', at: [15, 20], rows: ['a', 'a'], key: { a: 'wet' }, when: { damp: [true] } },
  { kind: 'stamp', at: [20, 27], rows: ['a'], key: { a: 'wet' }, when: { damp: [true] } });
// the code's clip order: the rock's decals after the back wall (body.tiles.decalOrder, engine/gen/tiles-clips.js)
def.body.tiles.decalOrder = 'last';

/** The library file this writes. */
export const LIBRARY_FILE = fileURLToPath(new URL('../../../sprites/tiles-cave.json', import.meta.url));
/** The text of sprites/tiles-cave.json as this writes it. */
export const written = () => fixtureText(def);

// node tests/helpers/ports/tiles-cave.mjs [--write]: says whether sprites/tiles-cave.json is what this writes (--write writes it)
if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const text = written();
  if (process.argv.includes('--write')) { fs.writeFileSync(LIBRARY_FILE, text); console.log('wrote', LIBRARY_FILE, Buffer.byteLength(text), 'bytes'); }
  else { const same = fs.existsSync(LIBRARY_FILE) && fs.readFileSync(LIBRARY_FILE, 'utf8') === text; console.log(same ? 'the library file is what this writes' : 'the library file differs from what this writes (--write to write it)'); process.exitCode = same ? 0 : 1; }

}
