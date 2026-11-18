// Parts on the shipped two-legged characters: the Hero's weapon, headgear, cape and hair; the Wizard's staff, hat and beard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultParams, cleanParams, renderFrame, renderSheet, partList, partOf, frameSockets, cueInEffect, inEffect } from '../../engine/sprite.js';
import { col, ramp } from '../../engine/color.js';
import { Surface } from '../../engine/surface.js';
import * as H from '../../rigs/humanoid.js';
import knight, { weaponReach } from '../../sprites/knight.js';
import wizard from '../../sprites/wizard.js';

const frames = (s, clip) => Array.from({ length: s.clips[clip].frames }, (_, f) => f);
const everyFrame = (s) => Object.keys(s.clips).flatMap((clip) => frames(s, clip).map((f) => [clip, f]));
const look = (s, over = {}) => cleanParams(s, { ...defaultParams(s), ...over });
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };
/** Biggest per-frame pixel difference between two looks, over every frame of every clip. */
const biggestChange = (s, a, b) => Math.max(...everyFrame(s).map(([clip, f]) => diff(renderFrame(s, clip, f, a), renderFrame(s, clip, f, b))));
const ends = (s, key) => [s.params[key].min, s.params[key].max];
/** One hash per clip over all its frames (same as the numbers recorded before parts were added), for the clips named. */
function clipHashes(s, p, clips) {
  const out = {};
  for (const clip of clips) {
    let h = 2166136261;
    for (const f of frames(s, clip)) for (const v of renderFrame(s, clip, f, p).data) { h = Math.imul(h ^ (v & 0xffff), 16777619); h = Math.imul(h ^ (v >>> 16), 16777619); }
    out[clip] = (h >>> 0).toString(16).padStart(8, '0');
  }
  return out;
}
function assertInsideFrame(s, p, what) {
  const [W, Hh] = s.size;
  for (const [clip, f] of everyFrame(s)) {
    const b = renderFrame(s, clip, f, p).bounds();
    assert.ok(b, `${what}: ${clip} frame ${f} is empty`);
    assert.ok(b.x0 > 0 && b.y0 > 0 && b.x1 < W - 1 && b.y1 < Hh - 1, `${what}: ${clip} frame ${f} touches the frame edge (box ${b.x0},${b.y0}..${b.x1},${b.y1})`);
  }
}

// ---- the rig -----------------------------------------------------------------------------------

test('rig: sockets names the attach points the body computes', () => {
  const d = H.dims({});
  const P = H.pose('walk', 0.3, {}, d), J = H.solve(P, d);
  const s = H.sockets(J, P, d);
  assert.deepEqual(Object.keys(s), ['hand', 'offhand', 'head', 'back', 'feet']);
  for (const k of Object.keys(s)) for (const f of ['x', 'y', 'angle']) assert.ok(Number.isFinite(s[k][f]), `${k}.${f}`);
  assert.deepEqual([s.hand.x, s.hand.y, s.hand.angle], [J.armF.hand[0], J.armF.hand[1], P.item]);
  assert.deepEqual([s.offhand.x, s.offhand.y], J.armB.hand);
  assert.equal(s.feet.y, J.gy);
  assert.ok(s.head.y < s.back.y && s.back.y < s.feet.y, 'head above back above feet');
});

test('rig: a hold angle is added to the pose angle in every clip, never replacing it', () => {
  const d = H.dims({});
  for (const clip of ['idle', 'walk', 'run', 'jump', 'attack', 'cast', 'hurt']) for (const t of [0, 0.2, 0.45, 0.6, 0.9]) {
    const plain = H.pose(clip, t, {}, d), held = H.pose(clip, t, { hold: 0.3 }, d);
    assert.ok(Math.abs(held.item - plain.item - 0.3) < 1e-9, `${clip} at ${t}`);
    assert.deepEqual(held.armF, plain.armF, `${clip} at ${t}: the arm does not move`);
  }
});

test('rig: swing scales how far the held item travels in the attack, and 1 leaves the pose as it was', () => {
  const d = H.dims({});
  const travel = (swing) => {
    const a = Array.from({ length: 21 }, (_, i) => H.pose('attack', i / 20, { swing }, d).item);
    return Math.max(...a) - Math.min(...a);
  };
  assert.ok(travel(0.5) < travel(1) * 0.7);
  assert.ok(travel(1.3) > travel(1) * 1.05);
  for (const t of [0, 0.3, 0.5, 0.8]) assert.deepEqual(H.pose('attack', t, { swing: 1, hold: 0 }, d), H.pose('attack', t, {}, d));
  assert.equal(H.pose('attack', 0, { swing: 1.3 }, d).item, H.pose('attack', 0, {}, d).item, 'the attack still starts from rest');
  assert.equal(H.pose('attack', 1, { swing: 0.5 }, d).item, H.pose('attack', 1, {}, d).item, 'and ends on it');
});

