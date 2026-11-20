// Prop generators of migration batch P5 (docs/data-sprites.md section 9; the redraw section of the /sprite-forge skill):
// eight interactive props of the station, the forest and the village redrawn as data, each naming one generator here.
// Each is a PORT of the code that drew the prop (the drawing in its old sprite file, word for word, and the engine
// helpers it called), made with engine/gen/port-sprite.js portGenerator as the M9 interface pieces and the E1 and E2
// effect ports are: the old drawing runs on an engine/gen/port-surface.js grid the size of the old frame with paint
// refs where it had colours, so it draws the code's pixels exactly at any colour a person picks (every colour the code
// worked out from a colour is the colour rule of the same function: ramp, tone, mix, textureTone, textureLight,
// faceTone, shadeTo). The old sprite's settings are the generator's arguments, typed; `picture` names the old clip the
// call draws (a data file names the generator once per clip, with that clip's `clip` list); the frame within the clip is
// ctx.frame. A HAND CHANGE note says where the drawing differs from its old file (a choice option with a space is a
// word with a dash: "wall mount" is "wall-mount").
//
//   door.blast@1        sprites/blast-door.js        a heavy station door whose leaves draw back into its frame
//   laser.gate@1        sprites/laser-gate.js        two posts with beams of light between them
//   platform.moving@1   sprites/moving-platform.js   a floating deck to ride, a gear turning under it
//   crystal.save@1      sprites/save-crystal.js      a big crystal floating over a pedestal, flashing when saved
//   saw.blade@1         sprites/saw-blade.js         a spinning circular saw blade
//   pedestal.upgrade@1  sprites/upgrade-pedestal.js  a stand offering an upgrade as a turning hologram
//   terminal.wall@1     sprites/wall-terminal.js     a station computer with a lit screen
//   warp.pad@1          sprites/warp-pad.js          a teleporter platform on the floor
//
// Each declares `units`, the measured work of its heaviest call (every picture, word and flag and each slider's ends
// and middle at every frame; the heaviest found again in a fresh process, the middle of three medians of nine, 1.5 times
// that at 0.01 ms a unit, as the E2 and P4 ports are priced); tests/unit/gen-p5-props.test.mjs holds each to it.
// Pure: no randomness, no clock, no site Surface; runs the same in Node and the browser.
import { portGenerator } from './port-sprite.js';
import { word, flag, share, count, px, paint } from './args.js';
import { ramp, tone, mix, INK } from './ports/colour.js';
import { Surface, masked, ellipseIn, polyIn, capsuleIn } from './ports/e2/surface.js';
import { steps, lamp, puffs, particles, twinkle, glow, ring, sparkles, hologram, meridians, beam } from './ports/e2/fx.js';
import { drawBolt, drawGrate } from './ports/e2/plating.js';
import { around, orbitHoop } from './ports/e2/orbits.js';
import { floorRing, lightShape } from './ports/e2/fx-floor.js';
import { solid, bandIn, stripesIn, ngonPoints, turningCubeIn } from './ports/e2/solids.js';
import { starIn, ringIn, placedIn, turnedIn } from './ports/e2/shapes.js';
import { machineTonesP, shadeToP, extrudeP, wallFillP, chainP, drawCrystalP, drawAuraP } from './ports/p5/helpers.js';
import { doorLeaves, DOOR_STYLES, screenIn, laserBeam, drawCasing, hazardBand } from '../bulkhead.js';
import { toothedIn } from '../mech.js';
import { glint } from '../pickups.js';
import { lerp, wave, pulse, keys, clamp, fract, hash, TAU, PI } from '../motion.js';
import { mix as mixHex } from '../color.js';
import { PALETTE } from '../palettes.js';

const D = PALETTE.derelict, TW = PALETTE.thornwood, HV = PALETTE.hearthvale;

// ---- door.blast@1: sprites/blast-door.js -----------------------------------------------------------------------------

