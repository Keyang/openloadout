// hero-walker: the first top-down character, built on rigs/topdown.js, exactly to its row in
// bundles/specs/kit-rpg-fantasy.md (batch R03). Every later top-down character is modelled on it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultParams, cleanParams, renderFrame, renderSheet, partList, frameSockets, cueInEffect, inEffect, clipFps } from '../../engine/sprite.js';
import { col, INK, brightness } from '../../engine/color.js';
import { PALETTE } from '../../engine/palettes.js';
import { validateMeta } from '../../catalog/schema.js';
import * as T from '../../rigs/topdown.js';
import { codeSprite } from '../helpers/library.mjs';   // the code, frozen first (tests/helpers/library.mjs): a test about the framework it uses
const hero = await codeSprite('hero-walker');
const knight = await codeSprite('knight');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HV = PALETTE.hearthvale;
const CLIPS = ['idle_down', 'idle_up', 'idle_side', 'walk_down', 'walk_up', 'walk_side', 'attack_down', 'attack_up', 'attack_side', 'hurt', 'die'];
const frames = (clip) => Array.from({ length: hero.clips[clip].frames }, (_, f) => f);
const everyFrame = () => CLIPS.flatMap((clip) => frames(clip).map((f) => [clip, f]));
const look = (over = {}) => cleanParams(hero, { ...defaultParams(hero), ...over });
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };
const count = (g, hex) => { const v = col(hex); let n = 0; for (const x of g.data) if (x === v) n++; return n; };
const ends = (key) => [hero.params[key].min, hero.params[key].max];
const ALL_LOW = () => { const p = {}; for (const [k, d] of Object.entries(hero.params)) p[k] = d.kind === 'range' ? d.min : d.kind === 'choice' ? d.options[0].value : d.def; return look(p); };
const ALL_HIGH = () => { const p = {}; for (const [k, d] of Object.entries(hero.params)) p[k] = d.kind === 'range' ? d.max : d.kind === 'choice' ? d.options.at(-1).value : d.def; return look(p); };
function assertInside(p, what) {
  const [W, H] = hero.size;
  for (const [clip, f] of everyFrame()) {
    const b = renderFrame(hero, clip, f, p).bounds();
    assert.ok(b, `${what}: ${clip} frame ${f} is empty`);
    assert.ok(b.x0 > 0 && b.y0 > 0 && b.x1 < W - 1 && b.y1 < H - 1, `${what}: ${clip} frame ${f} touches the frame edge (${b.x0},${b.y0}..${b.x1},${b.y1})`);
  }
}

// ---- the specification row -----------------------------------------------------------------------

test('hero-walker: id, name, frame, pivot, preview and metadata are the specification row', () => {
  assert.equal(hero.id, 'hero-walker');
  assert.equal(hero.name, 'Hero (map)');
  assert.deepEqual(hero.size, [48, 48]);
  assert.deepEqual(hero.pivot, [24, 42]);
  assert.equal(hero.preview, 'walk_down');
  assert.equal(hero.kind, 'Character');
  assert.equal(hero.meta.type, 'character');
  assert.equal(hero.meta.role, 'characters/player');
  assert.equal(hero.meta.view, 'top-down');
  assert.equal(hero.meta.themes[0], 'fantasy');
  assert.equal(hero.meta.gameTypes[0], 'turn-based-rpg');
  assert.ok(hero.meta.gameTypes.includes('top-down-rpg'));
  assert.equal(hero.meta.license, 'draft');
  assert.ok(hero.meta.words.length >= 6 && hero.meta.words.length <= 14);
  const v = validateMeta(hero.meta, 'sprite');
  assert.ok(v.ok, v.errors.join('; '));
  assert.ok(typeof hero.blurb === 'string' && hero.blurb.length > 20);
});

