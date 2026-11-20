// The studio's starting bodies (docs/studio.md section 3 and section 8, item S5; Contract 14): each template is a whole
// `loadout-sprite` with a bone rig and keyed clips, shaped like the library's own bodies. These tests check them the
// way the site will use them: validated and drawn by engine/data-sprite.js (S4), the top-down ones in its one-rig form
// (`directions`, an overlay per direction), and held to the quality bar (quality/sprite.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as T from '../../rigs/studio-templates.js';
import { validateStudioSprite, STANDARD_CLIPS } from '../../catalog/studio-schema.js';
import { validateDataSprite, dataSprite, makeDataSprite, framePose, directionRig, directionOf, drawOptions } from '../../engine/data-sprite.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { solveRig, groundOf } from '../../rigs/bones.js';
import { hexToRgb } from '../../engine/color.js';
import { checkSprite } from '../../quality/sprite.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const soundIds = fs.readdirSync(path.join(root, 'sounds')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
const catalogIds = fs.readdirSync(path.join(root, 'sprites')).filter((f) => /\.(js|json)$/.test(f) && !f.startsWith('_')).map((f) => f.replace(/\.(js|json)$/, ''));      // code and data files (docs/data-sprites.md, DQ1)
const OPTS = { soundIds, catalogIds };

const SIDE = ['two-legs', 'four-legs', 'crawler', 'flyer', 'blob', 'blank'];
const TOP = ['topdown-person', 'topdown-beast'];
const DIRS = ['down', 'up', 'side'];
const INK = '#231b33';

const SPRITES = Object.fromEntries(T.STUDIO_TEMPLATE_IDS.map((id) => [id, dataSprite(T.studioTemplate(id), OPTS)]));
const def = (id) => SPRITES[id].definition;
/** One frame as the site draws it, with the default controls or the ones given. */
const draw = (id, clip, frame, p = {}) => renderFrame(SPRITES[id], clip, frame, { ...defaultParams(SPRITES[id]), ...p });
/** Bounding box of the drawn pixels: [x0, y0, x1, y1], or null when nothing is drawn. */
function bbox(g) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let i = 0; i < g.data.length; i++) if (g.data[i]) { const x = i % g.w, y = (i / g.w) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return x1 < 0 ? null : [x0, y0, x1, y1];
}
const drawn = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const lowest = (id, clip, frame) => bbox(draw(id, clip, frame))[3];
const ground = (id) => SPRITES[id].pivot[1];
const grounded = T.STUDIO_TEMPLATE_IDS.filter((id) => SPRITES[id].grounded);
/** The rig a clip is drawn on (its direction's, for a top-down body) and where every bone is on a frame. */
const rigFor = (id, clip) => (def(id).body.rig.view === 'top-down' ? directionRig(def(id).body.rig, directionOf(clip)) : def(id).body.rig);
const solve = (id, clip, frame) => solveRig(rigFor(id, clip), framePose(def(id), clip, frame), drawOptions(def(id)));
const walks = (id) => Object.keys(def(id).clips).filter((n) => n === 'walk' || n.startsWith('walk_'));

test('templates: the list has the six side-view bodies and the two top-down ones, in picker order', () => {
  assert.deepEqual([...T.STUDIO_TEMPLATE_IDS], [...SIDE, ...TOP]);
  const list = T.studioTemplates();
  assert.deepEqual(list.map((t) => t.id), [...SIDE, ...TOP]);
  for (const t of list) {
    assert.ok(t.label && t.label.length <= 60 && t.blurb && t.blurb.length <= 300, t.id);
    assert.equal(t.view, TOP.includes(t.id) ? 'top-down' : 'side', t.id);
    assert.deepEqual(t.size, T.studioTemplate(t.id).size, t.id);
    assert.deepEqual(t.clips, Object.keys(T.studioTemplate(t.id).clips), t.id);
  }
});

