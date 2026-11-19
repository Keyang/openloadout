// Ready-made versions of every sprite in sprites/ (docs/site-design.md, section 4): each one renders, stays inside its frame,
// is clean and named in words, the Hero's twelve come first as written, and making them stays within a time budget.
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPixels, cleanParams, defaultParams } from '../../engine/sprite.js';
import { versionsOf, soundVersionsOf, cleanVersions, badVersionName, pictureDifference, VERSION_RULES } from '../../engine/versions.js';
import { spriteType } from '../../quality/sprite.js';
import { loadSprites, loadSounds } from '../../tools/lib/assets.mjs';

const sprites = (await loadSprites()).map((s) => s.def);
// the sprite types whose drawing may reach the frame edge: the same list as EDGE_FREE in quality/sprite.js (not exported)
const EDGE_FREE = new Set(['tileset', 'background', 'ui', 'icon']);
// processor time (not wall time, so a busy machine does not fail it): the median sprite takes well under 100 ms for twelve;
// the slowest (96x96 mechs and golems with many clips: every kept version is drawn at three frames of every clip for the
// frame-edge rule) about 4 s, so a page should not make them all at once (build them into the catalogue, or one card at a time)
const BUDGET_MS = 6000;
// a deterministic bound on the work, pictures drawn per call: the defaults, each hand-made version, one per single change
// worth trying (every other option, every swatch, the two ends of a slider) and each combination tried
// (VERSION_RULES.attempts per version asked for, at least 40)
const singles = (s) => Object.values(s.params).reduce((t, d) => t + (d.kind === 'toggle' ? 1 : d.kind === 'choice' ? d.options.length - 1 : d.kind === 'color' ? d.swatches.length : 2), 0);
const MAX_PICTURES = (s, n) => 1 + n + singles(s) + Math.max(40, n * VERSION_RULES.attempts);

// frames checked per clip: every frame of a hand-made version; the first, middle and last of a generated one
const framesOf = (c, all) => (all ? [...Array(c.frames).keys()] : [...new Set([0, Math.floor(c.frames / 2), c.frames - 1])]);

const made = new Map();
for (const s of sprites) {
  const t0 = process.cpuUsage();
  let pictures = 0;
  const picture = VERSION_RULES.picture;
  VERSION_RULES.picture = (sp, p) => { pictures++; return picture(sp, p); };
  try { const list = versionsOf(s, 12), used = process.cpuUsage(t0);
    made.set(s.id, { list, ms: (used.user + used.system) / 1000, pictures }); } finally { VERSION_RULES.picture = picture; }
}

test('the Hero lists the twelve versions of the mock-up, first and as written', () => {
  const knight = sprites.find((s) => s.id === 'knight');
  const list = made.get('knight').list;
  assert.deepEqual(list.map((v) => v.name), ['Classic', 'Ranger', 'Royal', 'Raider', 'Shadow', 'Swamp guard', 'Brawler', 'Frost guard', 'Gold knight', 'Squire', 'Spirit', 'Rose captain']);
  assert.ok(list.every((v) => v.made === 'hand'));
  assert.deepEqual(list[0].params, defaultParams(knight));
  assert.deepEqual(list[1].params, cleanParams(knight, knight.versions[1].params));
  assert.equal(list[3].params.weapon, 'axe');
});

test('every sprite\'s own versions are valid (cleanVersions does not throw)', () => {
  for (const s of sprites) assert.doesNotThrow(() => cleanVersions(s), s.id);
});

