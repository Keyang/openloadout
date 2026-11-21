// Parts (docs/architecture.md, Contract 3): what a sprite holds or wears, one level below the sprite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defineSprite, defaultParams, cleanParams, renderSheet, range, choice, color, toggle, partList, partOf, partRemoved, inEffect, frameSockets, cueInEffect } from '../../engine/sprite.js';

// the keys of the controls in effect at these settings, in the order of sprite.params (what engine/sprite.js activeParams was, built from inEffect, the one rule)
const activeParams = (sprite, p) => Object.keys(sprite.params).filter((k) => inEffect(sprite, k, p));

const base = (over = {}) => ({
  id: 'test-holder', name: 'Test holder', size: [24, 24], pivot: [12, 22],
  params: {
    size: range('Size', 0.5),
    item: choice('Item', 'stick', ['stick', 'ball', 'none']),
    itemLength: range('Length', 6, { min: 3, max: 9, step: 1 }),
    itemAngle: range('Hold angle', 0, { min: -30, max: 30, step: 1 }),
    hat: toggle('Hat', true),
    hatSize: range('Size', 0.5),
    tint: color('Tint', '#ff0000', ['#ff0000', '#00ff00', '#0000ff']),
  },
  parts: {
    item: { label: 'Item', params: ['item', 'itemLength', 'itemAngle'], none: 'none', socket: 'hand' },
    hat: { params: ['hat', 'hatSize'], socket: 'head' },
  },
  clips: { idle: { frames: 4, fps: 6 }, hit: { frames: 3, fps: 10, loop: false } },
  sockets(clip, t, p) {
    return { hand: { x: 15, y: 12 + 2 * t, angle: 2 + p.itemAngle / 100 }, head: { x: 12, y: 6, angle: Math.PI } };
  },
  render(g, { t, p }) {
    g.ellipse(12, 14, 3 + p.size * 3, 6, p.tint);
    if (p.item !== 'none') g.rect(15, 12 + Math.round(2 * t) - p.itemLength, 1, p.itemLength, '#ffffff');
    if (p.hat) g.rect(10, 5 - Math.round(p.hatSize * 2), 5, 2 + Math.round(p.hatSize * 2), '#ffff00');
  },
  ...over,
});
const withParts = (parts) => base({ parts });

test('defineSprite accepts parts whose selector is a choice or an on/off control, and fills in the label', () => {
  const s = defineSprite(base());
  assert.equal(s.parts.item.label, 'Item');
  assert.equal(s.parts.hat.label, 'Hat');           // from the part's name
  assert.equal(s.parts.item.none, 'none');
  assert.equal(s.parts.hat.none, false);            // an on/off part is removed by switching it off
});

test('a sprite with no parts still defines, with an empty parts list', () => {
  const d = base(); delete d.parts; delete d.sockets;
  const s = defineSprite(d);
  assert.deepEqual(s.parts, {});
  assert.deepEqual(partList(s), []);
  assert.equal(partOf(s, 'item'), null);
  assert.equal(inEffect(s, 'itemLength', { item: 'none' }), true);   // no part declared, so nothing switches it off
});

test('defineSprite rejects a part that lists an unknown control', () => {
  assert.throws(() => defineSprite(withParts({ item: { params: ['item', 'itemWeight'] } })), /part "item".*"itemWeight"/);
});

test('defineSprite rejects a part whose selector is not a choice or an on/off control', () => {
  assert.throws(() => defineSprite(withParts({ item: { params: ['itemLength', 'item'] } })), /part "item".*"itemLength".*choice/);
  assert.throws(() => defineSprite(withParts({ paint: { params: ['tint'] } })), /part "paint".*"tint".*choice/);
});

test('defineSprite rejects a none value that the selector cannot take', () => {
  assert.throws(() => defineSprite(withParts({ item: { params: ['item'], none: 'nothing' } })), /part "item".*"nothing"/);
  assert.throws(() => defineSprite(withParts({ hat: { params: ['hat'], none: 'none' } })), /part "hat"/);
});

test('defineSprite rejects a part with no controls, a control in two parts, and a socket the sprite does not provide', () => {
  assert.throws(() => defineSprite(withParts({ item: { label: 'Item' } })), /part "item".*params/);
  assert.throws(() => defineSprite(withParts({ item: { params: [] } })), /part "item".*params/);
  assert.throws(() => defineSprite(withParts({ item: { params: ['item', 'itemLength'] }, other: { params: ['hat', 'itemLength'] } })), /"itemLength".*already/);
  assert.throws(() => defineSprite(withParts({ item: { params: ['item'], socket: 'tail' } })), /part "item".*socket "tail"/);
  assert.throws(() => defineSprite(base({ sockets: 5 })), /sockets/);
});

