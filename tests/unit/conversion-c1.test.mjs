// Conversion of the side-view character sprites to studio data files (docs/studio.md section 9, Q3: "convert all 17";
// build item C1). The guard every conversion must pass before a sprite file is replaced, written against the files as
// they were before any conversion: the original of each sprite is kept in tests/fixtures/conversion/<id>.js.txt (the
// file at ORIGINAL, the commit these seven files were last unchanged at; test (0) checks the copy against git wherever
// git has that commit) and imported from a temporary copy, so the comparison still holds once the file in sprites/ is
// the converted one. A missing original fails; it never skips.
//
//   (1) the same id, name, meta, frame size, pivot, clip names, frames, loop and fps (slow, middle, fast), parts with
//       their params, none and socket, control ids with their kind, default, range, step, `when` and choice values
//       (and the old values a choice still takes), sound cues with their `when`, and the hand-made versions (each
//       version's settings as the sprite reads them): so saved links and bags keep working, and an old control value
//       means the same thing;
//   (1b) the same words and swatches a person sees: kind, blurb, preview clip, clip labels, part labels, and each
//       control's label, lo / hi words, group, swatches and option labels;
//   (2) every clip at the default settings, at both ends of every slider, at every value of every choice and every
//       on/off control, with every colour at another swatch, and at every hand-made version, differs from the
//       original's drawing by at most 2% of the original's drawn pixels on every frame. The worst case per clip is
//       printed (t.diagnostic);
//   (2s) at those same settings, every frame has the original's sockets (hand, head, muzzle, ...), each within 1 px of
//       where it was and its angle within 0.1 rad.
//
// The pixel comparison runs only for a file that is not the original (it is slow: every frame at about 40 settings);
// for an unchanged file it says so and passes. To try a conversion before it replaces a file, put the candidate files
// in a folder and run:  C1_CANDIDATES=/that/folder node --test tests/unit/conversion-c1.test.mjs
// (a candidate's imports may start with ../ as in sprites/: they are pointed at this project).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderFrame, defaultParams, cleanParams, clipFps, frameSockets, randomParams } from '../../engine/sprite.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** The commit whose sprites/<id>.js are the originals (the seven files are the same at HEAD when C1 started). */
const ORIGINAL = '1877f655f8093815e5ff3af3c86ad27c7440155a';
/** The seven side-view character sprites of C1, simplest first. */
const C1_IDS = ['rogue-battler', 'road-bandit', 'knight', 'bone-soldier', 'spear-goblin', 'thicket-imp', 'wizard'];
/** The most a frame may differ: a share of the original frame's drawn pixels. */
const MOST = 0.02;
/** The most a socket may move, in frame pixels, and turn, in radians. */
const SOCKET_PX = 1, SOCKET_TURN = 0.1;
/** How many seeded random full settings requirement 2 draws per sprite (every control set at once), and their first seed. */
const RANDOM_SETTINGS = 8, RANDOM_SEED = 0xc1;
/** Where the originals are kept: <id>.js.txt, the file at ORIGINAL. */
const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'conversion');

const CANDIDATES = process.env.C1_CANDIDATES ? path.resolve(process.env.C1_CANDIDATES) : null;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'c1-conversion-'));
const rootUrl = pathToFileURL(ROOT).href;
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

