// Framework additions made with batch R15 (party and villager portraits):
//   engine/faces.js   PORTRAIT_SIZE, PORTRAIT_PIVOT, PORTRAIT_FRAMES, TALK_FRAMES, TALK_FPS          how a portrait set is laid out
//                     FACE_MOODS, FACE_AGES, FACE_HAIR, FACE_HEADGEAR, FACE_BEARDS, FACE_COLLARS, FACE_CARRIED   what a person may be made of
//                     faceClips, parseFaceClip, talkStep                                           the clips of a set: <who>-<mood>, <who>-talk
//                     faceBust, portraitFrame, portrait                                            a head and shoulders from a description; its border; the two together
// And the two sprites made with it: each portrait is the same person as that person's map sprite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, INK } from '../../engine/color.js';
import { renderFrame, defaultParams, cleanParams } from '../../engine/sprite.js';
import { HAIR_STYLES } from '../../rigs/topdown.js';
import {
  PORTRAIT_SIZE, PORTRAIT_PIVOT, PORTRAIT_FRAMES, TALK_FRAMES, TALK_FPS, FACE_MOODS, FACE_AGES, FACE_HAIR, FACE_HEADGEAR, FACE_BEARDS, FACE_COLLARS, FACE_CARRIED,
  faceClips, parseFaceClip, talkStep, faceBust, portraitFrame, portrait,
} from '../../engine/faces.js';

const diff = (a, b) => a.data.reduce((n, v, i) => n + (v !== b.data[i] ? 1 : 0), 0);
const shapeDiff = (a, b) => a.data.reduce((n, v, i) => n + (!v !== !b.data[i] ? 1 : 0), 0);
const colours = (g) => { const s = new Set(g.data); s.delete(0); return s; };
const count = (g, hex) => { const c = col(hex); return g.data.reduce((n, v) => n + (v === c ? 1 : 0), 0); };
const SKIN = '#f6d3b0';
const plain = (more = {}) => ({ skin: SKIN, hair: { style: 'short', colour: '#9a6a3e' }, outfit: { colour: '#3f6fd1' }, ...more });
const draw = (person, opt) => portrait(new Surface(...PORTRAIT_SIZE), person, opt);

test('a portrait is 48x48 with its pivot in the middle, and the lists are frozen', () => {
  assert.deepEqual([...PORTRAIT_SIZE], [48, 48]);
  assert.deepEqual([...PORTRAIT_PIVOT], [24, 24]);
  for (const list of [PORTRAIT_SIZE, PORTRAIT_PIVOT, PORTRAIT_FRAMES, FACE_MOODS, FACE_AGES, FACE_HAIR, FACE_HEADGEAR, FACE_BEARDS, FACE_COLLARS, FACE_CARRIED]) assert.ok(Object.isFrozen(list));
  assert.deepEqual([...PORTRAIT_FRAMES], ['none', 'round', 'square']);
  // the hair styles of the body rigs are all here, under the same names
  for (const style of HAIR_STYLES) assert.ok(FACE_HAIR.includes(style), `the rigs' hair style "${style}"`);
});

test('faceClips makes <who>-<mood> clips of one frame, person by person, and a 4-frame talk clip at a fixed speed', () => {
  const clips = faceClips(['hero', ['kid', 'Child']], ['neutral', 'happy'], { talk: true });
  assert.deepEqual(Object.keys(clips), ['hero-neutral', 'hero-happy', 'hero-talk', 'kid-neutral', 'kid-happy', 'kid-talk']);
  assert.deepEqual(clips['hero-happy'], { frames: 1, fps: 1, loop: true, label: 'Hero, happy' });
  assert.deepEqual(clips['kid-talk'], { frames: TALK_FRAMES, fps: TALK_FPS, loop: true, label: 'Child, talking' });
  assert.equal(TALK_FRAMES, 4);
  assert.equal(TALK_FPS, 8);
  assert.deepEqual(Object.keys(faceClips(['a'], ['neutral'])), ['a-neutral']);
  assert.throws(() => faceClips(['a'], ['grumpy']), /mood "grumpy" is not one of/);
});

test('parseFaceClip reads a clip name back, and talkStep opens and closes the mouth', () => {
  assert.deepEqual(parseFaceClip('hero-happy'), { who: 'hero', mood: 'happy', talk: false });
  assert.deepEqual(parseFaceClip('old-man-worried'), { who: 'old-man', mood: 'worried', talk: false });
  assert.deepEqual(parseFaceClip('mage-talk'), { who: 'mage', mood: 'neutral', talk: true });
  assert.throws(() => parseFaceClip('hero'), /not a <who>-<mood> clip name/);
  assert.throws(() => parseFaceClip('hero-sleepy'), /mood "sleepy"/);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(talkStep), [0, 1, 2, 1, 0, 1]);
});