test('hero-walker: the 11 clips of the "Full" level, in the fixed order, with the standard frames, speeds and labels', () => {
  assert.deepEqual(Object.keys(hero.clips), CLIPS);
  const want = { idle: [8, true, 7], walk: [8, true, 10], attack: [8, false, 13], hurt: [4, false, 9], die: [8, false, 10] };
  for (const clip of CLIPS) {
    const { action, direction } = T.parseClip(clip), [n, loop, fps] = want[action], c = hero.clips[clip];
    assert.deepEqual([c.frames, c.loop], [n, loop], clip);
    assert.equal(clipFps(hero, clip, look({ speed: 0.5 })), Math.round(fps * 1.05), `${clip} speed`);
    assert.ok(clipFps(hero, clip, look({ speed: 1 })) > clipFps(hero, clip, look({ speed: 0 })), `${clip}: Speed is wired in`);
    if (clip.includes('_')) assert.equal(c.label, `${action[0].toUpperCase()}${action.slice(1)} (${direction})`);
  }
});

test('hero-walker: three parts with the specification\'s options and settings, on the standard sockets', () => {
  assert.deepEqual(partList(hero).map((p) => [p.name, p.selector, p.controls, p.none, p.socket]), [
    ['weapon', 'weapon', ['weaponLength'], 'none', 'hand'],
    ['headgear', 'headgear', ['headgearSize'], 'none', 'head'],
    ['cape', 'cape', ['capeLength'], 'none', 'back'],
  ]);
  const options = (k) => hero.params[k].options.map((o) => o.value);
  assert.deepEqual(options('weapon'), ['sword', 'axe', 'spear', 'none']);
  assert.deepEqual(options('headgear'), ['helmet', 'crown', 'none']);
  assert.deepEqual(options('cape'), ['plain', 'tattered', 'none']);
  for (const k of ['weaponLength', 'headgearSize', 'capeLength']) {
    assert.equal(hero.params[k].kind, 'range');
    assert.equal(hero.params[k].def, 1, `${k} is a multiplier with default 1`);
    assert.ok(['Length', 'Size'].includes(hero.params[k].label), `${k}: short label inside a part`);
  }
});

test('hero-walker: 11 controls of its own plus 6 in parts, with the standard keys, labels and groups', () => {
  const own = ['height', 'build', 'hairStyle', 'skin', 'hair', 'outfit', 'trim', 'metal', 'bounce', 'stride', 'speed'];
  const inParts = ['weapon', 'weaponLength', 'headgear', 'headgearSize', 'cape', 'capeLength'];
  assert.deepEqual(Object.keys(hero.params).sort(), [...own, ...inParts].sort());
  assert.deepEqual(Object.keys(hero.params).filter((k) => !inParts.includes(k)), ['height', 'build', 'hairStyle', 'skin', 'hair', 'outfit', 'trim', 'metal', 'bounce', 'stride', 'speed'].sort((a, b) => Object.keys(hero.params).indexOf(a) - Object.keys(hero.params).indexOf(b)));
  // order: look sliders and choices, then each part's settings together, then colours, then motion
  const keys = Object.keys(hero.params), at = (k) => keys.indexOf(k);
  assert.ok(at('height') < at('build') && at('build') < at('hairStyle') && at('hairStyle') < at('weapon'));
  for (const [sel, set] of [['weapon', 'weaponLength'], ['headgear', 'headgearSize'], ['cape', 'capeLength']]) assert.equal(at(set), at(sel) + 1, `${set} follows ${sel}`);
  assert.ok(at('capeLength') < at('skin') && at('metal') < at('bounce') && at('bounce') < at('stride') && at('stride') < at('speed'));
  const P = hero.params;
  assert.deepEqual([P.height.label, P.height.lo, P.height.hi], ['Height', 'Short', 'Tall']);
  assert.deepEqual([P.build.label, P.build.lo, P.build.hi], ['Build', 'Slim', 'Stocky']);
  assert.deepEqual([P.bounce.label, P.bounce.lo, P.bounce.hi, P.bounce.group], ['Bounce', 'Calm', 'Bouncy', 'Motion']);
  assert.deepEqual([P.stride.label, P.stride.lo, P.stride.hi, P.stride.group], ['Stride', 'Small steps', 'Big steps', 'Motion']);
  assert.deepEqual([P.speed.label, P.speed.lo, P.speed.hi, P.speed.group], ['Speed', 'Slow', 'Fast', 'Motion']);
  assert.deepEqual(P.hairStyle.options.map((o) => o.value), ['short', 'long', 'spiky', 'ponytail']);
  for (const k of ['skin', 'hair', 'outfit', 'trim', 'metal']) {
    assert.equal(P[k].kind, 'color');
    assert.ok(P[k].swatches.length >= 4 && P[k].swatches.length <= 8, `${k}: 4 to 8 swatches`);
    assert.equal(P[k].swatches[0], P[k].def, `${k}: the default is the first swatch`);
    for (const sw of P[k].swatches) assert.ok(brightness(sw) >= 0.18, `${k}: swatch ${sw} is too dark`);
    assert.ok(!/colou?r/i.test(k));
  }
});