test('templates: studioTemplate gives a fresh copy each time, plain JSON; an unknown id gives null', () => {
  for (const id of T.STUDIO_TEMPLATE_IDS) {
    const a = T.studioTemplate(id);
    assert.deepEqual(JSON.parse(JSON.stringify(a)), a, `${id} is plain JSON`);
    a.clips.idle_down = null; a.body.rig.bones.length = 0; a.name = 'changed';
    const b = T.studioTemplate(id);
    assert.ok(b.body.rig.bones.length > 0 && b.name !== 'changed', `${id}: a change to one copy does not reach the next`);
    assert.equal(b.made.from, `template:${id}`);
    assert.equal(b.made.in, 'studio');
  }
  for (const bad of ['nope', '', '__proto__', 'constructor', 'toString', null, 3]) assert.equal(T.studioTemplate(bad), null, String(bad));
});

test('templates: every template passes engine/data-sprite.js with no errors and no warnings, as an object and as JSON text, plain and strict', () => {
  for (const id of T.STUDIO_TEMPLATE_IDS) {
    for (const input of [T.studioTemplate(id), JSON.stringify(T.studioTemplate(id))]) for (const strict of [false, true]) {
      const v = validateDataSprite(input, { ...OPTS, strict });
      assert.deepEqual(v.errors, [], `${id} strict=${strict}`);
      assert.deepEqual(v.warnings, [], `${id} strict=${strict}`);
      assert.ok(v.ok, id);
    }
    const m = makeDataSprite(T.studioTemplate(id), OPTS);
    assert.ok(m.ok && m.sprite, id);
    assert.deepEqual(m.warnings, [], `${id}: makeDataSprite warns of nothing`);
    assert.doesNotThrow(() => dataSprite(T.studioTemplate(id)), id);
  }
});

test('templates: the side-view templates also pass catalog/studio-schema.js directly, plain and strict', () => {
  for (const id of SIDE) for (const strict of [false, true]) {
    const v = validateStudioSprite(T.studioTemplate(id), { ...OPTS, strict });
    assert.deepEqual(v.errors, [], id);
    assert.deepEqual(v.warnings, [], id);
  }
});

test('templates: every template meets the quality bar (quality/sprite.js checkSprite) with no errors', () => {
  for (const id of T.STUDIO_TEMPLATE_IDS) {
    const r = checkSprite(SPRITES[id]);
    assert.deepEqual(r.errors, [], id);
    // the only advice allowed is the one about few controls (Blob and Blank are meant to be plain starting points)
    assert.deepEqual(r.warnings.filter((w) => !/^only \d+ parameters/.test(w)), [], id);
  }
});

test('templates: a top-down template is ONE rig with a down and an up overlay over its side view (engine/data-sprite.js directions)', () => {
  for (const id of TOP) {
    const rig = def(id).body.rig;
    assert.equal(rig.view, 'top-down', id);
    assert.deepEqual(Object.keys(rig.directions).sort(), ['down', 'up'], `${id}: the rig is the side view, down and up are overlays`);
    // no shape set per direction: no copies of a shape for up or side, and a modest number of shapes
    assert.ok(rig.shapes.length <= 24, `${id}: ${rig.shapes.length} shapes`);
    assert.ok(!rig.shapes.some((s) => /(Up|Side)(Shut)?$/.test(s.id)), `${id}: no per-direction copies of a shape`);
    // an edit to the side view reaches the other directions wherever they do not change that field
    const head = rig.shapes.find((s) => s.id === 'skull');
    for (const dir of ['down', 'up']) {
      const over = rig.directions[dir].shapes.skull ?? {};
      assert.ok(!('paint' in over) && !('kind' in over) && !('bone' in over), `${id} ${dir}: an overlay never repaints or re-parents a shape`);
      if (!('r' in over)) assert.deepEqual(directionRig(rig, dir).shapes.find((s) => s.id === 'skull').r, head.r, `${id} ${dir}: the skull follows the rig`);
    }
    // clips switch nothing but eyes and mouths with show / hide: the direction's look comes from its overlay
    for (const [name, c] of Object.entries(def(id).clips)) for (const k of c.keys) for (const f of ['show', 'hide']) for (const s of k[f] ?? []) {
      assert.ok(/^(eye|mouth)/.test(s), `${id} ${name}: key ${f}s ${s}; only eyes and mouths are shown or hidden by keys`);
    }
  }
});

