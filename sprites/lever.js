// Lever: a handle on a stone base that leans left when off and right when on, with a lamp on
// the base that lights when it is on. Three builds share one handle: a floor lever, a tall wall
// plate with a knife switch, and a crank whose toothed wheel stands in a stone block and turns
// with the handle. `pull` throws the handle across, past its stop and back (the clank lands on
// the frame it hits the stop). Stone, metal fitting and handle are three layers, each inked once.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, PI } from '../engine/motion.js';
import { ramp, tone, INK } from '../engine/color.js';
import { Surface, ellipseIn, rectIn } from '../engine/surface.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { twinkle } from '../engine/fx.js';
import { toothedIn } from '../engine/mech.js';
import { clippedIn } from '../engine/shapes.js';

const P = PALETTE.thornwood;
const W = 32, CX = 16, GROUND = 29;       // the lowest body row; its outline lands on the pivot row
// pull, frame by frame, as a share of the full throw: off, moving, slammed past the stop, bounced back, settling, on
const THROW = [-1, -0.3, 1.22, 0.88, 1.05, 1];

// Per build: where the handle turns, how far it leans (radians from upright) and where the lamp is.
const BUILD = {
  floor: { px: CX, py: 22, lean: 0.62, reach: [9, 14], lamp: [14, 27, 4, 2] },
  wall: { px: CX, py: 20, lean: 0.8, reach: [8, 12], lamp: [14, 25, 4, 2] },
  crank: { px: CX, py: 20, lean: 0.6, reach: [12, 15], lamp: [14, 26, 4, 2] },
};
const WHEEL = 7;                          // the crank's wheel, px from its hub to the tooth tips

// Everything except the handle: the stone goes on `g`, the metal the handle turns on goes on `m`, a layer
// of its own, so each gets one ink line. a: the handle's angle (the crank's wheel turns with it).
function base(g, m, p, B, a) {
  const stone = ramp(p.stone), metal = ramp(p.metal);
  if (p.style === 'floor') {
    // a wide slab with a raised block, and a metal hump the handle comes out of
    g.blob([rectIn(6, 26, 20, 4), rectIn(10, 23, 12, 3)], stone, { shade: 2 });
    g.rect(10, 23, 12, 1, stone.light);
    g.rect(6, 26, 4, 1, stone.light).rect(22, 26, 4, 1, stone.light);
    m.fill(11, 19, 21, 23, clippedIn(ellipseIn(CX, 23, 4, 3.4), -Infinity, -Infinity, Infinity, 23), metal, { light: 1 });
  } else if (p.style === 'wall') {
    // a tall plate with a rounded top and a metal slot the handle swings in
    g.blob([rectIn(10, 12, 12, 18), ellipseIn(CX, 12.5, 6, 4)], stone, { shade: 2 });
    g.rect(11, 28, 10, 1, stone.dark);                                       // the foot of the plate
    m.rect(12, 19, 8, 3, metal, { light: 1 });
    m.rect(13, 20, 6, 1, tone(p.metal, -1.6));
  } else {
    // a stone block with a toothed metal wheel standing in it: the wheel turns with the handle. Its teeth
    // are one flat tone and its face is shaded as a disc; the hub is much darker than the wheel and the handle
    g.blob([rectIn(8, 24, 16, 6)], stone, { shade: 2 });
    g.rect(8, 24, 16, 1, stone.light);
    m.fill(B.px - WHEEL, B.py - WHEEL, B.px + WHEEL, B.py + WHEEL, toothedIn(B.px, B.py, WHEEL, 8, 2.5, a), metal.base);
    m.ellipse(B.px, B.py, WHEEL - 2.5, WHEEL - 2.5, metal, { light: 1 });
    m.ellipse(B.px, B.py, 2, 2, tone(p.metal, -1.5));
  }
}

