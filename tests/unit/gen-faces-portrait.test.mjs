// Migration batch M4b (docs/data-sprites.md section 9, M1 to M40; 3.3 family "face"): portrait@1 (engine/gen/faces.js),
// the generator the two library portrait sets name, a port of engine/faces.js portrait drawn on a paint-ref grid
// (engine/gen/ports/faces.js). Held here to what the code paints, pixel for pixel, for every person of the two sets
// and for every word each argument takes, at skins light and dark (the two colour tests the code made on the skin's
// brightness are ifLight colour rules in the port), and to the goldens harness (tests/helpers/gen-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';
import { Surface } from '../../engine/surface.js';
import { brightness, INK } from '../../engine/color.js';
import { PALETTE } from '../../engine/palettes.js';
import { oldReplay } from '../helpers/old-replay.mjs';
import { paintColour } from '../../engine/data-rules.js';
import { drawList } from '../../engine/draw-list.js';

const OLD = oldReplay('gen-faces-portrait');   // what engine/faces.js (deleted by R3) drew, recorded in the order of the calls (tests/helpers/old-replay.mjs)
// what engine/faces.js offered: every mood, hair style, headgear, collar and beard word, and the mouth's step by clip frame
const FACE_MOODS = ['neutral', 'happy', 'worried', 'hurt', 'angry', 'surprised'];
const FACE_HAIR = ['short', 'long', 'spiky', 'ponytail', 'bald', 'bowl', 'pigtails', 'balding'];
const FACE_HEADGEAR = ['none', 'helmet', 'kettle hat', 'hat-pointed', 'hat-wide', 'hood', 'turban', 'cap'];
const FACE_COLLARS = ['none', 'mantle', 'scarf', 'collar', 'vee', 'apron', 'tabard'];
const FACE_BEARDS = ['none', 'short', 'long'];
const talkStep = (frame) => [0, 1, 2, 1][frame % 4];
const P = PALETTE.hearthvale;
// the slots a portrait call names here, and their colours
const HEX = {
  ink: INK, skin: P.skin, white: '#ffffff', backing: P.panel, edge: P.cream, wood: P.wood, cream: P.cream, crimson: P.crimson, gold: P.gold,
  steel: P.steel, wheat: P.wheat, slate: P.slate, roof: P.roof, cobble: P.cobble, hero: P.hero, mage: P.mage, rogue: P.rogue,
};
const light = (slot) => Math.round(brightness(HEX[slot]) * 10000) / 10000;

/** A portrait@1 call and the engine/faces.js person it stands for, from one description in slot names. */
function both(d) {
  const hex = (s) => (s === undefined ? undefined : HEX[s]);
  const args = {
    skin: d.skin ?? 'skin', white: 'white', backing: 'backing', edge: 'edge',
    hair: d.hair ?? 'bald', hairPaint: d.hairPaint ?? 'wood', hairLight: light(d.hairPaint ?? 'wood'),
    outfit: d.outfit ?? 'cobble', collar: d.collar ?? 'none', outfitPaints: { trim: d.trim ?? d.outfit ?? 'cobble', panel: d.panel ?? 'hero', ...(d.clasp ? { clasp: d.clasp } : {}) },
    ...(d.age ? { age: d.age } : {}), ...(d.build !== undefined ? { build: d.build } : {}), ...(d.neck !== undefined ? { neck: d.neck } : {}),
    ...(d.brows ? { brows: d.brows } : {}),
    ...(d.beard ? { beard: d.beard, beardPaint: d.beardPaint, beardLight: light(d.beardPaint), ...(d.beardLength ? { beardLength: d.beardLength } : {}) } : {}),
    ...(d.headgear ? { headgear: d.headgear.replace(' ', '-'), gearPaints: { cloth: d.gear ?? 'roof', metal: d.metal ?? 'steel', ...(d.plume ? { plume: d.plume } : {}), ...(d.band ? { band: d.band } : {}), ...(d.jewel ? { jewel: d.jewel } : {}) } } : {}),
    ...(d.spectacles ? { spectacles: { wire: 'slate', lens: 'cream' } } : {}),
    ...(d.carried ? { carried: d.carried, carriedPaints: { metal: 'steel', wood: 'wood' } } : {}),
  };
  const person = {
    skin: hex(args.skin), age: d.age, build: d.build, neck: d.neck, brows: d.brows,
    hair: { style: args.hair, colour: hex(args.hairPaint) },
    ...(d.beard ? { beard: { kind: d.beard, colour: hex(d.beardPaint), length: d.beardLength } } : {}),
    ...(d.headgear ? { headgear: { kind: d.headgear, colour: hex(d.gear ?? 'roof'), metal: hex(d.metal ?? 'steel'), plume: hex(d.plume), band: hex(d.band), jewel: hex(d.jewel) } } : {}),
    ...(d.spectacles ? { spectacles: { frame: HEX.slate, lens: HEX.cream } } : {}),
    outfit: { colour: hex(args.outfit), collar: args.collar, trim: hex(args.outfitPaints.trim), clasp: hex(d.clasp), panel: hex(args.outfitPaints.panel) },
    ...(d.carried ? { carried: { kind: d.carried, metal: HEX.steel, wood: HEX.wood } } : {}),
  };
  return { args, person };
}