test('rig: heldItem draws from an attach point, an angle and its own settings only', () => {
  const draw = (at, item) => { const g = new Surface(64, 64); H.heldItem(g, at, { metal: '#c2c9d6', ...item }); return g; };
  const lit = (g) => { const out = []; for (let i = 0; i < g.data.length; i++) if (g.data[i]) out.push([i % 64, Math.floor(i / 64)]); return out; };
  for (const kind of ['sword', 'axe', 'spear', 'staff']) {
    assert.ok(H.ITEM_KINDS.includes(kind));
    const at = { x: 30, y: 40, angle: 2.5 }, len = 14;
    const g = draw(at, { kind, length: len });
    const px = lit(g);
    assert.ok(px.length > 10, `${kind}: nothing drawn`);
    // it is drawn at the socket: there are pixels at the hand, and it reaches out along the socket's angle
    assert.ok(px.some(([x, y]) => Math.hypot(x + 0.5 - at.x, y + 0.5 - at.y) < 2.5), `${kind}: no pixels at the attach point`);
    const far = kind === 'staff' ? len * 0.45 : len;                     // a staff is held part-way along
    const tip = [at.x + Math.sin(at.angle) * far, at.y + Math.cos(at.angle) * far];
    assert.ok(px.some(([x, y]) => Math.hypot(x + 0.5 - tip[0], y + 0.5 - tip[1]) < 2.5), `${kind}: no pixels at its far end`);
    const reach = Math.max(...px.map(([x, y]) => Math.hypot(x + 0.5 - at.x, y + 0.5 - at.y)));
    assert.ok(reach < len + 5, `${kind}: drawn ${reach.toFixed(1)} pixels from the hand, longer than its length ${len}`);
    // it moves with the socket: the same picture, shifted by the same whole pixels
    const moved = lit(draw({ x: at.x + 7, y: at.y - 5, angle: at.angle }, { kind, length: len }));
    assert.deepEqual(moved, px.map(([x, y]) => [x + 7, y - 5]).sort((a, b) => a[1] - b[1] || a[0] - b[0]), `${kind}: did not move with the attach point`);
    // it turns with the socket's angle, and grows with its own length
    const turned = lit(draw({ ...at, angle: 1.2 }, { kind, length: len }));
    const tip2 = [at.x + Math.sin(1.2) * far, at.y + Math.cos(1.2) * far];
    assert.ok(turned.some(([x, y]) => Math.hypot(x + 0.5 - tip2[0], y + 0.5 - tip2[1]) < 2.5), `${kind}: did not turn with the angle`);
    assert.ok(!turned.some(([x, y]) => Math.hypot(x + 0.5 - tip[0], y + 0.5 - tip[1]) < 1.5), `${kind}: still points the old way`);
    assert.ok(lit(draw(at, { kind, length: len + 6 })).length > px.length, `${kind}: a longer one is not bigger`);
  }
});

test('rig: the standard held items and the hold-angle conversion live in the rig', () => {
  for (const kind of ['sword', 'axe', 'spear']) for (const k of ['length', 'back', 'pad']) assert.ok(H.ITEMS[kind][k] > 0, `${kind}.${k}`);
  assert.equal(H.holdAngle(0), 0);
  assert.ok(Math.abs(H.holdAngle(90) + Math.PI / 2) < 1e-12, 'forward (a positive Hold angle) is a smaller rig angle');
  assert.deepEqual(H.itemSize('spear', 1.2), { length: H.ITEMS.spear.length * 1.2, back: H.ITEMS.spear.back, pad: H.ITEMS.spear.pad });
  assert.equal(H.itemSize('none', 1), null);
  const p = look(knight, { weapon: 'spear', weaponLength: 1.2 });
  assert.equal(weaponReach(p), H.ITEMS.spear.length * 1.2);
});

// ---- the Hero ----------------------------------------------------------------------------------

