// Playground: everything the scene needs to know about one bag item, worked out once from the
// sprite and the visitor's settings: its clips and their speeds, the sounds on its frames, how
// big its body is, where it stands, where a projectile leaves it. The scene itself (world.js)
// then needs no sprite code.
//
// WHAT BLOCKS THE WAY IN A TOP-DOWN SCENE (footprintOf)
//   A prop blocks when its type is `prop` and its role is `world/prop` (a tree, a rock, a crate, a chest, a sign) or
//   `world/building` (a house, a stall). Platforms, hazards, doors and crops (world/platform, world/hazard,
//   world/door, world/crop), pickups, effects and everything that moves are walked over or through.
//   What blocks is its footprint, the part that stands on the ground, measured from the drawing itself:
//     how wide   the pixels of its resting clip in the six rows above the pivot row: a tree's trunk, a crate's
//                whole width, a house's walls
//     how deep   six pixels up from the pivot row; a building, 40% of its drawn height (12 to 48 px), so nobody
//                walks into a house from behind
//   Everything above the footprint is only a picture: whoever stands north of the pivot row is drawn behind it
//   (things are drawn in the order of their pivot rows), so the player walks behind a tree's crown and a roof.
//   So: put the pivot on the ground line at the middle of what stands on the ground, and draw nothing in the six
//   rows above it that should not block (roots that spread, a shadow, grass at the foot).
//   A sprite cannot yet say its footprint itself. One that needs to (an arch you walk through, an L-shaped house,
//   a tree with wide roots) would need a field such as `footprint: { left, right, depth }` in pixels from the pivot
//   in the sprite's data, carried to the catalogue's `tech`: proposed, not in the engine.
// Pure JavaScript: no DOM.
import { cleanParams, defaultParams, clipFps, renderFrame, frameSockets, cueInEffect } from '../../engine/sprite.js';
import { clipSpeed, restClip, actionOf, STATES } from './clips.js';

/**
 * The sounds a sprite plays at these settings: { clip: [{ sound, frame, preset, params, volume }] }.
 * stored: the visitor's own list from the bag (or null for the sprite's own sounds). A sound that only
 * applies to some settings carries `when`; cueInEffect says whether it plays at these.
 */
export function activeCues(sprite, stored, params) {
  const out = {};
  for (const clip of Object.keys(sprite.clips)) {
    const list = stored && Array.isArray(stored[clip]) ? stored[clip] : sprite.sounds?.[clip] ?? [];
    out[clip] = list.filter((c) => cueInEffect(sprite, c, params)).map((c) => ({
      sound: c.sound,
      frame: Math.max(0, Math.min(sprite.clips[clip].frames - 1, Math.round(Number(c.frame)) || 0)),
      preset: c.preset ?? null, params: c.params ?? null, volume: c.volume ?? 1,
    }));
  }
  return out;
}

/** The ids of the sounds a sprite plays at these settings. */
export function soundIdsOf(sprite, stored, params) {
  return [...new Set(Object.values(activeCues(sprite, stored, cleanParams(sprite, params ?? {}))).flat().map((c) => c.sound))];
}

/**
 * True when the visitor changed this sprite: a control away from where it was made, or sounds that are not the
 * sprite's own. settings: the bag item's { params, cues }.
 */
export function isCustom(sprite, settings = {}) {
  const made = defaultParams(sprite), now = cleanParams(sprite, settings?.params ?? {});
  if (Object.keys(made).some((k) => made[k] !== now[k])) return true;
  const stored = settings?.cues;
  if (!stored || typeof stored !== 'object') return false;
  const plain = (list) => JSON.stringify(list.map((c) => [c.sound, c.frame, c.preset ?? null, c.params ?? null, c.volume ?? 1]));
  return Object.keys(sprite.clips).some((clip) => Array.isArray(stored[clip]) && plain(stored[clip]) !== plain(sprite.sounds?.[clip] ?? []));
}

/**
 * The drawn part of one frame, measured from the pivot: l and r to the sides, t above, b below.
 * (A frame has empty space round the sprite; touching is judged on the body, not on the frame.)
 */
