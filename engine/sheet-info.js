// Sheet facts: what a game needs to know about a sprite sheet beyond where its frames are, worked out from
// the sprite itself and written into the JSON that ships with it (docs/architecture.md, Contracts 2 and 8).
//
// Everything visual is a sprite (Contract 2), so a sheet's rows mean different things: animations of a figure,
// one animation per direction, tiles, layers of a background, states of an interface piece, separate pictures.
// renderSheet() lays them all out the same way; describeSheet() says which it is, so that neither a tool nor a
// person has to guess, and so that nothing in the JSON is false for the asset (a tileset does not "face right").
//
//   import { describeSheet } from '../engine/sheet-info.js';
//   const json = describeSheet(sprite, renderSheet(sprite, p).meta, p);
//
// What it adds (nothing is taken away except a `facing` that would be false):
//   kind       what the sheet is: one of SHEET_KINDS
//   view       how it is seen, from the sprite's metadata: side | top-down | front | none (left out when not given)
//   counting   one sentence: rows and frames are counted from 0
//   grounded   true when the pivot is the point that stands on the ground; false when it is the thing's anchor
//   facing     kept ('right') only where the whole sheet faces one way; removed otherwise (an effect is never
//              said to face a way: a slash shows a direction, a ring of light does not, and nothing records which)
//   animations[name].label       the row's everyday name
//   animations[name].direction   a sheet with one animation per direction: 'down' | 'up' | 'right' | 'any'
//   animations[name].state       an interface piece: true on the rows that are states of ONE piece (a button's
//                                normal / hover / pressed, a cursor's idle / shoot), not pieces of their own
//   animations[name].textArea    an interface piece: where text goes, { x, y, w, h, colour } in sheet pixels
//                                from the frame's top left corner (a list when there are several)
//   tiles      a tileset: tileSize, and the groups of engine/tile-rules.js with, for each, the ordered rules
//              and one complete arrangement of neighbours for each tile (patterns), and what every tile name is
//   layers     a background: [{ name, row, scroll }] from the back to the front; scroll is the share of the
//              camera's movement the layer slides by on screen
//
// Pure: runs in the browser and in Node.

import { tileRules } from './tile-rules.js';
import { SCROLL } from './backdrop.js';

/** The kinds of sheet there are, each with the words for it in a sentence ("a tileset"). No arguments: a frozen object keyed by kind. */
export const SHEET_KINDS = Object.freeze({
  character: 'a character',
  creature: 'a creature',
  object: 'an object',
  pickup: 'a pickup',
  projectile: 'a projectile',
  effect: 'an effect',
  tileset: 'a tileset',
  background: 'a background',
  interface: 'an interface piece',
  pictures: 'a set of pictures',
  animation: 'an animated picture',
});

/** The one way rows and frames are counted, in the JSON and in every text of a download. No arguments: a sentence. */
export const COUNTING = 'Rows and frames are counted from 0: row 0 is the top row of the picture and frame 0 is the leftmost picture in a row.';

const BY_TYPE = { character: 'character', creature: 'creature', prop: 'object', pickup: 'pickup', projectile: 'projectile', effect: 'effect', tileset: 'tileset', background: 'background', ui: 'interface', icon: 'pictures' };

/**
 * What kind of sheet a sprite makes: a key of SHEET_KINDS. Decided by the sprite's metadata (its type first, then its role, as the playground does), and for a sprite with neither by whether anything in it moves.
 * Arguments: meta (the sprite's `meta`: { type, role }; may be missing); clips (its clip table, or a list of { frames }).
 */
export function sheetKind(meta, clips) {
  const type = meta?.type ?? '', role = meta?.role ?? '';
  if (BY_TYPE[type]) return BY_TYPE[type];
  if (role === 'world/tile') return 'tileset';
  if (role.startsWith('environment/')) return 'background';
  if (role.startsWith('interface/')) return 'interface';
  if (role === 'items/icon') return 'pictures';
  if (role.startsWith('characters/')) return 'character';
  if (role === 'effects/projectile') return 'projectile';
  if (role.startsWith('effects/')) return 'effect';
  if (role.startsWith('items/')) return 'pickup';
  if (role.startsWith('world/')) return 'object';
  const list = Array.isArray(clips) ? clips : Object.values(clips ?? {});
  return list.length && list.every((c) => c.frames === 1) ? 'pictures' : 'animation';
}

/**
 * Which way a row of a top-down sheet faces, from its name (docs/style-guide.md, section 5): 'down' (towards the camera), 'up' (away from it), 'right' (a name ending in _side), or null for a name with no direction.
 * Arguments: name (the row's name, such as 'walk_side').
 */
export function clipDirection(name) {
  const m = /_(down|up|side)$/.exec(String(name));
  return m ? (m[1] === 'side' ? 'right' : m[1]) : null;
}

/**
 * How far each layer of a background slides when the camera moves: { name: share }, the layers listed from the back to the front. The three standard names take the backdrop helper's speeds (far, mid, near); other names are spread evenly between the slowest and the fastest of those, the first layer slowest.
 * Arguments: names (the layers' names in sheet order, farthest first).
 */
export function layerScroll(names) {
  const lo = SCROLL.far, hi = SCROLL.near, n = names.length;
  return Object.fromEntries(names.map((name, i) => [name, SCROLL[name] ?? (n <= 1 ? lo : Math.round((lo + ((hi - lo) * i) / (n - 1)) * 100) / 100)]));
}

const STATE_NAMES = ['normal', 'hover', 'pressed', 'disabled'];

