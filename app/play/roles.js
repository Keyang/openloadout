// Playground (architecture.md, Contract 9): what each thing in the bag does in the scene.
// It is decided by the asset's metadata (kind, type, role, view) and never by its id.
//
// THE METADATA THE PLAYGROUND UNDERSTANDS (first match wins)
//   kind music, or type music                              -> music: plays, with its main sliders
//   kind sound                                             -> a button on the sound board, unless a sprite in the bag plays it
//   role characters/player                                 -> the player (one is picked; the others walk around)
//   type tileset, or role world/tile                       -> the ground: every tileset that fits the scene's view is used,
//                                                             together (see level.js)
//   type background, or a role under environment/          -> layers behind the scene (far, mid, near)
//   type ui or icon, a role under interface/, items/icon   -> the on-screen display (never the player, whatever it shows)
//   role characters/enemy, boss or animal, or type creature -> moves by itself; the action hurts it. An animal never
//                                                             attacks; a boss takes eight hits, the others three
//   any other character (characters/npc)                   -> walks around; talks when the player is next to it
//   type pickup, or a role under items/                    -> collected by walking into it
//   type projectile, or role effects/projectile            -> fired by the player's action
//   type effect, or a role under effects/                  -> plays in the scene; its burst plays where a hit lands
//   everything else (world/prop, world/door, ...)          -> a prop: the action next to it steps it through its clips
//   view (side, top-down)                                  -> which scene it can be in. The scene opens in the view of the
//                                                             bag's ground tiles, else of most of its things (chooseMode);
//                                                             a thing drawn for the other view is left out and listed, never
//                                                             placed; every other view (front, none) fits both scenes
//   tech.pivot, tech.grounded (catalogue row)              -> where it stands: a grounded sprite on the ground, others hover
//   stripClip (catalogue row)                              -> the clip a thing with no idle rests on
// The clip names are in clips.js, the tile names in level.js.
// Pure JavaScript: no DOM, runs in Node for the unit tests.
import { defaultParams, clipFps } from '../../engine/sprite.js';

/** Everything a bag item can be in the playground. */
export const ROLES = ['player', 'creature', 'npc', 'pickup', 'prop', 'effect', 'projectile', 'tiles', 'background', 'display', 'sound', 'music'];
/** Roles that stand or move in the scene as things. */
export const SCENE_ROLES = ['npc', 'creature', 'pickup', 'prop', 'effect'];

const SELF_MOVING = ['characters/enemy', 'characters/boss', 'characters/animal'];

/**
 * The playground role of one catalogue row ({ kind, type, role, view }).
 *   player      role characters/player (whatever its type)
 *   tiles       type tileset, or role world/tile
 *   background  type background, or a role under environment/
 *   display     type ui or icon, a role under interface/, or items/icon
 *   creature    role characters/enemy, boss or animal, or type creature: moves by itself, can be hit
 *   npc         any other character: wanders, cannot be hit
 *   pickup      type pickup, or a role under items/
 *   projectile  type projectile, or role effects/projectile: fired by the player's action
 *   effect      type effect, or a role under effects/
 *   prop        everything else (world/prop, world/door, ...)
 */
export function roleOf(row) {
  if (!row) return 'prop';
  if (row.kind === 'music' || row.type === 'music') return 'music';
  if (row.kind === 'sound') return 'sound';
  const type = row.type ?? '', role = row.role ?? '';
  if (role === 'characters/player') return 'player';
  if (type === 'tileset' || role === 'world/tile') return 'tiles';
  if (type === 'background' || role.startsWith('environment/')) return 'background';
  if (type === 'ui' || type === 'icon' || role.startsWith('interface/') || role === 'items/icon') return 'display';
  if (SELF_MOVING.includes(role) || type === 'creature') return 'creature';
  if (type === 'character' || role.startsWith('characters/')) return 'npc';
  if (type === 'pickup' || role.startsWith('items/')) return 'pickup';
  if (type === 'projectile' || role === 'effects/projectile') return 'projectile';
  if (type === 'effect' || role.startsWith('effects/')) return 'effect';
  return 'prop';
}

