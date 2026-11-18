// Sprite source text and a sound patch for the window.loadout tests: what an agent would hand to
// loadout.make.sprite(source) and loadout.make.sound(patch). The sprite is written exactly like a file in
// sprites/ (relative imports of the framework), and uses the palettes and the effect helpers.
// tests/unit/api-sources.test.mjs keeps GOOD_SPRITE and GOOD_SOUND passing the quality bar in Node, so the
// browser test (tests/e2e/api.spec.mjs) fails only for reasons of its own.
import fs from 'node:fs';

export const GOOD_ID = 'api-test-gem';

/** A small gem pickup that passes the quality bar. `id`: the sprite's id. */
export const goodSprite = (id = GOOD_ID) => `// A cut gem that floats and glints. Made for the window.loadout tests.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, wave } from '../engine/motion.js';
import { ramp, INK } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { sparkles, steps } from '../engine/fx.js';

const P = PALETTE.thornwood;
const CX = 16, CY = 17;

export default defineSprite({
  id: '${id}',
  name: 'Test gem',
  kind: 'Item',
  blurb: 'A cut gem that floats and glints.',
  meta: { type: 'pickup', role: 'items/pickup', themes: ['fantasy'], gameTypes: ['platformer'], view: 'front', words: ['gem', 'jewel', 'crystal', 'treasure', 'loot', 'collect'], license: 'draft' },
  size: [32, 32],
  pivot: [16, 28],
  grounded: false,
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    cut: choice('Cut', 'diamond', ['diamond', 'square', 'round']),
    colour: color('Colour', swatches('thornwood', 'gem')[0], swatches('thornwood', 'gem')),
    glint: toggle('Glints', true),
    bob: range('Float', 0.5, { lo: 'Still', hi: 'Floaty', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 8, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: true },
  },
  render(g, { t, p }) {
    const r = Math.round(lerp(6, 10, p.size));
    const cy = CY - Math.round(lerp(0, 3, p.bob) * wave(t));
    const m = ramp(p.colour);
    if (p.cut === 'diamond') g.poly([[CX, cy - r], [CX + r, cy], [CX, cy + r], [CX - r, cy]], m, { shade: 2, light: 1 });
    else if (p.cut === 'square') g.rect(CX - r + 1, cy - r + 1, r * 2 - 2, r * 2 - 2, m, { shade: 2, light: 1 });
    else g.ellipse(CX, cy, r, r, m, { shade: 2, light: 1 });
    g.rect(CX - 2, cy - Math.round(r / 2), 3, 2, m.light);
    g.outline(INK);
    if (p.glint) sparkles(g, { t, count: 4, seed: 3, colours: steps(P.gold), area: [CX - r - 3, cy - r - 3, CX + r + 4, cy + r + 4] });
  },
});
`;

export const GOOD_SPRITE = goodSprite();

// each breaks one rule of the quality bar and has an id of its own
/** One frame of the clip is empty. */
export const EMPTY_FRAME = goodSprite('api-test-empty').replace("render(g, { t, p }) {", "render(g, { t, p, frame }) {\n    if (frame === 3) return;");
/** A control that changes nothing. */
export const DEAD_CONTROL = goodSprite('api-test-dead').replace("glint: toggle('Glints', true),", "glint: toggle('Glints', true),\n    weight: range('Weight', 0.5, { lo: 'Light', hi: 'Heavy' }),");
/** No metadata. */
export const NO_META = goodSprite('api-test-nometa').replace(/^  meta: \{.*\},\n/m, '');
/** Not JavaScript. */
export const SYNTAX_ERROR = goodSprite('api-test-syntax').replace('export default defineSprite({', 'export default defineSprite({{');
/** Imports code from another site. */
export const FOREIGN_IMPORT = goodSprite('api-test-foreign').replace("import { lerp, wave } from '../engine/motion.js';", "import { lerp, wave } from 'https://example.com/motion.js';");
/** A plain object, not a sprite. */
export const NOT_A_SPRITE = "export default { id: 'api-test-plain', name: 'Plain' };\n";