export function bodyBox(sprite, clip, params, pivot = sprite.pivot) {
  const b = renderFrame(sprite, clip, 0, params).bounds();
  const [px, py] = pivot;
  if (!b) return { l: sprite.size[0] / 4, r: sprite.size[0] / 4, t: sprite.size[1] / 2, b: 0 };
  return { l: Math.max(1, px - b.x0), r: Math.max(1, b.x1 + 1 - px), t: Math.max(1, py - b.y0), b: Math.max(0, b.y1 + 1 - py) };
}

const BLOCKING_ROLES = ['world/prop', 'world/building'];
const BASE_ROWS = 6;

/**
 * What a prop blocks in a top-down scene: { l, r, d } in pixels from its pivot (left, right, and how deep, going up
 * from the pivot row), or null for something that is walked over or through. The rule is in this file's header.
 * meta: { type, role } (the catalogue row, or the sprite's own meta). clip: its resting clip.
 */
export function footprintOf(sprite, clip, params, meta = sprite.meta ?? {}, pivot = sprite.pivot) {
  if (meta.type !== 'prop' || !BLOCKING_ROLES.includes(meta.role)) return null;
  const g = renderFrame(sprite, clip, 0, params), [px, py] = pivot;
  let x0 = Infinity, x1 = -Infinity;
  for (let y = Math.max(0, py - BASE_ROWS); y < Math.min(g.h, py); y++) for (let x = 0; x < g.w; x++) {
    if (!g.data[y * g.w + x]) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
  }
  if (x1 < x0) return null;
  const b = g.bounds();
  const d = meta.role === 'world/building' ? Math.max(12, Math.min(48, Math.round((py - b.y0) * 0.4))) : BASE_ROWS;
  return { l: Math.max(1, px - x0), r: Math.max(1, x1 + 1 - px), d };
}

const HARMFUL = /\b(lava|acid|magma|poison)\b/i;
/**
 * True for a liquid that hurts whoever stands in it. It is told by its words: lava, acid, magma or poison in the
 * block's prefix, in the tileset's name, or in what one of its controls is set to (the Liquid control of
 * sprites/tiles-water.json set to "lava"). Search words (meta.words) do not count.
 * prefix: the liquid block's prefix. sprite: its tileset (may be null). params: the tileset's settings.
 */
export function harmfulLiquid(prefix, sprite, params = {}) {
  if (HARMFUL.test(String(prefix).replace(/-/g, ' '))) return true;
  if (sprite && HARMFUL.test(sprite.name ?? '')) return true;
  return Object.values(params ?? {}).some((v) => typeof v === 'string' && HARMFUL.test(v));
}

/** The frame of a clip on which a hit lands or a shot leaves: where its first sound is, or the middle. */
const hitFrame = (info, cues) => { const cue = (cues ?? []).find((c) => !c.loop); return cue ? cue.frame : Math.floor(info.frames / 2); };
const isAttack = (name) => STATES.action.includes(actionOf(name));
const STANDARD = new Set(Object.values(STATES).flat().concat(['victory']));

/** Fill in a kind from plain data (the unit tests build scenes this way, with no sprite). */
export function makeKind(spec) {
  const role = spec.role ?? 'prop';
  const cues = {}, clips = {};
  const clipNames = Object.keys(spec.clips ?? {});
  for (const name of clipNames) cues[name] = (spec.cues?.[name] ?? []).map((c) => ({ preset: null, params: null, volume: 1, loop: false, ...c }));
  for (const [name, c] of Object.entries(spec.clips ?? {})) {
    clips[name] = {
      frames: c.frames, fps: c.fps, loop: c.loop ?? true, label: c.label ?? name[0].toUpperCase() + name.slice(1),
      speed: c.speed ?? clipSpeed(name, c, spec.params ?? {}),
      hitFrame: c.hitFrame ?? hitFrame(c, cues[name]),
      fire: c.fire ?? null,                        // where a projectile leaves this clip: { dx forward, dy up } from the pivot
    };
  }
  const preview = clipNames.includes(spec.preview) ? spec.preview : clipNames[0];
  // an enemy's other moves (slam, roar, breath): one-shot clips that are not standard names
  const moves = clipNames.filter((n) => !clips[n].loop && !STANDARD.has(actionOf(n))).map(actionOf);
  return {
    key: spec.key, id: spec.id ?? spec.key, name: spec.name ?? spec.id ?? spec.key, role, view: spec.view ?? null,
    size: spec.size ?? [32, 32], pivot: spec.pivot ?? [16, 31], params: spec.params ?? {},
    clips, clipNames, cues, preview,
    rest: clipNames.includes(spec.rest) ? spec.rest : restClip(clipNames, preview, role),
    moves: [...new Set(moves)],
    box: { l: 6, r: 6, t: 12, b: 0, ...(spec.box ?? {}) },
    footprint: spec.footprint ?? null,             // top-down: what it blocks at its base ({ l, r, d }), or null
    flying: !!spec.flying,                         // not on the ground: it hovers and does not fall
    lift: spec.lift ?? 0,                          // how far above its ground point it is drawn
    hp: spec.hp ?? (role === 'creature' || role === 'player' ? 3 : 1),   // hits before it dies
    hostile: spec.hostile ?? role === 'creature',  // attacks the player when close
    hittable: spec.hittable ?? role === 'creature', // the player's action can hurt it
  };
}

