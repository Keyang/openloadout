// Pickup helpers: what every collectable shares, so that coins, gems, hearts, keys and cells of
// every kit float, pop and burst the same way (docs/style-guide.md section 4, "Pickup"). The two
// standard clips, where the thing is in each frame of them, the burst of sparkles a collected thing
// leaves, the glints that make it catch the eye, and two things pickups are often made of: a cut gem
// and a corked bottle with liquid in it. Shapes come from shapes.js, sparkles from fx.js.
//
// A pickup is data (sprites/gem.json, sprites/coin.json); the pickup generators and ports in engine/gen/ draw with these
// (engine/gen/props-p5.js calls glint; engine/gen/ports/pickups.js holds copies of the rest). No sprite file imports this module.
// The order a pickup is drawn in, for the code that draws one (pickupClips() gives the clips: idle 8 (loop), collect 8):
//     const at = pickupPose(clip, t, { bob, pop, cy: 17, up: ry + 1 });   // where it is this frame
//     if (at.show) {
//       const gem = drawGem(g, 16, at.y, rx * at.sx, ry * at.sy, body, { cut });
//       glint(g, gem, { x: 16, y: at.y, r: rx, phase: lerp(-1.6, 1.6, t) });             // before the outline: it is on the body
//       if (at.flash) g.tint('#ffffff');
//       g.outline(INK);
//     }
//     if (clip === 'idle') gleam(g, 16 + rx, at.y - ry, t, '#ffffff');                    // after the outline: it is light
//     collectBurst(g, { burst: at.burst, x: 16, y: at.y, r: rx, colour: body, sparkle });
//
// The collect clip, frame by frame (8 frames, t = frame / 7): 0 rest, 1 dip and squash (the sound starts
// here), 2 to 3 stretch and rise, 4 at the top, a little bigger and all white, 5 half size among sparkles,
// 6 sparkles only, 7 three pixels that are always left, whatever the settings.

import { ramp, mix } from './color.js';
import { lerp, wave, keys, clamp, fract, easeOut, hash, PI } from './motion.js';
import { twinkle } from './fx.js';
import { polyIn } from './surface.js';
import { placedIn, insetIn, gemIn, gemFacets, bottleIn } from './shapes.js';

/**
 * The two standard clips of a pickup, `idle` (8 frames, loops) and `collect` (8 frames, plays once), with the speed control wired into both.
 * Arguments: options { idle (frames per second of idle at speed 0.5, default 10), collect (default 14) }. The sprite needs a `speed` control.
 */
export function pickupClips({ idle = 10, collect = 14 } = {}) {
  const fps = (base) => (p) => base * lerp(0.65, 1.45, p.speed);
  return { idle: { frames: 8, fps: fps(idle), loop: true }, collect: { frames: 8, fps: fps(collect), loop: false } };
}

/**
 * Where a pickup is in a frame of `idle` (floating) or `collect` (dip, pop up, flash, shrink): returns { y, sx, sy, scale, flash, burst, show, bare }.
 * Arguments: clip ('collect', or anything else for the float); t (clip phase 0..1); options { bob, pop (the controls, 0..1), cy (resting centre y), up, down (pixels from cy to its top and bottom edge, outline included), side (pixels from the middle of the frame to its left or right edge, default up), frame (frame height, default 32), width (frame width, default frame), float (false: no float in idle) }. y is the centre this frame; sx, sy the squash times scale; flash: tint it white; burst 0..1: pass to collectBurst; show false: draw no body; bare: leave small details out. The float, the pop, the squash and the stretch all shrink to fit the frame.
 */