test('partList and partOf say which part a control belongs to', () => {
  const s = defineSprite(base());
  assert.deepEqual(partList(s), [
    { name: 'item', label: 'Item', selector: 'item', controls: ['itemLength', 'itemAngle'], params: ['item', 'itemLength', 'itemAngle'], none: 'none', socket: 'hand' },
    { name: 'hat', label: 'Hat', selector: 'hat', controls: ['hatSize'], params: ['hat', 'hatSize'], none: false, socket: 'head' },
  ]);
  assert.equal(partOf(s, 'itemAngle').name, 'item');
  assert.equal(partOf(s, 'item').name, 'item');
  assert.equal(partOf(s, 'hatSize').name, 'hat');
  assert.equal(partOf(s, 'size'), null);
  assert.equal(partOf(s, 'nope'), null);
});

test("a part's other controls are not in effect when its selector is at the none value", () => {
  const s = defineSprite(base());
  const p = defaultParams(s);
  assert.equal(partRemoved(s, 'item', p), false);
  assert.equal(inEffect(s, 'itemLength', p), true);
  assert.deepEqual(activeParams(s, p), Object.keys(s.params));

  const bare = { ...p, item: 'none' };
  assert.equal(partRemoved(s, 'item', bare), true);
  assert.equal(inEffect(s, 'itemLength', bare), false);
  assert.equal(inEffect(s, 'itemAngle', bare), false);
  assert.equal(inEffect(s, 'item', bare), true, 'the selector itself stays, so the part can be put back');
  assert.equal(inEffect(s, 'hatSize', bare), true, 'another part is not affected');
  assert.equal(inEffect(s, 'size', bare), true);
  assert.deepEqual(activeParams(s, bare), ['size', 'item', 'hat', 'hatSize', 'tint']);

  const hatless = { ...p, hat: false };
  assert.equal(partRemoved(s, 'hat', hatless), true);
  assert.deepEqual(activeParams(s, hatless), ['size', 'item', 'itemLength', 'itemAngle', 'hat', 'tint']);
});

test('a part without a none value can never be removed', () => {
  const s = defineSprite(withParts({ item: { params: ['item', 'itemLength'] } }));
  assert.equal(partRemoved(s, 'item', { item: 'none' }), false);
  assert.equal(inEffect(s, 'itemLength', { item: 'none' }), true);
});

test('frameSockets gives the attach points of one frame, or null when the sprite has none', () => {
  const s = defineSprite(base());
  const p = defaultParams(s);
  assert.deepEqual(frameSockets(s, 'hit', 2, p).hand, { x: 15, y: 14, angle: 2 });         // one-shot: last frame is t = 1
  assert.deepEqual(frameSockets(s, 'idle', 2, p).hand, { x: 15, y: 13, angle: 2 });        // loop: frame 2 of 4 is t = 0.5
  const d = base(); delete d.sockets; delete d.parts;
  assert.equal(frameSockets(defineSprite(d), 'idle', 0, p), null);
});

test('renderSheet metadata lists the parts and has one socket set per frame', () => {
  const s = defineSprite(base());
  const p = { ...defaultParams(s), item: 'ball', itemAngle: 20, hat: false };
  const m = renderSheet(s, p, { scale: 2 }).meta;
  assert.deepEqual(m.parts, {
    item: { label: 'Item', socket: 'hand', present: true, settings: { item: 'ball', itemLength: 6, itemAngle: 20 } },
    hat: { label: 'Hat', socket: 'head', present: false, settings: { hat: false } },
  });
  assert.equal(m.frames.length, 7);
  for (const f of m.frames) {
    assert.deepEqual(Object.keys(f.sockets), ['hand', 'head'], f.name);
    for (const sk of Object.values(f.sockets)) for (const k of ['x', 'y', 'angle']) assert.equal(typeof sk[k], 'number', `${f.name} ${k}`);
  }
  // positions are in the sheet's pixels (scale 2), measured from the frame's top-left corner like the pivot
  assert.deepEqual(m.frames[0].sockets.hand, { x: 30, y: 24, angle: 2.2 });
  assert.deepEqual(m.frames[6].sockets.hand, { x: 30, y: 28, angle: 2.2 });
  assert.deepEqual(m.frames[0].sockets.head, { x: 24, y: 12, angle: 3.142 });
  assert.match(m.socketAngle, /radians/);
  JSON.stringify(m);
});

