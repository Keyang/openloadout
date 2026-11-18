// Asset metadata: the allowed values, the role tree and the validators.
// Pure JavaScript with no Node or browser APIs: the build, the checkers, the tests
// and the site all import this file. See docs/architecture.md, Contract 1.
//
// To add a theme or a game type, add one line to THEME_LABELS or GAME_TYPE_LABELS
// (id: everyday label). Ids are lowercase words joined by dashes.

// ---- kinds and types --------------------------------------------------------

export const KINDS = ['sprite', 'sound', 'music'];

export const TYPE_LABELS = {
  // sprites
  character: 'Character',
  creature: 'Creature',
  tileset: 'Tiles',
  prop: 'Prop',
  pickup: 'Pickup',
  projectile: 'Projectile',
  effect: 'Effect',
  background: 'Background',
  ui: 'Interface',
  icon: 'Icon',
  // audio
  sfx: 'Sound effect',
  ambience: 'Background loop',
  music: 'Music',
  jingle: 'Jingle',
};
export const SPRITE_TYPES = ['character', 'creature', 'tileset', 'prop', 'pickup', 'projectile', 'effect', 'background', 'ui', 'icon'];
export const SOUND_TYPES = ['sfx', 'ambience', 'jingle'];
export const MUSIC_TYPES = ['music', 'jingle'];
export const AUDIO_TYPES = ['sfx', 'ambience', 'music', 'jingle'];

// ---- role tree ----------------------------------------------------------------
// The top level is shared by sprites and sounds, so a chest and its creak sit together.

export const ROLE_TREE = {
  characters: { label: 'Characters', sprite: ['player', 'enemy', 'boss', 'npc', 'animal'], sound: ['footstep', 'voice', 'hurt', 'death'] },
  actions: { label: 'Actions', sprite: [], sound: ['swing', 'hit', 'jump', 'land', 'dash', 'shoot', 'cast'] },
  items: { label: 'Items and pickups', sprite: ['pickup', 'weapon', 'key', 'food', 'icon'], sound: ['pickup', 'equip', 'consume', 'drop'] },
  world: { label: 'World', sprite: ['tile', 'prop', 'platform', 'hazard', 'door', 'building', 'crop'], sound: ['door', 'chest', 'lever', 'break', 'machine'] },
  effects: { label: 'Effects', sprite: ['explosion', 'spark', 'dust', 'magic', 'weather', 'projectile'], sound: ['explosion', 'magic', 'impact'] },
  environment: { label: 'Environment', sprite: ['background', 'lighting'], sound: ['ambience', 'weather'] },
  interface: { label: 'Interface', sprite: ['button', 'panel', 'bar', 'cursor', 'icon'], sound: ['click', 'hover', 'confirm', 'error', 'reward'] },
  music: { label: 'Music', sprite: [], sound: ['menu', 'exploration', 'battle', 'boss', 'shop', 'victory', 'gameover'] },
};
export const ROLE_TOPS = Object.keys(ROLE_TREE);
export const SPRITE_ROLES = ROLE_TOPS.flatMap((t) => ROLE_TREE[t].sprite.map((r) => `${t}/${r}`));
export const SOUND_ROLES = ROLE_TOPS.flatMap((t) => ROLE_TREE[t].sound.map((r) => `${t}/${r}`));
export const MUSIC_ROLES = SOUND_ROLES.filter((r) => r.startsWith('music/'));

// Everyday names for the leaves (the ones that are not just the id with a capital letter).
const ROLE_LEAF_LABELS = {
  npc: 'Townsfolk', gameover: 'Game over', footstep: 'Footsteps', ambience: 'Background loops', tile: 'Tiles', crop: 'Crops',
  building: 'Buildings', prop: 'Props', door: 'Doors', key: 'Keys', icon: 'Icons', pickup: 'Pickups', weapon: 'Weapons', button: 'Buttons',
  panel: 'Panels', bar: 'Bars', cursor: 'Cursors', platform: 'Platforms', hazard: 'Hazards', background: 'Backgrounds', enemy: 'Enemies',
  boss: 'Bosses', animal: 'Animals', spark: 'Sparks', explosion: 'Explosions', projectile: 'Projectiles', click: 'Clicks', machine: 'Machines',
};

