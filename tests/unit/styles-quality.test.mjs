// The quality bar and styles (Contract 12): one pass per style a sprite lists. (The warning for a sprite whose own code reads
// pixels back, and its tests, went in build item R4b: data sprites cannot read back; tests/unit/quality-no-read-back.test.mjs.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSprite } from '../../quality/sprite.js';
import { defineSprite, range, choice, color, toggle } from '../../engine/sprite.js';
import { validateMeta } from '../../catalog/schema.js';
import { lerp, pulse } from '../../engine/motion.js';
import { INK } from '../../engine/color.js';
import * as F from '../fixtures/quality/sprites.mjs';
import blob from '../fixtures/styles/blob.js';
import sparkle from '../fixtures/styles/sparkle.js';
import '../fixtures/styles/styles.js';

const show = (r) => `errors:\n  ${r.errors.join('\n  ')}\nwarnings:\n  ${r.warnings.join('\n  ')}`;
const META = { type: 'creature', role: 'characters/enemy', themes: ['neutral'], gameTypes: ['platformer'], view: 'side', words: ['blob', 'slime', 'goo', 'monster', 'enemy', 'bounce'], license: 'draft' };

// a small creature with one colour control; `more(g, ctx)` adds to the drawing
const creature = (over = {}, more = null) => defineSprite({
  id: 'style-q', name: 'Style quality test', kind: 'Creature', meta: { ...META },
  size: [32, 32], pivot: [16, 28],
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    horns: choice('Horns', 'short', ['none', 'short', 'tall']),
    tail: toggle('Tail', true),
    body: color('Colour', '#5fc46b', ['#5fc46b', '#9a62d6', '#e89a35']),
    bounce: range('Bounce', 0.5, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),
  },
  clips: { idle: { frames: 4, fps: 6 }, hop: { frames: 4, fps: 9 } },
  render(g, ctx) {
    const { clip, t, p } = ctx;
    const r = lerp(7, 10, p.size), ry = Math.round(r * 0.8);
    const lift = Math.round(lerp(1, 3, p.bounce) * (clip === 'idle' ? pulse(t) : 2 * Math.sin(Math.PI * t)));
    const cy = 28.5 - ry - lift, top = Math.round(cy - ry);
    if (p.tail) g.capsule(16 - r + 1, cy + 2, 16 - r - 4, cy - 3, 2, 1, p.body);
    g.ellipse(16, cy, r, ry, p.body);
    if (p.horns !== 'none') for (const s of [-1, 1]) g.poly([[16 + s * 5 - 2, top + 2], [16 + s * 5 + 2, top + 2], [16 + s * 5, top - (p.horns === 'tall' ? 6 : 2)]], p.body);
    g.rect(13, Math.round(cy - 2), 2, 2, INK); g.rect(18, Math.round(cy - 2), 2, 2, INK);
    if (more) more(g, ctx);
  },
  ...over,
});

test('a sprite with pixel alone is checked once, as before: no style in its messages or its metrics', () => {
  const r = checkSprite(F.good(), { soundIndex: F.SOUND_INDEX });
  assert.deepEqual(r.errors, [], show(r));
  assert.ok(![...r.errors, ...r.warnings].some((m) => /style "/.test(m)), show(r));
  assert.ok(!('styles' in r.metrics));
  assert.ok(r.metrics.renders > 0 && r.metrics.looks > 0);
  // a broken pixel-only sprite still says what it said
  const bad = checkSprite(F.deadSlider(), { soundIndex: F.SOUND_INDEX });
  assert.ok(bad.errors.length > 0);
  assert.ok(!bad.errors.some((m) => /style "/.test(m)), show(bad));
});

test('the fixture that lists three styles passes the bar in all three, and each was checked', () => {
  const r = checkSprite(blob, { validateMeta });
  assert.deepEqual(r.errors, [], show(r));
  assert.deepEqual(Object.keys(r.metrics.styles), ['pixel', 'silhouette', 'outline-svg']);
  for (const id of ['pixel', 'silhouette', 'outline-svg']) {
    assert.ok(r.metrics.styles[id].renders > 100, `${id} was drawn (${r.metrics.styles[id].renders} renders)`);
    assert.ok(r.metrics.styles[id].ms >= 0);
  }
  assert.equal(r.metrics.renders, r.metrics.styles.pixel.renders, 'the top-level numbers are the first style\'s');
  assert.ok(r.metrics.ms >= r.metrics.styles.pixel.ms + r.metrics.styles.silhouette.ms, 'the time is the whole check');
  assert.ok(r.metrics.metaChecked);
});

test('the single-pixel fixture passes in the two styles it lists', () => {
  const r = checkSprite(sparkle, { validateMeta });
  assert.deepEqual(r.errors, [], show(r));
  assert.deepEqual(Object.keys(r.metrics.styles), ['pixel', 'silhouette']);
});

test('a fault in one style is reported for that style by name; a fault of the sprite itself is reported once', () => {
  // a colour control changes nothing in a silhouette, so listing that style fails the bar there, and only there
  const r = checkSprite(creature({ styles: ['pixel', 'silhouette'] }), { validateMeta });
  const dead = r.errors.filter((m) => /"body" never changes the picture/.test(m));
  assert.equal(dead.length, 1, show(r));
  assert.match(dead[0], /^style "silhouette": /);
  assert.ok(!r.errors.some((m) => /^style "pixel": /.test(m)), show(r));
  // the same sprite with pixel alone is clean
  assert.deepEqual(checkSprite(creature(), { validateMeta }).errors, []);
  // a fault that is not about any one style (the metadata) comes once, with no style named
  const noMeta = checkSprite(creature({ styles: ['pixel', 'silhouette'], meta: undefined }), { validateMeta });
  const meta = noMeta.errors.filter((m) => /no meta/.test(m));
  assert.equal(meta.length, 1, show(noMeta));
  assert.ok(!/style "/.test(meta[0]));
});

test('a fault every style shares is reported for each, by name', () => {
  // the drawing touches the frame edge whatever the style
  const r = checkSprite(creature({ styles: ['pixel', 'silhouette'] }, (g) => g.rect(0, 10, 2, 2, INK)), { validateMeta });
  assert.ok(r.errors.some((m) => /^style "pixel": .*touches the frame edge/.test(m)), show(r));
  assert.ok(r.errors.some((m) => /^style "silhouette": .*touches the frame edge/.test(m)), show(r));
});

test('a style that is not registered is an error, not a crash', () => {
  const def = creature();
  def.styles = ['pixel', 'crayon'];
  const r = checkSprite(def, { validateMeta });
  assert.ok(r.errors.some((m) => /"crayon" is not a style/.test(m)), show(r));
});