test('renderSheet for a sprite with no parts and no sockets keeps frames as they were', () => {
  const d = base(); delete d.sockets; delete d.parts;
  const s = defineSprite(d);
  const m = renderSheet(s, defaultParams(s)).meta;
  assert.deepEqual(m.parts, {});
  assert.deepEqual(m.frames[0], { name: 'idle_0', animation: 'idle', x: 0, y: 0, w: 24, h: 24, duration: 167 });
  assert.equal(m.socketAngle, undefined);
});

// ---- controls that only matter sometimes: `when`, and a list of none values ------------------------

const whenBase = (over = {}) => base({
  params: {
    size: range('Size', 0.5),
    emblem: choice('Emblem', 'plain', ['plain', 'star', 'heart']),
    inlay: color('Emblem colour', '#ff0000', ['#ff0000', '#00ff00', '#0000ff'], { when: { emblem: ['star', 'heart'] } }),
    glow: toggle('Glow', false),
    glowSize: range('Glow size', 0.5, { when: { glow: [true] } }),
    sparkle: toggle('Sparkle', false, { when: { glow: [true], emblem: ['star'] } }),
    item: choice('Item', 'stick', ['stick', 'ball', 'none', 'hidden']),
    itemLength: range('Length', 6, { min: 3, max: 9, step: 1 }),
    itemTip: choice('Tip', 'round', ['round', 'sharp'], { when: { item: ['stick'] } }),
    tint: color('Tint', '#ff0000', ['#ff0000', '#00ff00', '#0000ff']),
  },
  parts: { item: { params: ['item', 'itemLength', 'itemTip'], none: ['none', 'hidden'] } },
  sockets: undefined,
  ...over,
});
const withParam = (key, control) => { const d = whenBase(); d.params[key] = control; return d; };

test('the control builders keep `when`, and leave it out when it is not given', () => {
  assert.deepEqual(range('A', 0.5, { when: { b: ['x'] } }).when, { b: ['x'] });
  assert.deepEqual(choice('A', 'x', ['x', 'y'], { when: { b: [true] } }).when, { b: [true] });
  assert.deepEqual(color('A', '#ff0000', ['#ff0000'], { when: { b: ['x'] } }).when, { b: ['x'] });
  assert.deepEqual(toggle('A', false, { when: { b: ['x'] } }).when, { b: ['x'] });
  for (const c of [range('A', 0.5), choice('A', 'x', ['x', 'y']), color('A', '#ff0000', ['#ff0000']), toggle('A', false)]) assert.equal('when' in c, false);
});

test('defineSprite accepts `when` and turns a single value into a list', () => {
  const s = defineSprite(withParam('extra', range('Extra', 0.5, { when: { emblem: 'star', glow: true } })));
  assert.deepEqual(s.params.extra.when, { emblem: ['star'], glow: [true] });
  assert.deepEqual(s.params.inlay.when, { emblem: ['star', 'heart'] });
});

test('defineSprite rejects a `when` that names an unknown control, itself, or a value that control cannot take', () => {
  assert.throws(() => defineSprite(withParam('extra', range('Extra', 0.5, { when: { emblm: ['star'] } }))), /"extra".*when.*"emblm"/);
  assert.throws(() => defineSprite(withParam('extra', range('Extra', 0.5, { when: { extra: [0.5] } }))), /"extra".*when.*itself/);
  assert.throws(() => defineSprite(withParam('extra', range('Extra', 0.5, { when: { emblem: ['moon'] } }))), /"extra".*when.*"moon".*"emblem"/);
  assert.throws(() => defineSprite(withParam('extra', range('Extra', 0.5, { when: { glow: ['yes'] } }))), /"extra".*when.*"yes".*"glow"/);
  assert.throws(() => defineSprite(withParam('extra', range('Extra', 0.5, { when: { emblem: [] } }))), /"extra".*when.*"emblem".*at least one/);
  assert.throws(() => defineSprite(withParam('extra', range('Extra', 0.5, { when: ['emblem'] }))), /"extra".*when/);
  assert.throws(() => defineSprite(withParam('extra', range('Extra', 0.5, { when: { size: [7] } }))), /"extra".*when.*7.*"size"/);
  assert.throws(() => defineSprite(withParam('extra', range('Extra', 0.5, { when: { tint: ['red'] } }))), /"extra".*when.*"red".*"tint"/);
});