/** door.blast@1: a heavy station door two tiles wide, split, iris or shutter, shut, drawing back into its frame with a hiss of vapour, or clamped shut with its lights blinking red (port of sprites/blast-door.js). */
export const doorBlast = (() => {
  const W = 64, H = 48, CX = 32, GROUND = 45;
  const X0 = 2, FW = 60, TOP = 3, HEAD = 9, POST = 6;
  const HX = X0 + POST, HY = 14, HW = FW - 2 * POST, HH = GROUND - HY + 1;
  const OPEN = [
    { k: 0, red: true, light: 1 },
    { k: 0, light: 2 },
    { k: 0.06, light: 2, steam: 0 },
    { k: 0.32, light: 1, steam: 0.3 },
    { k: 0.7, light: 1, steam: 0.6 },
    { k: 1.06, light: 1, steam: 0.85 },
    { k: 0.95, light: 1, steam: 1 },
    { k: 1, light: 1 },
  ];
  const BLINK = [1, 2, 2, 1, 0.5, 0, 0, 0.5];
  // HAND CHANGE: the code worked the frame's colour out from the two colours' brightness; here that is the shadeTo
  // colour rule (engine/data-rules.js), and the machine tones are the rules machineTones used (ports/p5/helpers.js)
  function tones(p) {
    const B = machineTonesP(p.body), F = machineTonesP(shadeToP(p.hull, { under: p.body, drop: 0.15, floor: 0.16 }));
    return { body: B.base, lit: B.lit, soft: B.soft, seam: B.seam, frame: F.base, ftop: F.soft, flit: F.lit, fseam: F.seam };
  }
  const leavesOf = (p, k) => doorLeaves(p.style, HX, HY, HW, HH, k, { teeth: 2, pitch: 16, stub: p.style === 'iris' ? 0 : 2 });
  function shutDoor(p, T) {
    const s = new Surface(W, H), leaves = leavesOf(p, 0);
    const which = (x, y) => leaves.findIndex((l) => l.rest(x + 0.5, y + 0.5));
    s.rect(HX, HY, HW, HH, T.body);
    if (p.style === 'split') {
      const n = Math.round(lerp(1, 4, p.pieces));
      for (let i = 1; i <= n; i++) { const y = HY + Math.round((i * HH) / (n + 1)) - 1; s.rect(HX, y, HW, 1, T.seam); s.rect(HX, y + 1, HW, 1, T.soft); }
      for (const x of [CX - 8, CX + 6]) { s.rect(x, HY + 10, 2, 5, T.seam); s.rect(x - 1, HY + 10, 1, 5, T.soft); }
    } else if (p.style === 'iris') {
      const n = Math.round(lerp(1, 3, p.pieces));
      for (let y = HY; y < HY + HH; y++) for (let x = HX; x < HX + HW; x++) {
        const name = leaves[which(x, y)].name;
        const d = name === 'top' ? y - HY : name === 'bottom' ? GROUND - y : name === 'left' ? x - HX : HX + HW - 1 - x;
        const pitch = name === 'top' || name === 'bottom' ? 4 : 6;
        if (d % pitch === pitch - 1 && Math.floor(d / pitch) < n) s.dot(x, y, T.seam);
        else if (d % pitch === 0 && d > 0 && Math.floor(d / pitch) <= n) s.dot(x, y, T.soft);
      }
    } else {
      const n = Math.round(lerp(4, 8, p.pieces));
      for (let i = 0; i < n; i++) { const y = HY + Math.round((i * (HH - 3)) / n); s.rect(HX, y, HW, 1, T.lit); if (i) s.rect(HX, y - 1, HW, 1, T.seam); }
      s.rect(HX, GROUND - 2, HW, 3, T.frame); s.rect(HX, GROUND - 3, HW, 1, T.seam);
      s.rect(CX - 5, GROUND - 1, 10, 1, T.flit);
    }
    if (p.stripes) hazardBand(s, HX, GROUND - (p.style === 'shutter' ? 9 : 6), HW, 5, { dark: T.fseam, paint: p.accent, pitch: 8 });
    for (let y = HY; y < HY + HH; y++) for (let x = HX; x < HX + HW; x++) {
      const me = which(x, y);
      if (x + 1 < HX + HW && which(x + 1, y) !== me) { s.dot(x, y, T.lit); s.dot(x + 1, y, INK); }
      if (y + 1 < HY + HH && which(x, y + 1) !== me) { s.dot(x, y, INK); s.dot(x, y + 1, T.lit); }
    }
    return s;
  }
  function drawFrame(g, T) {
    g.rect(X0, TOP, FW, HEAD - TOP, T.ftop);
    g.rect(X0, TOP, FW, 1, T.flit); g.rect(X0, HEAD - 1, FW, 1, T.flit); g.rect(X0 + FW - 1, TOP, 1, HEAD - TOP, T.flit);
    g.rect(X0, HEAD, FW, HY - HEAD, T.frame);
    for (const x of [X0, X0 + FW - POST]) {
      g.rect(x, HY, POST, HH, T.frame);
      g.rect(x + POST - 1, HEAD, 1, GROUND - HEAD + 1, T.ftop);
      g.rect(x + 1, GROUND - 1, POST - 2, 1, T.ftop);
      drawBolt(g, x + 2, HEAD + 1, { lit: T.flit, dark: T.fseam, face: T.ftop });
    }
    g.rect(HX, HY - 1, HW, 1, T.fseam);
    g.rect(CX - 5, HEAD + 1, 10, 3, T.fseam);
  }
  function drawClamp(g, T) {
    const y = HY + 9;
    g.rect(CX - 7, y, 14, 7, T.frame);
    g.rect(CX - 7, y, 14, 1, T.flit); g.rect(CX + 6, y, 1, 7, T.ftop);
    g.rect(CX - 7, y + 6, 14, 1, T.fseam);
    g.rect(CX - 3, y + 2, 6, 3, T.fseam);
    for (const x of [CX - 6, CX + 4]) drawBolt(g, x, y + 2, { lit: T.flit, dark: T.fseam, face: T.ftop });
  }
  return portGenerator({
    id: 'door.blast', family: 'shape', units: 220, size: [W, H], origin: [CX, GROUND + 1],
    states: { closed: { frames: 1 }, open: { frames: 8, loop: false }, locked: { frames: 8 } },
    about: 'A heavy station door two tiles wide (split, iris or shutter) whose leaves draw back into its frame with a hiss, or stay clamped shut with red lights blinking.',
    args: {
      style: word([...DOOR_STYLES], { default: 'split', about: 'Split halves, an iris of four blades or a rolling shutter' }),
      pieces: share({ default: 0.5, about: 'Panels: few to many seams, ridges or slats' }),
      stripes: flag({ default: true, about: 'Hazard stripes across the foot' }),
      body: paint({ about: 'The door' }),
      accent: paint({ about: 'The hazard stripes' }),
      glowing: paint({ about: 'The status lights' }),
      hull: paint({ about: 'The frame (drawn darker than the door)' }),
    },
    draw(g, { clip, frame, p: q }) {
      const p = { ...q, glow: q.glowing };   // HAND CHANGE: `glow` is a call field, so the argument is `glowing`
      const T = tones(p), o = clip === 'open' ? OPEN[frame] ?? OPEN[7] : { k: 0, light: clip === 'locked' ? BLINK[frame % 8] : 1, red: clip === 'locked' };
      drawFrame(g, T);
      const shut = shutDoor(p, T);
      for (const leaf of leavesOf(p, o.k)) {
        const moved = new Surface(W, H).blit(masked(shut, leaf.rest), leaf.dx, leaf.dy);
        g.blit(masked(moved, leaf.seen));
      }
      if (clip === 'locked') drawClamp(g, T);
      g.outline(INK);
      const colour = o.red ? D.red : p.glow;
      lamp(g, CX - 3, HEAD + 2, 6, 1, colour, o.light);
      for (const x of [X0 + 2, X0 + FW - POST + 2]) lamp(g, x, HY + 6, 2, 2, colour, o.light);
      if (clip === 'locked') lamp(g, CX - 2, HY + 12, 4, 1, D.red, o.light);
      if (o.steam !== undefined) {
        for (const [x, side] of [[HX + 3, 1], [HX + HW - 4, -1]]) {
          puffs(g, { t: o.steam, x, y: GROUND - 2, count: 3, seed: 5 + side, angle: side * 1.1, arc: 0.7, dist: 7, rise: 9, size: 2.4, lobes: 2, floor: GROUND + 1, colours: [D.suit, D.steel, D.panel], box: [HX, HY + 6, HX + HW, GROUND + 1] });
        }
      }
    },
  });
})();

// ---- laser.gate@1: sprites/laser-gate.js -----------------------------------------------------------------------------