test('hero-walker: the same person as the side-view Hero: palette defaults and the same parts and options', () => {
  const p = defaultParams(hero), k = defaultParams(knight);
  assert.equal(p.outfit, HV.hero);
  assert.equal(p.trim, HV.crimson);
  assert.equal(p.metal, HV.steel);
  assert.equal(p.skin, HV.skin);
  assert.deepEqual([p.outfit, p.trim, p.metal, p.skin], [k.outfit, k.trim, k.metal, k.skin], 'same default colours as knight');
  assert.deepEqual([p.weapon, p.headgear, p.cape], [k.weapon, k.headgear, k.cape], 'same default gear as knight');
  for (const key of ['weapon', 'headgear', 'cape']) assert.deepEqual(hero.params[key].options.map((o) => o.value), knight.params[key].options.map((o) => o.value), key);
});

test('hero-walker: sounds are the specification\'s, on the standard frames, and every one exists with its style', () => {
  const sound = (id) => JSON.parse(fs.readFileSync(path.join(ROOT, 'sounds', `${id}.json`), 'utf8'));
  for (const dir of T.DIRECTIONS) {
    const walk = hero.sounds[`walk_${dir}`];
    assert.deepEqual(walk.map((c) => [c.sound, c.frame, c.preset, c.volume]), [['footstep-grass', 0, 'Grass', 0.45], ['footstep-grass', 4, 'Grass', 0.45]], `walk_${dir}`);
    const attack = hero.sounds[`attack_${dir}`];
    const blade = attack.find((c) => c.sound === 'sword-slash');
    assert.deepEqual([blade.frame, blade.preset, blade.volume], [3, 'Quick dagger', 0.7], `attack_${dir}`);
    // the blade is heard only when a weapon is held; a bare fist swishes instead
    for (const w of ['sword', 'axe', 'spear']) assert.ok(cueInEffect(hero, blade, look({ weapon: w })));
    assert.ok(!cueInEffect(hero, blade, look({ weapon: 'none' })));
    const bare = attack.filter((c) => c !== blade);
    assert.equal(bare.length, 1);
    assert.ok(bare[0].frame === 3 && cueInEffect(hero, bare[0], look({ weapon: 'none' })) && !cueInEffect(hero, bare[0], look({ weapon: 'sword' })));
    assert.equal(hero.sounds[`idle_${dir}`], undefined, 'idle is silent');
  }
  assert.deepEqual(hero.sounds.hurt.map((c) => [c.sound, c.frame, c.preset, c.volume]), [['punch', 0, 'Light jab', 0.9]]);
  assert.deepEqual(hero.sounds.die.map((c) => [c.sound, c.frame, c.preset]), [['punch', 0, 'Heavy body blow']]);
  for (const list of Object.values(hero.sounds)) for (const c of list) {
    const patch = sound(c.sound);
    assert.ok(Object.keys(patch.presets ?? {}).includes(c.preset), `${c.sound} has no style "${c.preset}"`);
  }
});

// ---- every look ------------------------------------------------------------------------------------