// the seven people of the two library sets (sprites/portraits-party, portraits-village), as their code sprites said
const PEOPLE = {
  hero: { build: 0.6, hair: 'short', headgear: 'helmet', plume: 'crimson', outfit: 'hero', collar: 'mantle', trim: 'crimson', clasp: 'gold' },
  mage: { age: 'elder', build: 0.7, brows: 'bushy', hair: 'long', hairPaint: 'cream', beard: 'long', beardPaint: 'cream', headgear: 'hat-pointed', gear: 'mage', band: 'gold', outfit: 'mage', collar: 'vee', trim: 'gold' },
  rogue: { build: 0.35, hair: 'bald', hairPaint: 'wheat', headgear: 'hood', gear: 'rogue', outfit: 'rogue', collar: 'scarf', trim: 'slate' },
  elder: { age: 'elder', build: 0.3, brows: 'bushy', hair: 'balding', hairPaint: 'cream', beard: 'long', beardPaint: 'cream', outfit: 'cobble', collar: 'vee', trim: 'roof' },
  merchant: { build: 0.2, neck: 1, hair: 'ponytail', headgear: 'turban', gear: 'roof', jewel: 'gold', spectacles: true, outfit: 'wheat', collar: 'apron', trim: 'roof' },
  guard: { build: 0.9, hair: 'short', headgear: 'helmet', plume: 'wheat', outfit: 'cobble', collar: 'tabard', panel: 'hero', trim: 'wheat', carried: 'halberd' },
  kid: { age: 'child', hair: 'short', outfit: 'wheat', collar: 'collar', trim: 'roof' },
};
// skins: the default, a dark one, one close to the wood hair and one close to the cream hair and beard
const SKINS = { skin: P.skin, dark: '#5a3a22', near: '#a87850', pale: '#efe6d2' };

function codeDraw(person, o) { return OLD.surface(48, 48); }
function genDraw(args, o, palette, ctx = { size: [48, 48] }) {
  const r = registry.runGenerator({ gen: 'portrait', v: 1, at: [24, 24], ...args, ...o }, ctx);
  assert.ok(r.ok, r.errors.join('; '));
  const fix = (v) => (v && typeof v === 'object' && v.rule ? paintColour(v, palette) : v);
  const prims = r.primitives.map((p) => ({ ...p, key: Object.fromEntries(Object.entries(p.key).map(([k, v]) => [k, fix(v)])) }));
  const g = new Surface(48, 48);
  drawList(g, prims, { palette });
  return g;
}
function differ(a, b) {
  const out = [];
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) out.push([i % a.w, Math.floor(i / a.w)]);
  return out;
}
function same(d, o, label, skin = 'skin') {
  const palette = { ...HEX, skin: SKINS[skin] };
  const { args, person } = both(d);
  person.skin = SKINS[skin];
  const want = codeDraw(person, { mood: o.mood, mouth: o.mouth ?? 0, zoom: o.zoom ?? 0.5, frame: o.frame ?? 'none', backing: HEX.backing, band: HEX.edge });
  const got = genDraw(args, { ...(o.mood ? { mood: o.mood } : {}), ...(o.mouth ? { mouth: o.mouth } : {}), ...(o.zoom !== undefined ? { zoom: o.zoom } : {}), ...(o.frame ? { frame: o.frame } : {}) }, palette);
  assert.deepEqual(differ(want, got).slice(0, 6), [], `${label} (skin ${skin}): pixels differ`);
}