test('every version of every sprite renders without throwing and stays inside its frame', () => {
  const faults = [];
  for (const s of sprites) {
    const edgeFree = EDGE_FREE.has(spriteType(s));
    for (const v of made.get(s.id).list) {
      for (const [clip, c] of Object.entries(s.clips)) for (const f of framesOf(c, v.made === 'hand')) {
        let g;
        try { g = renderPixels(s, clip, f, v.params); } catch (e) { faults.push(`${s.id} / ${v.name} / ${clip} ${f}: threw ${e.message}`); continue; }
        const b = g.bounds();
        if (!b || edgeFree) continue;
        if (b.x0 === 0 || b.y0 === 0 || b.x1 === g.w - 1 || b.y1 === g.h - 1) {
          // a version is held to what the defaults do: a sprite whose own default frame touches an edge is the quality bar's business
          const d = renderPixels(s, clip, f, defaultParams(s)).bounds();
          const sides = (x) => [x.x0 === 0, x.y0 === 0, x.x1 === g.w - 1, x.y1 === g.h - 1];
          const ds = d ? sides(d) : [false, false, false, false];
          if (sides(b).some((t, i) => t && !ds[i])) faults.push(`${s.id} / ${v.name} / ${clip} ${f}: touches the frame edge, box ${b.x0},${b.y0}..${b.x1},${b.y1}`);
        }
      }
    }
  }
  assert.deepEqual(faults, []);
});