test('a portrait keeps the 1 px border of its frame, with every border and at every zoom', () => {
  for (const frame of PORTRAIT_FRAMES) for (const zoom of [0, 0.3, 0.5, 0.8, 1]) for (const kind of FACE_HEADGEAR) {
    const b = draw(plain({ headgear: { kind, colour: '#7a4fc4', metal: '#c2c9d6', plume: '#c9423a' } }), { frame, zoom }).bounds();
    assert.ok(b.x0 >= 1 && b.y0 >= 1 && b.x1 <= 46 && b.y1 <= 46, `${frame}, zoom ${zoom}, ${kind}: ${JSON.stringify(b)}`);
    if (frame !== 'none') assert.deepEqual(b, { x0: 1, y0: 1, x1: 46, y1: 46 }, `a ${frame} border reaches the 1 px border`);
    else assert.equal(b.y1, 46, 'a bust with no border is cut along the bottom of the frame');
  }
});

test('with no border the bust is inked all round; with one, the backing lies behind the head inside a band', () => {
  const g = draw(plain(), { frame: 'none' }), ink = col(INK);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    if (!g.get(x, y) || (g.get(x - 1, y) && g.get(x + 1, y) && g.get(x, y - 1) && g.get(x, y + 1))) continue;
    assert.equal(g.get(x, y), ink, `the edge pixel ${x}, ${y} is ink`);
  }
  assert.equal(portraitFrame(new Surface(48, 48), 'none'), null);
  for (const frame of ['round', 'square']) {
    const f = new Surface(48, 48), inside = portraitFrame(f, frame, { backing: '#4a609c', band: '#f0ead8' });
    assert.ok(inside(24.5, 24.5) && !inside(2.5, 24.5) && !inside(0.5, 0.5), `${frame}: the backing is the middle`);
    assert.ok(count(f, '#4a609c') > 1000 && count(f, '#f0ead8') > 200, `${frame}: a backing and a band`);
    assert.deepEqual([...colours(f)].length, 3, `${frame}: ink, band and backing only`);
    const p = draw(plain(), { frame, backing: '#4a609c', band: '#f0ead8' });
    assert.ok(count(p, '#4a609c') > 250, `${frame}: the backing still shows round the head`);
    assert.equal(count(p, '#f0ead8'), count(f, '#f0ead8'), `${frame}: nothing is drawn over the band`);
  }
  assert.ok(shapeDiff(draw(plain(), { frame: 'round' }), draw(plain(), { frame: 'square' })) > 100, 'the two borders differ in outline');
  assert.throws(() => portraitFrame(new Surface(48, 48), 'oval'), /frame "oval" is not one of/);
});

test('every mood changes the face, a talking mouth opens in steps, and hurt tips the head', () => {
  const neutral = draw(plain());
  for (const mood of FACE_MOODS) for (const other of FACE_MOODS) {
    if (mood >= other) continue;
    assert.ok(diff(draw(plain(), { mood }), draw(plain(), { mood: other })) >= 6, `${mood} and ${other} differ`);
  }
  const steps = [0, 1, 2].map((mouth) => draw(plain(), { mouth }));
  assert.equal(diff(steps[0], neutral), 0);
  assert.ok(diff(steps[0], steps[1]) >= 4 && diff(steps[1], steps[2]) >= 4 && diff(steps[0], steps[2]) > diff(steps[0], steps[1]));
  // tipped back: the top of the head moves to the left
  const left = (g) => { const b = g.bounds(); for (let x = 0; x < g.w; x++) if (g.get(x, b.y0 + 2)) return x; return -1; };
  assert.ok(left(draw(plain(), { mood: 'hurt' })) < left(neutral));
  assert.throws(() => draw(plain(), { mood: 'sleepy' }), /mood "sleepy"/);
});

