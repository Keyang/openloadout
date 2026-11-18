// Playground: how the layers of a background slide behind the scene (docs/style-guide.md section 7).
// Each layer moves at its own share of the camera's speed, the far one slowest. Pure JavaScript: no DOM.

/** The share of the camera's speed for the three standard layers. */
export const SCROLL = { far: 0.1, mid: 0.4, near: 0.7 };

/**
 * How fast a layer slides: by its clip name (far 0.1, mid 0.4, near 0.7); a background with other
 * clip names spreads its layers from 0.1 (the first clip, the farthest) to 0.7 (the last).
 */
export function layerSpeed(clip, index, count) {
  if (SCROLL[clip] !== undefined) return SCROLL[clip];
  return count <= 1 ? SCROLL.far : SCROLL.far + ((SCROLL.near - SCROLL.far) * index) / (count - 1);
}

/** How far a layer has slid to the left, in whole pixels, wrapped at its width (it repeats sideways). */
export function layerShift(cameraX, speed, width) {
  const s = Math.floor(cameraX * speed + 1e-6);
  return ((s % width) + width) % width;
}

// what is drawn first (behind) to last (in front) in side view
const SIDE_ORDER = { prop: 0, effect: 0, pickup: 1, npc: 2, creature: 2, player: 3, projectile: 4 };

/**
 * The order to draw things in. things: [{ n, role, y, passing }] (y: the pivot row, where it stands).
 * mode 'top': by pivot row, the smaller y first, so whoever stands below a tree's foot is in front of it and whoever
 * stands above it is behind (what a game that sorts by the pivot row shows). mode 'side': props, pickups, creatures,
 * the player, then things passing through (a projectile, a burst). Ties keep the order things were made in.
 */
export function drawOrder(things, mode) {
  const list = [...things];
  if (mode === 'top') return list.sort((a, b) => a.y - b.y || a.n - b.n);
  const rank = (t) => (t.passing ? 5 : SIDE_ORDER[t.role] ?? 0);
  return list.sort((a, b) => rank(a) - rank(b) || a.n - b.n);
}
