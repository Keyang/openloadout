// Playground: the words on the page that depend on what is in the scene, so the page only ever
// says what can really happen. Pure JavaScript: no DOM.

/** "Coin" -> "coins", "Torch" -> "torches", "Berry" -> "berries" (lower case, for the middle of a sentence). */
export function plural(name) {
  const n = String(name).toLowerCase();
  if (/[^aeiou]y$/.test(n)) return n.slice(0, -1) + 'ies';
  if (/(s|x|z|ch|sh)$/.test(n)) return n + 'es';
  return n + 's';
}

/**
 * One line for someone who has never played on a keyboard, built from what is in the scene:
 * "Jump onto the ledges, collect the coins, press X next to the slime."
 * scene: { mode, player (is there one), ledges, pickup, enemy, prop (names, or nothing) }. '' with no player.
 */
export function howTo(scene) {
  if (!scene.player) return '';
  const parts = [];
  if (scene.mode === 'top') parts.push('walk round the room');
  else if (scene.ledges) parts.push('jump onto the ledges');
  if (scene.pickup) parts.push(`collect the ${plural(scene.pickup)}`);
  const target = scene.enemy ?? scene.prop;
  if (target) parts.push(`press X next to the ${String(target).toLowerCase()}`);
  if (!parts.length) return '';
  const line = parts.join(', ');
  return line[0].toUpperCase() + line.slice(1) + '.';
}

/** What a thing of this role does, for the list under the scene. scene: { player }: is there a character to play. */
export function roleNote(role, { player = true } = {}) {
  switch (role) {
    case 'player': return 'You move this one.';
    case 'npc': return player ? 'Walks around by itself, and talks when you stand next to it.' : 'Walks around by itself.';
    case 'creature': return player ? 'Moves by itself. Your attack hurts it; hit it enough and it is gone.' : 'Moves by itself.';
    case 'pickup': return player ? 'Walk into it to collect it.' : 'Waits to be collected.';
    case 'prop': return player ? 'Stands in the scene. Press X next to it to play its next move.' : 'Stands in the scene.';
    case 'effect': return player ? 'Plays in the scene, and where your hits land.' : 'Plays in the scene.';
    case 'projectile': return player ? 'Flies out when you attack.' : 'Needs a character to fire it.';
    case 'tiles': return 'Makes the ground.';
    case 'background': return 'Scrolls behind the scene.';
    case 'display': return 'Shown with the score and health.';
    default: return '';
  }
}

/** What the keys do. scene: { mode, player, block, dodge } (block, dodge: the player has those moves). */
export function keysLine({ mode, player, block = false, dodge = false }) {
  if (!player) return 'Arrow keys move the view.';
  const out = [mode === 'top' ? 'Arrow keys or W, A, S and D to walk.' : 'Arrow keys or A and D to walk. Space to jump.', 'X to attack or use things.'];
  if (block) out.push('C to block.');
  if (dodge) out.push('V to dodge.');
  out.push('Hold Shift to run. On a phone, use the buttons under the scene.');
  return out.join(' ');
}

// ---- the two views of the scene -------------------------------------------------------------------------

const VIEW = {
  side: { name: 'Side view', scene: 'side-view scene', drawn: 'from the side', opened: 'in side view', switched: 'side view' },
  top: { name: 'Top-down', scene: 'top-down scene', drawn: 'from above', opened: 'top-down', switched: 'top-down' },
};
const other = (mode) => (mode === 'top' ? 'side' : 'top');

/** The name of a view on a button: 'Side view' or 'Top-down'. mode: 'side' | 'top'. */
export function viewName(mode) {
  return VIEW[mode === 'top' ? 'top' : 'side'].name;
}

/** Names as they are said in a sentence: "A", "A and B", "A, B and C". */
export function listNames(names) {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/**
 * The line under the scene for the things that were left out of it because they were drawn for the other view:
 * who, why, and how to see them. names: their names; mode: the view of the scene they are left out of. '' with none.
 */
export function leftOutNote(names, mode) {
  if (!names.length) return '';
  const here = VIEW[mode === 'top' ? 'top' : 'side'], there = VIEW[other(mode)], one = names.length === 1;
  return `${listNames(names)} ${one ? 'is' : 'are'} drawn to be seen ${there.drawn}, so ${one ? 'it is' : 'they are'} left out of this ${here.scene}. Switch to ${there.name} to see ${one ? 'it' : 'them'}.`;
}

/**
 * Why the scene opened in this view, as a sentence. why: what roles.js chooseMode said ('tiles', 'most', 'player',
 * 'even', 'chosen', 'only'); mode: the view. '' when the bag has things for one view only: there was nothing to choose.
 */
export function viewReason(why, mode) {
  const v = VIEW[mode === 'top' ? 'top' : 'side'];
  switch (why) {
    case 'tiles': return `The ground tiles in your bag are drawn ${v.drawn}, so the scene opened ${v.opened}.`;
    case 'most': return `Most things in your bag are drawn ${v.drawn}, so the scene opened ${v.opened}.`;
    case 'player': return `Your bag has as many things drawn from the side as from above, so the scene opened ${v.opened}, the way the first character in your bag is drawn.`;
    case 'even': return `Your bag has as many things drawn from the side as from above, so the scene opened ${v.opened}.`;
    case 'chosen': return `You switched to ${v.switched}.`;
    default: return '';
  }
}
