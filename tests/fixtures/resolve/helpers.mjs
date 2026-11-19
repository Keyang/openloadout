// Helpers for the settings resolver's tests (engine/resolve.js, build item B4). Test data only.
//   testPieces()        a piece store holding the test pieces of this folder and tests/fixtures/pieces/pieces
//   loadV2(name)        one fixture of tests/fixtures/v2 as plain data
//   V2_FIXTURES         the names of every sprite fixture there
//   validated(name)     that fixture through catalog/sprite-schema.js (stub generators, the test pieces)
//   settingsOf(def)     settings to try: defaults, every slider low and high, every option, every on/off flipped
//   leftovers(x)        bindings and control conditions still in a resolved value (should be none)
//   testRegistry()      a generator registry with runnable stand-ins for the fixtures' generators
import fs from 'node:fs';
import { createPieceStore, pieceRegistry } from '../../../engine/pieces.js';
import { validateSprite } from '../../../catalog/sprite-schema.js';
import { createRegistry } from '../../../engine/gen/registry.js';
import { point, count, paint, paints, px, flag } from '../../../engine/gen/args.js';
import { stubRegistry } from '../v2/registry.mjs';

const HERE = new URL('./', import.meta.url);
const SHARED = new URL('../pieces/pieces/', import.meta.url);
const V2 = new URL('../v2/', import.meta.url);

/** The sprite fixtures of tests/fixtures/v2 (every one the resolver is held to). */
export const V2_FIXTURES = fs.readdirSync(V2).filter((f) => f.endsWith('.json') && f !== 'generators.json').map((f) => f.slice(0, -5)).sort();

/** One v2 fixture as plain data. */
export const loadV2 = (name) => JSON.parse(fs.readFileSync(new URL(`${name}.json`, V2), 'utf8'));

const ORDER = ['stamp-test-clod.v1.json', 'part-test-tuft.v1.json'];

/** A piece store with every test piece added (dependencies first). */
export function testPieces() {
  const store = createPieceStore();
  for (const f of ORDER) store.add(fs.readFileSync(new URL(f, SHARED), 'utf8'), f);
  const mine = fs.readdirSync(HERE).filter((f) => f.endsWith('.json')).sort((a, b) => (a.startsWith('stamp') ? -1 : b.startsWith('stamp') ? 1 : a < b ? -1 : 1));
  for (const f of mine) store.add(fs.readFileSync(new URL(f, HERE), 'utf8'), f);
  return store;
}

/** The fixture through the v2 validator with the stub generators and the test pieces; throws when it does not pass. */
export function validated(name, store = testPieces()) {
  const r = validateSprite(loadV2(name), { generators: stubRegistry(), pieces: pieceRegistry(store) });
  if (!r.ok) throw new Error(`${name}: ${r.errors.join('; ')}`);
  return r.value;
}

/** Settings worth trying on a definition: defaults ({}), all low, all high, each option of each choice, each on/off flipped. */
export function settingsOf(def) {
  const out = [{}];
  const low = {}, high = {};
  for (const c of def.controls ?? []) {
    if (c.standard === 'speed') { low.speed = 0; high.speed = 1; continue; }
    const kind = c.kind ?? 'range';
    if (kind === 'range' || kind === 'slider') { low[c.key] = c.min ?? 0; high[c.key] = c.max ?? 1; }
    if (kind === 'choice') for (const o of c.options) out.push({ [c.key]: typeof o === 'string' ? o : o.value });
    if (kind === 'toggle') out.push({ [c.key]: !c.default });
  }
  out.push(low, high);
  return out;
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Paths in x where a binding ({ from, map | pick }, or a bare { from } naming one of `keys`) or a `when` naming a control is left. */
export function leftovers(x, keys, path = '') {
  const out = [];
  const walk = (v, p, parentKey) => {
    if (Array.isArray(v)) { v.forEach((y, i) => walk(y, `${p}[${i}]`, parentKey)); return; }
    if (!isObj(v)) return;
    const ks = Object.keys(v);
    if (typeof v.from === 'string' && (Object.hasOwn(v, 'map') || Object.hasOwn(v, 'pick') || (ks.length === 1 && keys.includes(v.from)))) { out.push(`${p}: binding`); return; }
    if (Object.hasOwn(v, 'when') && !Object.hasOwn(v, 'rule')) {
      for (const alt of [].concat(v.when)) for (const k of Object.keys(alt ?? {})) if (k !== 'clip' && k !== 'direction') out.push(`${p}.when names ${k}`);
    }
    for (const k of ks) if (k !== 'when' || Object.hasOwn(v, 'rule')) walk(v[k], `${p}.${k}`, k);
  };
  walk(x, path, null);
  return out;
}

/** A registry with runnable stand-ins of the fixtures' generators that draw (glint, spark.ring, particles, starburst). */
export function testRegistry() {
  const reg = createRegistry();
  reg.defineGenerator({ id: 'glint', v: 1, family: 'shine', about: 'Test glint: one dot.', args: { every: count(2, 64), paint: paint() }, cost: () => 1,
    run: (a, ctx) => [{ kind: 'dot', at: [Math.floor(ctx.frame % a.every), 0], paint: a.paint }] });
  reg.defineGenerator({ id: 'spark.ring', v: 1, family: 'fx', about: 'Test ring of sparks: one ring.', args: { at: point(), paints: paints(3) }, cost: () => 1,
    run: (a) => [{ kind: 'ring', at: a.at, r: 4, paint: a.paints[0] }] });
  reg.defineGenerator({ id: 'particles', v: 1, family: 'fx', about: 'Test particles: count dots in a row.', keyable: ['dist'],
    args: { at: point(), count: count(1, 64), seed: count(0, 9999), loop: flag({ default: false }), arc: px(-720, 720, { default: 360 }), dist: px(0, 64), size: px(1, 8), paints: paints(4) },
    cost: (a) => a.count,
    run: (a) => Array.from({ length: a.count }, (_, i) => ({ kind: 'dot', at: [a.at[0] + (i % 8), a.at[1] - Math.floor(i / 8)], paint: a.paints[i % a.paints.length] })) });
  return reg;
}