test('templates: the clips each body starts with, at the style guide\'s frames, speed and looping', () => {
  const want = {
    'two-legs': ['idle', 'walk', 'attack', 'hurt', 'die'],
    'four-legs': ['idle', 'walk', 'attack', 'hurt', 'die'],
    crawler: ['idle', 'walk', 'attack', 'hurt', 'die'],
    flyer: ['idle', 'fly', 'attack', 'hurt', 'die'],
    blob: ['idle', 'walk', 'hop', 'attack', 'hurt', 'die'],
    blank: ['idle', 'walk', 'attack', 'hurt', 'die'],
    'topdown-person': ['idle_down', 'idle_up', 'idle_side', 'walk_down', 'walk_up', 'walk_side', 'attack_down', 'attack_up', 'attack_side', 'hurt', 'die'],
    'topdown-beast': ['idle_down', 'idle_up', 'idle_side', 'walk_down', 'walk_up', 'walk_side', 'attack_down', 'attack_up', 'attack_side', 'hurt', 'die'],
  };
  for (const id of T.STUDIO_TEMPLATE_IDS) {
    const d = def(id);
    assert.deepEqual(Object.keys(d.clips), want[id], id);
    for (const [name, c] of Object.entries(d.clips)) {
      const std = STANDARD_CLIPS[name.split('_')[0]];
      assert.ok(std, `${id} ${name} is a standard action`);
      assert.equal(c.frames, std.frames, `${id} ${name} frames`);
      assert.equal(c.fps, std.fps, `${id} ${name} fps`);
      assert.equal(c.loop, std.loop, `${id} ${name} loop`);
      assert.ok(c.keys.length >= 2, `${id} ${name} is keyed`);
      if (name === 'hurt' || name === 'die') assert.equal(c.frameEdits?.['0']?.flash, true, `${id} ${name} starts on a white flash`);
    }
    assert.ok(d.controls.some((c) => c.key === 'speed' && c.standard === 'speed'), `${id} has the speed control`);
    assert.equal(d.preview, TOP.includes(id) ? 'walk_down' : id === 'flyer' ? 'fly' : 'walk', `${id} preview`);
    if (TOP.includes(id)) for (const n of Object.keys(d.clips)) if (/^(idle|walk)_/.test(n)) assert.equal(d.clips[n].label, `${n[0].toUpperCase()}${n.slice(1, n.indexOf('_'))} (${n.split('_')[1]})`, `${id} ${n} label`);
  }
});

test('templates: views, frame sizes, anchors and meta follow the style guide', () => {
  const sizes = { 'two-legs': [64, 64], 'four-legs': [64, 48], crawler: [48, 48], flyer: [48, 48], blob: [48, 48], blank: [48, 48], 'topdown-person': [48, 48], 'topdown-beast': [48, 48] };
  const pivots = { 'two-legs': [28, 58], 'four-legs': [28, 43], flyer: [24, 24] };
  for (const id of T.STUDIO_TEMPLATE_IDS) {
    const d = def(id);
    assert.deepEqual(d.size, sizes[id], id);
    assert.deepEqual(d.body.rig.size, sizes[id], id);
    assert.deepEqual(d.pivot, pivots[id] ?? [24, 42], `${id} pivot`);
    assert.equal(d.grounded, id !== 'flyer', `${id} grounded`);
    if (d.grounded) assert.equal(d.pivot[1], groundOf(d.body.rig), `${id}: the anchor is on the ground row`);
    assert.equal(d.meta.view, TOP.includes(id) ? 'top-down' : 'side', id);
    assert.equal(d.body.rig.view, d.meta.view, id);
    assert.ok(!catalogIds.includes(d.id), `${id}: the sprite id is not a catalogue id`);
    assert.ok(d.body.rig.colours.length <= 6, `${id}: at most six colour slots, so five materials and the eyes`);
    for (const c of Object.values(d.clips)) for (const s of c.sounds ?? []) assert.ok(soundIds.includes(s.sound), `${id}: sound ${s.sound} exists`);
  }
});

