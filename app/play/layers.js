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
