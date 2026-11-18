// Playground (architecture.md, Contract 9): what each thing in the bag does in the scene.
// It is decided by the asset's metadata (kind, type, role, view) and never by its id.
//
// THE METADATA THE PLAYGROUND UNDERSTANDS (first match wins)
//   kind music, or type music                              -> music: plays, with its main sliders
//   kind sound                                             -> a button on the sound board, unless a sprite in the bag plays it
//   role characters/player                                 -> the player (one is picked; the others walk around)
//   type tileset, or role world/tile                       -> the ground: every tileset made for the scene's view is used,
//                                                             together (view side in a side-view scene, top-down in a
//                                                             top-down one, any other view in both; see level.js)
//   type background, or a role under environment/          -> layers behind the scene (far, mid, near)
//   type ui or icon, a role under interface/, items/icon   -> the on-screen display (never the player, whatever it shows)
//   role characters/enemy, boss or animal, or type creature -> moves by itself; the action hurts it. An animal never
//                                                             attacks; a boss takes eight hits, the others three
//   any other character (characters/npc)                   -> walks around; talks when the player is next to it
//   type pickup, or a role under items/                    -> collected by walking into it
//   type projectile, or role effects/projectile            -> fired by the player's action
//   type effect, or a role under effects/                  -> plays in the scene; its burst plays where a hit lands
//   everything else (world/prop, world/door, ...)          -> a prop: the action next to it steps it through its clips
//   view top-down on the player                            -> a top-down scene; any other view: side view
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

/**
 * Sort a bag into a scene.
 * entries: [{ key, row, soundIds }] in bag order; soundIds = the sounds that sprite plays on its clips.
 * picks: { player, background } keys the visitor chose (each falls back to the first of its kind).
 * Returns {
 *   mode: 'side' | 'top',            // from the player's view; with no player, from the other sprites
 *   player, players,                  // the key in use and every playable character
 *   tilesets, otherTiles,             // the tilesets made for this scene's view (used together); those made for the other view
 *   background, backgrounds,
 *   scene,                            // keys of the things that stand or move in the scene, in bag order
 *   projectile,                       // the key the player's action fires, or null
 *   display, music,                   // on-screen display pieces; music tracks
 *   board, attached,                  // sounds with a button of their own; sounds a sprite in the bag already plays
 *   roles: { key: role },             // a playable character that was not picked is an 'npc'
 *   empty, soundsOnly,
 * }
 */
export function planScene(entries, picks = {}) {
  const roles = {};
  const by = (role) => entries.filter((e) => roles[e.key] === role).map((e) => e.key);
  for (const e of entries) roles[e.key] = roleOf(e.row);
  const players = by('player'), backgrounds = by('background');
  const player = pick(players, picks.player);
  for (const k of players) if (k !== player) roles[k] = 'npc';

  const viewOf = (key) => entries.find((e) => e.key === key)?.row.view;
  let mode = 'side';
  if (player) mode = viewOf(player) === 'top-down' ? 'top' : 'side';
  else {
    const views = entries.filter((e) => SCENE_ROLES.includes(roles[e.key]) || roles[e.key] === 'tiles').map((e) => e.row.view);
    if (views.includes('top-down') && !views.includes('side')) mode = 'top';
  }
  // a tileset drawn for the other view would lay the wrong ground: side-view grass is not a top-down floor
  const wrong = mode === 'top' ? 'side' : 'top-down';
  const fits = (key) => viewOf(key) !== wrong;

  const used = new Set(entries.filter((e) => e.row.kind === 'sprite').flatMap((e) => e.soundIds ?? []));
  const sounds = entries.filter((e) => roles[e.key] === 'sound');
  const sprites = entries.filter((e) => e.row.kind === 'sprite');
  return {
    mode, player, players,
    tilesets: by('tiles').filter(fits), otherTiles: by('tiles').filter((k) => !fits(k)),
    background: pick(backgrounds, picks.background), backgrounds,
    scene: entries.filter((e) => SCENE_ROLES.includes(roles[e.key])).map((e) => e.key),
    projectile: by('projectile')[0] ?? null,
    display: by('display'),
    music: by('music'),
    board: sounds.filter((e) => !used.has(e.row.id)).map((e) => e.key),
    attached: sounds.filter((e) => used.has(e.row.id)).map((e) => e.key),
    roles,
    empty: entries.length === 0,
    soundsOnly: entries.length > 0 && sprites.length === 0,
  };
}
