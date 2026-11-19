// Shelves: how a long list of assets (a bundle page's 40 to 50 sprites) is split under everyday headings.
// The groups come from each asset's catalogue type and role (catalog/schema.js), never from its id or its bundle,
// so a new asset, a new role or a fourth bundle needs no change here. Pure: no DOM, so Node tests it
// (tests/unit/site-shelves.test.mjs).
import { ROLE_TREE, ROLE_TOPS, labelFor } from '../catalog/schema.js';

// Sprite shelves, in the order a game maker looks for things: who plays, who fights them, the world they walk in,
// what they pick up, what flies about, what is behind, and the menus on top. A rule matches a role exactly or a
// role prefix ending in '/', or else a type.
const SPRITE_SHELVES = [
  { key: 'characters', label: 'Characters', roles: ['characters/player', 'characters/npc', 'characters/animal'], types: ['character'] },
  { key: 'enemies', label: 'Enemies and bosses', roles: ['characters/enemy', 'characters/boss'], types: ['creature'] },
  { key: 'ground', label: 'Ground, walls and platforms', roles: ['world/tile', 'world/platform'], types: ['tileset'] },
  { key: 'scenery', label: 'Scenery and objects', roles: ['world/prop', 'world/building', 'world/crop', 'world/door', 'world/'], types: ['prop'] },
  { key: 'hazards', label: 'Hazards and traps', roles: ['world/hazard'], types: [] },
  { key: 'items', label: 'Pickups and items', roles: ['items/'], types: ['pickup'] },
  { key: 'shots', label: 'Shots and projectiles', roles: ['effects/projectile'], types: ['projectile'] },
  { key: 'effects', label: 'Effects', roles: ['effects/'], types: ['effect'] },
  { key: 'backgrounds', label: 'Backgrounds', roles: ['environment/'], types: ['background'] },
  { key: 'interface', label: 'Menus and screens', roles: ['interface/'], types: ['ui', 'icon'] },
];

const roleMatches = (rule, role) => (rule.endsWith('/') ? role.startsWith(rule) : role === rule);
const sentence = (s) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);

/**
 * The shelf one catalogue row goes on: { key, label, order }. Sprites by the table above (an exact role first, then a
 * role prefix, then the type); sounds by the top of their role ("Actions", "Items and pickups"...); music on one shelf.
 * Anything the table does not know gets a shelf of its own named from its type, after the known ones.
 */
export function shelfOf(row) {
  const role = String(row?.role ?? ''), type = String(row?.type ?? '');
  if (row?.kind === 'music') return { key: 'music', label: 'Music', order: 0 };
  if (row?.kind === 'sound') {
    const top = role.split('/')[0];
    const i = ROLE_TOPS.indexOf(top);
    if (top === 'music') return { key: 'sound-music', label: 'Jingles and short tunes', order: i };      // a jingle is a sound, not a track
    if (i >= 0) return { key: `sound-${top}`, label: sentence(ROLE_TREE[top].label), order: i };
    return { key: `sound-${type || 'other'}`, label: sentence(labelFor('type', type) || 'Other sounds'), order: ROLE_TOPS.length };
  }
  const exact = SPRITE_SHELVES.findIndex((s) => s.roles.some((r) => !r.endsWith('/') && r === role));
  const prefix = exact >= 0 ? exact : SPRITE_SHELVES.findIndex((s) => s.roles.some((r) => roleMatches(r, role)));
  const i = prefix >= 0 ? prefix : SPRITE_SHELVES.findIndex((s) => s.types.includes(type));
  if (i >= 0) return { key: SPRITE_SHELVES[i].key, label: SPRITE_SHELVES[i].label, order: i };
  return { key: `other-${type || 'sprite'}`, label: sentence(labelFor('type', type) || 'Other'), order: SPRITE_SHELVES.length };
}

/**
 * Split catalogue rows into shelves: [{ key, label, kind, rows }], known shelves in their fixed order, unknown ones
 * after them; inside a shelf the rows keep the order they came in (a bundle's own order). Sprites, sounds and
 * music never share a shelf.
 */
export function shelvesOf(rows) {
  const KIND = { sprite: 0, sound: 1, music: 2 };
  const shelves = new Map();
  for (const row of rows) {
    const s = shelfOf(row);
    const kind = row?.kind ?? 'sprite';
    const key = `${kind}:${s.key}`;
    if (!shelves.has(key)) shelves.set(key, { key: s.key, label: s.label, kind, order: s.order, rows: [] });
    shelves.get(key).rows.push(row);
  }
  return [...shelves.values()].sort((a, b) => (KIND[a.kind] ?? 3) - (KIND[b.kind] ?? 3) || a.order - b.order)
    .map(({ key, label, kind, rows: list }) => ({ key, label, kind, rows: list }));
}