export function pickupPose(clip, t, { bob = 0.5, pop = 0.5, cy = 16, up = 10, down = up, side = up, frame = 32, width = frame, float = true } = {}) {
  const above = cy - 1 - up, below = frame - 1 - (cy + down);
  if (clip !== 'collect') {
    const f = float ? Math.max(0, Math.min(lerp(0, 2, bob), Math.floor(above), Math.floor(below))) : 0;
    return { y: cy - Math.round(f * wave(t)), sx: 1, sy: 1, scale: 1, flash: false, burst: 0, show: true, bare: false };
  }
  const swell = above >= 3 ? 1.1 : 1;                              // a little bigger on the flash frame, when there is room
  const room = Math.max(0, cy - 1 - up * swell);                   // how far it can rise
  const top = Math.max(0, lerp(0.45, 1, pop) * Math.min(7, room - 1));
  const lift = Math.round(keys(t, [[0, 0], [0.14, below >= 1 ? -1 : 0], [0.45, top], [0.6, top + Math.min(1, room)], [1, top + Math.min(1, room)]]));
  const sq = keys(t, [[0, 0], [0.14, 0.2], [0.3, -0.18], [0.5, 0], [1, 0]]);
  const scale = keys(t, [[0, 1], [0.5, 1], [0.58, swell], [0.75, 0.5], [0.86, 0]]);
  // never wider or taller than the frame allows where it is this frame
  const sx = Math.min(scale * (1 + sq), Math.max(1, (width / 2 - 1) / side));
  const sy = Math.min(scale * (1 - sq), Math.max(1, Math.min((cy - lift - 1) / up, (frame - 1 - cy + lift) / down)));
  return { y: cy - lift, sx, sy, scale, flash: t > 0.5 && t < 0.65, burst: clamp((t - 0.6) / 0.4), show: scale > 0.3, bare: scale < 0.9 };
}

/**
 * A heartbeat over one loop: two quick swells (at 1/8 and 3/8 of the loop, half let go between them) and then rest. Returns 0 to 1.
 * Arguments: t (loop phase 0..1; frames 1 and 3 of an 8-frame loop are the two beats).
 */
export function heartbeat(t) {
  return keys(fract(t), [[0, 0], [0.125, 1], [0.25, 0.4], [0.375, 0.9], [0.5, 0.35], [0.625, 0.1], [0.75, 0], [1, 0]], (x) => x);
}

/**
 * A slanted bright band that slides across a shape: the glint on a coin, a gem or a blade. Draw it before the outline.
 * Arguments: g (the Surface); test (shape test the band is kept inside); o: { x, y (centre of the shape), r (half its size), phase (-1.6 off one side, 0 across the middle, 1.6 off the other), slant (how much it leans, default 0.5; 0 is upright), width (half its width as a share of r, default 0.15), colour (default white) }.
 */
export function glint(g, test, { x, y, r, phase = 0, slant = 0.5, width = 0.15, colour = '#ffffff' }) {
  const band = (px, py) => Math.abs((px - x) / r + (slant * (py - y)) / r - phase) < width && test(px, py);
  g.fill(x - r - 2, y - r - 2, x + r + 2, y + r + 2, band, colour);
}

/**
 * A twinkle that flares up once per loop and is gone the rest of it: the sparkle on a corner of something shiny. Draw it after the outline.
 * Arguments: g (the Surface); x, y (where); t (loop phase 0..1); colour (of its arms; the centre is white); options { at (the phase it is biggest, default 0), big (its biggest size: 1 a plus, 2 a big plus; default 2), box }.
 */
export function gleam(g, x, y, t, colour, { at = 0, big = 2, box } = {}) {
  const d = Math.abs(fract(t - at + 0.5) - 0.5);
  const size = d < 0.07 ? big : d < 0.19 ? big - 1 : -1;
  if (size >= 0) twinkle(g, x, y, size, colour, { box });
}

/**
 * The burst a collected pickup leaves: a twinkle where it was and a ring of sparkles that spreads; the last frame is three pixels, whatever the settings. Draw it after the outline.
 * Arguments: g (the Surface); o: { burst (0..1, from pickupPose; 0 draws nothing), x, y (centre), r (half the size of the pickup), colour (its main colour), sparkle (false: no ring of twinkles, only the centre and the three pixels) }.
 */
export function collectBurst(g, { burst = 0, x, y, r, colour, sparkle = true }) {
  if (burst <= 0) return;
  const C = ramp(colour), light = mix(C.light, '#ffffff', 0.35);
  const far = Math.max(3, Math.min(r + 3, x - 3, g.w - 3 - x, y - 3, g.h - 3 - y));
  const d = lerp(3, far, easeOut(burst));
  const last = burst >= 0.8;
  for (let i = 0; i < 6; i++) {
    const a = (i + 0.5) * (PI / 3);
    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.9;
    if (i % 2 === 0) {
      if (last || !sparkle || burst <= 0.2) g.dot(px, py, light);
      else twinkle(g, px, py, 1, C.base);
    } else if (sparkle && !last && burst > 0.2) g.dot(px, py, light);
  }
  if (!last) twinkle(g, x, y, burst < 0.5 ? 2 : 1, light);
}