test('templates: every frame of every clip draws, inside the 1 px border, and nothing stands below the ground', () => {
  for (const id of T.STUDIO_TEMPLATE_IDS) {
    const [w, h] = SPRITES[id].size;
    for (const [name, c] of Object.entries(SPRITES[id].clips)) for (let f = 0; f < c.frames; f++) {
      const g = draw(id, name, f), b = bbox(g);
      assert.ok(b && drawn(g) >= 40, `${id} ${name} ${f}: draws (${b ? drawn(g) : 0} px)`);
      assert.ok(b[0] >= 1 && b[1] >= 1 && b[2] <= w - 2 && b[3] <= h - 2, `${id} ${name} ${f}: inside the border (${b})`);
      if (SPRITES[id].grounded) assert.ok(b[3] <= ground(id), `${id} ${name} ${f}: nothing below the ground row ${ground(id)} (lowest ${b[3]})`);
    }
  }
});

test('templates: standing bodies stand on the ground; the drawing fills its frame as the style guide asks', () => {
  for (const id of T.STUDIO_TEMPLATE_IDS) {
    const first = Object.keys(SPRITES[id].clips)[0];
    const b = bbox(draw(id, first, 0));
    if (SPRITES[id].grounded) assert.equal(b[3], ground(id), `${id}: the outline of the feet is on the ground row`);
    const along = Math.max(b[2] - b[0] + 1, b[3] - b[1] + 1), longer = Math.max(...SPRITES[id].size);
    // half to three quarters of the longer side (style guide 1); a person in a 64 px frame is 35 px (0.55), the slime 0.4
    assert.ok(along >= longer / 3 && along <= longer * 0.78, `${id}: spans ${along} of ${longer}`);
  }
  // the people are the library's heights: 35 px in 64 (side), about 30 px in 48 (top-down)
  const tall = (id, clip) => { const b = bbox(draw(id, clip, 0)); return b[3] - b[1] + 1; };
  assert.ok(Math.abs(tall('two-legs', 'idle') - 35) <= 2, `two legs: ${tall('two-legs', 'idle')} px tall`);
  assert.ok(Math.abs(tall('topdown-person', 'idle_down') - 30) <= 2, `top-down person: ${tall('topdown-person', 'idle_down')} px tall`);
});

test('templates: every walk of every grounded body has its contacts on frames 0 and 4: the lowest drawn row is the ground row', () => {
  for (const id of grounded) {
    const names = walks(id);
    assert.ok(names.length >= 1, `${id} walks`);
    for (const name of names) {
      for (const f of [0, 4]) assert.equal(lowest(id, name, f), ground(id), `${id} ${name} ${f}: the feet (or the body) on the ground row`);
      assert.deepEqual(def(id).clips[name].sounds.map((s) => s.frame), [0, 4], `${id} ${name}: footsteps on 0 and 4`);
    }
  }
});

/** Where each IK chain's end (a foot) is on a frame, and the height it stands at when it is on the ground. */
function feet(id, name, frame) {
  const rig = def(id).body.rig;
  const J = solve(id, name, frame);
  return rig.ik.map((c) => {
    const s = rig.shapes.find((x) => x.bone === c.bones[1] && x.kind === 'limb');
    return { id: c.id, x: J.bones[c.bones[1]].end[0], y: J.bones[c.bones[1]].end[1], planted: groundOf(rig) - (s ? s.width / 2 : 1) };
  });
}

