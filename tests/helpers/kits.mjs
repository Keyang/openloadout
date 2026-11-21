// The full game kits of a build, for tests/e2e/three-bundles.spec.mjs (and its own unit test,
// tests/unit/build-kits-helper.test.mjs).
//
// Which bundles are "the kits": the ones that have a plan in bundles/specs/<id>.plan.json. The level alone does not
// single them out (the small starter bundles are level "kit" too), and no list of names is kept anywhere: adding a
// plan adds a kit to what is checked, with no change here or in the test. Everything else is read from the
// catalogue the site reads: what each kit holds, its game type, and whether its assets are there.
//
// The rules (the first acceptance criterion; goal G1 in docs/progress.md):
//   - there are at least three full kits (40 to 50 sprites, 20 sounds and 2 music tracks: KIT_SIZE in
//     tools/lib/assets.mjs), for at least three different game types;
//   - every kit, full or small, holds 12 to 50 sprites, 8 to 30 sounds and 1 to 4 music tracks (SMALL_KIT_SIZE:
//     a kit may be smaller than a full one; Keyang, 2026-11-19), unless its plan declares its own "size", and then
//     it holds what its plan says (kitSize in tools/lib/assets.mjs; such a kit is still full only at KIT_SIZE);
//   - every kit is in the catalogue, as its plan describes it, and every asset it lists is in the catalogue.
import { KIT_SIZE, kitSize } from '../../tools/lib/assets.mjs';

export const MIN_KITS = 3;
const idsOf = (list) => (list ?? []).map((x) => (typeof x === 'string' ? x : x.id));
const KINDS = [['sprites', 'sprite'], ['sounds', 'sound'], ['music', 'music']];
const words = { sprites: 'sprites', sounds: 'sounds', music: 'music tracks' };

/** Every kit: [{ id, plan, bundle }] where bundle is the catalogue's entry, or null when the catalogue has none. plans: as loadPlans() returns them. */
export function kitsOf(catalog, plans) {
  return plans.map(({ id, plan }) => ({ id, plan, bundle: catalog.bundles.find((b) => b.id === id) ?? null }));
}

const inside = (bundle, size) => Object.entries(size).every(([field, [lo, hi]]) => bundle[field].length >= lo && bundle[field].length <= hi);

/** Whether a kit's bundle has the size of a full kit (KIT_SIZE). */
export function isFullKit(bundle) {
  return inside(bundle, KIT_SIZE);
}

/**
 * What is wrong with one kit's size: a list of sentences, empty when it is inside the size it is held to (kitSize:
 * its plan's own size when the plan declares one, else the size any kit may have, SMALL_KIT_SIZE).
 * plan: the kit's plan; left out, the kit is held to the size any kit may have.
 */
export function sizeProblems(bundle, plan) {
  const out = [];
  const size = kitSize(plan ?? undefined);                       // throws on a plan whose own size is not valid
  const rule = plan?.size === undefined ? 'a kit holds' : 'its plan says a kit of';
  for (const [field, [lo, hi]] of Object.entries(size)) {
    const n = bundle[field].length;
    if (n < lo || n > hi) out.push(`${bundle.id} holds ${n} ${words[field]}; ${rule} ${lo === hi ? lo : `${lo} to ${hi}`}`);
  }
  return out;
}

/** What is wrong with one kit against its plan and the catalogue's assets: a list of sentences. */
export function kitProblems({ id, plan, bundle }, catalog) {
  if (!bundle) {
    const there = catalog.bundles.map((b) => b.id).join(', ') || 'none';
    return [`the kit "${id}" has a plan (bundles/specs/${id}.plan.json) but the catalogue does not list it (it lists: ${there}). `
      + 'Run "node tools/bundles-from-plans.mjs" to write its bundle file once its assets exist, then "npm run build".'];
  }
  const out = [...sizeProblems(bundle, plan)];
  if (bundle.level !== 'kit') out.push(`${id} has the level "${bundle.level}"; a kit has the level "kit"`);
  if (bundle.gameType === 'any') out.push(`${id} is for "any" game; a kit is for one kind of game`);
  if (plan.gameType && bundle.gameType !== plan.gameType) out.push(`${id} is for "${bundle.gameType}" in the catalogue but its plan says "${plan.gameType}"`);
  const byId = Object.fromEntries(catalog.assets.map((a) => [a.id, a]));
  const all = KINDS.flatMap(([field]) => bundle[field]);
  const twice = all.filter((a, i) => all.indexOf(a) !== i);
  if (twice.length) out.push(`${id} lists ${[...new Set(twice)].join(', ')} more than once`);
  for (const [field, kind] of KINDS) {
    const planned = idsOf(plan[field]);
    if (JSON.stringify(planned) !== JSON.stringify(bundle[field])) {
      const extra = bundle[field].filter((a) => !planned.includes(a)), lacking = planned.filter((a) => !bundle[field].includes(a));
      out.push(`${id}: its ${words[field]} in the catalogue are not the ones its plan lists`
        + `${lacking.length ? ` (not in the catalogue: ${lacking.join(', ')})` : ''}${extra.length ? ` (not in the plan: ${extra.join(', ')})` : ''}`
        + `${!lacking.length && !extra.length ? ' (same ones, another order)' : ''}. Run "node tools/bundles-from-plans.mjs", then "npm run build".`);
    }
    for (const a of bundle[field]) {
      if (!byId[a]) out.push(`${id} lists the ${kind} "${a}", which the catalogue does not have`);
      else if (byId[a].kind !== kind) out.push(`${id} lists "${a}" as a ${kind}; the catalogue has it as a ${byId[a].kind}`);
      else if (!(byId[a].bundles ?? []).includes(id)) out.push(`"${a}" does not say it is in ${id}`);
    }
  }
  return out;
}

/**
 * What is wrong with the kits as a set: too few full kits, or full kits for too few kinds of game. Small kits are
 * allowed but do not count. A kit the catalogue does not list yet counts (kitProblems reports it). A list of sentences.
 */
export function setProblems(allKits) {
  const out = [];
  const kits = allKits.filter((k) => !k.bundle || isFullKit(k.bundle));
  if (kits.length < MIN_KITS) out.push(`there ${kits.length === 1 ? 'is' : 'are'} ${kits.length} full kit${kits.length === 1 ? '' : 's'} (${kits.map((k) => k.id).join(', ') || 'none'}); there must be at least ${MIN_KITS}`);
  const types = [...new Set(kits.filter((k) => k.bundle && k.bundle.gameType !== 'any').map((k) => k.bundle.gameType))];
  if (types.length < MIN_KITS) out.push(`the full kits are for ${types.length} kind${types.length === 1 ? '' : 's'} of game (${types.join(', ') || 'none'}); there must be full kits for at least ${MIN_KITS} different kinds`);
  return out;
}