test('Hero: weapon, headgear and cape are parts, each with settings of its own', () => {
  const byName = Object.fromEntries(partList(knight).map((p) => [p.name, p]));
  assert.deepEqual(byName.weapon.params, ['weapon', 'weaponLength', 'weaponAngle', 'weaponSwing']);
  assert.equal(byName.weapon.none, 'none');
  assert.equal(byName.weapon.socket, 'hand');
  assert.equal(byName.weapon.label, 'Weapon');
  for (const name of ['headgear', 'cape']) {
    assert.ok(byName[name], `no part "${name}"`);
    assert.ok(byName[name].controls.length >= 1, `${name} has no setting of its own`);
    assert.notEqual(byName[name].none, undefined, `${name} cannot be taken off`);
  }
  assert.equal(knight.params.weaponLength.label, 'Length');
  assert.equal(knight.params.weaponAngle.label, 'Hold angle');
  assert.equal(knight.params.weaponSwing.label, 'Swing');
  assert.equal(partOf(knight, 'height'), null);
  // what was there before is kept
  assert.equal(knight.meta.role, 'characters/player');
  assert.equal(knight.sounds.attack[0].sound, 'sword-slash');
});

test('Hero: each weapon setting changes the picture when a weapon is held', () => {
  for (const weapon of ['sword', 'axe', 'spear']) for (const key of ['weaponLength', 'weaponAngle', 'weaponSwing']) {
    const [lo, hi] = ends(knight, key);
    const n = biggestChange(knight, look(knight, { weapon, [key]: lo }), look(knight, { weapon, [key]: hi }));
    assert.ok(n > 4, `${key} with the ${weapon}: only ${n} pixels change`);
  }
});

test('Hero: weapon settings change nothing when no weapon is held', () => {
  for (const key of ['weaponLength', 'weaponAngle', 'weaponSwing']) {
    const [lo, hi] = ends(knight, key);
    assert.equal(biggestChange(knight, look(knight, { weapon: 'none', [key]: lo }), look(knight, { weapon: 'none', [key]: hi })), 0, key);
  }
});

test('Hero: every other part setting changes the picture when worn and nothing when taken off', () => {
  for (const part of partList(knight).filter((p) => p.name !== 'weapon')) for (const key of part.controls) {
    const d = knight.params[key];
    if (d.kind !== 'range') continue;
    const values = knight.params[part.selector].options.map((o) => o.value);
    for (const v of values) {
      const n = biggestChange(knight, look(knight, { [part.selector]: v, [key]: d.min }), look(knight, { [part.selector]: v, [key]: d.max }));
      if (v === part.none) assert.equal(n, 0, `${key} still changes the picture with ${part.selector}=${v}`);
      else assert.ok(n > 4, `${key} with ${part.selector}=${v}: only ${n} pixels change`);
    }
  }
});

test("Hero: the sword's tip follows the hand socket in every frame of every clip", () => {
  const [l0, l1] = ends(knight, 'weaponLength'), [a0, a1] = ends(knight, 'weaponAngle'), [s0, s1] = ends(knight, 'weaponSwing');
  const looks = [{}, { weaponLength: l0 }, { weaponLength: l1 }, { weaponAngle: a0 }, { weaponAngle: a1 }, { weaponSwing: s0 }, { weaponSwing: s1 }, { height: 1, weaponLength: l1, weaponAngle: a1 }];
  for (const over of looks) {
    const p = look(knight, { weapon: 'sword', ...over });
    const len = weaponReach(p);
    assert.ok(len > 5, 'weaponReach gives the length in pixels');
    const tipColours = new Set([col(ramp(p.metal).light), col('#ffffff')]);        // white while the hit flash is on
    for (const [clip, f] of everyFrame(knight)) {
      const { hand } = frameSockets(knight, clip, f, p);
      const tx = hand.x + Math.sin(hand.angle) * len, ty = hand.y + Math.cos(hand.angle) * len;
      const got = renderFrame(knight, clip, f, p).get(Math.floor(tx), Math.floor(ty));
      assert.ok(tipColours.has(got), `${JSON.stringify(over)} ${clip} frame ${f}: no sword tip at ${tx.toFixed(1)},${ty.toFixed(1)}`);
    }
  }
  // the angle setting turns the socket, by the same amount in every frame
  const base = look(knight, {}), turned = look(knight, { weaponAngle: a1 });
  const turn = frameSockets(knight, 'idle', 0, turned).hand.angle - frameSockets(knight, 'idle', 0, base).hand.angle;
  assert.ok(Math.abs(turn) > 0.2);
  for (const [clip, f] of [['walk', 3], ['run', 5], ['hurt', 1]]) {
    const d = frameSockets(knight, clip, f, turned).hand.angle - frameSockets(knight, clip, f, base).hand.angle;
    assert.ok(Math.abs(d - turn) < 1e-6, `${clip} frame ${f}`);
  }
});

