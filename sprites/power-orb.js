// Power orb (core-sprites-1, batch K02): a generic power-up. A glowing shell (a ball, a six-sided
// prism or a four-sided shard) turns slowly about its upright axis with a mark floating in it (an
// arrow up, a sun, a star), a soft glow round it and a thin, level metal ring circling it, its back
// half behind the shell. The mark says what kind of power it is. Collecting it is the standard
// pickup pop (engine/pickups.js). Built from drawCrystal (engine/crystals.js), drawMark
// (engine/marks.js), around and orbitHoop (engine/orbits.js); this file gives them size and motion.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, wave, pulse, clamp } from '../engine/motion.js';
import { INK, ramp, pick, mix } from '../engine/color.js';
import { Surface, masked } from '../engine/surface.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { pickupClips, pickupPose, collectBurst, glint, gleam } from '../engine/pickups.js';
import { steps } from '../engine/fx.js';
import { drawCrystal, drawAura } from '../engine/crystals.js';
import { around, orbitHoop } from '../engine/orbits.js';
import { drawMark } from '../engine/marks.js';

const P = PALETTE.thornwood;
const CX = 16, CY = 16;
const W = 32;
// Half width and half height of each shell at the smallest and the biggest size, in pixels.
const SHELLS = { orb: { rx: [5, 7], ry: [5, 7] }, prism: { rx: [4, 5], ry: [7, 9] }, shard: { rx: [5, 5], ry: [7, 10] } };
// Where the mark's centre and the hoop's middle sit below the shell's centre, and whether the mark drifts: the
// narrow shard holds its mark still at its widest row, with the hoop lower down.
const PLACE = { orb: { mark: -1, hoop: 3, drift: 1 }, prism: { mark: -1, hoop: 3, drift: 1 }, shard: { mark: 0, hoop: 4, drift: 0 } };
const MARK = { arrow: { name: 'arrow', turn: 3 }, sun: { name: 'sun' }, star: { name: 'star' } };
// The 'up' arrow: marks.js's arrow at 7 px has a 1 px shaft under a 5 px head, which reads as a cross. Here
// the head widens a pixel each side per row from a 1 px point to the full width (1, 3, 5, 7 at 7 px; 1, 3, 5 at 5 px) and the
// shaft under it is 3 px wide (1 px at 5 px), so the top reads as a chevron with nothing like a crossbar.
const arrowUpIn = (x, y, size) => {
  const n = Math.max(2, (size - 1) >> 1), half = n >= 3 ? 1 : 0, tip = y - n;
  const head = n;                                                    // the head ends at the full width
  return (px, py) => {
    const i = Math.abs(Math.floor(px) - x), j = Math.floor(py) - tip;
    if (j < 0 || j > 2 * n) return false;
    return j < head + 1 ? i <= j : i <= half;
  };
};