test('inEffect and activeParams follow `when`: every listed control must be at one of its values', () => {
  const s = defineSprite(whenBase());
  const p = defaultParams(s);                                  // emblem plain, glow off, item stick
  assert.equal(inEffect(s, 'inlay', p), false);
  assert.equal(inEffect(s, 'inlay', { ...p, emblem: 'heart' }), true);
  assert.equal(inEffect(s, 'glowSize', p), false);
  assert.equal(inEffect(s, 'glowSize', { ...p, glow: true }), true);
  // two conditions: both must hold
  assert.equal(inEffect(s, 'sparkle', { ...p, glow: true }), false);
  assert.equal(inEffect(s, 'sparkle', { ...p, emblem: 'star' }), false);
  assert.equal(inEffect(s, 'sparkle', { ...p, glow: true, emblem: 'star' }), true);
  assert.equal(inEffect(s, 'emblem', p), true);
  assert.deepEqual(activeParams(s, p), ['size', 'emblem', 'glow', 'item', 'itemLength', 'itemTip', 'tint']);
  assert.deepEqual(activeParams(s, { ...p, glow: true, emblem: 'star' }), Object.keys(s.params));
});

test('`when` and parts work together, and none may be a list of values', () => {
  const s = defineSprite(whenBase());
  const p = defaultParams(s);
  assert.deepEqual(partList(s)[0].none, ['none', 'hidden']);
  for (const off of ['none', 'hidden']) {
    assert.equal(partRemoved(s, 'item', { ...p, item: off }), true, off);
    assert.equal(inEffect(s, 'itemLength', { ...p, item: off }), false, off);
    assert.equal(inEffect(s, 'itemTip', { ...p, item: off }), false, off);
  }
  // present, but the tip only matters on a stick
  assert.equal(partRemoved(s, 'item', { ...p, item: 'ball' }), false);
  assert.equal(inEffect(s, 'itemLength', { ...p, item: 'ball' }), true);
  assert.equal(inEffect(s, 'itemTip', { ...p, item: 'ball' }), false);
  assert.equal(inEffect(s, 'itemTip', p), true);
  // exported metadata: settings are the controls in effect
  assert.deepEqual(renderSheet(s, { ...p, item: 'ball' }).meta.parts.item, { label: 'Item', present: true, settings: { item: 'ball', itemLength: 6 } });
  assert.deepEqual(renderSheet(s, { ...p, item: 'hidden' }).meta.parts.item, { label: 'Item', present: false, settings: { item: 'hidden' } });
  assert.throws(() => defineSprite(whenBase({ parts: { item: { params: ['item'], none: ['none', 'gone'] } } })), /part "item".*"gone"/);
  assert.throws(() => defineSprite(whenBase({ parts: { item: { params: ['item'], none: [] } } })), /part "item".*none/);
});

test('when a part selector is itself not in effect, the whole part is not', () => {
  const d = whenBase();
  d.params.item = choice('Item', 'stick', ['stick', 'ball', 'none', 'hidden'], { when: { glow: [true] } });
  const s = defineSprite(d);
  const p = defaultParams(s);
  assert.equal(inEffect(s, 'item', p), false);
  assert.equal(inEffect(s, 'itemLength', p), false);
  assert.equal(inEffect(s, 'itemLength', { ...p, glow: true }), true);
  assert.equal(renderSheet(s, p).meta.parts.item.present, false);
});

test('an on/off selector removes its part when off, whatever else is declared', () => {
  const s = defineSprite(base());
  assert.equal(partRemoved(s, 'hat', { hat: false }), true);
  assert.equal(partRemoved(s, 'hat', { hat: true }), false);
});

// ---- sounds that only play sometimes ---------------------------------------------------------