test('portrait@1 draws each person of the two library sets as engine/faces.js draws them, every mood, zoom, border and skin', () => {
  for (const [who, d] of Object.entries(PEOPLE)) for (const mood of FACE_MOODS) for (const skin of Object.keys(SKINS)) {
    same(d, { mood, zoom: 0.5 }, `${who} ${mood}`, skin);
  }
  for (const [who, d] of Object.entries(PEOPLE)) for (const zoom of [0, 0.25, 1]) for (const frame of ['none', 'round', 'square']) same(d, { zoom, frame }, `${who} zoom ${zoom} ${frame}`);
});

test('portrait@1 draws every hair style, headgear, beard and collar, and the mouth half and wide open, as engine/faces.js', () => {
  for (const hair of FACE_HAIR) for (const skin of Object.keys(SKINS)) same({ hair, hairPaint: 'wood' }, {}, `hair ${hair}`, skin);
  for (const headgear of FACE_HEADGEAR.filter((g) => g !== 'none')) same({ hair: 'short', headgear, plume: 'crimson', band: 'gold', jewel: 'gold', gear: 'roof' }, {}, `headgear ${headgear}`);
  for (const beard of FACE_BEARDS.filter((b) => b !== 'none')) for (const skin of Object.keys(SKINS)) same({ hair: 'short', beard, beardPaint: 'cream', beardLength: 1.3 }, {}, `beard ${beard}`, skin);
  for (const collar of FACE_COLLARS) same({ hair: 'short', outfit: 'hero', collar, trim: 'crimson', clasp: 'gold', panel: 'roof' }, { zoom: 0 }, `collar ${collar}`);
  for (const carried of ['halberd', 'spear']) same({ hair: 'short', carried }, {}, `carried ${carried}`);
  for (const mouth of [1, 2]) same(PEOPLE.mage, { mouth }, `mouth ${mouth}`);
});

test('a talk call opens and closes the mouth with the clip\'s frames: closed, half, open, half', () => {
  const { args } = both(PEOPLE.hero), palette = HEX;
  const frames = [0, 1, 2, 3, 4].map((frame) => genDraw({ ...args, talk: true }, {}, palette, { size: [48, 48], frame, frames: 4, loop: true }));
  for (const f of [0, 1, 2, 3]) assert.deepEqual(differ(frames[f], genDraw(args, { mouth: talkStep(f) }, palette)), [], `frame ${f}`);
  assert.deepEqual(differ(frames[4], frames[0]), [], 'the loop closes');
  assert.ok(differ(frames[0], frames[2]).length > 0, 'the mouth moves');
});

test('portrait@1 passes the goldens harness', () => {
  const hero = both(PEOPLE.hero).args, guard = both(PEOPLE.guard).args, mage = both(PEOPLE.mage).args;
  checkGeneratorContract(registry, registry.generator('portrait', 1), { cases: [
    { args: { at: [24, 24], ...hero } },
    { args: { at: [20, 30], ...guard, mood: 'worried', zoom: 1, frame: 'round' } },
    { args: { at: [24, 24], ...mage, talk: true, frame: 'square', zoom: 0 }, ctx: { frame: 2, frames: 4, loop: true, size: [48, 48] } },
  ] });
});
