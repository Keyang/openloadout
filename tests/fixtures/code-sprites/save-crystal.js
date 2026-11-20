// FROZEN COPY, not a sprite: sprites/save-crystal.js as it was on 2026-11-20 (migration batch P5), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only for the tests about the framework its code uses (tests/helpers/library.mjs
// codeSprite, codeSpriteSource); imports point at ../../../. Never edit it; the build never scans tests/.
// Save crystal: a big cut crystal that floats over a low pedestal on the Hearthvale map, turning slowly inside a
// glow that swells and sinks. `activate` (the game is saved): it flashes white, two rings of light rise from
// under it and fade, and it settles; the last frame is the first frame of `idle` again.
// The crystal and its glow are the framework's (engine/crystals.js), the band of light that crosses it is the
// pickups' (engine/pickups.js), the rings, the flash and the sparkles are effects (engine/fx.js), putting a ring's
// far half behind the crystal and its near half in front is engine/orbits.js, and the stone pedestal is a solid
// (engine/solids.js). This file says how big each is, where it floats and what happens when.
import { defineSprite, range, choice, color, toggle } from '../../../engine/sprite.js';
import { lerp, wave, pulse, keys, clamp } from '../../../engine/motion.js';
import { ramp, mix, INK } from '../../../engine/color.js';
import { Surface, ellipseIn } from '../../../engine/surface.js';
import { PALETTE, swatches } from '../../../engine/palettes.js';
import { steps, glow, ring, sparkles } from '../../../engine/fx.js';
import { glint } from '../../../engine/pickups.js';
import { extrude } from '../../../engine/solids.js';
import { drawCrystal, drawAura } from '../../../engine/crystals.js';
import { around, orbitHoop } from '../../../engine/orbits.js';

const HV = PALETTE.hearthvale;
const W = 32, H = 48, CX = 16, GROUND = 45;           // the lowest body row; its outline lands on the pivot row
// Half the width of each cut as a share of half its height.
const WIDE = { shard: 0.56, prism: 0.5, orb: 1, star: 0.74 };
// activate, frame by frame: up (px the crystal has risen), white (it is all white), burst (radius of the flash
// behind it), ring1 / ring2 (how far each ring of light has risen, 0 under the crystal to 1 at the top)
const ACT = [
  { up: 0 },
  { up: -1, white: true, burst: 5 },                   // it dips and flashes (the sound starts here)
  { up: 2, burst: 8, ring1: 0 },
  { up: 3, ring1: 0.3, ring2: 0 },
  { up: 3, ring1: 0.62, ring2: 0.28 },
  { up: 2, ring1: 0.9, ring2: 0.58 },
  { up: 1, ring2: 0.88 },
  { up: 0 },                                           // settled: idle's first frame
];

// The pedestal, drawn on its own layer with its foot on the ground row. Returns the row of its top.
function pedestal(g, p) {
  if (p.pedestal === 'none') return GROUND - 2;        // nothing under it: the crystal hangs just over the ground
  const s = p.pedestalSize, layer = new Surface(W, H);
  if (p.pedestal === 'stone') {
    // two round steps and a shallow dish
    const rx = Math.round(10 * s), h = Math.round(lerp(2, 4, clamp((s - 0.65) / 0.7)));
    const foot = extrude(layer, ellipseIn(CX, 30, rx, 3.4), h, p.pedestalColour, { lip: 1, shade: 2 });
    extrude(layer, ellipseIn(CX, 27.5, rx - 4, 2.4), 2, p.pedestalColour, { lip: 1 });
    layer.ellipse(CX, 27.5, Math.max(1.5, rx - 7), 1.2, foot.ramps.wall.dark);
  } else {
    // roots: a low knot of them, two reaching up to either side like the prongs of a cradle (the biggest ones
    // grow taller, not wider: they stop two px short of the frame's sides)
    const R = ramp(p.pedestalColour), out = Math.min(10 * s, CX - 4), up = 8 * s;
    layer.ellipse(CX, 30, 7 * s, 2.6, R, { shade: 1 });
    for (const side of [-1, 1]) {
      layer.limb(CX + side * out, 31.5, CX + side * out * 0.5, 29, 3, R);                          // along the ground
      layer.limb(CX + side * out * 0.5, 29.5, CX + side * (out * 0.6 + 1), 31 - up * 0.6, 3, R);  // up
      layer.limb(CX + side * (out * 0.6 + 1), 31 - up * 0.6, CX + side * out * 0.42, 31 - up, 2, R);   // and curling in
    }
    layer.limb(CX - 3 * s, 30, CX + 2 * s, 28, 2, { base: R.dark, dark: R.dark, light: R.base });     // one root lying across the knot
  }
  layer.outline(INK);
  const b = layer.bounds();
  g.blit(layer, 0, GROUND + 1 - b.y1);
  return b.y0 + GROUND + 1 - b.y1;
}