/** laser.gate@1: two posts (pylons, orb pedestals or wall rails) with beams of light between them that burn, power down, stand dark or warn before they switch on (port of sprites/laser-gate.js). */
export const laserGate = (() => {
  const W = 64, H = 48, CX = 32, GROUND = 45;
  const ROWS = { one: [26], two: [20, 32], three: [17, 26, 35] };
  const ORB_ROWS = { one: [21], two: [21, 34], three: [21, 32, 38] };
  const SWELL = { 4: [0.15, 1], 6: [0.5, -1], 1: [0.8, 1] };
  const DOWN = [
    { thick: 5, cut: 0, lens: 1 },
    { thick: 3, cut: 0, lens: 2 },
    { thick: 1, cut: 0.3, lens: 1 },
    { thick: 1, cut: 0.62, lens: 0.5, spark: true },
    { thick: 1, cut: 0.88, lens: 0.5 },
    { thick: 0, cut: 1, lens: 0 },
  ];
  const WARN = [{ line: true, light: 2 }, { line: true, light: 1 }, { line: false, light: 0.5 }, { line: true, light: 2 }, { line: false, light: 1 }, { line: false, light: 0 }];
  // HAND CHANGE: the style "wall mount" is the word "wall-mount"
  function dims(p) {
    const gap = 2 * Math.round(lerp(13, 20, p.width)), half = p.style === 'wall-mount' ? 3 : 5;
    return { gap, half, xs: [CX - gap / 2 - half, CX + gap / 2 + half], rows: (p.style === 'orb' ? ORB_ROWS : ROWS)[p.beams] };
  }
  function post(g, p, T, d, side) {
    const cx = d.xs[side < 0 ? 0 : 1], inner = -side, lenses = [], lights = [], tips = [];
    const paintOf = { dark: T.dark, paint: p.accent };
    const nozzle = (from, y) => {
      const x = inner > 0 ? from : from - 3;
      g.rect(x, y - 2, 3, 5, T.dark); g.rect(x, y - 2, 3, 1, T.darkLit);
      lenses.push([inner > 0 ? x + 2 : x, y - 1, 1, 3]);
      tips.push(inner > 0 ? x + 3 : x - 1);
    };
    if (p.style === 'pylon') {
      drawCasing(g, T, cx - 3, 14, 6, 28, 0);
      drawCasing(g, T, cx - 4, 9, 8, 7, 2);
      drawCasing(g, T, cx - 5, 39, 10, 7, 2);
      hazardBand(g, cx - 4, 42, 8, 3, paintOf);
      lights.push([cx - 1, 12, 2, 2]);
      for (const y of d.rows) nozzle(inner > 0 ? cx + 3 : cx - 3, y);
    } else if (p.style === 'orb') {
      drawCasing(g, T, cx - 3, 30, 6, 12, 0);
      drawCasing(g, T, cx - 5, 27, 10, 4, 2);
      drawCasing(g, T, cx - 5, 40, 10, 6, 2);
      hazardBand(g, cx - 4, 43, 8, 2, paintOf);
      lights.push([cx - 1, 34, 2, 2]);
      const dim = tone(p.glow, -1.9);
      g.ellipse(cx, 21, 5, 5, { light: tone(p.glow, -1.2), base: dim, dark: dim }, { shade: 0, light: 1 });
      lenses.push('orb');
      tips.push(inner > 0 ? cx + 5 : cx - 6);
      for (const y of d.rows.slice(1)) nozzle(inner > 0 ? cx + 3 : cx - 3, y);
    } else {
      g.rect(cx - side * 2 - 2, 9, 4, 37, T.dark); g.rect(cx - side * 2 - 2, 9, 4, 1, T.darkLit);
      drawCasing(g, T, cx - 2 + inner, 11, 4, 35, 1);
      hazardBand(g, cx - 1 + inner, 39, 2, 6, paintOf);
      lights.push([cx - 1 + inner, 13, 2, 2]);
      for (const y of d.rows) nozzle(inner > 0 ? cx + 2 + inner : cx - 2 + inner, y);
    }
    return { cx, lenses, lights, tips };
  }
  return portGenerator({
    id: 'laser.gate', family: 'shape', units: 80, size: [W, H], origin: [CX, GROUND + 1],
    states: { idle: { frames: 8 }, open: { frames: 6, loop: false }, off: { frames: 1 }, warn: { frames: 6 } },
    about: 'Two posts with beams of light between them that bar a corridor, power down, stand dark or warn before they switch on.',
    args: {
      width: share({ default: 0.6, about: 'The gap between the posts: narrow to wide' }),
      style: word(['pylon', 'orb', 'wall-mount'], { default: 'pylon', about: 'Pylons, orb pedestals or slim rails against a wall' }),
      beams: word(['one', 'two', 'three'], { default: 'two', about: 'How many beams' }),
      body: paint({ about: 'The posts' }),
      accent: paint({ about: 'The warning paint and lights' }),
      glowing: paint({ about: 'The beams' }),
      flicker: share({ default: 0.5, about: 'Steady to wild: how often the beams swell and thin' }),
    },
    draw(g, { clip, frame, t, p: q }) {
      const p = { ...q, glow: q.glowing };   // HAND CHANGE: `glow` is a call field, so the argument is `glowing`
      const T = machineTonesP(p.body), d = dims(p);
      const left = post(g, p, T, d, -1), right = post(g, p, T, d, 1);
      g.outline(INK);
      const C = steps(p.glow);
      const down = clip === 'open' ? DOWN[frame] ?? DOWN[5] : null, warn = clip === 'warn' ? WARN[frame % 6] : null;
      const lens = clip === 'off' ? 0 : down ? down.lens : warn ? (warn.line ? 1 : 0.5) : frame % 2 ? 1 : 2;
      const light = clip === 'off' ? 0 : warn ? warn.light : down ? Math.min(1, down.lens) : 1;
      for (const P of [left, right]) {
        for (const L of P.lenses) {
          if (L !== 'orb') { lamp(g, ...L, p.glow, lens); continue; }
          if (lens <= 0) continue;
          g.ellipse(P.cx, 21, 3, 3, lens >= 2 ? '#ffffff' : lens >= 1 ? C[1] : C[3], { shade: 0 });
          if (lens >= 1) g.ellipse(P.cx, 21, 1.5, 1.5, '#ffffff', { shade: 0 });
        }
        for (const L of P.lights) lamp(g, ...L, p.accent, light);
      }
      if (clip === 'off') return;
      d.rows.forEach((y, i) => {
        const x0 = left.tips[i], x1 = right.tips[i], span = x1 - x0 + 1;
        if (warn) { if (warn.line) laserBeam(g, { x0, x1, y, thick: 1, colours: C, cut: 0.45, dash: 3, phase: frame / 6, seed: i }); return; }
        if (down) {
          if (down.thick) laserBeam(g, { x0, x1, y, thick: down.thick, colours: C, cut: down.cut, dash: 4, phase: frame * 0.37, seed: i });
          if (down.spark) twinkle(g, i % 2 ? x1 - 2 : x0 + 2, y, 2, C[2]);
          return;
        }
        const swell = SWELL[frame] && p.flicker >= SWELL[frame][0] ? SWELL[frame][1] : 0;
        laserBeam(g, { x0, x1, y, thick: 5 + 2 * swell, colours: C });
        const at = x0 + Math.floor(((t + i / d.rows.length) % 1) * span), bump = Math.min(x1, at + 3);
        laserBeam(g, { x0: at, x1: bump, y, thick: 7 + 2 * swell, colours: C });
      });
    },
  });
})();

// ---- platform.moving@1: sprites/moving-platform.js -------------------------------------------------------------------

