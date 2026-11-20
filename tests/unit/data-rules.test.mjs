// engine/data-rules.js (studio item F1; docs/architecture.md Contract 14 rule 2, docs/studio.md 2.3): the fixed registry
// of framework functions a studio definition may NAME (never contain). Each colour rule is exactly the framework function
// it names; a paint expression is a colour, a colour slot's key, or { rule, ...arguments }; nothing in it ever runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { COLOUR_RULES, FIGURE_BLOCKS, paintColour, paintFigure, whenMatches } from '../../engine/data-rules.js';
import { tone, ramp, mix, pick } from '../../engine/color.js';
import { apart } from '../../rigs/humanoid-figure.js';
import { bandTone } from '../../engine/tones.js';

const V = { skin: '#f6d3b0', outfit: '#2f8f9d', trim: '#5a5f7a', weapon: 'daggers', headgear: 'wide hat', size: 1.2 };

test('data-rules: the registry is frozen, names exactly the documented rules, and says what each takes', () => {
  assert.ok(Object.isFrozen(COLOUR_RULES));
  assert.deepEqual(Object.keys(COLOUR_RULES).sort(), ['apart', 'bandTone', 'choose', 'mix', 'ramp', 'standOut', 'textureLight', 'textureTone', 'tone']);   // texture*: build item B15b (tests/unit/texture-rules.test.mjs)
  for (const [name, r] of Object.entries(COLOUR_RULES)) {
    assert.ok(Object.isFrozen(r) && Object.isFrozen(r.args), name);
    assert.equal(typeof r.about, 'string', name);
    assert.ok(r.about.length > 10, name);
    for (const [arg, spec] of Object.entries(r.args)) assert.ok(['colour', 'colours', 'number', 'word', 'when'].includes(spec.kind), `${name}.${arg}`);
    assert.equal('fn' in r, false, `${name}: the registry is data; the functions stay in the module`);
  }
});

test('data-rules: a colour, a key, and each rule equal the framework function it names', () => {
  assert.equal(paintColour('#AABBCC', V), '#aabbcc');
  assert.equal(paintColour('outfit', V), V.outfit);
  assert.equal(paintColour({ rule: 'tone', of: 'outfit', by: -0.6 }, V), tone(V.outfit, -0.6));
  assert.equal(paintColour({ rule: 'apart', of: 'trim', from: ['outfit'], least: 0.05 }, V), apart(V.trim, V.outfit, 0.05));
  assert.equal(paintColour({ rule: 'apart', of: 'trim', from: [['outfit', 0.3], ['skin', 0.19]] }, V), apart(V.trim, [[V.outfit, 0.3], [V.skin, 0.19]]));
  assert.equal(paintColour({ rule: 'apart', of: '#9a6a3e', from: [['#8e3a4a', 0.3]] }, V), apart('#9a6a3e', [['#8e3a4a', 0.3]]));
  assert.equal(paintColour({ rule: 'bandTone', of: 'trim', under: ['outfit'] }, V), bandTone(V.trim, [V.outfit]));
  assert.equal(paintColour({ rule: 'bandTone', of: 'trim', under: ['outfit'], least: 0.3 }, V), bandTone(V.trim, [V.outfit], 0.3));
  assert.equal(paintColour({ rule: 'tone', of: 'outfit', by: -2.3 }, V), tone(V.outfit, -2.3));
  assert.equal(paintColour({ rule: 'mix', of: 'outfit', with: '#ffffff', amount: 0.45 }, V), mix(V.outfit, '#ffffff', 0.45));
  assert.equal(paintColour({ rule: 'standOut', against: 'skin', from: ['#4a609c', '#f0ead8'] }, V), pick(V.skin, '#4a609c', '#f0ead8'));
  assert.equal(paintColour({ rule: 'standOut', against: '#1a1a1a', from: ['#4a609c', '#f0ead8'] }, V), '#f0ead8');
  for (const t of ['light', 'base', 'dark', 'deep']) assert.equal(paintColour({ rule: 'ramp', of: 'skin', tone: t }, V), ramp(V.skin)[t], t);
  // nested: a tone of a colour kept apart
  assert.equal(paintColour({ rule: 'tone', of: { rule: 'apart', of: 'trim', from: ['outfit'], least: 0.05 }, by: 0.85 }, V), tone(apart(V.trim, V.outfit, 0.05), 0.85));
});