test('templates: the side-view walks plant every IK foot on frames 0 and 4, lift each foot in between, and dip the body on contact', () => {
  for (const id of ['two-legs', 'four-legs', 'crawler']) {
    const rig = def(id).body.rig;
    assert.ok(rig.ik.length >= 2, `${id} has feet`);
    for (const f of [0, 4]) for (const ft of feet(id, 'walk', f)) assert.ok(Math.abs(ft.y - ft.planted) < 0.01, `${id} walk ${f}: ${ft.id} planted (${ft.y} vs ${ft.planted})`);
    for (const c of rig.ik) {
      const lift = Math.max(...[1, 2, 3, 5, 6, 7].map((f) => { const ft = feet(id, 'walk', f).find((x) => x.id === c.id); return ft.planted - ft.y; }));
      assert.ok(lift >= 1.5, `${id}: ${c.id} leaves the ground in the walk (by ${lift})`);
    }
    const a = feet(id, 'walk', 0), b = feet(id, 'walk', 4);
    assert.ok(a.some((ft, i) => Math.sign(ft.x - b[i].x) > 0) && a.some((ft, i) => Math.sign(ft.x - b[i].x) < 0), `${id}: legs swap on 4`);
    const dy = (f) => framePose(def(id), 'walk', f).root?.[1] ?? 0;
    assert.ok(dy(0) > Math.min(dy(2), dy(6)) && dy(4) > Math.min(dy(2), dy(6)), `${id}: the body is lowest on contact`);
  }
});

test('templates: in every top-down walk each leg is planted on frames 0 and 4 and its foot comes up (the leg folding) in between', () => {
  for (const id of TOP) for (const dir of DIRS) {
    const name = `walk_${dir}`;
    const legs = rigFor(id, name).bones.filter((b) => /^leg/.test(b.id)).map((b) => b.id);
    assert.ok(legs.length >= 2, `${id} has legs`);
    const end = (f) => solve(id, name, f).bones;
    const between = [1, 2, 3, 5, 6, 7];
    for (const l of legs) {
      const contact = Math.max(end(0)[l].end[1], end(4)[l].end[1]);
      const lift = Math.max(...between.map((f) => contact - end(f)[l].end[1]));
      assert.ok(lift >= 1, `${id} ${name}: ${l} lifts its foot in the walk (by ${lift.toFixed(2)} px)`);
      // and the leg itself folds (the foot comes up towards the hip), so it is a step, not the body bobbing
      const span = (f) => end(f)[l].end[1] - end(f)[l].start[1];
      const fold = Math.min(span(0), span(4)) - Math.min(...between.map(span));
      assert.ok(fold >= 1, `${id} ${name}: ${l} draws its foot up at least 1 px towards the hip between the contacts (by ${fold.toFixed(2)} px)`);
    }
    // while one foot is up, another stays down: the body is carried, it does not hop
    for (const f of [1, 2, 3, 5, 6, 7]) assert.ok(lowest(id, name, f) >= ground(id) - 1, `${id} ${name} ${f}: a foot stays on (or 1 px over) the ground`);
  }
});

test('templates: the feet hold still through every idle (the lowest row is the ground row on every frame)', () => {
  for (const id of grounded) for (const name of Object.keys(def(id).clips).filter((n) => n.startsWith('idle'))) {
    const rows = Array.from({ length: def(id).clips[name].frames }, (_, f) => lowest(id, name, f));
    assert.deepEqual(rows, rows.map(() => ground(id)), `${id} ${name}: lowest rows ${rows}`);
  }
});

test('templates: every grounded body\'s die ends on the remains, lying on the ground row', () => {
  for (const id of grounded) {
    const c = def(id).clips.die;
    assert.equal(lowest(id, 'die', c.frames - 1), ground(id), `${id}: the last frame of die rests on the ground`);
    assert.equal(lowest(id, 'die', c.frames - 2), ground(id), `${id}: and the frame before it`);
  }
});