/** platform.moving@1: a floating wooden, stone or metal deck to ride, hung from chains, with a gear turning under it (port of sprites/moving-platform.js). */
export const platformMoving = (() => {
  const W = 64, H = 32, CX = 32, TOP = 8, TEETH = 8;
  // HAND CHANGE: the deck's material is the mix colour rule of the Deck colour and the code's stone or slate
  const MATERIAL = { wood: (c) => c, stone: (c) => mix(c, TW.stone, 0.6), metal: (c) => mix(c, TW.slate, 0.7) };
  function deckWood(s, x0, x1, y, deck, metal) {
    const shade = mix(deck.base, deck.dark, 0.5);
    s.rect(x0, y, x1 - x0 + 1, 4, deck.base);
    s.rect(x0, y, x1 - x0 + 1, 1, deck.light);
    for (let x = x0 + 9; x < x1 - 4; x += 8) s.rect(x, y, 1, 3, deck.dark);
    s.rect(x0, y + 3, x1 - x0 + 1, 1, deck.dark);
    s.rect(x0 + 4, y + 4, x1 - x0 - 7, 4, shade);
    s.rect(x0 + 4, y + 7, x1 - x0 - 7, 1, deck.dark);
    for (let x = x0 + 12; x < x1 - 12; x += 13) s.rect(x, y + 5, 5, 1, deck.dark);
    for (const x of [x0, x1 - 2]) { s.rect(x, y, 3, 4, metal.base); s.rect(x, y, 3, 1, metal.light); s.rect(x, y + 3, 3, 1, metal.dark); s.dot(x + 1, y + 2, metal.dark); }
  }
  function deckStone(s, x0, x1, y, deck, metal) {
    for (let r = 0; r < 8; r++) {
      const cut = Math.max(0, r - 4);
      s.rect(x0 + cut, y + r, x1 - x0 + 1 - 2 * cut, 1, r === 0 ? deck.light : r === 7 ? deck.dark : deck.base);
    }
    s.rect(x0, y + 4, x1 - x0 + 1, 1, deck.dark);
    for (let x = x0 + 7; x < x1 - 3; x += 12) s.rect(x, y + 1, 1, 3, deck.dark);
    for (let x = x0 + 13; x < x1 - 5; x += 12) s.rect(x, y + 5, 1, 2, deck.dark);
    for (const x of [x0 + 3, x1 - 4]) { s.rect(x, y, 2, 6, metal.base); s.rect(x, y, 2, 1, metal.light); s.rect(x, y + 5, 2, 1, metal.dark); }
  }
  function deckMetal(s, x0, x1, y, deck, metal) {
    s.rect(x0, y, x1 - x0 + 1, 3, deck.base);
    s.rect(x0, y, x1 - x0 + 1, 1, deck.light);
    s.rect(x0, y + 2, x1 - x0 + 1, 1, deck.dark);
    for (let r = 3; r < 8; r++) {
      const cut = 2 + (r - 3);
      s.rect(x0 + cut, y + r, x1 - x0 + 1 - 2 * cut, 1, r === 7 ? deck.base : deck.dark);
    }
    for (let x = x0 + 8; x < x1 - 7; x++) s.dot(x, y + 3 + [0, 1, 2, 3, 3, 2, 1, 0][(x - x0) % 8], deck.light);
    for (let x = x0 + 6; x < x1 - 5; x += 6) s.rect(x, y + 1, 2, 1, metal.base);
    for (const x of [x0, x1 - 1]) { s.rect(x, y, 2, 3, metal.base); s.rect(x, y, 2, 1, metal.light); }
  }
  const DRAW = { wood: deckWood, stone: deckStone, metal: deckMetal };
  return portGenerator({
    id: 'platform.moving', family: 'shape', units: 80, size: [W, H], origin: [CX, TOP],
    states: { idle: { frames: 8 }, move: { frames: 8 } },
    about: 'A floating wooden, stone or metal platform to ride, hung from chains, with a gear turning under it; it bobs at rest and its chains sway as it moves.',
    args: {
      width: px(40, 62, { default: 48, about: 'The deck\'s width in pixels' }),
      style: word(['wood', 'stone', 'metal'], { default: 'wood', about: 'Planks, a stone slab or a riveted girder' }),
      chains: flag({ default: true, about: 'Chains it hangs from' }),
      wood: paint({ about: 'The deck' }),
      metal: paint({ about: 'The gear, straps and chains' }),
      bob: share({ default: 0.5, about: 'Still to floaty: how far it sinks and comes back' }),
    },
    draw(g, { clip, t, p: q }) {
      const p = { ...q, glow: q.glowing };   // HAND CHANGE: `glow` is a call field, so the argument is `glowing`
      const deck = ramp(MATERIAL[p.style](p.wood)), metal = ramp(p.metal);
      const dy = Math.round(lerp(0, 2, p.bob) * pulse(t));
      const wide = Math.round(p.width);
      const x0 = CX - wide / 2 + 1, x1 = CX + wide / 2 - 2;
      const y = TOP + 1 + dy;
      const turn = ((clip === 'move' ? 3 : 1) * TAU * t) / TEETH;
      const gy = y + 11;
      const below = (px_, py) => py > y + 4;
      g.fill(0, 0, W, H, toothedIn(CX, gy, 7.5, TEETH, 2.5, turn), metal, { shade: 1, clip: below });
      g.ellipse(CX, gy, 2.5, 2.5, tone(p.metal, -1.6), { outline: metal.dark });
      g.outline(INK);
      const s = new Surface(W, H);
      DRAW[p.style](s, x0, x1, y, deck, metal);
      if (p.chains) {
        const bow = clip === 'move' ? Math.round(1.4 * wave(t)) : 0;
        for (const x of [x0 + 3, x1 - 3]) {
          chainP(s, x, 2, x, y - 2, { colour: p.metal, bow });
          s.rect(x - 1, y - 1, 3, 1, metal.dark);
        }
      }
      s.outline(INK);
      g.blit(s);
    },
  });
})();

// ---- crystal.save@1: sprites/save-crystal.js -------------------------------------------------------------------------

/** crystal.save@1: a big cut crystal floating over a stone or root pedestal inside a swelling glow, with a ring of light round its waist, that flashes white and sends rings of light up when the game is saved (port of sprites/save-crystal.js). */
export const crystalSave = (() => {
  const W = 32, H = 48, CX = 16, GROUND = 45;
  const WIDE = { shard: 0.56, prism: 0.5, orb: 1, star: 0.74 };
  const ACT = [
    { up: 0 },
    { up: -1, white: true, burst: 5 },
    { up: 2, burst: 8, ring1: 0 },
    { up: 3, ring1: 0.3, ring2: 0 },
    { up: 3, ring1: 0.62, ring2: 0.28 },
    { up: 2, ring1: 0.9, ring2: 0.58 },
    { up: 1, ring2: 0.88 },
    { up: 0 },
  ];
  function pedestal(g, p) {
    if (p.pedestal === 'none') return GROUND - 2;
    const s = p.pedestalSize, layer = new Surface(W, H);
    if (p.pedestal === 'stone') {
      const rx = Math.round(10 * s), h = Math.round(lerp(2, 4, clamp((s - 0.65) / 0.7)));
      const foot = extrudeP(layer, ellipseIn(CX, 30, rx, 3.4), h, p.pedestalColour, { lip: 1, shade: 2 });
      extrudeP(layer, ellipseIn(CX, 27.5, rx - 4, 2.4), 2, p.pedestalColour, { lip: 1 });
      layer.ellipse(CX, 27.5, Math.max(1.5, rx - 7), 1.2, foot.ramps.wall.dark);
    } else {
      const R = ramp(p.pedestalColour), out = Math.min(10 * s, CX - 4), up = 8 * s;
      layer.ellipse(CX, 30, 7 * s, 2.6, R, { shade: 1 });
      for (const side of [-1, 1]) {
        layer.limb(CX + side * out, 31.5, CX + side * out * 0.5, 29, 3, R);
        layer.limb(CX + side * out * 0.5, 29.5, CX + side * (out * 0.6 + 1), 31 - up * 0.6, 3, R);
        layer.limb(CX + side * (out * 0.6 + 1), 31 - up * 0.6, CX + side * out * 0.42, 31 - up, 2, R);
      }
      layer.limb(CX - 3 * s, 30, CX + 2 * s, 28, 2, { base: R.dark, dark: R.dark, light: R.base });
    }
    layer.outline(INK);
    const b = layer.bounds();
    g.blit(layer, 0, GROUND + 1 - b.y1);
    return b.y0 + GROUND + 1 - b.y1;
  }
  return portGenerator({
    id: 'crystal.save', family: 'shape', units: 680, size: [W, H], origin: [CX, 46],
    states: { idle: { frames: 8 }, activate: { frames: 8, loop: false } },
    about: 'A glowing cut crystal floating over a stone or root pedestal, a ring of light round its waist, that flashes and sends rings of light up when the game is saved.',
    args: {
      size: share({ default: 0.5, about: 'Small to big' }),
      shape: word(['shard', 'prism', 'orb', 'star'], { default: 'shard', about: 'The cut' }),
      rings: flag({ default: true, about: 'A ring of light round its waist' }),
      pedestal: word(['stone', 'roots', 'none'], { default: 'stone', about: 'What it floats over' }),
      pedestalSize: px(0.65, 1.35, { default: 1, about: 'How big the pedestal is' }),
      pedestalColour: paint({ about: 'The pedestal' }),
      body: paint({ about: 'The crystal' }),
      glowing: paint({ about: 'Its glow' }),
      bob: share({ default: 0.5, about: 'Still to floaty' }),
      flicker: share({ default: 0.5, about: 'Steady to wild: how far the glow swells' }),
    },
    draw(g, { clip, t, frame, p: q }) {
      const p = { ...q, glow: q.glowing };   // HAND CHANGE: `glow` is a call field, so the argument is `glowing`
      const act = clip === 'activate' ? ACT[frame] : null;
      const tall = Math.round(lerp(8, 12, p.size)), ry = p.shape === 'orb' ? Math.round(tall * 0.78) : tall;
      const rx = Math.max(3, Math.round(ry * WIDE[p.shape]));
      const light = steps(p.body, { core: p.glow });
      const top = pedestal(g, p);
      const float = act ? act.up : Math.round(lerp(0, 2, p.bob) * wave(t));
      const rest = Math.max(ry + 5, top - 4 - ry), cy = Math.max(ry + 5, rest - float);
      const turn = act ? keys(t, [[0, 0], [0.15, 0], [0.85, 1], [1, 1]]) : t;
      const body = new Surface(W, H);
      const stone = drawCrystalP(body, CX, cy, rx, ry, p.body, { cut: p.shape, turn });
      if (!act) glint(body, stone, { x: CX, y: cy, r: ry, phase: lerp(-1.7, 1.7, clamp((t - 0.05) / 0.5)), width: 0.13, colour: mix(light[1], '#ffffff', 0.6) });
      if (act?.white) body.tint('#ffffff');
      body.outline(INK);
      const swell = act ? (act.white || act.burst ? 3 : act.ring1 !== undefined || act.ring2 !== undefined ? 2 : 1) : 1 + Math.round(lerp(0, 2.4, p.flicker) * pulse(t));
      if (act?.burst) glow(g, CX, cy, Math.min(rx + act.burst, CX - 2, cy - 2), light.slice(1), { box: [1, 1, W - 1, top] });
      drawAuraP(g, body, { reach: swell, colours: [light[1], light[2], light[3]], box: [1, 1, W - 1, H - 1] });
      const rising = (act ? [act.ring1, act.ring2] : []).filter((k) => k !== undefined).map((k) => ({ t: k, x: CX, y: Math.round(lerp(cy + ry + 1, cy - ry - 3, k)), r0: rx + 6, r1: rx + 6, thick: 2, squash: 0.32, colours: light, seed: 2, box: [1, 1, W - 1, H - 1] }));
      const rings = rising.map((o) => ({ y: o.y, draw: (layer) => ring(layer, o) }));
      if (p.rings) rings.push(orbitHoop({ cx: CX, cy: cy + 1, rx: rx + 5, ry: 2.6, thick: 1, back: light[3], front: light[1], bead: { turn: t, colour: light[1] } }));
      around(g, body, rings);
      if (!act) {
        sparkles(g, { t, count: 4, seed: 3, big: false, colours: light, area: [CX - rx - 7, cy - ry - 4, CX + rx + 8, cy + ry + 2], box: [1, 1, W - 1, top] });
      } else if (frame === 6) { g.dot(CX - rx - 3, cy - ry - 2, light[2]); g.dot(CX + rx + 3, cy - ry, light[2]); }
    },
  });
})();