/** The original text of sprites/<id>.js as kept in tests/fixtures/conversion, or null when the copy is missing. */
function originalText(id) {
  const file = path.join(FIXTURES, `${id}.js.txt`);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

/** sprites/<id>.js at ORIGINAL from git, or null when git or the commit is not there (a scratch copy, a shallow clone). */
function gitText(id) {
  try { return execFileSync('git', ['show', `${ORIGINAL}:sprites/${id}.js`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; }
}

/** Imports sprite source text from a temporary file, its ../ imports pointed at this project. */
let n = 0;
async function load(text, tag) {
  const file = path.join(TMP, `${tag}-${n++}.mjs`);
  fs.writeFileSync(file, text.replace(/(['"])\.\.\//g, `$1${rootUrl}/`));
  return (await import(pathToFileURL(file).href)).default;
}

/** What must stay the same, as plain data (requirement 1). */
function identityOf(s) {
  const P = defaultParams(s);
  const controls = {};
  for (const [k, d] of Object.entries(s.params)) {
    const c = { kind: d.kind, default: d.def, when: plainOf(d.when) };
    if (d.kind === 'range') Object.assign(c, { min: d.min, max: d.max, step: d.step });
    if (d.kind === 'choice') c.values = d.options.map((o) => o.value);
    if (d.was) c.was = Object.fromEntries(Object.keys(d.was).map((v) => [v, cleanParams(s, { [k]: v })[k]]));
    controls[k] = c;
  }
  const clips = {};
  for (const [name, c] of Object.entries(s.clips)) {
    clips[name] = { frames: c.frames, loop: !!c.loop, fps: [0, 0.5, 1].map((speed) => +clipFps(s, name, { ...P, speed }).toFixed(6)) };
  }
  const sounds = JSON.parse(JSON.stringify(s.sounds ?? {}));
  for (const k of Object.keys(sounds)) if (!sounds[k]?.length) delete sounds[k];
  const parts = Object.fromEntries(Object.entries(s.parts ?? {}).map(([k, x]) => [k, plainOf({ params: x.params, none: x.none ?? null, socket: x.socket ?? null })]));
  const versions = (s.versions ?? []).map((v) => ({ name: v.name, params: cleanParams(s, v.params ?? {}) }));
  return {
    id: s.id, name: s.name, meta: s.meta, size: [...s.size], pivot: [...s.pivot],
    clips, parts, controls, sounds, versions,
  };
}

/** A value as plain data (undefined becomes null, so a key that is gone and a key that is undefined compare alike). */
function plainOf(v) { return v === undefined ? null : JSON.parse(JSON.stringify(v)); }

/** What a person reads and picks from, as plain data (requirement 1b): words, swatches and groups. */
function presentationOf(s) {
  const controls = {};
  for (const [k, d] of Object.entries(s.params)) {
    controls[k] = plainOf({
      label: d.label, group: d.group, lo: d.lo, hi: d.hi, swatches: d.swatches,
      options: d.kind === 'choice' ? d.options.map((o) => [o.value, o.label]) : undefined,
    });
  }
  return {
    kind: s.kind ?? null, blurb: s.blurb ?? null, preview: s.preview ?? null,
    clips: Object.fromEntries(Object.entries(s.clips).map(([k, c]) => [k, c.label ?? null])),
    parts: Object.fromEntries(Object.entries(s.parts ?? {}).map(([k, x]) => [k, x.label ?? null])),
    controls,
  };
}

/** Readable differences between two values, one line each (path: was -> now). */
function differences(a, b, at = '') {
  const plain = (v) => v !== null && typeof v === 'object';
  if (!plain(a) || !plain(b) || Array.isArray(a) !== Array.isArray(b)) {
    return JSON.stringify(a) === JSON.stringify(b) ? [] : [`${at || '(whole)'}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`];
  }
  if (Array.isArray(a) && a.every((x) => !plain(x)) && b.every((x) => !plain(x))) {
    return JSON.stringify(a) === JSON.stringify(b) ? [] : [`${at}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`];
  }
  const out = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const p = at ? `${at}.${k}` : k;
    if (!Object.hasOwn(b, k)) out.push(`${p}: missing (was ${JSON.stringify(a[k])})`);
    else if (!Object.hasOwn(a, k)) out.push(`${p}: new (${JSON.stringify(b[k])})`);
    else out.push(...differences(a[k], b[k], p));
  }
  return out;
}

/**
 * The settings requirement 2 draws at, from the original's controls (what saved links hold): the defaults, both ends of
 * every slider and its quarter, half and three-quarter points (on the slider's step), every value of every choice, both
 * values of every on/off control, every colour at another swatch, every hand-made version, and RANDOM_SETTINGS seeded
 * random settings that set every control at once (engine/sprite.js randomParams), so a choice meets the sliders its
 * `when` depends on. Returns [{ name, p }].
 */
function settingsOf(s) {
  const P = defaultParams(s), out = [{ name: 'defaults', p: P }];
  for (const [k, d] of Object.entries(s.params)) {
    if (d.kind === 'range') {
      const snap = (v) => +(d.step ? Math.round(v / d.step) * d.step : v).toFixed(6);
      const at = [d.min, ...[0.25, 0.5, 0.75].map((q) => snap(d.min + (d.max - d.min) * q)), d.max];
      for (const v of new Set(at)) if (v !== d.def || v === d.min || v === d.max) out.push({ name: `${k}=${v}`, p: { ...P, [k]: v } });
    }
    else if (d.kind === 'choice') { for (const o of d.options) if (o.value !== d.def) out.push({ name: `${k}=${o.value}`, p: { ...P, [k]: o.value } }); }
    else if (d.kind === 'toggle') out.push({ name: `${k}=${!d.def}`, p: { ...P, [k]: !d.def } });
    else if (d.kind === 'color') {
      const other = [...(d.swatches ?? [])].reverse().find((c) => c.toLowerCase() !== String(d.def).toLowerCase());
      if (other) out.push({ name: `${k}=${other}`, p: { ...P, [k]: other } });
    }
  }
  for (const v of s.versions ?? []) out.push({ name: `version:${v.name}`, p: { ...P, ...(v.params ?? {}) } });
  for (let i = 0; i < RANDOM_SETTINGS; i++) out.push({ name: `random:${i + 1}`, p: cleanParams(s, randomParams(s, RANDOM_SEED + i)) });
  return out;
}

/** The smaller turn between two angles, in radians. */
const turn = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/**
 * Compares the sockets of two sprites frame by frame at the original's settings (requirement 2s), each setting opened
 * on each sprite as a saved link is. A socket the original has and the other lacks, one moved more than SOCKET_PX or
 * turned more than SOCKET_TURN, is over. Returns { worst: { clip: { dist, turn, at } }, over: [lines] }.
 */
function compareSockets(was, now, settings = settingsOf(was)) {
  const worst = {}, over = [];
  for (const { name, p } of settings) {
    const pw = cleanParams(was, p), pn = cleanParams(now, p);
    for (const [clip, c] of Object.entries(was.clips)) {
      for (let f = 0; f < c.frames; f++) {
        const a = frameSockets(was, clip, f, pw) ?? {};
        let b;
        try { b = now.clips[clip] ? (frameSockets(now, clip, f, pn) ?? {}) : {}; } catch { b = {}; }
        const at = `${name}, frame ${f}`;
        for (const [k, s] of Object.entries(a)) {
          const t = b[k];
          const dist = t ? Math.hypot(t.x - s.x, t.y - s.y) : Infinity;
          const tn = t ? turn(t.angle ?? 0, s.angle ?? 0) : Infinity;
          const w = worst[clip] ?? (worst[clip] = { dist: 0, turn: 0, at: 'nothing moved' });
          if (dist > w.dist || tn > w.turn) Object.assign(w, { dist: Math.max(w.dist, dist), turn: Math.max(w.turn, tn), at: `${k} at ${at}` });
          if (!t) over.push(`${clip} ${at}: socket ${k} is gone`);
          else if (dist > SOCKET_PX || tn > SOCKET_TURN) over.push(`${clip} ${at}: socket ${k} moved ${dist.toFixed(2)} px, turned ${tn.toFixed(3)} rad`);
        }
      }
    }
  }
  return { worst, over };
}

const drawn = (g) => { let c = 0; for (const v of g.data) if (v) c++; return c; };
const diff = (a, b) => {
  if (a.w !== b.w || a.h !== b.h) return Infinity;
  let c = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) c++; return c;
};

/**
 * Compares two sprites frame by frame at the original's settings (requirement 2). Each setting is opened on the
 * converted sprite as a saved link is: cleanParams(converted, setting). Returns { worst: { clip: { share, at } }, overall }.
 */
function comparePixels(was, now, settings = settingsOf(was)) {
  const worst = {};
  let overall = { share: 0, at: 'nothing differs' };
  for (const { name, p } of settings) {
    const pw = cleanParams(was, p), pn = cleanParams(now, p);
    for (const [clip, c] of Object.entries(was.clips)) {
      for (let f = 0; f < c.frames; f++) {
        const a = renderFrame(was, clip, f, pw);
        let share;
        try { share = now.clips[clip] ? diff(a, renderFrame(now, clip, f, pn)) / Math.max(1, drawn(a)) : Infinity; } catch { share = Infinity; }
        const at = `${name}, frame ${f}`;
        if (!worst[clip] || share > worst[clip].share) worst[clip] = { share, at };
        if (share > overall.share) overall = { share, at: `${clip}: ${at}` };
      }
    }
  }
  return { worst, overall };
}

const pct = (x) => (Number.isFinite(x) ? `${(x * 100).toFixed(2)}%` : 'not drawn');

for (const id of C1_IDS) {
  const orig = originalText(id);
  const file = CANDIDATES ? path.join(CANDIDATES, `${id}.js`) : path.join(ROOT, 'sprites', `${id}.js`);
  const nowText = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  // only a candidate run skips a sprite (no candidate given for it); a missing original fails in (0) and in every test
  const skip = nowText === null ? `no candidate ${file}` : false;
  const needOriginal = () => assert.ok(orig !== null, `the original of ${id} is missing: tests/fixtures/conversion/${id}.js.txt (sprites/${id}.js at ${ORIGINAL.slice(0, 7)})`);

  test(`C1 ${id}: (0) the original is kept in tests/fixtures/conversion and is the file at ${ORIGINAL.slice(0, 7)}`, (t) => {
    needOriginal();
    const g = gitText(id);
    if (g === null) { t.diagnostic(`${id}: git does not have ${ORIGINAL.slice(0, 7)} here; the kept copy is used as it is`); return; }
    assert.ok(g === orig, `tests/fixtures/conversion/${id}.js.txt is not sprites/${id}.js at ${ORIGINAL.slice(0, 7)}`);
  });

  test(`C1 ${id}: (1) id, name, meta, frame, pivot, clips, parts, controls, sounds and versions are the original's`, { skip }, async () => {
    needOriginal();
    const was = await load(orig, `${id}-original`), now = await load(nowText, `${id}-now`);
    const lines = differences(identityOf(was), identityOf(now));
    assert.deepEqual(lines, [], `${id} is not the same sprite to a saved link or bag:\n  ${lines.join('\n  ')}`);
  });

  test(`C1 ${id}: (1b) the words, groups and swatches a person sees are the original's`, { skip }, async () => {
    needOriginal();
    const was = await load(orig, `${id}-original`), now = await load(nowText, `${id}-now`);
    const lines = differences(presentationOf(was), presentationOf(now));
    assert.deepEqual(lines, [], `${id} reads differently on its page:\n  ${lines.join('\n  ')}`);
  });

  test(`C1 ${id}: (2s) every frame at every setting has the original's sockets, within ${SOCKET_PX} px and ${SOCKET_TURN} rad`, { skip }, async (t) => {
    needOriginal();
    if (nowText === orig) { t.diagnostic(`${id}: the file is the original; nothing to compare`); return; }
    const was = await load(orig, `${id}-original`), now = await load(nowText, `${id}-now`);
    const { worst, over } = compareSockets(was, now);
    for (const [clip, w] of Object.entries(worst)) t.diagnostic(`${id} ${clip}: sockets moved at most ${w.dist.toFixed(2)} px, turned ${w.turn.toFixed(3)} rad (${w.at})`);
    assert.deepEqual(over.slice(0, 12), [], `${id}: ${over.length} sockets moved:\n  ${over.slice(0, 12).join('\n  ')}`);
  });

  test(`C1 ${id}: (2) every clip at every setting differs from the original by at most 2% of the drawn pixels`, { skip }, async (t) => {
    needOriginal();
    if (nowText === orig) { t.diagnostic(`${id}: the file is the original; nothing to compare`); return; }
    const was = await load(orig, `${id}-original`), now = await load(nowText, `${id}-now`);
    const { worst, overall } = comparePixels(was, now);
    for (const [clip, w] of Object.entries(worst)) t.diagnostic(`${id} ${clip}: worst ${pct(w.share)} (${w.at})`);
    t.diagnostic(`${id}: worst of all ${pct(overall.share)} (${overall.at})`);
    const over = Object.entries(worst).filter(([, w]) => !(w.share <= MOST)).map(([clip, w]) => `${clip}: ${pct(w.share)} at ${w.at}`);
    assert.deepEqual(over, [], `${id}: frames differ by more than 2% of the drawn pixels:\n  ${over.join('\n  ')}`);
  });
}

test('C1 harness: settingsOf covers defaults, slider ends, every choice value, toggles and a colour each', async () => {
  const s = await fixtureOf('rogue-battler', 'harness');
  const names = settingsOf(s).map((x) => x.name);
  assert.equal(names[0], 'defaults');
  for (const want of ['height=0', 'height=1', 'weaponLength=0.65', 'weaponLength=1.35', 'weapon=none', 'weapon=claws', 'headgear=bandana', 'scarf=none']) assert.ok(names.includes(want), want);
  assert.ok(names.some((x) => x.startsWith('outfit=#')));
  // a sprite compared with itself differs nowhere
  const { overall } = comparePixels(s, s, settingsOf(s).slice(0, 3));
  assert.equal(overall.share, 0);
});

test('C1 harness: differences names what changed, what is missing and what is new', () => {
  assert.deepEqual(differences({ a: 1, b: { c: [1, 2] }, d: 1 }, { a: 1, b: { c: [1, 3] }, e: 2 }), ['b.c: [1,2] -> [1,3]', 'd: missing (was 1)', 'e: new (2)']);
});

// ---- review round 2: the guard's holes (sockets, versions, a control's `when` and `step`, presentation, a missing original)

const fixtureOf = async (id, tag = 'self') => load(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'conversion', `${id}.js.txt`), 'utf8'), `${id}-${tag}`);

test('C1 harness: identity holds the hand versions, each control\'s when and step, and each part\'s params, none and socket', async () => {
  const knight = await fixtureOf('knight'), rogue = await fixtureOf('rogue-battler');
  const k = identityOf(knight), r = identityOf(rogue);
  assert.equal(k.versions.length, 12);
  assert.equal(k.versions[1].name, 'Ranger');
  assert.equal(k.versions[1].params.weapon, 'spear');
  assert.deepEqual(r.controls.metal.when, { weapon: rogue.params.metal.when.weapon });
  assert.equal(r.controls.weaponLength.step, rogue.params.weaponLength.step);
  assert.deepEqual(r.parts.weapon, JSON.parse(JSON.stringify({ params: rogue.parts.weapon.params, none: rogue.parts.weapon.none ?? null, socket: rogue.parts.weapon.socket ?? null })));
  // taking the versions away, or a control's `when`, is a difference
  assert.ok(differences(k, identityOf({ ...knight, versions: undefined })).some((l) => l.startsWith('versions')));
  const noWhen = { ...rogue, params: { ...rogue.params, metal: { ...rogue.params.metal, when: undefined } } };
  assert.ok(differences(r, identityOf(noWhen)).some((l) => l.startsWith('controls.metal.when')));
});

test('C1 harness: presentation holds labels, swatches, groups, option labels, blurb and preview', async () => {
  const rogue = await fixtureOf('rogue-battler');
  const a = presentationOf(rogue);
  const relabelled = { ...rogue, blurb: 'x', params: { ...rogue.params, outfit: { ...rogue.params.outfit, label: 'Other', swatches: ['#000000'] } } };
  const lines = differences(a, presentationOf(relabelled));
  assert.ok(lines.some((l) => l.startsWith('blurb')));
  assert.ok(lines.some((l) => l.startsWith('controls.outfit.label')));
  assert.ok(lines.some((l) => l.startsWith('controls.outfit.swatches')));
});

test('C1 harness: settingsOf draws every hand version', async () => {
  const knight = await fixtureOf('knight');
  const names = settingsOf(knight).map((x) => x.name);
  for (const v of ['Classic', 'Ranger', 'Rose captain']) assert.ok(names.includes(`version:${v}`), v);
});

test('C1 harness: sockets moved more than a pixel, or missing, are found; the same sockets pass', async () => {
  const rogue = await fixtureOf('rogue-battler');
  const settings = settingsOf(rogue).slice(0, 2);
  assert.deepEqual(compareSockets(rogue, rogue, settings).over, []);
  const moved = { ...rogue, sockets: (c, t, p) => Object.fromEntries(Object.entries(rogue.sockets(c, t, p)).map(([k, s]) => [k, { ...s, x: s.x + 2 }])) };
  const r = compareSockets(rogue, moved, settings);
  assert.ok(r.over.length > 0);
  assert.ok(r.worst.idle.dist >= 2);
  const nudged = { ...rogue, sockets: (c, t, p) => Object.fromEntries(Object.entries(rogue.sockets(c, t, p)).map(([k, s]) => [k, { ...s, x: s.x + 0.5 }])) };
  assert.deepEqual(compareSockets(rogue, nudged, settings).over, [], 'half a pixel is within the tolerance');
  const none = { ...rogue, sockets: undefined };
  assert.ok(compareSockets(rogue, none, settings).over.length > 0);
});

// ---- review round 3: values between a slider's ends, and many controls changed at once

test('C1 harness: settingsOf draws every slider at its quarter, half and three-quarter points', async () => {
  const rogue = await fixtureOf('rogue-battler');
  const names = settingsOf(rogue).map((x) => x.name);
  for (const want of ['height=0.25', 'height=0.5', 'height=0.75']) assert.ok(names.includes(want), want);
  const wl = rogue.params.weaponLength, snap = (v) => +(Math.round(v / wl.step) * wl.step).toFixed(6);
  // a point that is the default is already drawn as 'defaults' (weaponLength's half point is its default, 1)
  for (const q of [0.25, 0.5, 0.75]) { const v = snap(wl.min + (wl.max - wl.min) * q); assert.ok(v === wl.def || names.includes(`weaponLength=${v}`), `weaponLength at ${q}`); }
});

test('C1 harness: settingsOf adds seeded random full settings, the same every run, that change several controls together', async () => {
  const rogue = await fixtureOf('rogue-battler');
  const a = settingsOf(rogue).filter((x) => x.name.startsWith('random:'));
  const b = settingsOf(rogue).filter((x) => x.name.startsWith('random:'));
  assert.equal(a.length, RANDOM_SETTINGS);
  assert.deepEqual(a, b, 'the random settings are seeded');
  const P = defaultParams(rogue);
  for (const { name, p } of a) {
    assert.deepEqual(p, cleanParams(rogue, p), `${name} is a legal setting`);
    assert.ok(Object.keys(P).filter((k) => p[k] !== P[k]).length >= 3, `${name} changes several controls`);
  }
  // a choice together with a slider its `when` depends on: some random setting holds a weapon and a non-default length
  assert.ok(a.some(({ p }) => p.weapon !== 'none' && p.weaponLength !== P.weaponLength));
});

test('C1 harness: a conversion that goes wrong only between a slider\'s ends is found, in pixels and in sockets', async () => {
  const rogue = await fixtureOf('rogue-battler');
  const P = defaultParams(rogue), d = rogue.params.height;
  // right at the default and both ends, wrong everywhere between (the review's r3-mid copy)
  const bend = (p) => ([d.min, d.max, P.height].includes(p.height) ? p : { ...p, height: p.height * p.height * 0.2 });
  const bent = { ...rogue, render: (g, ctx) => rogue.render(g, { ...ctx, p: bend(ctx.p) }), sockets: (c, t, p) => rogue.sockets(c, t, bend(p)) };
  const ends = settingsOf(rogue).filter((x) => /^(defaults|height=(0|1))$/.test(x.name));
  assert.equal(comparePixels(rogue, bent, ends).overall.share, 0, 'the ends alone do not see it');
  const mid = settingsOf(rogue).filter((x) => x.name.startsWith('height='));
  assert.ok(comparePixels(rogue, bent, mid).overall.share > MOST, 'the quarter points see it');
  assert.ok(compareSockets(rogue, bent, mid).over.length > 0, 'the sockets move too');
});
