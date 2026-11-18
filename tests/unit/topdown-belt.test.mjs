// A belt stands clear of the cloth under it: one rule (engine/tones.js: bandTone) for the belt of the top-down rig
// (rigs/topdown.js) and the belt of the side-view figure (rigs/humanoid-figure.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, ramp, brightness, INK } from '../../engine/color.js';
import { defaultParams, renderFrame } from '../../engine/sprite.js';
import { THEME_PRESETS, applyColour } from '../../engine/theme.js';
import { bandTone } from '../../engine/tones.js';
import * as T from '../../rigs/topdown.js';
import * as H from '../../rigs/humanoid.js';
import * as Fig from '../../rigs/humanoid-figure.js';

const mixed = (a, b) => '#' + [1, 3, 5].map((i) => Math.round((parseInt(a.slice(i, i + 2), 16) + parseInt(b.slice(i, i + 2), 16)) / 2).toString(16).padStart(2, '0')).join('');
const lum = (v) => (0.299 * (v & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * ((v >> 16) & 255)) / 255;
const LOOKS = ['sunset', 'night', 'mono', 'handheld', 'frost'];

test('bandTone: the shadow tone when it is clear of the cloth, else whichever of the three tones is furthest from it', () => {
  const r = ramp('#a8a4a0');
  assert.equal(bandTone('#a8a4a0', '#f0ead8'), r.dark, 'clear: the shadow tone, as belts were always painted');
  // cloth the same value as the shadow tone
  assert.equal(bandTone('#a8a4a0', r.dark), r.light, 'the furthest: the light tone on cloth as dark as the shadow tone');
  assert.equal(bandTone('#a8a4a0', [r.dark, r.base]), r.light, 'the cloth may be a list: furthest from the nearest of them');
  assert.equal(bandTone('#a8a4a0', mixed(r.light, '#ffffff'), 0.5), r.dark, 'on very light cloth the shadow tone is the furthest');
  // nothing is clear: the furthest of the three
  const none = bandTone('#a8a4a0', [r.dark, r.base, r.light]);
  assert.ok([r.dark, r.base, r.light].includes(none));
  for (const cloth of ['#2f8f9d', '#3f6fd1', '#c9423a', '#f0ead8', '#5a5f7a', '#e6c96a']) for (const colour of ['#a8a4a0', '#9a6a3e', '#5a5f7a', '#f2c230', '#c8553a']) {
    const t = bandTone(colour, cloth), c = ramp(colour), tones = [c.dark, c.base, c.light];
    assert.ok(tones.includes(t), 'always one of the colour\'s three tones');
    const best = Math.max(...tones.map((x) => Math.abs(brightness(x) - brightness(cloth))));
    assert.ok(Math.abs(brightness(t) - brightness(cloth)) >= Math.min(0.12, best) - 1e-9, `${colour} on ${cloth}: ${t} is ${Math.abs(brightness(t) - brightness(cloth)).toFixed(2)} from the cloth`);
    if (Math.abs(brightness(c.dark) - brightness(cloth)) >= 0.12) assert.equal(t, c.dark, `${colour} on ${cloth}: the shadow tone was clear and was not kept`);
  }
  // the pixels of a Surface serve as the cloth (what is already drawn under the belt); empty pixels and the outline are not cloth
  assert.equal(bandTone('#a8a4a0', [0, col(r.dark), col(r.dark), col(INK), 0]), r.light);
  assert.equal(bandTone('#a8a4a0', [0, 0]), r.dark, 'nothing under it: the shadow tone');
  assert.equal(bandTone('#a8a4a0', []), r.dark);
  assert.equal(bandTone(r, r.dark), r.light, 'a ramp is taken as it is');
  assert.equal(bandTone('#a8a4a0', r.dark, 0.01), r.light);
  assert.equal(bandTone('#a8a4a0', '#8a8690', 0.3), bandTone('#a8a4a0', '#8a8690', 0.3), 'the same answer every time');
});

test('topdown rig: the belt is in the shadow tone of its colour on cloth that leaves it clear, and in a lighter tone of it where the shadow tone would merge', () => {
  const beltRow = (dir, top, colour) => {
    const g = new Surface(...T.SIZE), d = T.dims({}), P = T.pose('idle', dir, 0, {}, d);
    const J = T.draw(g, dir, P, d, { skin: '#f6d3b0', top, bottom: '#2c4a8a', boots: '#9a6a3e', hair: '#5a3a22', hairStyle: 'short' }, { torso: (gg, JJ, PP, dd) => T.belt(gg, JJ, PP, dd, { colour }) });
    // the belt is on the row three above the hip; from the side the near arm hangs over the middle of it, so look along the row
    const y = Math.round(J.hip[1]) - 3, tones = Object.values(ramp(colour)).filter((c) => typeof c === 'string').map((c) => col(c));
    for (let x = 0; x < g.w; x++) if (tones.includes(g.get(x, y)) && g.get(x, y - 1) === col(top)) return { belt: g.get(x, y), cloth: g.get(x, y - 1) };
    assert.fail(`${dir} on ${top}: no belt on its row`);
  };
  for (const dir of T.DIRECTIONS) {
    const pale = ramp('#a8a4a0');
    const clear = beltRow(dir, '#f0ead8', '#a8a4a0');
    assert.equal(clear.belt, col(pale.dark), `${dir}: on pale cloth the belt keeps its shadow tone`);
    // a tunic of the very value of the belt's shadow tone (the Rogue's cobble trim on its teal tunic is this case)
    for (const top of ['#6d6980', '#2f8f9d', '#5a5f7a']) {      // the first is the value of the belt's own shadow tone
      const { belt, cloth } = beltRow(dir, top, '#a8a4a0');
      assert.ok([pale.dark, pale.base, pale.light].map((c) => col(c)).includes(belt), `${dir} on ${top}: the belt is a tone of its colour`);
      assert.ok(Math.abs(lum(belt) - lum(cloth)) >= 0.12, `${dir} on ${top}: belt ${lum(belt).toFixed(2)} on cloth ${lum(cloth).toFixed(2)}`);
    }
  }
});

test('side-view figure: its belt follows the same rule', () => {
  const beltOn = (top, colour) => {
    const g = new Surface(...H.SIZE), d = H.dims({}), P = H.pose('idle', 0, {}, d);
    let at = null;
    H.draw(g, P, d, { skin: '#f6d3b0', top, bottom: top, boots: '#9a6a3e', hair: '#5a3a22', hairStyle: 'short' }, { torso: (gg, J, PP, dd) => { at = [Math.round(J.hip[0]), Math.round(J.hip[1]) - 2]; Fig.belt(gg, J, PP, dd, { colour }); } });
    // the belt is the row of pixels through the hips: find its colour among the three tones of the belt's colour
    const tones = Object.values(ramp(colour)).filter((c) => typeof c === 'string').map((c) => col(c));
    const seen = new Map();
    for (let y = at[1] - 2; y <= at[1] + 3; y++) for (let x = at[0] - 6; x <= at[0] + 6; x++) { const v = g.get(x, y); if (tones.includes(v)) seen.set(v, (seen.get(v) ?? 0) + 1); }
    assert.ok(seen.size >= 1, `no belt found on ${top}`);
    return [...seen.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };
  const pale = ramp('#a8a4a0');
  assert.equal(beltOn('#f0ead8', '#a8a4a0'), col(pale.dark), 'on pale cloth the belt keeps its shadow tone');
  for (const top of ['#6d6980', '#2f8f9d', '#5a5f7a']) {
    const belt = beltOn(top, '#a8a4a0'), cloth = col(ramp(top).base);
    assert.ok(Math.abs(lum(belt) - lum(cloth)) >= 0.12, `on ${top}: belt ${lum(belt).toFixed(2)} on cloth ${lum(cloth).toFixed(2)}`);
  }
});

test('the Rogue, on the map and in battle: the belt is clear of the tunic at the default look and stays a different colour under every whole-bundle look', async () => {
  const { tone } = await import('../../engine/color.js');
  // the colour each sprite hands to belt(): the map Rogue a paler tone of its trim, the battle Rogue its trim kept apart from the tunic
  const beltColour = { 'rogue-walker': (p) => tone(p.trim, 0.85), 'rogue-battler': (p) => Fig.apart(p.trim, p.outfit, 0.05) };
  for (const [id, clip] of [['rogue-walker', 'idle_down'], ['rogue-walker', 'idle_up'], ['rogue-walker', 'idle_side'], ['rogue-battler', 'idle']]) {
    const s = (await import(`../../sprites/${id}.js`)).default, p = defaultParams(s), g = renderFrame(s, clip, 0, p);
    const cloth = col(p.outfit), found = { belt: col(bandTone(beltColour[id](p), p.outfit)) };
    let n = 0;
    for (const v of g.data) if (v === found.belt) n++;
    assert.ok(n >= 2, `${id} ${clip}: the belt's tone is not in the picture (${n} pixels)`);      // from the side the near arm hangs over most of it
    assert.ok(Math.abs(lum(found.belt) - lum(cloth)) >= 0.12, `${id} ${clip}: belt ${lum(found.belt).toFixed(2)} on tunic ${lum(cloth).toFixed(2)}`);
    for (const look of LOOKS) {
      const preset = THEME_PRESETS.find((t) => t.id === look || t.id.includes(look) || t.name.toLowerCase().includes(look));
      assert.ok(preset, `no look called ${look}`);
      const px = new Uint32Array([found.belt, cloth]);
      applyColour(px, preset.theme.colour);
      assert.notEqual(px[0], px[1], `${id} ${clip} under ${preset.name}: the belt and the tunic become one colour`);
      assert.ok(Math.abs(lum(px[0]) - lum(px[1])) >= 0.06, `${id} ${clip} under ${preset.name}: belt ${lum(px[0]).toFixed(2)} on tunic ${lum(px[1]).toFixed(2)}`);
    }
  }
});