test('data-rules: choose picks by the settings, as a control\'s `when` reads them (one value, a list, alternatives)', () => {
  const hat = { rule: 'choose', when: { headgear: ['wide hat'] }, then: 'trim', else: 'outfit' };
  assert.equal(paintColour(hat, V), V.trim);
  assert.equal(paintColour(hat, { ...V, headgear: 'hood' }), V.outfit);
  const any = { rule: 'choose', when: [{ headgear: ['hood'] }, { weapon: ['daggers', 'claws'] }], then: '#000000', else: '#ffffff' };
  assert.equal(paintColour(any, V), '#000000');
  assert.equal(paintColour(any, { ...V, weapon: 'none' }), '#ffffff');
  // colours are compared without regard to case, as cleanParams lowers them
  const path = { rule: 'choose', when: { trim: ['#C9A06A'] }, then: { rule: 'tone', of: 'trim', by: -0.85 }, else: 'trim' };
  assert.equal(paintColour(path, { ...V, trim: '#c9a06a' }), tone('#c9a06a', -0.85));
  assert.equal(paintColour(path, V), V.trim);
  assert.equal(whenMatches({ size: [1.2] }, V), true);
  assert.equal(whenMatches({ size: [1] }, V), false);
  assert.equal(whenMatches(undefined, V), true);
});

test('data-rules: never throws; anything it cannot read paints the fallback colour', () => {
  for (const bad of [null, 3, {}, { rule: 'eval' }, { rule: 'tone' }, { rule: 'apart', of: 'trim', from: 'x' }, 'nokey', { rule: 'choose', when: 5, then: 'trim' }]) {
    assert.match(paintColour(bad, V), /^#[0-9a-f]{6}$/, JSON.stringify(bad));
  }
  // a loop of objects cannot hang it
  const loop = { rule: 'tone', by: 0.2 }; loop.of = loop;
  assert.match(paintColour(loop, V), /^#[0-9a-f]{6}$/);
});

test('data-rules: paintFigure paints the named fields of parts the figure has, and leaves the figure given unchanged', () => {
  const fig = { look: { skin: '#000000', top: '#000000' }, held: { kind: 'daggers', metal: '#111111' } };
  const out = paintFigure(fig, { 'look.skin': 'skin', 'look.top': { rule: 'tone', of: 'outfit', by: -0.6 }, 'held.metal': '#c2c9d6', 'mask.colour': 'trim' }, V);
  assert.deepEqual(out, { look: { skin: V.skin, top: tone(V.outfit, -0.6) }, held: { kind: 'daggers', metal: '#c2c9d6' } });
  assert.equal(out.mask, undefined, 'a part the figure does not have is not made by painting it');
  assert.equal(fig.look.skin, '#000000');
});

test('data-rules (review F1, issue 3): a frozen paint is worked out once per settings; each call gets its own figure, other settings their own colours', () => {
  const deepFreeze = (o) => { for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v); return Object.freeze(o); };
  const paint = deepFreeze({ 'look.top': { rule: 'tone', of: 'outfit', by: -0.6 }, 'held.metal': 'trim' });
  const fig = { look: { top: '#000000' }, held: { kind: 'daggers', metal: '#111111' } };
  const a = paintFigure(fig, paint, V), b = paintFigure(fig, paint, V);
  assert.deepEqual(a, b);
  assert.notEqual(a.look, b.look, 'no figure is shared between calls');
  a.look.top = '#ffffff';
  assert.equal(paintFigure(fig, paint, V).look.top, tone(V.outfit, -0.6));
  assert.equal(paintFigure(fig, paint, { ...V, outfit: '#c9423a' }).look.top, tone('#c9423a', -0.6));
  assert.equal(paintFigure(fig, paint, { ...V, trim: '#123456' }).held.metal, '#123456');
  // a paint that can still change is worked out every time
  const open = { 'look.top': 'outfit' };
  assert.equal(paintFigure(fig, open, V).look.top, V.outfit);
  open['look.top'] = 'trim';
  assert.equal(paintFigure(fig, open, V).look.top, V.trim);
});

test('data-rules: FIGURE_BLOCKS lists the figure blocks read with defaults when absent', () => {
  assert.ok(Object.isFrozen(FIGURE_BLOCKS));
  assert.deepEqual([...FIGURE_BLOCKS], ['body', 'motion', 'look', 'hair']);
});