// ---- saw.blade@1: sprites/saw-blade.js -------------------------------------------------------------------------------

/** saw.blade@1: a spinning circular saw blade (classic, jagged or ring) with a bolted hub plate, turning one tooth a loop, or biting and throwing sparks (port of sprites/saw-blade.js). */
export const sawBlade = (() => {
  const SIZE = 48, C = 24;
  const SPARKS = steps(TW.ember, { core: TW.gold });
  function blade(clip, t, frame, p) {
    const R = Math.round(lerp(11, 18, p.size));
    const sway = lerp(0, 2.2, p.wobble);
    const x = C + Math.round(sway * Math.cos(TAU * t));
    const y = C + Math.round(sway * Math.sin(TAU * t)) + (clip === 'grind' ? frame % 2 : 0);
    return { R, x, y, teeth: Math.round(p.teeth), turn: (TAU * t) / Math.round(p.teeth) };
  }
  return portGenerator({
    id: 'saw.blade', family: 'shape', units: 510, size: [SIZE, SIZE], origin: [C, C],
    states: { idle: { frames: 8 }, grind: { frames: 8 } },
    about: 'A spinning circular saw blade (classic, jagged fangs or a ring of holes) with a bolted hub plate; it turns one tooth a loop, or bites, judders and throws sparks.',
    args: {
      size: share({ default: 0.55, about: 'Small to big' }),
      style: word(['classic', 'jagged', 'ring'], { default: 'classic', about: 'The cut of its teeth' }),
      teeth: count(6, 12, { default: 8, about: 'How many teeth' }),
      hub: flag({ default: true, about: 'A bolted hub plate' }),
      metal: paint({ about: 'The blade' }),
      accent: paint({ about: 'The hub plate' }),
      wobble: share({ default: 0.35, about: 'Firm to wobbly: how far the axle swings' }),
    },
    draw(g, { clip, t, frame, p: q }) {
      const p = { ...q, glow: q.glowing };   // HAND CHANGE: `glow` is a call field, so the argument is `glowing`
      const { R, x, y, teeth, turn } = blade(clip, t, frame, p);
      const metal = ramp(p.metal);
      const all = [0, 0, SIZE, SIZE];
      let root;
      if (p.style === 'jagged') {
        root = R * 0.62;
        g.fill(...all, starIn(x, y, R, teeth, { inner: 0.62, angle: turn }), metal, { shade: 2, light: 1 });
        g.fill(...all, ringIn(x, y, root - 1.5, 1), metal.dark);
      } else {
        const depth = p.style === 'ring' ? Math.max(2, R * 0.16) : Math.max(2.5, R * 0.22);
        root = R - depth;
        const body = toothedIn(x, y, R, teeth, depth, turn, 'saw');
        g.fill(...all, body, metal, { shade: 2, light: 1 });
        if (p.style === 'ring') {
          const mid = R * 0.6, hole = (TAU * mid) / teeth >= 6 ? 3 : 2;
          for (let i = 0; i < teeth; i++) {
            const a = turn + (i * TAU) / teeth;
            g.rect(Math.round(x + mid * Math.cos(a) - hole / 2), Math.round(y + mid * Math.sin(a) - hole / 2), hole, hole, metal.deep);
          }
        } else g.fill(...all, ringIn(x, y, R * 0.6, 1), metal.dark);
      }
      const shine = Math.max(4, root - 2);
      g.arc(x, y, shine, PI * 0.62, PI * 0.9, 1, metal.light);
      g.arc(x, y, shine, PI * 0.68, PI * 0.82, 1, '#ffffff');
      if (p.hub) {
        const plate = ramp(p.accent), h = Math.max(4, Math.round(R * 0.34));
        g.ellipse(x, y, h, h, plate, { outline: INK, light: 1 });
        if (h >= 5) {
          const k = Math.round(h * 0.55);
          for (const bx of [x - k, x + k - 1]) for (const by of [y - k, y + k - 1]) g.dot(bx, by, by < y ? metal.light : metal.base);
        }
        g.rect(x - 1, y - 1, 2, 2, metal.base);
        g.dot(x, y - 1, metal.light);
      } else {
        g.ellipse(x, y, 2.5, 2.5, tone(p.metal, -1.6), { outline: INK });
        g.dot(x, y - 1, metal.base);
      }
      g.outline(INK);
      const inFrame = (px_, py) => px_ >= 1 && py >= 1 && px_ < SIZE - 1 && py < SIZE - 1;
      for (const side of [0, PI]) {
        const a = side - TAU * t + PI * 0.3;
        g.arc(x, y, R + 2.5, a - 0.26, a + 0.26, 1, '#ffffff', { clip: inFrame });
      }
      if (clip === 'grind') {
        const bx = x - 1, by = Math.min(y + R - 1, SIZE - 4);
        particles(g, { t, x: bx, y: by, count: 12, seed: 4, cycles: 2, angle: -PI * 0.6, arc: 1.1, dist: R + 6, gravity: 6, size: 2.4, spread: 1.5, lifespan: 0.85, colours: SPARKS });
        twinkle(g, bx, by + 1, frame % 2 ? 2 : 1, SPARKS[2]);
      }
    },
  });
})();

// ---- pedestal.upgrade@1: sprites/upgrade-pedestal.js -----------------------------------------------------------------