test('hero-walker: every frame of every clip stays inside the frame: default, all-low, all-high and every choice', () => {
  assertInside(look(), 'default');
  assertInside(ALL_LOW(), 'all-low');
  assertInside(ALL_HIGH(), 'all-high');
  for (const [k, d] of Object.entries(hero.params)) if (d.kind === 'choice') for (const o of d.options) assertInside(look({ [k]: o.value }), `${k}=${o.value}`);
  // the corners: the longest weapon on the tallest body with the biggest headgear and the longest cape
  for (const weapon of ['sword', 'axe', 'spear']) for (const headgear of ['helmet', 'crown']) for (const hairStyle of ['spiky', 'long']) {
    assertInside(look({ weapon, headgear, hairStyle, height: 1, build: 1, weaponLength: ends('weaponLength')[1], headgearSize: ends('headgearSize')[1], capeLength: ends('capeLength')[1], bounce: 1, stride: 1 }), `tallest ${weapon} ${headgear} ${hairStyle}`);
  }
});

test('hero-walker: about 30 px tall at the default look; all-low still fills a third of the frame', () => {
  const bare = look({ headgear: 'none', weapon: 'none', cape: 'none' });
  for (const dir of T.DIRECTIONS) {
    const b = renderFrame(hero, `idle_${dir}`, 0, bare).bounds();
    const tall = b.y1 - b.y0 + 1 - 2;      // without the outline
    assert.ok(tall >= 29 && tall <= 31, `${dir}: ${tall} px tall`);
    assert.equal(b.y1, hero.pivot[1], `${dir}: the outline under the feet is on the pivot row`);
  }
  const low = renderFrame(hero, 'idle_down', 0, ALL_LOW()).bounds();
  assert.ok(low.y1 - low.y0 + 1 >= 16, 'all-low fills a third of the frame');
  const def = renderFrame(hero, 'idle_down', 0, look()).bounds();
  assert.ok(def.y1 - def.y0 + 1 >= 24 && def.y1 - def.y0 + 1 <= 36, 'default fills half to three quarters');
});

test('hero-walker: looping clips close and every clip moves', () => {
  for (const clip of CLIPS) {
    const fs_ = frames(clip).map((f) => renderFrame(hero, clip, f, look()));
    assert.ok(fs_.some((g) => diff(g, fs_[0]) > 6), `${clip} does not move`);
    if (hero.clips[clip].loop) {
      assert.ok(diff(fs_.at(-1), fs_[0]) > 0, `${clip}: the last frame is the first`);
      const steps = fs_.map((g, i) => diff(g, fs_[(i + 1) % fs_.length]));
      const avg = steps.reduce((a, b) => a + b, 0) / steps.length;
      assert.ok(steps.at(-1) <= 2.5 * avg + 8, `${clip}: the loop seam jumps (${steps})`);
    }
  }
  // one-shot attacks start and end on the standing pose of their direction
  for (const dir of T.DIRECTIONS) {
    const idle = renderFrame(hero, `idle_${dir}`, 0, look());
    assert.equal(diff(renderFrame(hero, `attack_${dir}`, 0, look()), idle), 0, `attack_${dir} starts on idle`);
    assert.equal(diff(renderFrame(hero, `attack_${dir}`, 7, look()), idle), 0, `attack_${dir} ends on idle`);
  }
  assert.equal(diff(renderFrame(hero, 'hurt', 3, look()), renderFrame(hero, 'idle_down', 0, look())), 0, 'hurt ends on idle');
});

test('hero-walker: hurt and die start on a white frame; die ends lying down and never empty', () => {
  for (const clip of ['hurt', 'die']) {
    const g = renderFrame(hero, clip, 0, look());
    const colours = new Set(g.data.filter((v) => v));
    assert.deepEqual([...colours].sort(), [col('#ffffff'), col(INK)].sort(), `${clip} frame 0 is white with an outline`);
  }
  const last = renderFrame(hero, 'die', 7, look()).bounds();
  assert.ok(last && last.x1 - last.x0 > last.y1 - last.y0, 'the body lies down');
});