test('a sound on an animation may say when it plays; cueInEffect follows it', () => {
  const s = defineSprite(whenBase({ sounds: { hit: [
    { sound: 'clang', frame: 1, when: { item: ['stick', 'ball'] } },
    { sound: 'whoosh', frame: 1, when: { item: 'none', glow: [false] } },
    { sound: 'thud', frame: 2 },
  ] } }));
  const [clang, whoosh, thud] = s.sounds.hit;
  assert.deepEqual(whoosh.when, { item: ['none'], glow: [false] }, 'a single value becomes a list');
  const p = defaultParams(s);
  assert.equal(cueInEffect(s, clang, p), true);
  assert.equal(cueInEffect(s, whoosh, p), false);
  assert.equal(cueInEffect(s, thud, p), true, 'a sound with no `when` always plays');
  const bare = { ...p, item: 'none' };
  assert.equal(cueInEffect(s, clang, bare), false);
  assert.equal(cueInEffect(s, whoosh, bare), true);
  assert.equal(cueInEffect(s, whoosh, { ...bare, glow: true }), false);
  // a copy of a cue made by the site (same fields, other object) works too
  assert.equal(cueInEffect(s, { sound: 'clang', frame: 0, when: { item: ['ball'] } }, p), false);
  assert.equal(cueInEffect(s, { sound: 'clang', frame: 0 }, p), true);
});

test('defineSprite rejects a sound whose `when` names an unknown control or an impossible value', () => {
  assert.throws(() => defineSprite(whenBase({ sounds: { hit: [{ sound: 'clang', frame: 1, when: { weapon: ['sword'] } }] } })), /sound clang on clip hit.*when.*"weapon"/);
  assert.throws(() => defineSprite(whenBase({ sounds: { hit: [{ sound: 'clang', frame: 1, when: { item: ['sword'] } }] } })), /sound clang on clip hit.*when.*"sword".*"item"/);
  assert.throws(() => defineSprite(whenBase({ sounds: { hit: [{ sound: 'clang', frame: 1, when: 'item' }] } })), /sound clang on clip hit.*when/);
});

// ---- review round: chained `when`, any-of lists, loops, old link values, sockets, warnings ---------

const chainBase = (over = {}) => {
  const d = whenBase();
  d.params = {
    size: range('Size', 0.5),
    shape: choice('Shape', 'round', ['round', 'square']),
    glow: toggle('Glow', false, { when: { shape: ['square'] } }),
    glowSize: range('Glow size', 0.5, { when: { glow: [true] } }),
    tint: color('Tint', '#ff0000', ['#ff0000', '#00ff00', '#0000ff']),
    ...over,
  };
  delete d.parts;
  return d;
};

test('a chained `when` is followed: a control is in effect only if every control it depends on is too', () => {
  const s = defineSprite(chainBase());
  // Glow is hidden on a round shape, so Glow size is not in effect even though Glow is still switched on
  const p = { ...defaultParams(s), shape: 'round', glow: true };
  assert.equal(inEffect(s, 'glow', p), false);
  assert.equal(inEffect(s, 'glowSize', p), false);
  assert.deepEqual(activeParams(s, p), ['size', 'shape', 'tint']);
  assert.equal(inEffect(s, 'glowSize', { ...p, shape: 'square' }), true);
  assert.equal(inEffect(s, 'glowSize', { ...p, shape: 'square', glow: false }), false);
  // sounds follow the same rule
  assert.equal(cueInEffect(s, { sound: 'hum', frame: 0, when: { glow: [true] } }, p), false);
  assert.equal(cueInEffect(s, { sound: 'hum', frame: 0, when: { glow: [true] } }, { ...p, shape: 'square' }), true);
});

test('defineSprite rejects loops of `when`', () => {
  assert.throws(() => defineSprite(chainBase({
    a: toggle('A', false, { when: { b: [true] } }),
    b: toggle('B', false, { when: { a: [true] } }),
  })), /when.*loop.*"a".*"b"|when.*loop.*"b".*"a"/);
  assert.throws(() => defineSprite(chainBase({
    a: toggle('A', false, { when: { c: [true] } }),
    b: toggle('B', false, { when: { a: [true] } }),
    c: toggle('C', false, { when: [{ shape: ['round'] }, { b: [true] }] }),
  })), /when.*loop/);
  // a part's selector cannot depend on one of the part's own settings: those need the selector first
  const d = whenBase();
  d.params.item = choice('Item', 'stick', ['stick', 'ball', 'none', 'hidden'], { when: { itemLength: [6] } });
  assert.throws(() => defineSprite(d), /when.*loop.*"item"/);
});

