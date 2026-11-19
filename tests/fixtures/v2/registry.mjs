// A stand-in generator registry for the format v2 validator's tests (catalog/sprite-schema.js), made from
// generators.json, with the interface the validator reads from engine/gen/registry.js (build item B2):
// generator(id, v) -> entry or null, generators() -> every entry. An entry is { id, v, family, about, args, keyable,
// cost(args) -> number }. Test data only.
import fs from 'node:fs';

const LIST = JSON.parse(fs.readFileSync(new URL('./generators.json', import.meta.url), 'utf8')).generators;

/** The stand-in registry; `extra` adds entries (each with its own cost function or a { base, per } cost). */
export function stubRegistry(extra = []) {
  const entries = [...LIST, ...extra].map((g) => Object.freeze({
    id: g.id, v: g.v, family: g.family, about: g.about ?? `${g.id} (test stand-in)`, args: g.args, keyable: g.keyable ?? [],
    cost: typeof g.cost === 'function' ? g.cost : (args) => (g.cost?.base ?? 1) + (g.cost?.per ? Number(args?.[g.cost.per] ?? 0) : 0),
  }));
  return Object.freeze({
    generator: (id, v) => entries.find((e) => e.id === id && e.v === v) ?? null,
    generators: () => entries,
  });
}

/** A stand-in piece registry: piece(id, v) -> { id, v, kind, slots, bones, shapes, clips, args, cost } or null. */
export function stubPieces(extra = []) {
  const list = [
    { id: 'base:person-side', v: 1, kind: 'base', slots: ['skin', 'outfit', 'trousers', 'metal', 'eye'], bones: ['root', 'hip', 'spine', 'neck', 'head', 'thighF', 'thighB', 'shinF', 'shinB', 'armF', 'armB', 'handF', 'handB'],
      shapes: ['torso', 'skull', 'legF', 'legB'], clips: { idle: { frames: 8 }, walk: { frames: 8 }, swing: { frames: 8 }, hurt: { frames: 4 } }, cost: 40 },
    { id: 'part:hair', v: 1, kind: 'part', slots: ['hair'], args: { style: { type: 'word', options: ['crop', 'fall', 'bun'] }, length: { type: 'px', lo: 0, hi: 12 } }, cost: 6 },
    { id: 'part:helmet-plumed', v: 1, kind: 'part', slots: ['metal', 'plume'], cost: 8 },
    { id: 'held:sword', v: 1, kind: 'held', slots: ['blade'], args: { length: { type: 'px', lo: 4, hi: 24 } }, cost: 4 },
    { id: 'stamp:clod', v: 1, kind: 'stamp', slots: ['a'], cost: 1 },
    { id: 'skin:wood', v: 1, kind: 'skin', slots: ['face', 'frame'], cost: 0 },
    { id: 'font:chunky', v: 1, kind: 'font', glyphs: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 !?.,:-', cost: 0 },
    ...extra,
  ];
  return Object.freeze({ piece: (id, v) => list.find((p) => p.id === id && p.v === v) ?? null, pieces: () => list });
}