for (const [name, text] of Object.entries({ EMPTY_FRAME, DEAD_CONTROL, NO_META, SYNTAX_ERROR, FOREIGN_IMPORT })) {
  if (text === goodSprite(text.match(/id: '([^']+)'/)[1])) throw new Error(`tests/fixtures/api/sources.mjs: ${name} is the same as the good sprite; its replace() found nothing`);
}

/** A short blip that passes the sound quality bar (the quality tests' own fixture, under an id of its own). */
export function goodSound(id = 'api-test-blip') {
  const patch = JSON.parse(fs.readFileSync(new URL('../quality/sounds/good-blip.json', import.meta.url), 'utf8'));
  return { ...patch, id, name: 'Test blip' };
}
export const GOOD_SOUND = goodSound();

// ---- route 2: what an agent writes against the framework during one visit (tests/e2e/route2.spec.mjs) ----------

export const STAR_ID = 'route2-star', CHIME_ID = 'route2-chime';

/**
 * A star pickup with an idle clip and a collect clip, written against the framework (palettes, fx).
 * broken: the first try, with a "Weight" slider that does nothing; cue: the id of the sound its collect clip plays.
 */
export const starSprite = ({ id = STAR_ID, broken = false, cue = null } = {}) => `// A star to collect: it floats, and bursts into sparks when taken.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, wave, clamp, TAU } from '../engine/motion.js';
import { ramp, INK } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { sparkles, particles, steps } from '../engine/fx.js';

const P = PALETTE.thornwood;
const CX = 16, CY = 16;
const star = (cx, cy, r, points, turn) => Array.from({ length: points * 2 }, (_, i) => {
  const a = turn + (i * TAU) / (points * 2), d = i % 2 ? r * 0.48 : r;
  return [cx + Math.sin(a) * d, cy - Math.cos(a) * d];
});

export default defineSprite({
  id: '${id}',
  name: 'Wish star',
  kind: 'Item',
  blurb: 'A star to collect. It floats, and bursts into sparks when it is taken.',
  meta: { type: 'pickup', role: 'items/pickup', themes: ['fantasy'], gameTypes: ['platformer'], view: 'front', words: ['star', 'wish', 'collect', 'pickup', 'bonus', 'treasure', 'sparkle'], license: 'draft' },
  size: [32, 32],
  pivot: [16, 28],
  grounded: false,
  preview: 'idle',${cue ? `\n  sounds: { collect: [{ sound: '${cue}', frame: 0 }] },` : ''}
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    points: choice('Points', 'five', ['four', 'five', 'six']),
    colour: color('Colour', swatches('thornwood', 'gem')[4], swatches('thornwood', 'gem')),
    glint: toggle('Glints', true),${broken ? "\n    weight: range('Weight', 0.5, { lo: 'Light', hi: 'Heavy' })," : ''}
    bob: range('Float', 0.5, { lo: 'Still', hi: 'Floaty', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 8, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: true },
    collect: { frames: 6, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false },
  },
  render(g, { clip, t, p }) {
    const n = { four: 4, five: 5, six: 6 }[p.points];
    const full = lerp(7, 11, p.size);
    const m = ramp(p.colour);
    if (clip === 'idle') {
      const cy = CY - Math.round(lerp(0, 2, p.bob) * wave(t));
      g.poly(star(CX, cy, full, n, 0), m, { shade: 1, light: 1 });
      g.outline(INK);
      if (p.glint) sparkles(g, { t, count: 3, seed: 5, big: false, colours: steps(P.gold), area: [CX - 12, CY - 13, CX + 13, CY + 12] });
      return;
    }
    // collect: the star shrinks away while sparks fly out and settle
    const r = full * (1 - clamp(t * 1.4));
    if (r > 2) { g.poly(star(CX, CY, r, n, t * 2), m, { shade: 1, light: 1 }); g.outline(INK); }
    particles(g, { t, x: CX, y: CY, count: 8, seed: 2, loop: false, arc: TAU, dist: lerp(8, 12, p.size), size: 2, colours: steps(p.colour) });
    if (p.glint && t < 0.5) sparkles(g, { t, count: 2, seed: 9, big: false, colours: steps(P.gold), area: [CX - 8, CY - 8, CX + 9, CY + 9] });
  },
});
`;

/** A two-note chime for the star, as a patch written for the visit. */
export function chimePatch(id = CHIME_ID) {
  const patch = JSON.parse(fs.readFileSync(new URL('../../../sounds/coin-pickup.json', import.meta.url), 'utf8'));
  return { ...patch, id, name: 'Wish chime', description: 'A two-note chime for a collected star.', meta: { ...patch.meta, words: ['star', 'wish', 'chime', 'collect', 'pickup', 'bonus', 'ding'] } };
}
