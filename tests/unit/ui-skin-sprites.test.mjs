// The skin-family interface sprites of migration batch M8 as the game gets them: ui-bars-*, ui-buttons-* and
// ui-panel-* drawn as data on the panel body (engine/gen/ui-skin.js, pieces/skin-*.v*.json). The review of M8 round 1
// found an export that threw and fills that missed their housing, which nothing ran over every redraw; this file does.
//   - every redraw exports a sheet (renderSheet) at the defaults and in every look, every clip with its frames
//   - every bar set: the frame clip exports the opening its housing really has, every fill strip fills exactly that
//     opening, and the housing and the fills share one border; the knob exports its rect and no border (as the code did)
//   - a titled panel says where its title goes as well as its body (Contract 8: two text areas, the body first)
//   - the exported borders at the defaults, clip by clip: the code's where it still fits the drawing (each change is
//     named, with its reason, in the M8 report and in BORDERS below); that the corner ornaments lie inside the border
//     is held at the generator, in tests/unit/gen-ui-skin.test.mjs
// Node only (it loads the library files).
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSheet, renderFrame, defaultParams, cleanParams } from '../../engine/sprite.js';
import { librarySprite } from '../helpers/library.mjs';

const FAMILIES = ['candy', 'crystal', 'flat', 'gilded', 'grove', 'neon', 'paper'];
const BARS = [...FAMILIES, 'rpg', 'tech'].map((f) => `ui-bars-${f}`);
const BUTTONS = [...FAMILIES, 'wood'].map((f) => `ui-buttons-${f}`);
const PANELS = [...FAMILIES, 'wood'].map((f) => `ui-panel-${f}`);
const IDS = [...BARS, ...BUTTONS, ...PANELS];
const sprites = Object.fromEntries(await Promise.all(IDS.map(async (id) => [id, await librarySprite(id)])));

const params = (s, over = {}) => cleanParams(s, { ...defaultParams(s), ...over });
/** The defaults, then every option of every choice, every toggle flipped and every slider at both ends, one at a time. */
function looks(s) {
  const out = [{}];
  for (const [k, d] of Object.entries(s.params)) {
    if (d.kind === 'choice') for (const o of d.options) out.push({ [k]: o.value ?? o });
    if (d.kind === 'toggle') out.push({ [k]: !d.def });
    if (d.kind === 'range') out.push({ [k]: d.min }, { [k]: d.max });
  }
  return out;
}
const boundsOf = (g) => { const b = g.bounds(); return b ? { x: b.x0, y: b.y0, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1 } : null; };

test('every M8 redraw is a data file and exports a sheet in every look, every clip with its frames', () => {
  for (const id of IDS) {
    const s = sprites[id];
    for (const look of looks(s)) {
      let meta;
      assert.doesNotThrow(() => { meta = renderSheet(s, params(s, look), { scale: 1 }).meta; }, `${id} ${JSON.stringify(look)}`);
      for (const c of Object.keys(s.clips)) assert.ok(meta.animations[c], `${id} ${c}`);
      assert.equal(meta.frames.length, Object.values(s.clips).reduce((n, c) => n + c.frames, 0), `${id}: every frame`);
    }
  }
});

test('every bar set: the fills fill exactly the opening the housing exports, and share its border', () => {
  for (const id of BARS) {
    const s = sprites[id];
    for (const look of looks(s)) {
      const p = params(s, look), { meta } = renderSheet(s, p, { scale: 1 });
      const frame = meta.animations.frame, o = frame.opening;
      assert.ok(o && o.w > 0 && o.h > 0, `${id}: the frame exports an opening ${JSON.stringify(look)}`);
      // the housing really has that opening: ringed in ink and not of the frame's colours inside
      const g = renderFrame(s, 'frame', 0, p);
      for (let x = o.x; x < o.x + o.w; x++) assert.ok(g.get(x, o.y - 1) >>> 24 && g.get(x, o.y + o.h) >>> 24, `${id}: the opening is edged at x=${x}`);
      for (const c of ['fill', 'fill-b', 'fill-c', 'flash']) {
        const a = meta.animations[c];
        assert.deepEqual(a.opening, o, `${id} ${c}: the housing's opening ${JSON.stringify(look)}`);
        assert.deepEqual(a.border, frame.border, `${id} ${c}: the housing's border ${JSON.stringify(look)}`);
        assert.deepEqual(a.tile, frame.tile, `${id} ${c}: the housing's tile`);
        assert.deepEqual(boundsOf(renderFrame(s, c, 0, p)), o, `${id} ${c}: its pixels are the opening ${JSON.stringify(look)}`);
      }
      // the knob is a small piece: its rect and no border (it cannot stretch), as the code exported it
      if (meta.animations.knob) {
        const k = meta.animations.knob;
        assert.ok(k.rect, `${id} knob rect`);
        assert.equal(k.border, undefined, `${id}: the knob has no border`);
      }
    }
  }
});