// ---- themes, game types, views, licences --------------------------------------

export const THEME_LABELS = {
  fantasy: 'Fantasy',
  'sci-fi': 'Sci-fi',
  space: 'Space',
  dungeon: 'Dungeon',
  forest: 'Forest',
  farm: 'Farm',
  city: 'City',
  horror: 'Horror',
  underwater: 'Underwater',
  candy: 'Candy',
  neutral: 'Fits anywhere',
};
export const THEMES = Object.keys(THEME_LABELS);

export const GAME_TYPE_LABELS = {
  platformer: 'Platformer',
  'turn-based-rpg': 'Turn-based RPG',
  'roguelike-action': 'Action roguelike',
  'top-down-rpg': 'Top-down RPG',
  'farming-sim': 'Farming game',
  shooter: 'Shooter',
  racing: 'Racing',
  puzzle: 'Puzzle',
  'card-game': 'Card game',
  arcade: 'Arcade',
};
export const GAME_TYPES = Object.keys(GAME_TYPE_LABELS);
/** A bundle may also say it suits any game (a set of menu sounds, say). */
export const BUNDLE_GAME_TYPES = [...GAME_TYPES, 'any'];

export const VIEW_LABELS = { side: 'Side view', 'top-down': 'Top-down', front: 'Front view', none: 'No view' };
export const VIEWS = Object.keys(VIEW_LABELS);

export const LICENSE_LABELS = { draft: 'Draft (not yet released)', free: 'Free to use', attribution: 'Free with credit', commercial: 'Paid' };
export const LICENSES = Object.keys(LICENSE_LABELS);

/** Bundle levels (BAG-6): one object with its sounds, one character, or a whole game kit. */
export const BUNDLE_LEVEL_LABELS = { object: 'Object set', character: 'Character set', kit: 'Game kit' };
export const BUNDLE_LEVELS = Object.keys(BUNDLE_LEVEL_LABELS);

export const WORDS_MIN = 6;
export const WORDS_MAX = 14;

/** Fields an asset's meta may have, in the order they are written. */
export const META_FIELDS = ['type', 'role', 'themes', 'gameTypes', 'view', 'words', 'license'];
/** Facts the build measures; writing them by hand is an error. */
export const DERIVED_FIELDS = ['frame', 'frames', 'clips', 'size', 'seconds', 'duration', 'length', 'loop', 'stereo', 'bpm', 'tempo', 'controls', 'parts', 'styles', 'sounds', 'bundles', 'tech'];

export const BUNDLE_FIELDS = ['id', 'name', 'gameType', 'blurb', 'level', 'sprites', 'sounds', 'music', 'theme'];
export const THEME_FIELDS = ['seed', 'colour', 'sound', 'music', 'shapes'];

// ---- helpers for the site --------------------------------------------------------

export const typesFor = (kind) => (kind === 'sprite' ? SPRITE_TYPES : kind === 'music' ? MUSIC_TYPES : SOUND_TYPES);
export const rolesFor = (kind) => (kind === 'sprite' ? SPRITE_ROLES : kind === 'music' ? MUSIC_ROLES : SOUND_ROLES);

const cap = (s) => s[0].toUpperCase() + s.slice(1);

/** Everyday label for a facet value. facet: type | role | themes | gameTypes | view | license | level. */
export function labelFor(facet, value) {
  if (value === undefined || value === null) return '';
  if (facet === 'type') return TYPE_LABELS[value] ?? cap(value);
  if (facet === 'themes' || facet === 'theme') return THEME_LABELS[value] ?? cap(value);
  if (facet === 'gameTypes' || facet === 'gameType') return value === 'any' ? 'Any game' : GAME_TYPE_LABELS[value] ?? cap(value);
  if (facet === 'view') return VIEW_LABELS[value] ?? cap(value);
  if (facet === 'license') return LICENSE_LABELS[value] ?? cap(value);
  if (facet === 'level') return BUNDLE_LEVEL_LABELS[value] ?? cap(value);
  if (facet === 'role') {
    const [top, leaf] = String(value).split('/');
    if (!leaf) return ROLE_TREE[top]?.label ?? cap(top);
    return ROLE_LEAF_LABELS[leaf] ?? cap(leaf);
  }
  return String(value);
}