test('Hero: with no weapon the attack is an unarmed one and no blade trail is drawn', () => {
  const white = col('#ffffff');
  const whites = (p, f) => renderFrame(knight, 'attack', f, p).data.filter((v) => v === white).length;
  const armed = look(knight, { weapon: 'sword' }), bare = look(knight, { weapon: 'none' });
  assert.ok(Math.max(...frames(knight, 'attack').map((f) => whites(armed, f))) > 10, 'the sword attack has a trail');
  for (const f of frames(knight, 'attack')) assert.ok(whites(bare, f) <= 2, `unarmed attack frame ${f} has ${whites(bare, f)} white pixels`);
  const far = Math.max(...frames(knight, 'attack').map((f) => {
    const a = frameSockets(knight, 'attack', f, armed).hand, b = frameSockets(knight, 'attack', f, bare).hand;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }));
  assert.ok(far > 3, `the unarmed attack moves the hand like the sword attack (at most ${far.toFixed(1)} pixels apart)`);
  // it reads as a punch: the fist is drawn back behind where it rests, thrown well out in front, and comes home
  const xs = frames(knight, 'attack').map((f) => frameSockets(knight, 'attack', f, bare).hand.x);
  const rest = frameSockets(knight, 'idle', 0, bare).hand.x;
  assert.ok(Math.max(...xs) > rest + 11, `the fist reaches only ${(Math.max(...xs) - rest).toFixed(1)} pixels in front of where it rests`);
  assert.ok(Math.min(...xs) < rest - 2, `the fist is drawn back only ${(rest - Math.min(...xs)).toFixed(1)} pixels`);
  assert.ok(xs.indexOf(Math.min(...xs)) < xs.indexOf(Math.max(...xs)), 'wind-up comes before the punch');
  assert.ok(Math.abs(xs[xs.length - 1] - xs[0]) < 0.01, 'it ends where it began');
  // the body goes with it: the head travels forward during the punch and rocks back after
  const heads = frames(knight, 'attack').map((f) => frameSockets(knight, 'attack', f, bare).head.x);
  assert.ok(Math.max(...heads) - heads[0] > 3 && heads[0] - Math.min(...heads) > 0.8, `head x: ${heads.map((v) => v.toFixed(1)).join(' ')}`);
});

test("Hero: the Metal colour is in effect only when something metal is worn or held", () => {
  const colours = knight.params.metal.swatches;
  for (const weapon of ['sword', 'none']) for (const headgear of ['helmet', 'crown', 'none']) {
    const a = look(knight, { weapon, headgear, metal: colours[0] }), b = look(knight, { weapon, headgear, metal: colours[2] });
    const shows = weapon !== 'none' || headgear === 'helmet';
    assert.equal(inEffect(knight, 'metal', a), shows, `weapon=${weapon} headgear=${headgear}`);
    const n = biggestChange(knight, a, b);
    if (shows) assert.ok(n > 4, `metal with weapon=${weapon} headgear=${headgear}: only ${n} pixels change`);
    else assert.equal(n, 0, `metal still changes ${n} pixels with weapon=${weapon} headgear=${headgear}`);
  }
});

test('Hero: a link made when the cape was on/off still opens with the right cape', () => {
  assert.equal(cleanParams(knight, { cape: 'false' }).cape, 'none');
  assert.equal(cleanParams(knight, { cape: 'true' }).cape, 'plain');
  assert.equal(cleanParams(knight, { cape: 'tattered' }).cape, 'tattered');
});

test('Hero: the tallest Hero with the longest weapon at the widest angles stays inside the frame in every clip', () => {
  const [, l1] = ends(knight, 'weaponLength');
  const big = { height: 1, head: 1, bounce: 1, stride: 1, weaponLength: l1 };
  for (const weapon of ['sword', 'axe', 'spear']) for (const weaponAngle of ends(knight, 'weaponAngle')) for (const weaponSwing of ends(knight, 'weaponSwing')) for (const build of [0, 1]) {
    for (const part of [{ headgear: 'helmet', headgearSize: knight.params.headgearSize.max }, { headgear: 'crown', headgearSize: knight.params.headgearSize.max, capeLength: knight.params.capeLength.max }]) {
      const over = { ...big, weapon, weaponAngle, weaponSwing, build, ...part };
      assertInsideFrame(knight, look(knight, over), JSON.stringify(over));
    }
  }
});

