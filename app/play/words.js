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