// ---- validation ------------------------------------------------------------------

const list = (xs) => xs.join(', ');
const q = (v) => JSON.stringify(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const WORD_RE = /^[a-z0-9]+(?:[ '-][a-z0-9]+)*$/;
const ID_RE = /^[a-z][a-z0-9-]*$/;

function checkList(errors, field, value, allowed, labelsName, { min = 1 } = {}) {
  if (!Array.isArray(value)) { errors.push(`meta.${field}: must be a list, like ["${allowed[0]}"]; got ${q(value)}`); return; }
  if (value.length < min) errors.push(`meta.${field}: give at least one value (choose from: ${list(allowed)})`);
  const seen = new Set();
  for (const v of value) {
    if (seen.has(v)) errors.push(`meta.${field}: ${q(v)} is listed twice; remove the repeat`);
    seen.add(v);
    if (!allowed.includes(v)) errors.push(`meta.${field}: ${q(v)} is not a known value. Choose from: ${list(allowed)}${labelsName ? ` (or add it to ${labelsName} in catalog/schema.js)` : ''}`);
  }
}

/**
 * Checks one asset's meta. kind: 'sprite' | 'sound' | 'music'.
 * Returns { ok, errors }, where each error names the field and says what to write instead.
 */
export function validateMeta(meta, kind) {
  const errors = [];
  if (!KINDS.includes(kind)) return { ok: false, errors: [`kind ${q(kind)} is not known; use one of: ${list(KINDS)}`] };
  const need = META_FIELDS.filter((f) => f !== 'view' || kind === 'sprite');
  if (meta === undefined || meta === null) {
    return { ok: false, errors: [`meta is missing: add a meta object with ${list(need)}${kind === 'sprite' ? ' (in defineSprite)' : ' (a top-level "meta" in the JSON)'}`] };
  }
  if (!isObj(meta)) return { ok: false, errors: [`meta must be an object with ${list(need)}; got ${q(meta)}`] };

  for (const k of Object.keys(meta)) {
    if (DERIVED_FIELDS.includes(k)) errors.push(`meta.${k}: is derived by the build from the asset itself; remove it`);
    else if (!META_FIELDS.includes(k)) errors.push(`meta.${k}: is not a known field; meta takes ${list(need)}`);
  }

  const types = typesFor(kind), roles = rolesFor(kind);

  // type
  if (meta.type === undefined) errors.push(`meta.type: missing. For a ${kind} use one of: ${list(types)}`);
  else if (!types.includes(meta.type)) errors.push(`meta.type: ${q(meta.type)} does not fit a ${kind}. Use one of: ${list(types)}`);

  // role
  if (meta.role === undefined) errors.push(`meta.role: missing. For a ${kind} use one of: ${list(roles)}`);
  else if (typeof meta.role !== 'string' || !roles.includes(meta.role)) {
    const r = String(meta.role);
    const [top, leaf] = r.split('/');
    let why;
    if (kind === 'music') why = `music takes a role under music/: ${list(roles)}`;
    else if (ROLE_TREE[top] && leaf && kind === 'sprite' && ROLE_TREE[top].sound.includes(leaf)) why = `${r} is for sounds only. Sprite roles under ${top}/: ${list(ROLE_TREE[top].sprite.map((x) => `${top}/${x}`)) || 'none'}`;
    else if (ROLE_TREE[top] && leaf && kind !== 'sprite' && ROLE_TREE[top].sprite.includes(leaf)) why = `${r} is for sprites only. Sound roles under ${top}/: ${list(ROLE_TREE[top].sound.map((x) => `${top}/${x}`)) || 'none'}`;
    else if (ROLE_TREE[top]) why = `under ${top}/ a ${kind} can be: ${list(roles.filter((x) => x.startsWith(top + '/'))) || 'nothing'}. All ${kind} roles: ${list(roles)}`;
    else why = `the role tree starts with ${list(ROLE_TOPS)}. All ${kind} roles: ${list(roles)}`;
    errors.push(`meta.role: ${q(meta.role)} is not in the role tree; ${why}`);
  }

  // themes and game types
  if (meta.themes === undefined) errors.push(`meta.themes: missing. Give a list from: ${list(THEMES)}`);
  else checkList(errors, 'themes', meta.themes, THEMES, 'THEME_LABELS');
  if (meta.gameTypes === undefined) errors.push(`meta.gameTypes: missing. Give a list from: ${list(GAME_TYPES)}`);
  else checkList(errors, 'gameTypes', meta.gameTypes, GAME_TYPES, 'GAME_TYPE_LABELS');

  // view
  if (kind === 'sprite') {
    if (meta.view === undefined) errors.push(`meta.view: missing. Use one of: ${list(VIEWS)}`);
    else if (!VIEWS.includes(meta.view)) errors.push(`meta.view: ${q(meta.view)} is not a known view. Use one of: ${list(VIEWS)}`);
  } else if (meta.view !== undefined) errors.push(`meta.view: is for sprites only; remove it from a ${kind}`);

  // words
  const w = meta.words;
  if (w === undefined) errors.push(`meta.words: missing. List ${WORDS_MIN} to ${WORDS_MAX} lowercase words people would type to find it (nouns, verbs, events, synonyms)`);
  else if (!Array.isArray(w)) errors.push(`meta.words: must be a list of words, like ["coin", "gold", "money"]; got ${q(w)}`);
  else {
    if (w.length < WORDS_MIN) errors.push(`meta.words: has ${w.length}; give at least ${WORDS_MIN} (add synonyms, verbs and events people would type)`);
    if (w.length > WORDS_MAX) errors.push(`meta.words: has ${w.length}; give at most ${WORDS_MAX} (keep the ones people are most likely to type)`);
    const seen = new Set();
    for (const x of w) {
      if (typeof x !== 'string' || !x.trim()) { errors.push(`meta.words: has an empty entry; remove it`); continue; }
      if (seen.has(x)) errors.push(`meta.words: ${q(x)} is listed twice; remove the repeat`);
      seen.add(x);
      if (!WORD_RE.test(x)) {
        const fix = x.toLowerCase().trim().replace(/\s+/g, ' ');
        errors.push(`meta.words: ${q(x)} must be lowercase letters and digits (a short phrase may use spaces or dashes)${WORD_RE.test(fix) ? `; write ${q(fix)}` : ''}`);
      }
    }
  }

  // license
  if (meta.license === undefined) errors.push(`meta.license: missing. Use one of: ${list(LICENSES)} (new assets start as "draft")`);
  else if (!LICENSES.includes(meta.license)) errors.push(`meta.license: ${q(meta.license)} is not known. Use one of: ${list(LICENSES)}`);

  return { ok: errors.length === 0, errors };
}

/**
 * Checks one bundle. knownIds is either { sprite: [ids], sound: [ids], music: [ids] }
 * (then each list is checked against its own kind) or a flat list / Set of every asset id.
 * Returns { ok, errors }.
 */
export function validateBundle(bundle, knownIds = null) {
  const errors = [];
  if (!isObj(bundle)) return { ok: false, errors: [`a bundle must be an object with ${list(BUNDLE_FIELDS)}`] };
  for (const k of Object.keys(bundle)) if (!BUNDLE_FIELDS.includes(k)) errors.push(`${k}: is not a known field; a bundle takes ${list(BUNDLE_FIELDS)}`);

  if (typeof bundle.id !== 'string' || !ID_RE.test(bundle.id)) errors.push(`id: ${q(bundle.id)} must be lowercase letters, digits and dashes, starting with a letter, and match the file name`);
  for (const f of ['name', 'blurb']) {
    if (bundle[f] === undefined) errors.push(`${f}: missing; give the bundle a ${f === 'name' ? 'short name' : 'one-sentence description'}`);
    else if (typeof bundle[f] !== 'string' || !bundle[f].trim()) errors.push(`${f}: must be non-empty text`);
  }
  if (bundle.gameType === undefined) errors.push(`gameType: missing. Use one of: ${list(BUNDLE_GAME_TYPES)}`);
  else if (!BUNDLE_GAME_TYPES.includes(bundle.gameType)) errors.push(`gameType: ${q(bundle.gameType)} is not known. Use one of: ${list(BUNDLE_GAME_TYPES)} (or add it to GAME_TYPE_LABELS in catalog/schema.js)`);
  if (bundle.level !== undefined && !BUNDLE_LEVELS.includes(bundle.level)) errors.push(`level: ${q(bundle.level)} is not known. Use one of: ${list(BUNDLE_LEVELS)}`);

  const perKind = knownIds && !Array.isArray(knownIds) && !(knownIds instanceof Set);
  const sets = perKind ? { sprite: new Set(knownIds.sprite ?? []), sound: new Set(knownIds.sound ?? []), music: new Set(knownIds.music ?? []) } : null;
  const flat = knownIds && !perKind ? new Set(knownIds) : null;
  const kindOf = (id) => (sets ? (sets.sprite.has(id) ? 'sprite' : sets.sound.has(id) ? 'sound' : sets.music.has(id) ? 'music' : null) : null);
  const name = { sprites: 'sprite', sounds: 'sound', music: 'music' };
  const article = { sprite: 'a sprite', sound: 'a sound effect', music: 'a music track' };

  let total = 0;
  for (const field of ['sprites', 'sounds', 'music']) {
    const v = bundle[field];
    if (v === undefined) { errors.push(`${field}: missing; use [] when the bundle has none`); continue; }
    if (!Array.isArray(v)) { errors.push(`${field}: must be a list of ids, like ["${field === 'sprites' ? 'knight' : 'coin-pickup'}"]; got ${q(v)}`); continue; }
    total += v.length;
    const seen = new Set();
    for (const id of v) {
      if (seen.has(id)) errors.push(`${field}: ${q(id)} is listed twice; remove the repeat`);
      seen.add(id);
      if (flat && !flat.has(id)) errors.push(`${field}: ${q(id)} is not an asset id; check the spelling against sprites/ and sounds/`);
      if (sets) {
        const k = kindOf(id);
        if (!k) errors.push(`${field}: there is no ${name[field]} ${q(id)}; check the spelling against ${field === 'sprites' ? 'sprites/' : 'sounds/'}`);
        else if (k !== name[field]) errors.push(`${field}: ${q(id)} is ${article[k]}; move it to the ${k === 'sprite' ? 'sprites' : k === 'sound' ? 'sounds' : 'music'} list`);
      }
    }
  }
  if (total === 0 && Array.isArray(bundle.sprites) && Array.isArray(bundle.sounds) && Array.isArray(bundle.music)) errors.push('the bundle is empty: list at least one sprite, sound or music track');

  if (bundle.theme === undefined) errors.push('theme: missing; use {} for no theme');
  else if (!isObj(bundle.theme)) errors.push(`theme: must be an object (the bundle-level settings of Contract 7, or {}); got ${q(bundle.theme)}`);
  else {
    const t = bundle.theme;
    for (const k of Object.keys(t)) if (!THEME_FIELDS.includes(k)) errors.push(`theme.${k}: is not a known setting; a theme takes ${list(THEME_FIELDS)}`);
    if (t.seed !== undefined && !Number.isFinite(t.seed)) errors.push('theme.seed: must be a number');
    if (t.shapes !== undefined && typeof t.shapes !== 'boolean') errors.push('theme.shapes: must be true or false');
    for (const k of ['colour', 'sound', 'music']) if (t[k] !== undefined && !isObj(t[k])) errors.push(`theme.${k}: must be an object`);
  }
  return { ok: errors.length === 0, errors };
}