test('Hero: exported metadata lists the parts and gives every frame its attach points', () => {
  const p = look(knight, { weapon: 'axe', cape: 'none' });
  const m = renderSheet(knight, p).meta;
  assert.deepEqual(Object.keys(m.parts).sort(), partList(knight).map((x) => x.name).sort());
  assert.deepEqual(m.parts.weapon, { label: 'Weapon', socket: 'hand', present: true, settings: { weapon: 'axe', weaponLength: p.weaponLength, weaponAngle: p.weaponAngle, weaponSwing: p.weaponSwing } });
  assert.equal(m.parts.cape.present, false);
  assert.deepEqual(m.parts.cape.settings, { cape: 'none' });
  assert.equal(m.frames.length, everyFrame(knight).length);
  for (const f of m.frames) {
    assert.deepEqual(Object.keys(f.sockets), ['hand', 'offhand', 'head', 'back', 'feet'], f.name);
    for (const s of Object.values(f.sockets)) assert.ok(s.x > 0 && s.x < 64 && s.y > 0 && s.y < 64 && Number.isFinite(s.angle), `${f.name} ${JSON.stringify(s)}`);
  }
});

// Recorded on 2026-11-18 from the sprites as they were before parts existed.
const BEFORE = {
  'knight headgear=none': { idle: '0ddd7f87', walk: '768efa08', run: '809d22b7', jump: '6d4de220', attack: 'd5f647c8', hurt: '6cf1ad9d' },
  'knight headgear=crown': { idle: '9e7b1fbb', walk: 'df461fa4', run: '7dbb0337', jump: 'fceb7c14', attack: 'db4d82a6', hurt: '67ac5a6b' },
  'knight hairStyle=bald': { idle: 'efa76d57', walk: '0c4f7698', run: 'dd9422ff', jump: '74d5227f', attack: 'fd6ee33a', hurt: 'e4533d43' },
  'knight hairStyle=long': { idle: '8452da7b', walk: 'e07d9910', run: '10901c33', jump: '3eb1c2d5', attack: '78c74421', hurt: '006c6641' },
  'knight tall': { idle: '8ce5b055', walk: '6e92c257', run: 'ebfdb018', jump: '0816ddca', attack: '5130f484', hurt: '16b9deaa' },
  'wizard default': { idle: '62caf596', walk: '9a882e74', run: '47a03e43', jump: 'b59d6947', cast: '418da5d5', hurt: '426887cc' },
  'wizard hood': { idle: 'd02a4526', walk: 'f0e06efc', run: '3d1dfd55', jump: '1e0f76bc', cast: 'f0ceaadc', hurt: 'dcf6f45a' },
  'wizard tall': { idle: 'c31d188e', walk: 'ece6d761', run: 'd23842f6', jump: '44b4f949', cast: 'f04b79ee', hurt: '2fc1289f' },
};

test('Hero: at default part settings the picture is what it was before parts', () => {
  // The one deliberate change: short hair now shows under the helmet (the hair colour did nothing there before),
  // so the default look is compared without hair, and the hair styles are compared without that helmet.
  assert.deepEqual(clipHashes(knight, look(knight, { hairStyle: 'bald' }), Object.keys(BEFORE['knight hairStyle=bald'])), BEFORE['knight hairStyle=bald']);
  assert.deepEqual(clipHashes(knight, look(knight, { headgear: 'none' }), Object.keys(BEFORE['knight headgear=none'])), BEFORE['knight headgear=none']);
  assert.deepEqual(clipHashes(knight, look(knight, { headgear: 'crown' }), Object.keys(BEFORE['knight headgear=crown'])), BEFORE['knight headgear=crown']);
  assert.deepEqual(clipHashes(knight, look(knight, { hairStyle: 'long' }), Object.keys(BEFORE['knight hairStyle=long'])), BEFORE['knight hairStyle=long']);
  assert.deepEqual(clipHashes(knight, look(knight, { height: 1, build: 1, head: 1, headgear: 'none' }), Object.keys(BEFORE['knight tall'])), BEFORE['knight tall']);
});