/** pedestal.upgrade@1: a pillar, ring or claw stand offering an upgrade as a turning hologram (cube, orb, arrow or star) that streaks away when taken (port of sprites/upgrade-pedestal.js). */
export const pedestalUpgrade = (() => {
  const W = 32, H = 48, CX = 16, GROUND = 45;
  const ACT = [
    { holo: [1, 1], lit: 1, lens: 1 },
    { holo: [1.35, 0.6], hot: true, lit: 1, lens: 2 },
    { holo: [0.6, 1.5], hot: true, up: 3, lit: 1, lens: 2 },
    { streak: [0, 1], lit: 1, lens: 2 },
    { streak: [0.55, 1], sparks: 3, lit: 1, lens: 1 },
    { sparks: 3, lit: 0, lens: 1 },
    { sparks: 2, lit: 0, lens: 0 },
    { lit: 0, lens: 0 },
  ];
  const dims = (p) => ({ r: Math.round(lerp(5, 8, p.size)), R: Math.round(lerp(5, 7, p.size)), col: Math.round(lerp(7, 11, p.size)) });
  function stand(g, p, d, lit) {
    const { r, R } = d;
    const light = lit >= 1 ? tone(p.accent, 0.7) : tone(p.accent, -1.5);
    const disc = (cy, rx, ry, h, opt) => extrudeP(g, ellipseIn(CX, cy, rx, ry), h, p.body, opt);
    if (p.style === 'ring') {
      const rx = Math.min(13, r + 5), cy = GROUND + 1 - 3 - 4;
      const S = disc(cy, rx, 4, 3, { lip: 1 });
      wallFillP(g, S, bandIn(S, 0, 3), S.ramps.wall.dark, { flat: true });
      wallFillP(g, S, stripesIn(bandIn(S, 1, 1), { pitch: 4, slant: 0, phase: 1 }), light, { flat: true });
      disc(cy - 1, rx - 3, 3, 1, { lip: 1 });
      g.ellipse(CX, cy - 1, rx - 5, 2, S.ramps.wall.dark);
      const lw = Math.max(2, rx - 7);
      return { lens: [CX - lw, cy - 2, 2 * lw, 2], top: cy - 4, hy: cy - 4 - 5 - R };
    }
    if (p.style === 'claw') {
      const cy = GROUND + 1 - 3 - 3;
      const S = disc(cy, r + 1, 3, 3, { lip: 1 }), Rw = S.ramps.wall;
      wallFillP(g, S, bandIn(S, 1, 1), light, { flat: true });
      g.ellipse(CX, cy, r - 2, 1.6, Rw.dark);
      const hy = cy - 5 - R, out = Math.min(R + 5, 13);
      for (const side of [-1, 1]) {
        const kx = CX + side * out, tx = CX + side * (out - 2);
        g.limb(CX + side * (r - 1), cy - 1, kx, hy + 3, 3, Rw);
        g.limb(kx, hy + 3, tx, hy - R + 2, 3, Rw);
        g.rect(Math.round(tx) - 1, hy - R, 2, 2, light);
      }
      return { lens: [CX - 2, cy - 1, 4, 2], top: hy - R, hy };
    }
    const cy0 = GROUND + 1 - 2 - 3;
    disc(cy0, r + 2, 3, 2, { lip: 1 });
    const cy1 = cy0 - d.col, S1 = disc(cy1, r - 1, 2, d.col);
    wallFillP(g, S1, bandIn(S1, 2, 4), S1.ramps.wall.dark, { flat: true });
    wallFillP(g, S1, bandIn(S1, 3, 2), light, { flat: true });
    const cy2 = cy1 - 2, S2 = disc(cy2, r + 1, 3, 2, { lip: 1 });
    g.ellipse(CX, cy2, r - 1, 2, S2.ramps.wall.dark);
    return { lens: [CX - (r - 2), cy2 - 1, 2 * (r - 2), 2], top: cy2 - 3, hy: cy2 - 3 - 3 - R };
  }
  function shape(p, R, t) {
    if (p.shape === 'cube') return turningCubeIn(R, t);
    if (p.shape === 'orb') return { body: ellipseIn(0, 0, R, R), lit: null };
    const flat = p.shape === 'arrow'
      ? polyIn([[0, -R], [R * 0.95, -R * 0.05], [R * 0.4, -R * 0.05], [R * 0.4, R], [-R * 0.4, R], [-R * 0.4, -R * 0.05], [-R * 0.95, -R * 0.05]])
      : starIn(0, R * 0.1, R * 1.2, 5);
    return { body: turnedIn(flat, PI * t, 2).body, lit: null };
  }
  return portGenerator({
    id: 'pedestal.upgrade', family: 'shape', units: 260, size: [W, H], origin: [CX, GROUND + 1],
    states: { idle: { frames: 8 }, activate: { frames: 8, loop: false }, taken: { frames: 1 } },
    about: 'A pillar, ring or claw stand that offers an upgrade as a turning hologram (cube, orb, arrow or star), which flashes and streaks away when it is taken.',
    args: {
      size: share({ default: 0.5, about: 'Small to big' }),
      style: word(['pillar', 'ring', 'claw'], { default: 'pillar', about: 'The stand' }),
      shape: word(['cube', 'orb', 'arrow', 'star'], { default: 'cube', about: 'The hologram' }),
      body: paint({ about: 'The stand' }),
      accent: paint({ about: 'Its lights' }),
      glowing: paint({ about: 'The hologram' }),
      bob: share({ default: 0.5, about: 'Still to floaty' }),
    },
    draw(g, { clip, t, frame, p: q }) {
      const p = { ...q, glow: q.glowing };   // HAND CHANGE: `glow` is a call field, so the argument is `glowing`
      const d = dims(p), R = d.R;
      const resting = clip === 'idle' || (clip === 'activate' && frame === 0);
      const a = resting ? { holo: [1, 1], lit: 1, lens: frame % 4 === 0 ? 2 : 1 } : clip === 'taken' ? ACT[7] : ACT[frame] ?? ACT[7];
      const s = stand(g, p, d, a.lit);
      g.outline(INK);
      lamp(g, ...s.lens, p.glow, a.lens);
      const white = mix(p.glow, '#ffffff', 0.75);
      const loop = clip === 'idle' ? t : 0;
      const room = Math.max(0, s.hy - R - 3);
      const bob = Math.round(Math.min(room, lerp(0, 3, p.bob)) * wave(loop, 0.25));
      const hy = s.hy - bob - (a.up ?? 0);
      if (a.holo) {
        const { body, lit } = shape(p, R, loop), [sx, sy] = a.holo;
        const at = (f) => (f ? placedIn(f, CX, hy, { sx, sy }) : null);
        hologram(g, at(body), a.hot ? white : p.glow, { scan: a.hot ? null : fract(loop + 0.15), lit: a.hot ? null : at(lit), light: a.hot ? 0 : 2 });
        if (p.shape === 'orb' && !a.hot) meridians(g, CX, hy, R, loop, p.glow);
        if (resting) particles(g, { t: loop, x: CX, y: s.top - 1, count: 3, seed: 4, angle: PI, arc: 0.9, dist: Math.max(2, s.top - hy - R), size: 1.2, colours: [tone(p.glow, 0.9), p.glow, tone(p.glow, -1)] });
      }
      if (a.streak) {
        const y0 = lerp(hy + R, 2, a.streak[0]), y1 = lerp(hy + R, 2, a.streak[1]);
        hologram(g, capsuleIn(CX, y0, CX, y1 + 1, a.streak[0] ? 1 : 1.6, 1), white, { light: 0 });
      }
      if (a.sparks) {
        const size = a.sparks === 3 && !a.streak ? 1 : a.streak ? 1 : 0;
        for (let i = 0; i < a.sparks; i++) twinkle(g, CX + [-3, 2, -1][i], Math.max(3, Math.round(lerp(hy - R, 4, (i + 1) / 3)) - (frame - 4)), size, p.glow);
      }
    },
  });
})();