test('every version is clean, every name is everyday words and unique within its sprite', () => {
  for (const s of sprites) {
    const list = made.get(s.id).list;
    assert.equal(new Set(list.map((v) => v.name.toLowerCase())).size, list.length, `${s.id}: two versions share a name`);
    const keys = Object.keys(s.params).filter((k) => /[A-Z0-9]/.test(k));      // camelCase keys never appear in a name
    for (const v of list) {
      assert.deepEqual(cleanParams(s, v.params), v.params, `${s.id} / ${v.name}: params are not clean`);
      assert.ok(/^[A-Z]/.test(v.name) && !/#|\d|[{}=_]/.test(v.name), `${s.id}: "${v.name}"`);
      for (const k of keys) assert.ok(!v.name.includes(k), `${s.id}: "${v.name}" names the control key ${k}`);
    }
  }
});

test('most sprites get at least two versions (fewer only where nothing believable shows at card size)', () => {
  // A sprite gets fewer when its colours are held by their material (a red dragon stays red, grass stays green: engine/materials.js)
  // and its other controls only nudge the shape. 2026-11-19: 115 of 137 sprites get two or more, 79 three or more.
  const two = sprites.filter((s) => made.get(s.id).list.length >= 2).length;
  assert.ok(two >= sprites.length * 0.7, `only ${two} of ${sprites.length} sprites get two or more`);
  assert.ok(sprites.every((s) => made.get(s.id).list.length <= 12));
});

// Sprites with a choice or a colour control that still get fewer than three versions, and why (measured 2026-11-19).
const FEW_VERSIONS = {
  'bg-starfield': 'the preview is the far layer: style, stars and land do not show on it',
  // a tileset is judged on a sheet of six pieces; in these the ground fill covers most of it, and their other colours
  // (flowers, crystals, stones, glow) are small marks that never reach a quarter of the sheet
  'tiles-forest': 'two soil colours; grass, stones and flowers are small marks',
  'tiles-meadow': 'two path colours; the other colours are small marks',
  'tiles-cave': 'two rock colours; shade and crystals are small marks',
  'tiles-pit': 'two kinds of pit; its colours are small marks',
};

test('every sprite with a choice or a colour control gets at least three versions, apart from the listed exceptions', () => {
  const few = sprites.filter((s) => Object.values(s.params).some((d) => d.kind === 'choice' || d.kind === 'color') && made.get(s.id).list.length < 3).map((s) => s.id);
  assert.deepEqual(few.filter((id) => !FEW_VERSIONS[id]), [], 'add a reason to FEW_VERSIONS only when the card truly cannot show more');
  assert.deepEqual(Object.keys(FEW_VERSIONS).filter((id) => !few.includes(id)), [], 'these have three or more now: take them off FEW_VERSIONS');
});

test('a version that only adds to another version adds something that shows by itself', () => {
  const close = [];
  for (const s of sprites) {
    const dflt = defaultParams(s), list = made.get(s.id).list.filter((v) => v.made === 'generated');
    const changed = (v) => Object.keys(v.params).filter((k) => v.params[k] !== dflt[k]);
    for (const a of list) for (const b of list) {
      if (a === b) continue;
      const ca = changed(a), cb = changed(b);
      if (cb.length <= ca.length || !ca.every((k) => b.params[k] === a.params[k])) continue;
      const d = pictureDifference(VERSION_RULES.picture(s, a.params), VERSION_RULES.picture(s, b.params));
      if (d < VERSION_RULES.between) close.push(`${s.id}: "${a.name}" ~ "${b.name}" ${d.toFixed(2)}`);
    }
  }
  assert.deepEqual(close, []);
});

test('the upgrade card offers a new face colour and the epic rarity (a dark hue change and a small gem are seen)', () => {
  const list = made.get('ui-upgrade-card').list;
  assert.ok(list.some((v) => v.params.face !== defaultParams(sprites.find((s) => s.id === 'ui-upgrade-card')).face), list.map((v) => v.name).join(', '));
  assert.ok(list.some((v) => v.params.rarity === 'epic'), list.map((v) => v.name).join(', '));
});

test('a tileset is judged on a sheet of six of its pieces, three across and two down', () => {
  const t = sprites.find((s) => s.meta?.type === 'tileset' && Object.keys(s.clips).length >= 6);
  const [pic] = VERSION_RULES.picture(t, defaultParams(t));
  const scale = Math.max(1, Math.ceil(Math.max(3 * t.size[0], 2 * t.size[1]) / VERSION_RULES.card));
  assert.deepEqual([pic.w, pic.h], [Math.ceil(3 * t.size[0] / scale), Math.ceil(2 * t.size[1] / scale)]);
});

test('a generated sound name leads with one change and says at most two', () => {
  for (const { id, patch } of loadSounds()) for (const v of soundVersionsOf(patch, 12).filter((x) => x.made === 'generated')) assert.ok(v.name.split(',').length <= 2, `${id}: "${v.name}"`);
});

test('no version name of any sprite or sound says a word twice, contradicts itself or runs long', () => {
  const bad = [];
  for (const s of sprites) for (const v of made.get(s.id).list) { const why = badVersionName(v.name); if (why) bad.push(`${s.id}: "${v.name}": ${why}`); }
  // style names and hand-made names are the author's words; every generated name is checked exactly as shown
  for (const { id, patch } of loadSounds()) for (const v of soundVersionsOf(patch, 12)) { const why = badVersionName(v.name); if (why && v.made !== 'hand') bad.push(`${id}: "${v.name}": ${why}`); }
  assert.deepEqual(bad, []);
});

test('a generated version changes only what its name says, and leads with a part, a kind or a colour', () => {
  for (const s of sprites) {
    const dflt = defaultParams(s);
    for (const v of made.get(s.id).list.filter((x) => x.made === 'generated')) {
      const changed = Object.keys(v.params).filter((k) => v.params[k] !== dflt[k]);
      assert.ok(changed.length <= v.name.split(',').length, `${s.id}: "${v.name}" changes ${changed.join(', ')}`);
      assert.ok(changed.some((k) => s.params[k].kind !== 'range'), `${s.id}: "${v.name}" only moves sliders`);
    }
  }
});

test('making twelve versions stays within the budget for every sprite, in time and in pictures drawn', () => {
  const slow = sprites.filter((s) => made.get(s.id).ms > BUDGET_MS).map((s) => `${s.id}: ${Math.round(made.get(s.id).ms)} ms of processor time`);
  assert.deepEqual(slow, []);
  const busy = sprites.filter((s) => made.get(s.id).pictures > MAX_PICTURES(s, 12)).map((s) => `${s.id}: ${made.get(s.id).pictures} pictures`);
  assert.deepEqual(busy, []);
});

test('asking again is answered from memory', () => {
  const s = sprites.find((x) => x.id === 'knight' ? false : Object.keys(x.params).length > 3);
  const t0 = performance.now();
  const again = versionsOf(s, 12);
  assert.ok(performance.now() - t0 < 20, 'a second call drew pictures again');
  assert.deepEqual(again, made.get(s.id).list);
});