/** A catalogue-shaped row made from a sprite itself, for a sprite that is not in the catalogue. */
export function rowFromSprite(def) {
  const m = def.meta ?? {}, p = defaultParams(def);
  return {
    id: def.id, kind: 'sprite', name: def.name, description: def.blurb ?? '',
    type: m.type ?? null, role: m.role ?? null, themes: m.themes ?? [], gameTypes: m.gameTypes ?? [], view: m.view ?? null,
    stripClip: def.preview,
    tech: {
      frame: [...def.size], pivot: [...def.pivot], grounded: def.grounded !== false,
      clips: Object.entries(def.clips).map(([name, c]) => ({ name, label: c.label ?? name, frames: c.frames, loop: c.loop ?? true, fps: clipFps(def, name, p) })),
    },
  };
}

/** The same for a sound or a music track (a patch). */
export function rowFromPatch(patch) {
  const m = patch.meta ?? {};
  const music = patch.category === 'music' || m.type === 'music';
  return {
    id: patch.id, kind: music ? 'music' : 'sound', name: patch.name, description: patch.description ?? '',
    type: m.type ?? (music ? 'music' : 'sfx'), role: m.role ?? null, themes: m.themes ?? [], gameTypes: m.gameTypes ?? [], view: null,
    tech: { loop: !!patch.loop },
  };
}

const pick = (list, wanted) => (list.includes(wanted) ? wanted : list[0] ?? null);

/** The two views a scene can have, in the order the page offers them. */
export const MODES = ['side', 'top'];
// the view (meta.view) a scene of each sort is drawn in, and the roles that are never part of the picture of the scene
const DRAWN_FOR = { side: 'side', top: 'top-down' };
const NOT_PLACED = ['display', 'sound', 'music'];

/**
 * True when a thing drawn for `view` (a sprite's meta.view) can be put in a scene of this mode ('side' or 'top').
 * Only the other scene's own view is turned away: a side-view sprite in a top-down scene, a top-down sprite in a
 * side-view scene. Every other view ('front', 'none', none given) fits both: a coin, a burst, a field of stars.
 */
export function fitsMode(view, mode) {
  return view !== DRAWN_FOR[mode === 'top' ? 'side' : 'top'];
}

/**
 * Which view a bag's scene opens in, the way a person looking at the bag would say it.
 * things: [{ view, role }] in bag order, one for each sprite that would be part of the scene (role: its playground role).
 * wanted: the view the visitor switched to ('side', 'top'), if any.
 * Returns { mode, modes, why }.
 *   modes  the views the bag has something drawn for, in MODES order; with nothing drawn for either, side view only
 *   why    'only'    the bag has things for one view, so there is nothing to choose
 *          'chosen'  the visitor switched to it
 *          'tiles'   every ground tileset that says a view says this one
 *          'most'    more of the bag's things were drawn for this view than for the other
 *          'player'  as many of each: the first character to play as was drawn for this view
 *          'even'    as many of each and no such character: side view
 */
export function chooseMode(things, wanted = null) {
  const drawnFor = (mode) => things.filter((t) => t.view === DRAWN_FOR[mode]);
  const modes = MODES.filter((mode) => drawnFor(mode).length);
  if (modes.length < 2) return { mode: modes[0] ?? MODES[0], modes: modes.length ? modes : [MODES[0]], why: 'only' };
  if (modes.includes(wanted)) return { mode: wanted, modes, why: 'chosen' };
  const ground = MODES.filter((mode) => drawnFor(mode).some((t) => t.role === 'tiles'));
  if (ground.length === 1) return { mode: ground[0], modes, why: 'tiles' };
  const [side, top] = MODES.map((mode) => drawnFor(mode).length);
  if (side !== top) return { mode: side > top ? 'side' : 'top', modes, why: 'most' };
  const first = things.find((t) => t.role === 'player' && MODES.some((mode) => t.view === DRAWN_FOR[mode]));
  if (first) return { mode: MODES.find((mode) => first.view === DRAWN_FOR[mode]), modes, why: 'player' };
  return { mode: MODES[0], modes, why: 'even' };
}