test('every hair style, headgear, beard, collar and carried thing draws, and each differs from the others', () => {
  const each = (list, make, least) => {
    const pics = list.map((name) => draw(make(name)));
    list.forEach((a, i) => list.forEach((b, j) => { if (i < j) assert.ok(diff(pics[i], pics[j]) >= least, `${a} and ${b}: ${diff(pics[i], pics[j])} pixels differ`); }));
    return pics;
  };
  each(FACE_HAIR, (style) => plain({ hair: { style, colour: '#9a6a3e' } }), 12);
  const hats = each(FACE_HEADGEAR, (kind) => plain({ headgear: { kind, colour: '#7a4fc4', metal: '#c2c9d6', plume: '#c9423a', band: '#f2c230', jewel: '#f2c230' } }), 20);
  // headgear changes the outline, not only the colours
  for (let i = 1; i < hats.length; i++) assert.ok(shapeDiff(hats[0], hats[i]) >= 8, `${FACE_HEADGEAR[i]} changes the outline`);
  each(FACE_BEARDS, (kind) => plain({ beard: { kind, colour: '#f0ead8' } }), 20);
  each(FACE_COLLARS, (collar) => plain({ outfit: { colour: '#3f6fd1', collar, trim: '#c9423a', clasp: '#f2c230', panel: '#4f9d57' } }), 12);
  each(['none', ...FACE_CARRIED], (kind) => plain(kind === 'none' ? {} : { carried: { kind, metal: '#c2c9d6', wood: '#9a6a3e' } }), 12);
  each(FACE_AGES, (age) => plain({ age }), 12);
  assert.ok(diff(draw(plain()), draw(plain({ spectacles: { frame: '#5a5f7a', lens: '#f0ead8' } }))) >= 20, 'spectacles');
  assert.ok(diff(draw(plain()), draw(plain({ brows: 'bushy' }))) >= 4, 'bushy brows');
  for (const [field, bad] of [['hair', { style: 'mohawk' }], ['headgear', { kind: 'fez' }], ['beard', { kind: 'goatee' }], ['outfit', { collar: 'ruff' }], ['carried', { kind: 'banner' }]]) {
    assert.throws(() => draw(plain({ [field]: bad })), /is not one of/, `${field}: an unknown name is refused`);
  }
  assert.throws(() => draw(plain({ age: 'baby' })), /age "baby"/);
  assert.throws(() => draw({}), /skin colour/);
});

test('zoom goes from head and shoulders to a close face, and every colour of a person shows at both ends', () => {
  const person = plain({ outfit: { colour: '#3f6fd1', collar: 'mantle', trim: '#c9423a', clasp: '#f2c230' }, headgear: { kind: 'helmet', metal: '#c2c9d6', plume: '#c9423a' } });
  const far = draw(person, { zoom: 0 }), near = draw(person, { zoom: 1 });
  assert.ok(count(near, SKIN) > count(far, SKIN) * 1.5, 'more face');
  assert.ok(count(far, '#3f6fd1') > count(near, '#3f6fd1'), 'less of the shoulders');
  for (const g of [far, near]) for (const hex of [SKIN, '#3f6fd1', '#c9423a']) assert.ok(count(g, hex) > 8, `${hex} shows`);
});

test('a portrait is thrifty with colours and draws the same picture twice', () => {
  const person = plain({ outfit: { colour: '#a8a4a0', collar: 'tabard', panel: '#3f6fd1', trim: '#e6c96a' }, headgear: { kind: 'helmet', metal: '#c2c9d6', plume: '#e6c96a' }, carried: { kind: 'halberd', metal: '#c2c9d6', wood: '#9a6a3e' } });
  for (const frame of PORTRAIT_FRAMES) for (const zoom of [0, 0.5, 1]) {
    const g = draw(person, { frame, zoom, backing: '#4a609c', band: '#f0ead8' });
    assert.ok(colours(g).size <= 16, `${frame}, zoom ${zoom}: ${colours(g).size} colours`);
    assert.equal(diff(g, draw(person, { frame, zoom, backing: '#4a609c', band: '#f0ead8' })), 0);
  }
});

test('faceBust draws on the surface it is given, without a frame, and leaves what was there outside the bust', () => {
  const g = new Surface(48, 48).rect(0, 0, 2, 2, '#ff00ff');
  assert.equal(faceBust(g, plain()), g);
  assert.equal(g.get(0, 0), col('#ff00ff'));
  assert.ok(count(g, SKIN) > 150 && count(g, '#3f6fd1') > 60);
  const small = faceBust(new Surface(40, 40), plain());
  assert.ok(small.bounds().x1 <= 39 && count(small, SKIN) > 100, 'another size of picture works too');
});

// ---- the two portrait sets -----------------------------------------------------------------------

const party = (await import('../../sprites/portraits-party.js')).default;
const village = (await import('../../sprites/portraits-village.js')).default;
const face = (sprite, clip, set = {}, frame = 0) => renderFrame(sprite, clip, frame, cleanParams(sprite, { ...defaultParams(sprite), ...set }));