// ---- the three directions ----------------------------------------------------------------------------

test('hero-walker: down shows the face, up shows the back, side faces right', () => {
  const bare = look({ headgear: 'none', cape: 'plain' });
  const skin = (dir) => count(renderFrame(hero, `idle_${dir}`, 0, bare), HV.skin);
  const cape = (dir) => { const g = renderFrame(hero, `idle_${dir}`, 0, bare), h = renderFrame(hero, `idle_${dir}`, 0, { ...bare, cape: 'none' }); return diff(g, h); };
  assert.ok(skin('down') > skin('up') * 2, `the face shows going down (${skin('down')} skin pixels) and not going up (${skin('up')})`);
  assert.ok(cape('up') > cape('down') * 1.25, `the cape covers the back going up (${cape('up')} pixels) and peeks out going down (${cape('down')})`);
  assert.ok(cape('down') > 12 && cape('side') > 12, 'the cape still shows going down and sideways');
  // side faces right: the weapon hand and the sword are on the right half in the hit frame
  const s = frameSockets(hero, 'attack_side', 4, look());
  assert.ok(s.hand.x > hero.pivot[0] + 2 && s.muzzle.x > s.hand.x + 6, 'attack_side reaches right');
  assert.ok(frameSockets(hero, 'attack_down', 4, look()).muzzle.y > frameSockets(hero, 'attack_down', 4, look()).hand.y + 3, 'attack_down reaches down');
  assert.ok(frameSockets(hero, 'attack_up', 4, look()).muzzle.y < frameSockets(hero, 'attack_up', 4, look()).hand.y - 6, 'attack_up reaches up');
});

test('hero-walker: the same colours in all three directions (the same person)', () => {
  const p = look();
  for (const dir of T.DIRECTIONS) {
    const g = renderFrame(hero, `idle_${dir}`, 0, p);
    assert.ok(count(g, p.outfit) >= 12, `${dir}: outfit`);
    assert.ok(count(g, p.metal) + count(g, T.ramp(p.metal).dark) >= 20, `${dir}: metal (helmet, sword)`);
    assert.ok(count(g, p.trim) + count(g, T.ramp(p.trim).dark) >= 6, `${dir}: trim (cape, plume)`);
  }
});

test('hero-walker: the white swing arc is drawn after the outline, on the hit frames of each direction, only with a weapon', () => {
  for (const dir of T.DIRECTIONS) {
    const white = (f, over) => count(renderFrame(hero, `attack_${dir}`, f, look(over)), '#ffffff');
    assert.ok(white(4) - white(0) >= 8, `attack_${dir}: no arc on the hit frame`);
    assert.equal(white(1), white(0), `attack_${dir}: an arc in the wind-up`);
    assert.equal(white(4, { weapon: 'none' }), white(0, { weapon: 'none' }), `attack_${dir}: an arc with no weapon`);
  }
});

// ---- parts -------------------------------------------------------------------------------------------

test('hero-walker: every frame exports hand, offhand, head, back, feet and muzzle inside the frame', () => {
  for (const p of [look(), ALL_LOW(), ALL_HIGH()]) for (const [clip, f] of everyFrame()) {
    const s = frameSockets(hero, clip, f, p);
    assert.deepEqual(Object.keys(s), ['hand', 'offhand', 'head', 'back', 'feet', 'muzzle'], clip);
    for (const k of Object.keys(s)) {
      assert.ok(Number.isFinite(s[k].x) && Number.isFinite(s[k].y) && Number.isFinite(s[k].angle), `${clip} ${f} ${k}`);
      assert.ok(s[k].x >= 0 && s[k].x <= 48 && s[k].y >= 0 && s[k].y <= 48, `${clip} ${f}: ${k} outside the frame (${s[k].x}, ${s[k].y})`);
    }
  }
  const sheet = renderSheet(hero, look());
  assert.deepEqual(Object.keys(sheet.meta.parts), ['weapon', 'headgear', 'cape']);
  assert.ok(sheet.meta.frames.every((fr) => fr.sockets && fr.sockets.hand && fr.sockets.muzzle));
});