// ---- the Wizard --------------------------------------------------------------------------------

test('Wizard: the staff, the hat and the beard are the parts weapon, headgear and beard; the staff has a length and a hold angle', () => {
  const byName = Object.fromEntries(partList(wizard).map((p) => [p.name, p]));
  // the part names of the style guide (section 9); on screen they are still called Staff and Hat
  assert.deepEqual(Object.keys(byName).sort(), ['beard', 'headgear', 'weapon']);
  assert.equal(byName.weapon.label, 'Staff');
  assert.equal(byName.headgear.label, 'Hat');
  // the controls keep the keys they had, so links and bag items saved before the rename open the same wizard
  assert.deepEqual(byName.weapon.params, ['staff', 'staffLength', 'staffAngle']);
  assert.equal(byName.weapon.socket, 'hand');
  assert.equal(wizard.params.staffLength.label, 'Length');
  assert.equal(wizard.params.staffAngle.label, 'Hold angle');
  assert.equal(byName.headgear.selector, 'hat');
  assert.equal(byName.beard.selector, 'beard');
  assert.equal(byName.beard.none, 'none');
  const old = { hat: 'hood', staff: 'crook', staffLength: 0.7, staffAngle: 10, beard: 'short' };
  const p = cleanParams(wizard, old);
  for (const [k, v] of Object.entries(old)) assert.equal(p[k], v, `a saved ${k} is kept`);
  const m = renderSheet(wizard, p, { clips: ['idle'] }).meta;
  assert.deepEqual(m.parts.weapon.settings, { staff: 'crook', staffLength: 0.7, staffAngle: 10 });
  assert.deepEqual(m.parts.headgear.settings, { hat: 'hood' });
});

test('Wizard: default-settings renders are unchanged', () => {
  assert.deepEqual(clipHashes(wizard, defaultParams(wizard), Object.keys(BEFORE['wizard default'])), BEFORE['wizard default']);
  assert.deepEqual(clipHashes(wizard, look(wizard, { height: 1, build: 1, head: 1 }), Object.keys(BEFORE['wizard tall'])), BEFORE['wizard tall']);
  assert.deepEqual(clipHashes(wizard, look(wizard, { hat: 'hood', beard: 'none' }), Object.keys(BEFORE['wizard hood'])), BEFORE['wizard hood'], 'the hood is hairless, as it was');
});

test('Wizard: the hair and beard colour is in effect unless the hood hides the hair and there is no beard', () => {
  const colours = wizard.params.beardColor.swatches;
  for (const beard of ['long', 'short', 'none']) for (const hat of wizard.params.hat.options.map((o) => o.value)) {
    const a = look(wizard, { hat, beard, beardColor: colours[0] }), b = look(wizard, { hat, beard, beardColor: colours[5] });
    const shows = !(hat === 'hood' && beard === 'none');
    assert.equal(inEffect(wizard, 'beardColor', a), shows, `hat=${hat} beard=${beard}`);
    const n = biggestChange(wizard, a, b);
    if (shows) assert.ok(n > 4, `hair and beard colour with hat=${hat}, beard=${beard}: only ${n} pixels change`);
    else assert.equal(n, 0, 'nothing of the hair shows under the hood without a beard');
  }
});

test('Hero: the hair colour shows with every hair style under the helmet, and bald switches it off', () => {
  const colours = knight.params.hair.swatches;
  for (const hairStyle of ['short', 'long', 'spiky', 'ponytail']) for (const headgear of ['helmet', 'crown', 'none']) {
    const a = look(knight, { hairStyle, headgear, hair: colours[0] }), b = look(knight, { hairStyle, headgear, hair: colours[5] });
    assert.equal(inEffect(knight, 'hair', a), true);
    assert.ok(biggestChange(knight, a, b) > 4, `hair colour with ${hairStyle} hair and headgear=${headgear}`);
  }
  assert.equal(inEffect(knight, 'hair', look(knight, { hairStyle: 'bald' })), false);
  assert.equal(biggestChange(knight, look(knight, { hairStyle: 'bald', hair: colours[0] }), look(knight, { hairStyle: 'bald', hair: colours[5] })), 0);
});