/**
 * Draw a cut gem that fills the box cx ± rx, cy ± ry, lit from the top right; returns its silhouette as a shape test (for a glint).
 * Arguments: g (the Surface); cx, cy (centre); rx, ry (half its width and height in pixels); colour; options { cut (one of GEM_CUTS in shapes.js, default 'diamond'), facets (true: flat facets in four tones; false: a smooth polished stone) }. Call g.outline afterwards.
 */
export function drawGem(g, cx, cy, rx, ry, colour, { cut = 'diamond', facets = true } = {}) {
  const R = ramp(colour), stone = gemIn(cx, cy, rx, ry, cut);
  const box = [cx - rx - 1, cy - ry - 1, cx + rx + 1, cy + ry + 1];
  g.fill(...box, stone, R, { shade: Math.min(rx, ry) >= 6 ? 2 : 1, light: 1 });
  if (!facets) {
    // a polished stone: one bright window towards the light, with a white spot in it
    const wx = cx + 0.24 * rx, wy = cy - 0.3 * ry, keep = insetIn(stone, 1);
    g.fill(...box, gemIn(wx, wy, rx * 0.48, ry * 0.48, cut), R.light, { clip: keep });
    g.fill(...box, gemIn(wx + 0.14 * rx, wy - 0.12 * ry, Math.max(1, rx * 0.2), Math.max(1, ry * 0.2), 'round'), '#ffffff', { clip: keep });
  } else {
    const tones = { 2: mix(R.light, '#ffffff', 0.55), 1: R.light, 0: R.base, [-1]: R.dark };
    for (const f of gemFacets(cx, cy, rx, ry, cut)) g.fill(...box, polyIn(f.pts), tones[f.tone] ?? R.base, { clip: stone });
  }
  return stone;
}

/**
 * Draw a corked glass bottle h pixels tall with liquid in it, centred on (cx, cy); returns { body, inner, wet } as shape tests (the glass, its cavity, the liquid).
 * Arguments: g (the Surface); cx, cy (centre; an odd h needs cy ending in .5); h (height with the cork, whole pixels); o: { shape (one of BOTTLE_SHAPES in shapes.js), glass, liquid, cork (colours), level (0 nearly empty to 1 full), tilt (slope of the liquid's surface, pixels down per pixel to the right), bubbles (how many rise through the liquid), t (loop phase for the bubbles), sx, sy (squash, default 1), shine (false: no highlight on the glass) }. Call g.outline afterwards.
 */
export function drawBottle(g, cx, cy, h, { shape = 'round', glass = '#f0ead8', liquid = '#c9423a', cork = '#a06a3c', level = 0.7, tilt = 0, bubbles = 0, t = 0, sx = 1, sy = 1, shine = true } = {}) {
  const B = bottleIn(h, shape);
  const place = (f) => placedIn(f, cx, cy, { sx, sy });
  const body = place(B.glass), inner = insetIn(body, 1);
  const G = ramp(glass), L = ramp(liquid);
  const box = [cx - (B.half + 2) * sx, cy - (h / 2 + 2) * sy, cx + (B.half + 2) * sx, cy + (h / 2 + 2) * sy];
  g.fill(...box, place(B.cork), ramp(cork));
  g.fill(...box, body, G, { shade: 1, light: 1 });
  const floor = cy + B.fill[1] * sy, surface = cy + lerp(B.fill[1] - 2, B.fill[0], clamp(level)) * sy;
  const wet = (px, py) => py >= surface + tilt * (px - cx) && inner(px, py);
  g.fill(...box, wet, L, { shade: 1 });
  g.fill(...box, (px, py) => wet(px, py) && !wet(px, py - 1), L.light);          // the surface of the liquid
  for (let i = 0; i < bubbles; i++) {
    const life = fract(t + hash(i, 5) * (i ? 1 : 0));
    const bx = Math.floor(cx + (i ? (hash(i, 3) - 0.5) * B.half * sx : -1)), by = Math.floor(lerp(floor - 1, surface + 1, life));
    const big = i === 0 && life < 0.75;
    for (const [ox, oy] of big ? [[0, 0], [1, 0], [0, 1], [1, 1]] : [[0, 0]]) if (wet(bx + ox + 0.5, by + oy + 0.5)) g.dot(bx + ox, by + oy, L.light);
  }
  if (shine) g.fill(...box, placedIn(B.shine, cx, cy, { sx, sy }), '#ffffff', { clip: inner });
  return { body, inner, wet };
}