test('hero-walker: the weapon stays in the hand: in every frame the hand socket is on the body and the weapon starts there', () => {
  for (const weapon of ['sword', 'axe', 'spear']) for (const [clip, f] of everyFrame()) {
    const p = look({ weapon });
    const s = frameSockets(hero, clip, f, p);
    const armed = renderFrame(hero, clip, f, p), bare = renderFrame(hero, clip, f, look({ weapon: 'none' }));
    assert.ok(armed.get(Math.floor(s.hand.x), Math.floor(s.hand.y)) !== 0, `${weapon} ${clip} ${f}: the hand socket is on nothing`);
    if (['attack', 'die'].includes(T.parseClip(clip).action)) continue;       // the unarmed attack is another pose; a falling body is moved to keep its weapon in the frame
    // the pixels the weapon adds are within its reach of the hand, and some are right at the hand
    const { length, back, pad } = T.itemSize(weapon, p.weaponLength);
    let near = Infinity, far = 0, n = 0;
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
      if (armed.get(x, y) === bare.get(x, y)) continue;
      const dist = Math.hypot(x + 0.5 - s.hand.x, y + 0.5 - s.hand.y);
      near = Math.min(near, dist); far = Math.max(far, dist); n++;
    }
    assert.ok(n >= 6, `${weapon} ${clip} ${f}: the weapon is not seen`);
    assert.ok(near <= 5.5, `${weapon} ${clip} ${f}: the weapon is ${near.toFixed(1)} px from the hand`);      // the fist covers the grip
    assert.ok(far <= Math.max(length, back) + pad + 3, `${weapon} ${clip} ${f}: something is ${far.toFixed(1)} px from the hand`);
  }
});

test('hero-walker: a part set to none leaves nothing behind, and its settings then change nothing', () => {
  for (const [part, setting] of [['weapon', 'weaponLength'], ['headgear', 'headgearSize'], ['cape', 'capeLength']]) {
    const [lo, hi] = ends(setting);
    for (const [clip, f] of everyFrame()) {
      assert.equal(diff(renderFrame(hero, clip, f, look({ [part]: 'none', [setting]: lo })), renderFrame(hero, clip, f, look({ [part]: 'none', [setting]: hi }))), 0, `${part}=none: ${setting} still changes ${clip}`);
    }
    assert.ok(!inEffect(hero, setting, look({ [part]: 'none' })));
  }
  // no weapon: the attack is a punch, with nothing held out at rest
  const none = look({ weapon: 'none' });
  for (const dir of T.DIRECTIONS) assert.ok(diff(renderFrame(hero, `attack_${dir}`, 4, none), renderFrame(hero, `idle_${dir}`, 0, none)) > 20, `${dir}: the unarmed attack does nothing`);
  // metal is the weapon, the helmet and the crown (the specification's `when`): with none of them it is not in effect, and then it changes nothing
  assert.deepEqual(hero.params.metal.when, [{ weapon: ['sword', 'axe', 'spear'] }, { headgear: ['helmet', 'crown'] }]);
  const noMetal = look({ weapon: 'none', headgear: 'none' });
  assert.ok(!inEffect(hero, 'metal', noMetal));
  assert.ok(inEffect(hero, 'metal', look({ weapon: 'none' })) && inEffect(hero, 'metal', look({ headgear: 'none' })) && inEffect(hero, 'metal', look({ weapon: 'none', headgear: 'crown' })));
  for (const dir of T.DIRECTIONS) {
    const crowned = look({ weapon: 'none', headgear: 'crown' });
    assert.ok(diff(renderFrame(hero, `idle_${dir}`, 0, crowned), renderFrame(hero, `idle_${dir}`, 0, { ...crowned, metal: '#f2c230' })) > 5, `${dir}: metal does not colour the crown`);
  }
  for (const [clip, f] of everyFrame()) assert.equal(diff(renderFrame(hero, clip, f, noMetal), renderFrame(hero, clip, f, { ...noMetal, metal: '#f2c230' })), 0, `metal changes ${clip} with nothing metal worn`);
});