test('Hero: the blade sound plays only when a weapon is held, and the unarmed attack has its own sound', () => {
  const cues = knight.sounds.attack;
  const playing = (weapon) => cues.filter((c) => cueInEffect(knight, c, look(knight, { weapon }))).map((c) => c.sound);
  for (const weapon of ['sword', 'axe', 'spear']) assert.deepEqual(playing(weapon), ['sword-slash'], weapon);
  const bare = playing('none');
  assert.equal(bare.length, 1);
  assert.notEqual(bare[0], 'sword-slash');
  // blocking: metal rings only when there is a weapon to take the blow; bare arms have a sound of their own (style guide, section 9)
  const blocking = (weapon) => knight.sounds.block.filter((c) => cueInEffect(knight, c, look(knight, { weapon }))).map((c) => c.sound);
  for (const weapon of ['sword', 'axe', 'spear']) assert.deepEqual(blocking(weapon), ['metal-hit'], weapon);
  assert.equal(blocking('none').length, 1);
  assert.notEqual(blocking('none')[0], 'metal-hit');
  // every other animation's sounds always play
  for (const [clip, list] of Object.entries(knight.sounds)) if (clip !== 'attack' && clip !== 'block') for (const c of list) assert.equal(c.when, undefined, clip);
});

test('Wizard: staff length, hold angle and kind each change the picture', () => {
  for (const key of ['staffLength', 'staffAngle']) {
    const [lo, hi] = ends(wizard, key);
    const n = biggestChange(wizard, look(wizard, { [key]: lo }), look(wizard, { [key]: hi }));
    assert.ok(n > 4, `${key}: only ${n} pixels change`);
  }
  const kinds = wizard.params.staff.options.map((o) => o.value);
  assert.ok(kinds.length >= 2);
  for (let i = 0; i < kinds.length; i++) for (let j = i + 1; j < kinds.length; j++) {
    assert.ok(biggestChange(wizard, look(wizard, { staff: kinds[i] }), look(wizard, { staff: kinds[j] })) > 4, `${kinds[i]} and ${kinds[j]} look the same`);
  }
});

test('Wizard: the hand socket is where the hand is drawn, with the staff running through it, in every frame', () => {
  const wood = new Set(['base', 'light', 'dark', 'deep'].map((k) => col(ramp('#8a5a34')[k])).concat(col('#ffffff')));
  const near = (g, x, y, r, ok) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (ok(g.get(Math.floor(x) + dx, Math.floor(y) + dy))) return true; return false; };
  for (const over of [{}, { staffLength: wizard.params.staffLength.max, staffAngle: wizard.params.staffAngle.max }, { height: 1, staffAngle: wizard.params.staffAngle.min }, { height: 0, build: 1, staff: 'crook' }]) {
    const p = look(wizard, over);
    const skin = new Set([col(ramp(p.skin).base), col('#ffffff')]);          // white while the hit flash is on
    for (const [clip, f] of everyFrame(wizard)) {
      const s = frameSockets(wizard, clip, f, p);
      assert.deepEqual(Object.keys(s), ['hand', 'offhand', 'head', 'back', 'feet']);
      const g = renderFrame(wizard, clip, f, p);
      const what = `${JSON.stringify(over)} ${clip} frame ${f}`;
      assert.ok(near(g, s.hand.x, s.hand.y, 1, (v) => skin.has(v)), `${what}: no hand drawn at the hand socket ${s.hand.x.toFixed(1)},${s.hand.y.toFixed(1)}`);
      // the staff runs through the hand along the socket's angle: wood above the hand, and below it past the hanging sleeve
      for (const along of [4, 7, -8]) {
        const x = s.hand.x + Math.sin(s.hand.angle) * along, y = s.hand.y + Math.cos(s.hand.angle) * along;
        // talking, the free hand reaches out in front of the staff and covers that much of it
        if (clip === 'talk' && Math.hypot(x - s.offhand.x, y - s.offhand.y) < 5) continue;
        assert.ok(near(g, x, y, 1, (v) => wood.has(v)), `${what}: no staff ${along} pixels along the socket angle`);
      }
    }
  }
});

test('Wizard: the tallest wizard with the longest staff stays in the frame', () => {
  const [, l1] = ends(wizard, 'staffLength');
  for (const staff of wizard.params.staff.options.map((o) => o.value)) for (const staffAngle of ends(wizard, 'staffAngle')) for (const hat of ['pointed', 'wide']) {
    const over = { height: 1, head: 1, build: 1, bounce: 1, stride: 1, spell: 1, staff, staffLength: l1, staffAngle, hat };
    assertInsideFrame(wizard, look(wizard, over), JSON.stringify(over));
  }
});