// ---- terminal.wall@1: sprites/wall-terminal.js -----------------------------------------------------------------------

/** terminal.wall@1: a station computer (a console, a kiosk or a wall panel) whose screen scrolls text, a graph, a map or a skull, flashes and shows a tick when used, or stands dark (port of sprites/wall-terminal.js). */
export const terminalWall = (() => {
  const W = 32, H = 48, CX = 16, GROUND = 45;
  const GLASS = mixHex(D.void, D.plate, 0.25);
  // HAND CHANGE: the style "wall panel" is the word "wall-panel"
  const BUILDS = {
    console: { screen: [7, 14, 18, 11], lamps: [[6, 27], [24, 27]], trim: [10, 27, 12, 2], shelf: [4, 30, 24] },
    kiosk: { screen: [11, 14, 10, 12], lamps: [[11, 29], [19, 29]], trim: [14, 29, 4, 2], shelf: [6, 33, 20] },
    'wall-panel': { screen: [5, 14, 16, 11], lamps: [[24, 15], [24, 19]], trim: [5, 28, 16, 2], shelf: [3, 33, 26] },
  };
  const GLITCH = { 2: 0.15, 6: 0.5, 5: 0.8 };
  const ACT = [
    { lights: 0.5 },
    { flash: true, lights: 2 },
    { tick: 'hot', lights: 2 },
    { tick: 'on', lights: 1 },
    { tick: 'hot', lights: 1 },
    { tick: 'on', lights: 1 },
    { tick: 'on', lights: 2 },
    { tick: 'on', lights: 1 },
  ];
  function bezel(g, T, [x, y, w, h]) {
    g.rect(x - 2, y - 2, w + 4, h + 4, T.dark);
    g.rect(x - 2, y + h + 1, w + 4, 1, T.darkLit);
    g.rect(x, y, w, h, GLASS);
  }
  function shelf(g, T, p, [x, y, w]) {
    g.rect(x, y, w, 3, T.soft); g.rect(x, y, w, 1, T.lit);
    for (let i = 2; i < w - 3; i += 3) { g.rect(x + i, y + 1, 2, 1, T.dark); if ((i / 3) % 4 === 1) g.rect(x + i, y + 1, 2, 1, p.accent); }
    g.rect(x, y + 3, w, 2, T.base); g.rect(x, y + 4, w, 1, T.seam);
  }
  function body(g, p, T, B) {
    if (p.style === 'console') {
      drawCasing(g, T, 8, 31, 16, 12, 0);
      drawGrate(g, 11, 33, 10, 8, { frame: T.seam, bar: T.base, slot: T.dark, lit: T.soft, pitch: 2 });
      drawCasing(g, T, 6, 41, 20, 5, 1);
      drawCasing(g, T, 4, 10, 24, 20, 2);
    } else if (p.style === 'kiosk') {
      drawCasing(g, T, 9, 12, 14, 30, 0);
      drawCasing(g, T, 8, 9, 16, 4, 2);
      drawCasing(g, T, 6, 40, 20, 6, 2);
      g.rect(12, 36, 8, 1, T.seam); g.rect(12, 37, 8, 1, T.soft);
    } else {
      drawCasing(g, T, 14, 31, 4, 12, 0);
      g.rect(14, 37, 4, 1, T.seam);
      drawCasing(g, T, 10, 41, 12, 5, 1);
      drawCasing(g, T, 2, 11, 28, 21, 1);
      g.rect(23, 13, 5, 11, T.dark); g.rect(23, 24, 5, 1, T.darkLit);
      for (const y of [26, 28]) g.rect(24, y, 3, 1, T.seam);
    }
    bezel(g, T, B.screen);
    g.rect(...B.trim, p.accent);
    if (p.keys) shelf(g, T, p, B.shelf);
  }
  function picture(g, p, [x, y, w, h], t, { dim = false, shove = 0, scan = -1, beat = 0 } = {}) {
    const text = p.shape === 'text', top = text ? h - 4 : h - 2;
    const ink = dim ? tone(p.glow, -0.9) : p.shape === 'skull' && beat ? '#ffffff' : p.glow;
    if (scan >= 0 && scan < h) g.rect(x, y + scan, w, 1, mix(GLASS, p.glow, 0.3));
    g.fill(x, y, x + w, y + h, screenIn(p.shape, x + 1 + shove, y + 1, w - 2, top, t), ink);
    if (!text) return;
    g.rect(x + 1, y + h - 2, 3, 1, ink);
    if (!beat) g.rect(x + 5, y + h - 3, 2, 2, '#ffffff');
  }
  return portGenerator({
    id: 'terminal.wall', family: 'shape', units: 80, size: [W, H], origin: [CX, GROUND + 1],
    states: { idle: { frames: 8 }, activate: { frames: 8, loop: false }, off: { frames: 1 } },
    about: 'A station computer (console, kiosk or wall panel) whose screen scrolls text, a graph, a map or a skull, flashes and shows a tick when it is used, or stands dark.',
    args: {
      style: word(['console', 'kiosk', 'wall-panel'], { default: 'console', about: 'A console, a kiosk or a wall panel' }),
      shape: word(['text', 'graph', 'map', 'skull'], { default: 'text', about: 'What the screen shows' }),
      keys: flag({ default: true, about: 'A keyboard shelf' }),
      body: paint({ about: 'The body' }),
      accent: paint({ about: 'The trim and side lights' }),
      glowing: paint({ about: 'The screen' }),
      flicker: share({ default: 0.5, about: 'Steady to wild: how often the screen glitches' }),
    },
    draw(g, { clip, frame, t, p: q }) {
      const p = { ...q, glow: q.glowing };   // HAND CHANGE: `glow` is a call field, so the argument is `glowing`
      const T = machineTonesP(p.body), B = BUILDS[p.style], [x, y, w, h] = B.screen;
      body(g, p, T, B);
      g.outline(INK);
      const a = clip === 'activate' ? ACT[frame] ?? ACT[7] : null;
      const lights = clip === 'off' ? 0 : a ? a.lights : 0.5;
      for (const [lx, ly] of B.lamps) lamp(g, lx, ly, 2, 2, p.accent, lights);
      if (clip === 'off') {
        const sheen = mix(GLASS, T.soft, 0.3);
        for (let i = 0; i < 4; i++) g.rect(x + w - 6 + i, y + 4 - i, 2, 1, sheen);
        return;
      }
      if (clip === 'idle' || (a && !a.flash && !a.tick)) {
        const glitch = clip === 'idle' && p.flicker >= (GLITCH[frame] ?? 9);
        picture(g, p, B.screen, clip === 'idle' ? t : 0, { dim: glitch, shove: glitch ? (frame % 2 ? -1 : 1) : 0, scan: clip === 'idle' ? Math.floor((t * h + 2) % h) : -1, beat: (frame >> 2) % 2 });
        return;
      }
      if (a.flash) {
        g.rect(x - 1, y - 1, w + 2, h + 2, p.glow);
        g.rect(x, y, w, h, '#ffffff');
        return;
      }
      const hot = a.tick === 'hot';
      if (hot) g.rect(x, y, w, h, p.glow);
      g.fill(x, y, x + w, y + h, screenIn('tick', x + 1, y + 1, w - 2, h - 2), hot ? '#ffffff' : p.glow);
    },
  });
})();

// ---- warp.pad@1: sprites/warp-pad.js ---------------------------------------------------------------------------------