test('templates: the three top-down directions look different (face, back, profile) and only the side view has one eye', () => {
  for (const id of TOP) {
    const pics = DIRS.map((dir) => draw(id, `idle_${dir}`, 0));
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.ok(pics[i].data.some((v, k) => v !== pics[j].data[k]), `${id}: ${DIRS[i]} and ${DIRS[j]} differ`);
    const eyes = (clip) => {
      const p = framePose(def(id), clip, 0), rig = rigFor(id, clip);
      return rig.shapes.filter((s) => /^eye/.test(s.id) && !s.id.includes('Shut') && (p.show?.includes(s.id) || (!s.hidden && !p.hide?.includes(s.id)))).length;
    };
    for (const clip of ['idle_down', 'walk_down', 'hurt']) assert.equal(eyes(clip), 2, `${id} ${clip}: two eyes facing down`);
    for (const clip of ['idle_up', 'walk_up']) assert.equal(eyes(clip), 0, `${id} ${clip}: no face from behind`);
    for (const clip of ['idle_side', 'walk_side']) assert.equal(eyes(clip), 1, `${id} ${clip}: one eye in profile`);
    // a clip with no keys at all still draws each direction as itself: the look is in the rig, not in the keys
    const bare = T.studioTemplate(id);
    for (const dir of DIRS) bare.clips[`run_${dir}`] = { label: `Run (${dir})`, frames: 6, fps: 12, loop: true, keys: [{ t: 0 }, { t: 0.5 }] };
    const s = dataSprite(bare, OPTS);
    const P = defaultParams(s);
    for (const dir of DIRS) {
      const a = renderFrame(s, `run_${dir}`, 0, P), b = renderFrame(s, `idle_${dir}`, 0, P);
      const diff = a.data.reduce((n, v, k) => n + (v !== b.data[k] ? 1 : 0), 0);
      assert.ok(diff < drawn(b) / 4, `${id}: an unkeyed run_${dir} looks like idle_${dir} (${diff} px differ)`);
    }
  }
});

test('templates: every idle loop blinks once, on frames 6 to 7', () => {
  for (const id of T.STUDIO_TEMPLATE_IDS) {
    for (const n of Object.keys(def(id).clips).filter((x) => x.startsWith('idle'))) {
      if (n === 'idle_up') continue;   // no face from behind
      const shut = (f) => (framePose(def(id), n, f).show ?? []).some((s) => /Shut$/.test(s));
      assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(shut), [false, false, false, false, false, false, true, true], `${id} ${n}`);
    }
  }
});

test('templates: the trousers stand apart from the outline and the boots, so the legs read at 1x', () => {
  // relative luminance (WCAG); the outline is engine/color.js INK
  const lum = (hex) => { const [r, g, b] = hexToRgb(hex); const c = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const id of ['two-legs', 'topdown-person']) {
    const c = def(id).colours;
    assert.ok(ratio(c.trousers, INK) >= 3, `${id}: trousers ${c.trousers} against the outline: ${ratio(c.trousers, INK).toFixed(2)}`);
    assert.ok(ratio(c.trousers, c.boots) >= 1.8, `${id}: trousers against boots: ${ratio(c.trousers, c.boots).toFixed(2)}`);
  }
});

test('templates: drawing is deterministic', () => {
  for (const id of T.STUDIO_TEMPLATE_IDS) {
    const name = Object.keys(def(id).clips)[1];
    const again = dataSprite(T.studioTemplate(id), OPTS);
    assert.deepEqual([...draw(id, name, 3).data], [...renderFrame(again, name, 3, defaultParams(again)).data], id);
  }
});

test('templates: every slider at both ends keeps every frame inside the border and standing bodies on the ground', () => {
  for (const id of T.STUDIO_TEMPLATE_IDS) {
    const [w, h] = SPRITES[id].size;
    for (const c of def(id).controls.filter((x) => x.scales)) for (const v of [c.min, c.max]) {
      for (const [name, clip] of Object.entries(SPRITES[id].clips)) for (let f = 0; f < clip.frames; f++) {
        const b = bbox(draw(id, name, f, { [c.key]: v }));
        assert.ok(b && b[0] >= 1 && b[1] >= 1 && b[2] <= w - 2 && b[3] <= h - 2, `${id} ${c.key}=${v} ${name} ${f}: inside the border (${b})`);
        if (SPRITES[id].grounded) assert.ok(b[3] <= ground(id), `${id} ${c.key}=${v} ${name} ${f}: not below the ground (${b[3]})`);
      }
    }
  }
});