/**
 * A kind from a bag entry: { key, sprite, row, settings: { params, cues } }, with the role roles.js gave it.
 * The pivot and whether it stands on the ground come from the catalogue row (tech.pivot, tech.grounded) when
 * there is one, the preview clip from its stripClip.
 * opts.isLoop(soundId): whether that sound loops (a looping sound runs for as long as its clip plays).
 * opts.hostile: false for an animal. opts.hp: hits before it dies (a boss takes more).
 */
export function buildKind(entry, role, { isLoop = () => false, hostile, hp } = {}) {
  const { sprite } = entry, tech = entry.row?.tech ?? {};
  const params = cleanParams(sprite, entry.settings?.params ?? {});
  const pivot = Array.isArray(tech.pivot) ? [...tech.pivot] : [...sprite.pivot];
  const grounded = typeof tech.grounded === 'boolean' ? tech.grounded : sprite.grounded !== false;
  const preview = sprite.clips[entry.row?.stripClip] ? entry.row.stripClip : sprite.preview;
  const cues = activeCues(sprite, entry.settings?.cues ?? null, params);
  for (const list of Object.values(cues)) for (const c of list) c.loop = !!isLoop(c.sound);
  const clips = {};
  for (const [name, c] of Object.entries(sprite.clips)) {
    clips[name] = { frames: c.frames, fps: clipFps(sprite, name, params), loop: c.loop ?? true, label: c.label, speed: clipSpeed(name, c, params) };
    if (isAttack(name)) {
      // a projectile leaves from the muzzle, else from the hand, on the frame the shot sounds
      const at = hitFrame(c, cues[name]);
      const s = frameSockets(sprite, name, at, params);
      const from = s && (s.muzzle ?? s.hand);
      clips[name].hitFrame = at;
      if (from) clips[name].fire = { dx: from.x - pivot[0], dy: pivot[1] - from.y };
    }
  }
  const rest = restClip(Object.keys(clips), preview, role);
  const box = bodyBox(sprite, rest, params, pivot);
  // Stand on the ground: a sprite whose pivot is at its middle (an effect, a flyer) is raised until nothing is under
  // the ground line. One that is not on the ground hovers: lifted clear as the sprite's own page does, and a little more.
  const under = Math.max(0, box.b - 1);
  const hover = grounded ? 0 : Math.round((sprite.size[1] - pivot[1]) * 0.75);
  const mover = role === 'creature' || role === 'npc' || role === 'player';
  const lift = grounded ? under : Math.max(under, hover) + (mover ? 20 : role === 'pickup' ? 6 : 0);
  return makeKind({
    key: entry.key, id: sprite.id, name: sprite.name, role, view: entry.row?.view ?? sprite.meta?.view ?? null,
    size: [...sprite.size], pivot, params, clips, cues, preview, rest, box,
    footprint: role === 'prop' ? footprintOf(sprite, rest, params, { type: entry.row?.type ?? sprite.meta?.type, role: entry.row?.role ?? sprite.meta?.role }, pivot) : null,
    flying: !grounded, lift, hostile, hp,
  });
}