/**
 * Sort a bag into a scene.
 * entries: [{ key, row, soundIds }] in bag order; soundIds = the sounds that sprite plays on its clips.
 * picks: what the visitor chose: { mode, side: { player, background, tiles }, top: { player, background, tiles } }. Each view keeps
 * its own picks, so switching the view and back changes nothing else; a pick that is not there (or not in this
 * view) falls back to the first of its kind.
 * Returns {
 *   mode: 'side' | 'top',            // chooseMode: from the bag's ground tiles, else from what most of it was drawn for
 *   modes, why,                       // the views the bag has things for (two: the page offers a switch); why this one
 *   player, players,                  // the key in use and every playable character drawn for this view
 *   tilesets, allTilesets, otherTiles, // the tilesets used for the ground (all of this view's together, or the one picked); every one made
 *                                     // for this view; those made for the other view
 *   background, backgrounds,          // those that fit this view
 *   scene,                            // keys of the things that stand or move in the scene, in bag order
 *   projectile,                       // the key the player's action fires, or null
 *   leftOut,                          // keys of every sprite drawn for the other view, in bag order: none of them is
 *                                     // in player, players, scene, projectile, tilesets or backgrounds
 *   display, music,                   // on-screen display pieces; music tracks
 *   board, attached,                  // sounds with a button of their own; sounds a sprite in the bag already plays
 *   roles: { key: role },             // a playable character that was not picked is an 'npc'
 *   empty, soundsOnly,
 * }
 */
export function planScene(entries, picks = {}) {
  const roles = {};
  for (const e of entries) roles[e.key] = roleOf(e.row);
  const placed = entries.filter((e) => e.row.kind === 'sprite' && !NOT_PLACED.includes(roles[e.key]));
  const { mode, modes, why } = chooseMode(placed.map((e) => ({ view: e.row.view, role: roles[e.key] })), picks.mode ?? null);
  // a thing drawn for the other view would look wrong here: side-view grass is not a top-down floor, and a hero
  // seen from above cannot walk along a side-view ledge
  const out = new Set(placed.filter((e) => !fitsMode(e.row.view, mode)).map((e) => e.key));
  const by = (role) => entries.filter((e) => roles[e.key] === role && !out.has(e.key)).map((e) => e.key);
  const mine = picks[mode] ?? {};
  const players = by('player'), backgrounds = by('background'), allTilesets = by('tiles');
  const player = pick(players, mine.player);
  for (const k of players) if (k !== player) roles[k] = 'npc';

  const used = new Set(entries.filter((e) => e.row.kind === 'sprite').flatMap((e) => e.soundIds ?? []));
  const sounds = entries.filter((e) => roles[e.key] === 'sound');
  const sprites = entries.filter((e) => e.row.kind === 'sprite');
  return {
    mode, modes, why, player, players,
    // the ground: every tileset of the view together, or the one the visitor chose when the bag has several
    tilesets: allTilesets.includes(mine.tiles) ? [mine.tiles] : allTilesets, allTilesets, otherTiles: entries.filter((e) => roles[e.key] === 'tiles' && out.has(e.key)).map((e) => e.key),
    background: pick(backgrounds, mine.background), backgrounds,
    scene: entries.filter((e) => SCENE_ROLES.includes(roles[e.key]) && !out.has(e.key)).map((e) => e.key),
    projectile: by('projectile')[0] ?? null,
    leftOut: entries.filter((e) => out.has(e.key)).map((e) => e.key),
    display: by('display'),
    music: by('music'),
    board: sounds.filter((e) => !used.has(e.row.id)).map((e) => e.key),
    attached: sounds.filter((e) => used.has(e.row.id)).map((e) => e.key),
    roles,
    empty: entries.length === 0,
    soundsOnly: entries.length > 0 && sprites.length === 0,
  };
}