export default defineSprite({
  id: 'power-orb',
  name: 'Power orb',
  kind: 'Item',
  blurb: 'A floating power-up: a glowing shell with a mark inside and a ring around it, turning slowly. Change the shell, the mark, the ring, its size, sparkle and colours.',
  meta: { type: 'pickup', role: 'items/pickup', themes: ['neutral', 'fantasy', 'sci-fi'], gameTypes: ['arcade', 'platformer', 'shooter', 'roguelike-action'], view: 'front',
    words: ['power', 'powerup', 'orb', 'boost', 'buff', 'energy', 'crystal', 'sphere', 'upgrade', 'collect', 'pickup', 'glowing', 'magic'], license: 'draft' },
  size: [32, 32],
  pivot: [16, 30],
  grounded: false,
  preview: 'idle',
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shell', 'orb', ['orb', 'prism', 'shard']),
    mark: choice('Mark', 'star', ['arrow', 'sun', 'star', 'none']),
    cage: toggle('Ring', true),
    sparkle: toggle('Sparkle', true),
    glow: color('Glow', P.magic, [...swatches('thornwood', 'glow', { lead: 'magic' }), PALETTE.derelict.cyan]),
    metal: color('Metal', P.steel, [P.steel, P.stone, P.slate, '#c98a4a', PALETTE.hearthvale.rust], { when: { cage: [true] } }),
    bob: range('Float', 0.5, { lo: 'Still', hi: 'Floaty', group: 'Motion' }),
    pop: range('Pop height', 0.5, { lo: 'Low', hi: 'High', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: pickupClips(),
  sounds: { collect: [{ sound: 'star-pickup', preset: 'Chiptune', frame: 1, volume: 0.7 }] },
  versions: [
    { name: 'Blue power', params: {} },
    { name: 'Speed boost', params: { mark: 'arrow', glow: P.ember } },
    { name: 'Sun orb', params: { mark: 'sun', glow: P.gold, metal: P.steel } },
    { name: 'Crystal core', params: { shape: 'prism', cage: false, glow: P.thorn } },
    { name: 'Star shard', params: { shape: 'shard', mark: 'star', glow: PALETTE.derelict.cyan } },
  ],

  render(g, { clip, t, p }) {
    const S = SHELLS[p.shape], rx = Math.round(lerp(...S.rx, p.size)), ry = Math.round(lerp(...S.ry, p.size));
    const hoop = rx + 4;                                 // the ring's outer radius across
    const at = pickupPose(clip, t, { bob: p.bob, pop: p.pop, cy: CY + 1, up: ry + 2, down: ry + 2, side: p.cage ? hoop + 1 : rx + 3 });
    const idle = clip === 'idle';
    const C = steps(p.glow);                             // white, core, mid, edge, rim
    if (at.show) {
      const sx = rx * at.sx, sy = ry * at.sy, cy = at.y;
      // the shell on its own layer, so only it is inked and the glow lies under it
      const body = new Surface(W, W);
      const shell = drawCrystal(body, CX, cy, Math.max(2, sx), Math.max(2, sy), p.glow, { cut: p.shape, turn: idle ? t : 0 });
      if (idle) glint(body, shell, { x: CX, y: cy, r: ry, phase: lerp(-1.6, 1.6, clamp((t - 0.1) / 0.5)), width: 0.12, colour: mix(C[1], '#ffffff', 0.6) });
      // the mark floats just above the middle, drifting a pixel side to side as the shell turns. Its colour is
      // pick(glow, white, ink); an ink mark on a light shell gets a 1 px white halo, so its shape stands clear
      // (the sun's rays apart from its disc) and it never reads as a dark blob
      if (p.mark !== 'none' && !at.bare) {
        const m = MARK[p.mark], ink = pick(p.glow, '#ffffff', INK);
        const mx = CX + (idle ? Math.round(wave(t)) * PLACE[p.shape].drift : 0), my = Math.round(cy) + PLACE[p.shape].mark;
        // the mark scales with the shell: 7 px with a halo where the shell is wide enough round it, else
        // 5 px, and the halo only where it still leaves a ring of glow (the small shard), so glow shows
        let inner = 0;
        for (let x = 0; x < W; x++) if (body.get(x, my)) inner++;
        const size = inner >= 7 + 4 ? 7 : 5, halo = ink === INK && inner >= size + 4;
        const sign = new Surface(W, W);
        if (m.name === 'arrow') sign.fill(mx - 3, my - 3, mx + 4, my + 4, arrowUpIn(mx, my, size), ink, { shade: 0 });
        else drawMark(sign, m.name, mx, my, size, ink, { turn: m.turn ?? 0 });
        const inShell = (x, y) => !!body.get(Math.floor(x), Math.floor(y));          // mark and halo stay inside the shell
        if (halo) body.blit(masked(drawAura(new Surface(W, W), sign, { reach: 1, colours: ['#ffffff'] }), inShell));
        body.blit(masked(sign, inShell));
      }
      if (at.flash) body.tint('#ffffff');
      body.outline(INK);
      // a glow that swells and sinks once per loop
      if (!at.flash) drawAura(g, body, { reach: idle ? 1 + Math.round(pulse(t)) : 1, colours: [C[2], C[3]], box: [1, 1, W - 1, W - 1] });
      const rings = [];
      if (p.cage && !at.bare) {
        const M = ramp(p.metal);
        // the hoop runs round the lower half, below the mark, so the whole mark shows above its front
        rings.push(orbitHoop({ cx: CX, cy: Math.round(cy) + PLACE[p.shape].hoop, rx: Math.min(hoop, 14) * Math.min(1, at.sx), ry: 3, thick: 2, back: M.dark, front: M.base, bead: idle ? { turn: t, colour: C[1] } : null }));
      }
      around(g, body, rings);
    }
    if (idle && p.sparkle) gleam(g, CX + rx, at.y - ry, t, '#ffffff', { at: 0.6 });
    collectBurst(g, { burst: at.burst, x: CX, y: at.y, r: Math.max(rx, ry), colour: p.glow, sparkle: p.sparkle });
  },
});