test('hero-walker: every part setting and every option shows, in all three directions', () => {
  const N = 5;      // the checker's N for this sprite (opaque pixels / 100)
  for (const dir of T.DIRECTIONS) {
    const frame = (over, clip = `idle_${dir}`, f = 0) => renderFrame(hero, clip, f, look(over));
    for (const k of ['weapon', 'headgear', 'cape', 'hairStyle']) {
      const opts = hero.params[k].options.map((o) => o.value);
      for (let i = 0; i < opts.length; i++) for (let j = i + 1; j < opts.length; j++) {
        assert.ok(diff(frame({ [k]: opts[i] }), frame({ [k]: opts[j] })) > N, `${dir}: ${k} ${opts[i]} and ${opts[j]} look alike`);
      }
    }
    for (const [setting, sel] of [['weaponLength', 'weapon'], ['headgearSize', 'headgear'], ['capeLength', 'cape']]) {
      const [lo, hi] = ends(setting);
      for (const o of hero.params[sel].options.map((x) => x.value).filter((v) => v !== 'none')) {
        assert.ok(diff(frame({ [sel]: o, [setting]: lo }), frame({ [sel]: o, [setting]: hi })) > N, `${dir}: ${setting} does not show on ${o}`);
      }
    }
    for (const k of ['height', 'build']) assert.ok(diff(frame({ [k]: 0 }), frame({ [k]: 1 })) > N, `${dir}: ${k}`);
    assert.ok(diff(frame({ stride: 0 }, `walk_${dir}`, 0), frame({ stride: 1 }, `walk_${dir}`, 0)) > N, `${dir}: stride`);
    assert.ok(diff(frame({ bounce: 0 }, `idle_${dir}`, 4), frame({ bounce: 1 }, `idle_${dir}`, 4)) > N, `${dir}: bounce`);
  }
});

test('hero-walker: hair shows under every headgear, in every direction and style; skin, outfit and trim always show', () => {
  const N = 5;      // the checker's N for this sprite (opaque pixels / 100)
  for (const dir of T.DIRECTIONS) for (const headgear of ['helmet', 'crown', 'none']) {
    for (const hairStyle of ['short', 'long', 'spiky', 'ponytail']) {
      const a = renderFrame(hero, `idle_${dir}`, 0, look({ headgear, hairStyle, hair: '#5a3a22' })), b = renderFrame(hero, `idle_${dir}`, 0, look({ headgear, hairStyle, hair: '#e6c96a' }));
      assert.ok(diff(a, b) > N, `${dir} ${headgear} ${hairStyle}: only ${diff(a, b)} pixels of hair show`);
    }
    for (const cape of ['plain', 'none']) for (const weapon of ['sword', 'none']) {
      const base = { headgear, cape, weapon };
      const change = (k, v) => diff(renderFrame(hero, `idle_${dir}`, 0, look(base)), renderFrame(hero, `idle_${dir}`, 0, look({ ...base, [k]: v })));
      assert.ok(change('outfit', '#4f9d57') > N, `${dir} ${headgear} ${cape}: outfit`);
      assert.ok(change('trim', '#f2c230') > N, `${dir} ${headgear} ${cape} ${weapon}: only ${change('trim', '#f2c230')} pixels of trim show`);
      if (dir !== 'up') assert.ok(change('skin', '#9a6240') > N, `${dir} ${headgear}: skin`);
      else assert.ok(change('skin', '#9a6240') > 3, `${dir} ${headgear}: skin (hands and neck)`);
    }
  }
});

// ---- fix round 2 (review of W3-H3) ---------------------------------------------------------------------

