// dataSprite, part 5: the studio's own definitions meet the quality bar (studio item S4b). The bar is advice in the
// studio (Contract 14 rule 7), but what the studio hands people to start from must pass it, as a library file must
// (route 1): the newt worked example, the beetle, every starting body (rigs/studio-templates.js, S5) and the Hero
// preset (rigs/humanoid-studio.js hero(), S6). Each becomes a sprite through dataSprite and is checked node-side by
// quality/sprite.js checkSprite as tools/check.mjs does: every sound of sounds/ and catalog/schema.js validateMeta.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkSprite } from '../../quality/sprite.js';
import { validateMeta } from '../../catalog/schema.js';
import { dataSprite } from '../../engine/data-sprite.js';
import * as T from '../../rigs/studio-templates.js';
import { hero } from '../../rigs/humanoid-studio.js';

const dir = new URL('../../sounds/', import.meta.url);
const soundIndex = new Map();
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.json') || f === 'index.json' || f.startsWith('_')) continue;
  const p = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));
  soundIndex.set(p.id, p);
}
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));

const DEFS = [
  ['the newt (tests/fixtures/studio/newt.json)', () => read('../fixtures/studio/newt.json')],
  ['the beetle (tests/fixtures/data-sprite/beetle-topdown.json)', () => read('../fixtures/data-sprite/beetle-topdown.json')],
  ...T.STUDIO_TEMPLATE_IDS.map((id) => [`template ${id}`, () => T.studioTemplate(id)]),
  ['the Hero preset (humanoid-studio hero())', () => hero()],
];

for (const [what, make] of DEFS) {
  test(`data-sprite bar: ${what} passes checkSprite with no errors`, () => {
    const r = checkSprite(dataSprite(make()), { soundIndex, validateMeta });
    assert.deepEqual(r.errors, []);
  });
}