export default defineSprite({
  id: 'lever',
  name: 'Lever',
  kind: 'Item',
  blurb: 'A lever that is pulled from off to on, with a lamp that lights. Make it a floor lever, a wall switch or a crank, and change its handle, knob and colours.',
  meta: { type: 'prop', role: 'world/prop', themes: ['fantasy', 'forest'], gameTypes: ['platformer'], view: 'side',
    words: ['lever', 'switch', 'crank', 'handle', 'pull', 'toggle', 'activate', 'puzzle', 'mechanism', 'stone', 'trigger'], license: 'draft' },
  size: [W, W],
  pivot: [CX, GROUND + 1],
  params: {
    style: choice('Style', 'floor', [{ value: 'floor', label: 'Floor lever' }, { value: 'wall', label: 'Wall switch' }, { value: 'crank', label: 'Crank' }]),
    length: range('Length', 0.5, { lo: 'Short', hi: 'Long' }),
    knob: toggle('Knob', true),
    stone: color('Stone', P.stone, swatches('thornwood', 'stone')),
    metal: color('Metal', P.steel, swatches('thornwood', 'metal')),
    accent: color('Knob and lamp', P.crimson, swatches('thornwood', 'accent')),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    off: { frames: 1, fps: 8, loop: true },
    pull: { frames: 6, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false },
    on: { frames: 1, fps: 8, loop: true },
  },
  sounds: { pull: [{ sound: 'lever-clank', preset: 'Lever', frame: 2, volume: 0.8 }] },

  render(g, { clip, frame, p }) {
    const B = { ...BUILD[p.style] };
    const L = Math.round(lerp(B.reach[0], B.reach[1], p.length));
    const share = clip === 'off' ? -1 : clip === 'on' ? 1 : THROW[frame] ?? 1;
    const a = share * B.lean;                                                // from upright: negative leans left
    const lit = clip === 'on' || (clip === 'pull' && frame >= 2);
    const slam = clip === 'pull' && frame === 2;
    const metal = ramp(p.metal), accent = ramp(p.accent);

    // three layers, each with its own ink line, so the handle never melts into what is behind it and no line doubles
    const stone = new Surface(W, W), fitting = new Surface(W, W), handle = new Surface(W, W);
    base(stone, fitting, p, B, a);
    const tx = B.px + Math.sin(a) * L, ty = B.py - Math.cos(a) * L;
    handle.limb(B.px, B.py, tx, ty, 2, metal, { light: 1 });
    if (p.knob) handle.ellipse(Math.round(tx), Math.round(ty), 3, 3, accent, { light: 1 });
    else handle.limb(B.px + Math.sin(a) * (L - 3), B.py - Math.cos(a) * (L - 3), tx, ty, 3, { base: metal.dark, dark: tone(p.metal, -1.8), light: metal.base });   // a plain grip
    // floor and wall: the handle comes out of the fitting, in front of everything. Crank: the arm is fixed behind
    // the wheel, so the whole toothed rim shows, and the wheel stands in the block, behind its front
    for (const layer of p.style === 'crank' ? [handle, fitting, stone] : [stone, fitting, handle]) g.blit(layer.outline(INK));

    // the lamp: a dull stone when off, bright when on, white on the frame the handle hits its stop
    const [lx, ly, lw, lh] = B.lamp;
    g.rect(lx, ly, lw, lh, slam ? '#ffffff' : lit ? accent.light : tone(p.accent, -1.7), { outline: INK });
    if (lit && !slam) g.rect(lx + lw - 2, ly, 1, 1, '#ffffff');

    // light and motion marks go on after the outline
    if (clip === 'pull' && (frame === 1 || frame === 2)) {
      // the sweep of the handle: a thin arc behind its tip
      const from = PI + B.lean * (frame === 1 ? 1 : -0.1), to = PI - a + (frame === 1 ? 0.25 : 0.3);
      g.arc(B.px, B.py, L + 1.5, from, to, 1, tone(p.metal, 0.9), { clip: (px, py) => px >= 1 && py >= 1 && px < W - 1 && py < GROUND });
    }
    if (lit) twinkle(g, lx + lw + 1, ly - 1, slam ? 2 : 1, accent.light);
  },
});