export default defineSprite({
  id: 'save-crystal',
  name: 'Save crystal',
  kind: 'Item',
  blurb: 'A glowing crystal that floats over a pedestal and flashes when the game is saved; change its cut, size, ring, pedestal, colours, float and pulse.',
  meta: {
    type: 'prop',
    role: 'world/prop',
    themes: ['fantasy'],
    gameTypes: ['turn-based-rpg', 'top-down-rpg'],
    view: 'top-down',
    words: ['save', 'crystal', 'save point', 'checkpoint', 'shrine', 'gem', 'glow', 'float', 'activate', 'magic', 'pedestal', 'heal'],
    license: 'draft',
  },
  size: [W, H],
  pivot: [CX, 46],
  preview: 'idle',
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shape', 'shard', ['shard', 'prism', 'orb', 'star']),
    rings: toggle('Ring', true),
    // pedestal
    pedestal: choice('Pedestal', 'stone', ['stone', 'roots', 'none']),
    pedestalSize: range('Size', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Small', hi: 'Big' }),
    pedestalColour: color('Colour', HV.cobble, [HV.cobble, HV.flagstone, HV.slate, HV.wood, HV.path, HV.cream]),
    body: color('Crystal', HV.magic, swatches('hearthvale', 'gem')),
    glow: color('Glow', HV.cream, [HV.cream, HV.thunder, HV.sky, HV.ice, HV.fire]),
    bob: range('Float', 0.5, { lo: 'Still', hi: 'Floaty', group: 'Motion' }),
    flicker: range('Flicker', 0.5, { lo: 'Steady', hi: 'Wild', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  parts: { pedestal: { label: 'Pedestal', params: ['pedestal', 'pedestalSize', 'pedestalColour'], none: 'none' } },
  clips: {
    idle: { frames: 8, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: true, label: 'Glow' },
    activate: { frames: 8, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false },
  },
  sounds: { activate: [{ sound: 'save-chime', preset: 'Save point', frame: 1, volume: 0.8 }] },

  render(g, { clip, t, frame, p }) {
    const act = clip === 'activate' ? ACT[frame] : null;
    // the orb is a ball, so it is as wide as it is tall, and a little shorter than the other cuts
    const tall = Math.round(lerp(8, 12, p.size)), ry = p.shape === 'orb' ? Math.round(tall * 0.78) : tall;
    const rx = Math.max(3, Math.round(ry * WIDE[p.shape]));
    const light = steps(p.body, { core: p.glow });                      // white, the glow, between, the crystal, its rim

    // behind everything: the pedestal, then where the crystal floats this frame (3 px over the pedestal at rest)
    const top = pedestal(g, p);
    const float = act ? act.up : Math.round(lerp(0, 2, p.bob) * wave(t));
    // (a big crystal on a big pedestal has little room over it: it then floats less high)
    const rest = Math.max(ry + 5, top - 4 - ry), cy = Math.max(ry + 5, rest - float);
    const turn = act ? keys(t, [[0, 0], [0.15, 0], [0.85, 1], [1, 1]]) : t;

    // the crystal on its own layer, so that only it is inked and its glow can lie under it
    const body = new Surface(W, H);
    const stone = drawCrystal(body, CX, cy, rx, ry, p.body, { cut: p.shape, turn });
    if (!act) glint(body, stone, { x: CX, y: cy, r: ry, phase: lerp(-1.7, 1.7, clamp((t - 0.05) / 0.5)), width: 0.13, colour: mix(light[1], '#ffffff', 0.6) });
    if (act?.white) body.tint('#ffffff');
    body.outline(INK);

    // the glow: it swells and sinks once per loop, further the more it flickers; activate holds it wide
    const swell = act ? (act.white || act.burst ? 3 : act.ring1 !== undefined || act.ring2 !== undefined ? 2 : 1) : 1 + Math.round(lerp(0, 2.4, p.flicker) * pulse(t));
    // (the flash is a round disc at every size: it grows no further than the room the frame leaves round it)
    if (act?.burst) glow(g, CX, cy, Math.min(rx + act.burst, CX - 2, cy - 2), light.slice(1), { box: [1, 1, W - 1, top] });
    drawAura(g, body, { reach: swell, colours: [light[1], light[2], light[3]], box: [1, 1, W - 1, H - 1] });

    // round it, each with its far half behind the crystal and its near half in front (innermost first):
    // activate: two rings of light rise from under it, thin out and break up
    const rising = (act ? [act.ring1, act.ring2] : []).filter((k) => k !== undefined).map((k) => ({ t: k, x: CX, y: Math.round(lerp(cy + ry + 1, cy - ry - 3, k)), r0: rx + 6, r1: rx + 6, thick: 2, squash: 0.32, colours: light, seed: 2, box: [1, 1, W - 1, H - 1] }));
    const rings = rising.map((o) => ({ y: o.y, draw: (layer) => ring(layer, o) }));
    // a thin ring of light round its waist, with a bright bead that runs round it
    if (p.rings) rings.push(orbitHoop({ cx: CX, cy: cy + 1, rx: rx + 5, ry: 2.6, thick: 1, back: light[3], front: light[1], bead: { turn: t, colour: light[1] } }));
    around(g, body, rings);

    if (!act) {
      // motes of light that twinkle round it
      sparkles(g, { t, count: 4, seed: 3, big: false, colours: light, area: [CX - rx - 7, cy - ry - 4, CX + rx + 8, cy + ry + 2], box: [1, 1, W - 1, top] });
    } else {
      // the last of the light
      if (frame === 6) { g.dot(CX - rx - 3, cy - ry - 2, light[2]); g.dot(CX + rx + 3, cy - ry, light[2]); }
    }
  },
});