/**
 * Which rows of an interface piece are states of one piece, to be swapped for each other as the player acts, and not separate pieces: a list of row names (empty when none are).
 * A button and a cursor are one piece, so all their rows are states (docs/style-guide.md, section 8); on anything else the standard state names are (normal, hover, pressed, disabled), when at least two of them are there.
 * Arguments: meta (the sprite's `meta`: its role decides; may be missing); names (the row names).
 */
export function stateRows(meta, names) {
  if (names.length < 2) return [];
  const role = meta?.role ?? '';
  if (role === 'interface/button' || role === 'interface/cursor') return [...names];
  const standard = names.filter((n) => STATE_NAMES.includes(n));
  return standard.length > 1 ? standard : [];
}

/**
 * Whether a whole sheet faces one way, and which: 'right', or null when it does not (a tileset, an interface piece, a figure with a row per direction, something seen from the front) or when nothing records that it does (an effect: some show a direction, some show none).
 * Arguments: kind (a key of SHEET_KINDS); view (the sprite's view); names (its row names).
 */
export function sheetFacing(kind, view, names) {
  if (names.some((n) => clipDirection(n))) return null;
  if (view === 'side' && ['character', 'creature', 'projectile'].includes(kind)) return 'right';
  if (view === 'top-down' && kind === 'projectile') return 'right';
  return null;
}

/**
 * The sheet JSON with what kind of sheet it is and what that kind needs: see the header of this file for every field. Returns a new object; the sheet passed in is not changed.
 * Arguments: sprite (the sprite definition); sheet (the JSON renderSheet made for it, at any scale); p (the settings it was drawn with: an interface piece's text areas may follow them).
 */
export function describeSheet(sprite, sheet, p) {
  const meta = sprite.meta ?? {};
  const names = Object.keys(sheet.animations ?? {});
  const kind = sheetKind(meta, names.map((n) => sprite.clips[n] ?? sheet.animations[n]));
  const view = typeof meta.view === 'string' ? meta.view : null;
  const scale = sheet.scale ?? 1;
  const facing = sheetFacing(kind, view, names);
  const directional = names.some((n) => clipDirection(n));
  const states = kind === 'interface' ? stateRows(meta, names) : [];

  const out = {};
  for (const [k, v] of Object.entries(sheet)) {
    if (k === 'facing') { if (facing) out.facing = facing; continue; }
    out[k] = v;
    if (k === 'name') {
      out.kind = kind;
      if (view) out.view = view;
      out.counting = COUNTING;
    }
    if (k === 'pivot') out.grounded = sprite.grounded !== false && !['tileset', 'background', 'interface', 'pictures'].includes(kind);
  }

  out.animations = {};
  for (const name of names) {
    const a = { ...sheet.animations[name] };
    const label = sprite.clips[name]?.label;
    if (typeof label === 'string' && label) a.label = label;
    if (directional) a.direction = clipDirection(name) ?? 'any';
    if (states.includes(name)) a.state = true;
    if (kind === 'interface' || kind === 'pictures') {
      const areas = textAreas(sprite, name, p);
      if (areas.length) {
        const scaled = areas.map((t) => ({ x: t.x * scale, y: t.y * scale, w: t.w * scale, h: t.h * scale, colour: t.colour }));
        a.textArea = scaled.length === 1 ? scaled[0] : scaled;
      }
    }
    out.animations[name] = a;
  }

  if (kind === 'tileset') {
    const rules = tileRules(Object.fromEntries(names.map((n) => [n, sprite.clips[n] ?? {}])), { view: view ?? 'side' });
    out.tiles = {
      tileSize: { w: sheet.frameWidth, h: sheet.frameHeight },
      how: 'Each row of the sheet is one tile. For a cell that holds a group, look at the eight cells round it, go down that group\'s "rules" and use the first tile whose "needs" all hold: true means that neighbour holds the same group, false means it does not, and a neighbour that is not listed may be either. "patterns" says the same for a tool that has no ordered rules and matches a tile to its neighbours cell by cell (a terrain in Godot): one complete arrangement for each tile, "around", with all eight cells said, the fullest one the tile is used for; a corner is counted only when the two sides next to it hold the group too. Do not build such a pattern from a rule\'s "needs": a rule leaves out what the rules before it settled. "versions" are other pictures of the group\'s middle tile: use any of them wherever a rule or a pattern gives it. "solid" groups block the way. A group with "oneWay" is a thin platform, drawn in the top part of its tile: it is stood on from above only (something lands on it from above and passes up through it from below), so it is not "solid". "other" tiles are placed by hand.',
      ...rules,
    };
  }
  if (kind === 'background') {
    const scroll = layerScroll(names);
    out.layers = names.map((name) => ({ name, row: sheet.animations[name].row, scroll: scroll[name] }));
    out.layersHow = 'Layers are listed from the back to the front: draw them in this order. Each repeats sideways with no seam. "scroll" is how far the layer slides on screen for every pixel the camera moves.';
  }
  return out;
}

/** Where text goes on one row of an interface piece, in frame pixels: [{ x, y, w, h, colour }] ('light' text unless the sprite says a dark colour). Empty when the sprite declares none, or the row is marked as never carrying text. */
function textAreas(sprite, clip, p) {
  if (typeof sprite.textArea !== 'function' || sprite.clips[clip]?.noText) return [];
  let areas;
  try { areas = sprite.textArea(clip, p); } catch { return []; }
  const ok = (t) => t && [t.x, t.y, t.w, t.h].every((v) => Number.isFinite(v)) && t.w > 0 && t.h > 0;
  return (Array.isArray(areas) ? areas : [areas]).filter(ok).map((t) => ({ x: t.x, y: t.y, w: t.w, h: t.h, colour: typeof t.text === 'string' ? t.text : 'light' }));
}