/** warp.pad@1: a round, six-sided or pylon-ringed teleporter platform on the floor whose rim lights chase round, which charges with rising rings of light and fires a column of light when it warps (port of sprites/warp-pad.js). */
export const warpPad = (() => {
  const W = 64, H = 48, CX = 32, GROUND = 39;
  const WALL = 3, LAMPS = 12;
  const RINGS = { one: [0.62], two: [0.68, 0.4], three: [0.72, 0.5, 0.28] };
  const PYLONS = [[-0.6, -0.7, 8], [0.6, -0.7, 8], [-0.86, 0.36, 9], [0.86, 0.36, 9]];
  const ACT = [
    { hoops: [0.2, 0.6] },
    { tall: 0.4, wide: 8, firm: 1, hoops: [0.55] },
    { tall: 1, wide: 10, firm: 0.9 },
    { tall: 1, wide: 14, firm: 1, white: true },
    { tall: 1, wide: 10, firm: 0.6, wave: 0.45 },
    { tall: 1, wide: 6, firm: 0.35, wave: 0.7 },
    { tall: 0.62, wide: 4, firm: 0.2, wave: 0.9 },
    { tall: 0.34, wide: 3, firm: 0.1, wave: 1.02, sparks: 3 },
    { tall: 0.14, wide: 2, firm: 0, sparks: 2 },
    {},
  ];
  function dims(p) {
    const rx = Math.round(p.size < 0.5 ? lerp(22, 28, p.size * 2) : lerp(28, 30, p.size * 2 - 1)), ry = Math.round(rx * 0.43);
    const sides = p.style === 'hex' ? 6 : 0;
    const face = (cy, k = 1) => (sides ? polyIn(ngonPoints(CX, cy, rx * k, ry * k, sides)) : ellipseIn(CX, cy, rx * k, ry * k));
    const at = solid(face(20), WALL, [0, 0, W, H]).box[3] - 1, cy = 20 + GROUND - at;
    return { rx, ry, cy, sides, face: (k) => face(cy, k) };
  }
  function lampSpots(d) {
    if (!d.sides) return ngonPoints(CX, d.cy, d.rx - 3.5, d.ry - 2, LAMPS, TAU / 24);
    const corners = ngonPoints(CX, d.cy, d.rx - 4.5, d.ry - 2, 6);
    return corners.flatMap(([x, y], i) => { const [nx, ny] = corners[(i + 1) % 6]; return [[x, y], [(x + nx) / 2, (y + ny) / 2]]; });
  }
  return portGenerator({
    id: 'warp.pad', family: 'shape', units: 850, size: [W, H], origin: [CX, GROUND + 1],
    states: { idle: { frames: 8 }, charge: { frames: 8 }, activate: { frames: 10, loop: false } },
    about: 'A round, six-sided or pylon-ringed teleporter pad on the floor: its rim lights chase round, rings of light rise as it charges, and a column of light fires when it warps.',
    args: {
      size: share({ default: 0.5, about: 'Small to big' }),
      style: word(['round', 'hex', 'pylons'], { default: 'round', about: 'Round, six-sided or ringed by four pylons' }),
      rings: word(['one', 'two', 'three'], { default: 'two', about: 'Rings of light on its face' }),
      body: paint({ about: 'The platform' }),
      accent: paint({ about: 'The rim lights' }),
      glowing: paint({ about: 'The rings, the emitter and the column of light' }),
      flicker: share({ default: 0.5, about: 'Steady to wild: how much the rings break up' }),
    },
    draw(g, { clip, t, frame, p: q }) {
      const p = { ...q, glow: q.glowing };   // HAND CHANGE: `glow` is a call field, so the argument is `glowing`
      const d = dims(p), { rx, ry, cy } = d, squash = ry / rx;
      const a = clip === 'activate' && frame < ACT.length - 1 ? ACT[frame] : null;
      const charging = clip === 'charge' || !!a;
      const beat = a ? frame : Math.round(t * 8);
      const S = extrudeP(g, d.face(1), WALL, p.body, { lip: 1, shade: 2 });
      wallFillP(g, S, bandIn(S, 1, 1), p.accent, { flat: true });
      g.fill(0, 0, W, H, d.face(0.8), S.ramps.wall.base);
      g.ellipse(CX, cy, 5, 2.4, S.ramps.wall.dark);
      const posts = p.style === 'pylons' ? PYLONS.map(([kx, ky, tall]) => {
        const x = CX + Math.round(kx * rx), y = cy + Math.round(ky * ry);
        extrudeP(g, ellipseIn(x, y - tall, 2.6, 1.4), tall, p.body);
        return [x, y - tall, y];
      }) : [];
      g.outline(INK);
      const C = steps(p.glow, { white: false });
      const hot = a?.white ? ['#ffffff', '#ffffff', C[0], C[3]] : C;
      lampSpots(d).forEach(([x, y], i) => {
        if (posts.some(([px_, py, foot]) => Math.abs(x - px_) < 4 && y > py - 2 && y < foot + 2)) return;
        const k = (((i - beat) % 4) + 4) % 4;
        lamp(g, Math.round(x) - 1, Math.round(y) - 1, 2, 2, p.accent, a?.white ? 2 : charging ? (k === 0 ? 2 : 1) : k === 0 ? 1 : k === 3 ? 0.5 : 0);
      });
      posts.forEach(([x, y], i) => lamp(g, x - 1, y - 1, 2, 2, p.glow, a?.white || (charging && (beat + i) % 2 === 0) ? 2 : (beat + i) % 4 === 0 || charging ? 1 : 0.5));
      RINGS[p.rings].forEach((k, j) => {
        const wild = p.flicker * (0.35 + 0.65 * hash(beat, 11 + j));
        const heat = charging ? 1 : 0.2 + 0.6 * pulse(t, -j / 4);
        floorRing(g, { x: CX, y: cy, r: rx * k, squash, thick: j ? 1 : 2, sides: d.sides, colours: hot, heat,
          gaps: wild > 0.3 ? 5 : 0, open: clamp(wild * 0.5, 0, 0.5), phase: TAU * hash(beat, 21 + j) });
      });
      lamp(g, CX - 2, cy - 1, 4, 2, p.glow, charging ? 2 : hash(beat, 3) < p.flicker * 0.5 ? 0.5 : 1);
      const hoop = (life, j) => floorRing(g, { x: CX, y: Math.round(lerp(cy - 2, 7, life)), r: rx * lerp(0.6, 0.3, life), squash, thick: life < 0.45 ? 2 : 1, colours: C, heat: 1 - life,
        gaps: life > 0.55 || p.flicker > 0.6 ? 4 : 0, open: clamp((life - 0.4) * 0.9 + p.flicker * 0.25, 0.1, 0.7), phase: TAU * hash(j, 5) + life * 2 });
      const n = RINGS[p.rings].length;
      if (clip === 'charge') for (let j = 0; j < n; j++) hoop(fract(t + j / n), j);
      (a?.hoops ?? []).forEach((life, j) => hoop(life, j));
      if (a?.wave) floorRing(g, { x: CX, y: cy, r: Math.max(6, rx * a.wave), squash, thick: a.wave < 0.8 ? 2 : 1, sides: d.sides, colours: C, heat: 1.2 - a.wave, gaps: a.wave > 0.8 ? 6 : 0, open: 0.4, phase: 1 });
      if (a?.white) lightShape(g, d.face(0.6), { colours: [C[0], C[2]], heart: '#ffffff', inset: 2 });
      if (a?.tall) {
        const full = cy + 4;
        beam(g, { x: CX, y: cy + 1, w: a.wide, h: a.tall >= 1 ? Math.round(full * 2.2) : Math.round(full * a.tall), phase: frame * 0.37, dash: 3, gap: p.flicker > 0.6 ? 3 : 2, solid: a.firm, seed: 3, colours: hot });
      }
      for (let i = 0; i < (a?.sparks ?? 0); i++) twinkle(g, CX + [-5, 4, 0][i], Math.round(cy - 6 - 7 * i - (frame - 7) * 3), 1, C[2]);
    },
  });
})();