test('`when` may be a list of alternatives: any one of them is enough', () => {
  const d = whenBase();
  d.params.shine = color('Shine', '#ff0000', ['#ff0000', '#00ff00', '#0000ff'], { when: [{ emblem: ['star', 'heart'] }, { glow: true, item: ['ball'] }] });
  const s = defineSprite(d);
  assert.deepEqual(s.params.shine.when, [{ emblem: ['star', 'heart'] }, { glow: [true], item: ['ball'] }]);
  const p = defaultParams(s);                               // emblem plain, glow off, item stick
  assert.equal(inEffect(s, 'shine', p), false);
  assert.equal(inEffect(s, 'shine', { ...p, emblem: 'heart' }), true);
  assert.equal(inEffect(s, 'shine', { ...p, glow: true }), false, 'the second alternative needs both of its keys');
  assert.equal(inEffect(s, 'shine', { ...p, glow: true, item: 'ball' }), true);
  // on a sound
  const cue = { sound: 'ding', frame: 0, when: [{ emblem: ['star'] }, { item: ['none'] }] };
  assert.equal(cueInEffect(s, cue, p), false);
  assert.equal(cueInEffect(s, cue, { ...p, emblem: 'star' }), true);
  assert.equal(cueInEffect(s, cue, { ...p, item: 'none' }), true);
  const t = defineSprite(whenBase({ sounds: { hit: [{ sound: 'ding', frame: 0, when: [{ emblem: 'star' }, { item: ['none'] }] }] } }));
  assert.deepEqual(t.sounds.hit[0].when, [{ emblem: ['star'] }, { item: ['none'] }]);
});

test('a list `when` is validated like a single one', () => {
  assert.throws(() => defineSprite(withParam('extra', range('Extra', 0.5, { when: [] }))), /"extra".*when/);
  assert.throws(() => defineSprite(withParam('extra', range('Extra', 0.5, { when: [{ emblem: ['star'] }, 'glow'] }))), /"extra".*when/);
  assert.throws(() => defineSprite(withParam('extra', range('Extra', 0.5, { when: [{ emblem: ['star'] }, { glow: ['on'] }] }))), /"extra".*when.*"on".*"glow"/);
  assert.throws(() => defineSprite(withParam('extra', range('Extra', 0.5, { when: [{ emblem: ['star'] }, {}] }))), /"extra".*when/);
  assert.throws(() => defineSprite(whenBase({ sounds: { hit: [{ sound: 'ding', frame: 0, when: [{ nope: [1] }] }] } })), /sound ding on clip hit.*when.*"nope"/);
});

test('a choice can say what its options used to be called, and cleanParams maps old values to new ones', () => {
  const d = whenBase();
  d.params.cape = choice('Cape', 'plain', ['plain', 'torn', 'none'], { was: { false: 'none', true: 'plain', ragged: 'torn' } });
  const s = defineSprite(d);
  assert.equal(cleanParams(s, { cape: 'false' }).cape, 'none');
  assert.equal(cleanParams(s, { cape: false }).cape, 'none');
  assert.equal(cleanParams(s, { cape: 'true' }).cape, 'plain');
  assert.equal(cleanParams(s, { cape: 'ragged' }).cape, 'torn');
  assert.equal(cleanParams(s, { cape: 'torn' }).cape, 'torn', 'a current value is never remapped');
  assert.equal(cleanParams(s, { cape: 'velvet' }).cape, 'plain', 'an unknown value still falls back to the usual one');
  const bad = whenBase();
  bad.params.cape = choice('Cape', 'plain', ['plain', 'none'], { was: { false: 'gone' } });
  assert.throws(() => defineSprite(bad), /"cape".*was.*"gone"/);
  assert.equal('was' in choice('A', 'x', ['x', 'y']), false);
});

test('defineSprite rejects a part that names a socket when the sprite has no sockets()', () => {
  const d = base(); delete d.sockets;
  assert.throws(() => defineSprite(d), /part "item".*socket "hand".*sockets/);
  const ok = base(); delete ok.sockets; delete ok.parts.item.socket; delete ok.parts.hat.socket;
  assert.deepEqual(Object.keys(defineSprite(ok).parts), ['item', 'hat']);
});

test('defineSprite warns when a selector has a "none" option the part does not declare', () => {
  const seen = [], real = console.warn;
  console.warn = (...a) => seen.push(a.join(' '));
  try {
    defineSprite(whenBase({ parts: { item: { params: ['item', 'itemLength', 'itemTip'] } } }));
    assert.equal(seen.length, 1);
    assert.match(seen[0], /test-holder.*part "item".*"none"/);
    seen.length = 0;
    defineSprite(whenBase());                                 // none declared: quiet
    defineSprite(base());                                     // on/off selector, and a declared none: quiet
    assert.deepEqual(seen, []);
  } finally { console.warn = real; }
});