test('a titled panel says where its title goes as well as its body: two text areas, the body first and the heading above it', () => {
  for (const id of PANELS) {
    const s = sprites[id];
    for (const look of looks(s)) {
      const p = params(s, look);
      const ta = s.textArea('panel-title', p);
      assert.ok(Array.isArray(ta) && ta.length === 2, `${id} ${JSON.stringify(look)}: ${JSON.stringify(ta)}`);
      const [body, head] = ta;
      assert.ok(head.y + head.h <= body.y, `${id}: the heading is above the body`);
      assert.ok(head.h >= 7 && head.w >= 60, `${id}: the heading takes a line of text (${head.w} x ${head.h})`);
      const top = s.slice('panel-title', p).top;
      assert.ok(top >= head.y + head.h, `${id}: the heading lies in the top border (${top}), so it keeps its height when stretched`);
    }
  }
});

// The borders exported at the defaults (left, top, right, bottom per clip): the code's, except where the redraw's drawing
// differs, each named with its reason in the M8 report (round 2):
//   - buttons and panels keep corners and band inside the style guide's 8 px (the code's crystal 10, grove 19 to 23 and
//     neon 6 followed the code's own ornaments); a corner ornament past that widens the border to hold it (the candy
//     tab's highlight bubble: top 9; the grove tab's leaves: bottom 4; the gilded bar's gems: top and bottom 5)
//   - a titled panel's top border holds the heading band, its rule and one row (the band sits a row higher than the
//     code's in candy, crystal and flat: 17 and 16 for the code's 18 and 17)
//   - a tooltip's bottom holds its 4-row tail (11; the code's 7 stretched the flat, gilded and paper tails)
const B = (left, top, right, bottom) => ({ left, top, right, bottom });
const PANEL8 = { panel: B(8, 8, 8, 8), inset: B(8, 8, 8, 8), tooltip: B(7, 7, 7, 11) };
const BORDERS = {
  'ui-bars-rpg': { frame: B(16, 8, 16, 8), fill: B(16, 8, 16, 8) },
  'ui-bars-tech': { frame: B(16, 8, 16, 8), flash: B(16, 8, 16, 8) },
  'ui-bars-candy': { frame: B(8, 4, 8, 4), slider: B(8, 8, 8, 8) },
  'ui-bars-flat': { frame: B(8, 4, 8, 4), slider: B(8, 8, 8, 8) },
  'ui-bars-gilded': { frame: B(9, 5, 9, 5), slider: B(8, 8, 8, 8) },
  'ui-buttons-candy': { normal: B(8, 8, 8, 8), pressed: B(8, 9, 8, 5), tab: B(8, 9, 8, 2), 'tab-active': B(8, 8, 8, 1) },
  'ui-buttons-flat': { normal: B(8, 8, 8, 8), pressed: B(8, 9, 8, 5), tab: B(8, 8, 8, 2), 'tab-active': B(8, 8, 8, 1) },
  'ui-buttons-grove': { normal: B(8, 8, 8, 8), pressed: B(8, 9, 8, 5), tab: B(8, 8, 8, 4), 'tab-active': B(8, 8, 8, 1) },
  'ui-buttons-crystal': { normal: B(8, 8, 8, 9), 'tab-active': B(8, 8, 8, 1) },
  'ui-panel-candy': { ...PANEL8, 'panel-title': B(8, 17, 8, 8) },
  'ui-panel-crystal': { ...PANEL8, 'panel-title': B(8, 17, 8, 8) },
  'ui-panel-flat': { ...PANEL8, 'panel-title': B(8, 16, 8, 8) },
  'ui-panel-grove': { ...PANEL8, 'panel-title': B(8, 17, 8, 8) },
  'ui-panel-neon': { ...PANEL8, 'panel-title': B(8, 17, 8, 8) },
  'ui-panel-wood': { panel: B(8, 8, 8, 8), 'panel-title': B(8, 17, 8, 8), 'panel-scroll': B(8, 8, 8, 8) },
};

test('the exported borders at the defaults: the code\'s, or the changes named in the M8 report', () => {
  for (const [id, clips] of Object.entries(BORDERS)) {
    const s = sprites[id], { meta } = renderSheet(s, defaultParams(s), { scale: 1 });
    for (const [c, b] of Object.entries(clips)) assert.deepEqual(meta.animations[c].border, b, `${id} ${c}`);
  }
});