test('hero-walker: the exported sockets are those of the fitted pose that is drawn, on the tallest body with the longest spear', () => {
  const p = look({ weapon: 'spear', weaponLength: 1.35, height: 1, build: 1, headgearSize: 1.8, bounce: 1, stride: 1 });
  const weaponColours = new Set([...Object.values(T.ramp(p.metal)), PALETTE.hearthvale.wood].filter((c) => typeof c === 'string').map((c) => col(c)));
  let moved = 0;
  for (const [clip, f] of everyFrame()) {
    const { action, direction } = T.parseClip(clip), c = hero.clips[clip], t = c.loop ? f / c.frames : f / (c.frames - 1);
    const s = frameSockets(hero, clip, f, p), d = T.dims(p);
    const raw = T.pose(action, direction, t, { bounce: p.bounce, stride: p.stride, armed: true }, d), unfitted = T.sockets(T.solve(direction, raw, d), raw, d, { muzzle: T.itemSize('spear', 1.35).length });
    if (Math.abs(unfitted.hand.x - s.hand.x) + Math.abs(unfitted.muzzle.y - s.muzzle.y) + Math.abs(unfitted.muzzle.x - s.muzzle.x) > 0.5) moved++;
    if (direction === 'up' || action === 'die' || (action === 'hurt' && f === 0)) continue;
    // the spear is drawn along the exported hand-to-muzzle line
    const g = renderFrame(hero, clip, f, p);
    let on = 0;
    for (const k of [0.5, 0.7, 0.9]) {
      const x = s.hand.x + (s.muzzle.x - s.hand.x) * k, y = s.hand.y + (s.muzzle.y - s.hand.y) * k;
      let hit = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (weaponColours.has(g.get(Math.floor(x) + dx, Math.floor(y) + dy))) hit = true;
      if (hit) on++;
    }
    assert.ok(on >= 2, `${clip} ${f}: the spear is not on the line from the exported hand to the exported muzzle`);
  }
  assert.ok(moved >= 3, `fit() changes ${moved} of these frames; the test needs some`);
});

test('hero-walker: long and short hair look different from the front under the helmet', () => {
  for (const dir of T.DIRECTIONS) {
    const n = diff(renderFrame(hero, `idle_${dir}`, 0, look({ hairStyle: 'short' })), renderFrame(hero, `idle_${dir}`, 0, look({ hairStyle: 'long' })));
    assert.ok(n >= (dir === 'down' ? 24 : 12), `${dir}: ${n} pixels differ`);
  }
});

test('hero-walker: the tunic is not busy: without a cape the trim is the hem and the cuffs, two rows of the body', () => {
  const p = look({ cape: 'none', headgear: 'none', weapon: 'none' }), g = renderFrame(hero, 'idle_down', 0, p), trim = col(p.trim), rows = new Set();
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) if (g.get(x, y) === trim) rows.add(y);
  assert.ok(rows.size >= 2 && rows.size <= 2, `trim on rows ${[...rows]}`);
  const withCape = renderFrame(hero, 'idle_down', 0, look({ headgear: 'none', weapon: 'none' })), rows2 = new Set();
  for (let y = 20; y < 32; y++) for (let x = 21; x < 28; x++) if (withCape.get(x, y) === trim || withCape.get(x, y) === col(T.ramp(p.trim).dark)) rows2.add(y);
  assert.ok(rows2.size <= 4, `with the cape: marks on ${rows2.size} rows of the torso`);
});

test('hero-walker: side clips stay within 20 colours at the default look, and the helmet is a tone darker than the skin', () => {
  for (const clip of CLIPS) {
    const seen = new Set();
    for (const f of frames(clip)) for (const v of renderFrame(hero, clip, f, look()).data) if (v) seen.add(v);
    assert.ok(seen.size <= 20, `${clip}: ${seen.size} colours`);
  }
  const g = renderFrame(hero, 'idle_side', 0, look());
  assert.ok(count(g, T.ramp(look().metal).dark) >= 20, 'the dome of the helmet is the metal\'s dark tone');
  assert.ok(brightness(T.ramp(look().metal).dark) < brightness(look().skin) - 0.12);
});
