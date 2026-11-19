// The full game kits of a build, for tests/e2e/three-bundles.spec.mjs (and its own unit test,
// tests/unit/build-kits-helper.test.mjs).
//
// Which bundles are "the kits": the ones that have a plan in bundles/specs/<id>.plan.json. The level alone does not
// single them out (the small starter bundles are level "kit" too), and no list of names is kept anywhere: adding a
// plan adds a kit to what is checked, with no change here or in the test. Everything else is read from the
// catalogue the site reads: what each kit holds, its game type, and whether its assets are there.
//
// The rules (the first acceptance criterion; goal G1 in docs/progress.md):
//   - there are at least three kits, for at least three different game types;
//   - every kit holds 40 to 50 sprites, 20 sounds and 2 music tracks (KIT_SIZE in tools/lib/assets.mjs);
//   - every kit is in the catalogue, as its plan describes it, and every asset it lists is in the catalogue.
import { KIT_SIZE } from '../../tools/lib/assets.mjs';

export const MIN_KITS = 3;
const idsOf = (list) => (list ?? []).map((x) => (typeof x === 'string' ? x : x.id));
const KINDS = [['sprites', 'sprite'], ['sounds', 'sound'], ['music', 'music']];
const words = { sprites: 'sprites', sounds: 'sounds', music: 'music tracks' };

/** Every kit: [{ id, plan, bundle }] where bundle is the catalogue's entry, or null when the catalogue has none. plans: as loadPlans() returns them. */
export function kitsOf(catalog, plans) {
  return plans.map(({ id, plan }) => ({ id, plan, bundle: catalog.bundles.find((b) => b.id === id) ?? null }));
}

/** What is wrong with one kit's size: a list of sentences, empty when it is a full kit. */
export function sizeProblems(bundle) {
  const out = [];
  for (const [field, [lo, hi]] of Object.entries(KIT_SIZE)) {
    const n = bundle[field].length;
    if (n < lo || n > hi) out.push(`${bundle.id} holds ${n} ${words[field]}; a kit holds ${lo === hi ? lo : `${lo} to ${hi}`}`);
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
  const out = [...sizeProblems(bundle)];
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

/** What is wrong with the kits as a set: too few of them, or too few kinds of game. A list of sentences. */
export function setProblems(kits) {
  const out = [];
  if (kits.length < MIN_KITS) out.push(`there ${kits.length === 1 ? 'is' : 'are'} ${kits.length} kit${kits.length === 1 ? '' : 's'} (${kits.map((k) => k.id).join(', ') || 'none'}); there must be at least ${MIN_KITS}`);
  const types = [...new Set(kits.filter((k) => k.bundle && k.bundle.gameType !== 'any').map((k) => k.bundle.gameType))];
  if (types.length < MIN_KITS) out.push(`the kits are for ${types.length} kind${types.length === 1 ? '' : 's'} of game (${types.join(', ') || 'none'}); there must be kits for at least ${MIN_KITS} different kinds`);
  return out;
}