test('the two sets have the clips, the controls and the role of their specification', () => {
  assert.deepEqual(Object.keys(party.clips), ['hero', 'mage', 'rogue'].flatMap((w) => ['neutral', 'happy', 'hurt', 'talk'].map((m) => `${w}-${m}`)));
  assert.deepEqual(Object.keys(village.clips), ['elder', 'merchant', 'guard', 'kid'].flatMap((w) => ['neutral', 'happy', 'worried'].map((m) => `${w}-${m}`)));
  for (const [clip, c] of Object.entries(party.clips)) assert.equal(c.frames, clip.endsWith('-talk') ? 4 : 1, clip);
  for (const c of Object.values(village.clips)) assert.equal(c.frames, 1);
  assert.deepEqual(Object.keys(party.params).sort(), ['backing', 'frame', 'hero', 'mage', 'rogue', 'size', 'skin']);
  assert.deepEqual(Object.keys(village.params).sort(), ['backing', 'elder', 'frame', 'guard', 'kid', 'merchant', 'size', 'skin']);
  for (const s of [party, village]) {
    assert.deepEqual(s.size, [48, 48]);
    assert.deepEqual(s.pivot, [24, 24]);
    // a portrait is never the player: the playground moves a characters/player sprite with the keyboard
    assert.equal(s.meta.type, 'icon');
    assert.equal(s.meta.role, 'interface/icon');
    assert.equal(s.meta.view, 'front');
    assert.deepEqual(s.params.backing.when, { frame: ['round', 'square'] });
    assert.equal(s.params.frame.def, 'none');
    assert.ok(!('speed' in s.params) && Object.keys(s.sounds ?? {}).length === 0, 'no speed control and no sounds');
  }
});

test('each portrait wears the default colours of that person\'s map sprite', async () => {
  const same = [
    [party, 'hero', 'hero-walker', ['skin', 'hair', 'outfit', 'trim']],
    [party, 'mage', 'mage-walker', ['skin', 'hair', 'outfit', 'trim']],
    [party, 'rogue', 'rogue-walker', ['skin', 'outfit', 'trim']],                // the hood hides the hair, as on the sprite
    [village, 'elder', 'village-elder', ['skin', 'hair', 'outfit', 'trim']],
    [village, 'merchant', 'merchant', ['skin', 'hair', 'outfit', 'accent']],
    [village, 'guard', 'town-guard', ['skin', 'outfit', 'trim']],
    [village, 'kid', 'farm-kid', ['skin', 'hair', 'outfit', 'accent']],
  ];
  for (const [set, who, id, keys] of same) {
    const sprite = (await import(`../../sprites/${id}.js`)).default, g = face(set, `${who}-neutral`);
    for (const key of keys) assert.ok(count(g, sprite.params[key].def) >= 6, `${who}: the ${key} colour of ${id} (${sprite.params[key].def}) shows in the portrait`);
  }
});

test('every person has an outline of their own, and each control of a set changes its person', () => {
  const all = [...['hero', 'mage', 'rogue'].map((w) => [w, face(party, `${w}-neutral`)]), ...['elder', 'merchant', 'guard', 'kid'].map((w) => [w, face(village, `${w}-neutral`)])];
  all.forEach(([a, ga], i) => all.forEach(([b, gb], j) => { if (i < j) assert.ok(shapeDiff(ga, gb) >= 80, `${a} and ${b}: outlines differ by ${shapeDiff(ga, gb)} pixels`); }));
  for (const [set, people] of [[party, ['hero', 'mage', 'rogue']], [village, ['elder', 'merchant', 'guard', 'kid']]]) for (const who of people) {
    const other = set.params[who].swatches.find((c) => c !== set.params[who].def);
    for (const p of people) {
      const changed = diff(face(set, `${p}-neutral`), face(set, `${p}-neutral`, { [who]: other }));
      if (p === who) assert.ok(changed >= 12, `${who}'s colour changes ${who} (${changed} pixels)`);
      else assert.equal(changed, 0, `${who}'s colour leaves ${p} alone`);
    }
  }
  // the four frames of a talk clip: closed, half open, open, half open
  const talk = [0, 1, 2, 3].map((f) => face(party, 'mage-talk', {}, f));
  assert.equal(diff(talk[0], face(party, 'mage-neutral')), 0);
  assert.ok(diff(talk[0], talk[1]) > 0 && diff(talk[1], talk[2]) > 0 && diff(talk[3], talk[0]) > 0);
  assert.equal(diff(talk[1], talk[3]), 0);
});
