// Interface-picture generators of migration batch M9 (family "ui"; docs/data-sprites.md 3.3 `counter`, `status.mark`,
// `ui.tech`): the library's HUD glyphs, damage numbers, status marks, crosshair, counters, plates and cards as port
// generators (engine/gen/port-sprite.js). Each draws what its code sprite drew, pixel for pixel: the sprite file's own
// drawing, moved here word for word inside its own block (so two pictures' helpers never meet), on the engine/ helpers
// ported to paint refs in engine/gen/ports/ (or the pure shape tests of engine/shapes.js, engine/surface.js,
// engine/marks.js as they are). Every argument is one of the old sprite's settings under its own name; `picture` is the
// clip. The old palettes stay only where the old drawing named a fixed colour (a steel blade beside a status mark).
// Pure: Node and browser.
import { share, px, word, flag, paint } from './args.js';
import { portGenerator } from './port-sprite.js';
import { Surface, rectIn, ellipseIn, polyIn } from './ports/surface.js';
import { tone, ramp, mix, pick, INK } from './ports/colour.js';
import { lerp, wave, fract, clamp, keys, easeOut, pulse, PI, TAU } from '../motion.js';
import { PALETTE } from '../palettes.js';
import { spunIn, reachOf, cornerIn, grownIn } from '../shapes.js';
import {
  digitSize, digitBody, glyphGrid, rimmed, panel9, highlight, triangle, slice9, borderPx, PANEL_STYLES, stampGlyph, cutRectIn,
  techPanel, scanLines, desaturate, cutPx, TECH_STYLES, ungreyed,
} from './ports/ui.js';
const SKIN_TEXT = Object.freeze({ flat: '#ffffff' });   // engine/ui-skins.js SKIN_TEXT.flat: the old flat-skin text colour (review M9 round 1: no import of the skins module)
import { statusMark, drawGlyph, glyphPlate } from './ports/glyphs.js';
import { glyphPicture } from './ports/glyphs.js';
import { placedIn, heartIn, starIn, insetIn, crossIn, hexIn, ringIn, allIn, notIn } from '../shapes.js';
import { slotFill, levelIn, socketTones } from './ports/slots.js';
import { markIn, drawMark } from '../marks.js';
import { drawGem } from './ports/pickups.js';
import { fontMetrics, fontGlyph } from '../pixel-font.js';
import { COUNTER_STYLES, rollDigit, clockIn } from './ports/counters.js';
import { windowDigit, windowPen } from './ports/counter-digits.js';
import { bridgeColonGap, wideCounterColon } from './ports/counter-colon.js';
import { styledCounterPlate } from './ports/counter-styles.js';

// ---- damage.digits@1 (tests/fixtures/code-sprites/ui-damage-digits.js) -------------------------------------------------

/** damage.digits@1: Thick outlined digits, plus, minus, a critical-hit burst and a miss mark for pop-up numbers (port of tests/fixtures/code-sprites/ui-damage-digits.js). */
export const damageDigitsPort = (() => {
  const P = PALETTE.hearthvale;

  /** A starburst on a 9x9 grid: four long rays and four short ones round a middle. `fat` thickens the middle. */
  function burst(fat, round) {
    const b = glyphGrid(9, 9);
    for (let i = 0; i < 9; i++) { b.set(i, 4); b.set(4, i); }                 // the long rays
    for (const d of [1, 2]) for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) b.set(4 + sx * d, 4 + sy * d);   // the short ones
    if (fat) {
      b.box(3, 2, 5, 6); b.box(2, 3, 6, 5);                                    // a solid middle
      if (!round) for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) b.set(4 + sx * 3, 4 + sy * 3);
    }
    return b;
  }

  /**
   * The miss mark on a 9x8 grid: a swoosh rising to the right (where the blow went past) over two
   * motion lines. Three separate strokes inside one rim. sw: the swoosh's thickness.
   */
  function dodge(sw) {
    const b = glyphGrid(9, 8);
    const rise = [3, 3, 2, 2, 1, 1, 1, 0, 0];                                  // the swoosh's top row at each column
    for (let x = 0; x < 9; x++) for (let j = 0; j < sw; j++) if (rise[x] + j <= 3) b.set(x, rise[x] + j);
    b.box(3, 5, 8, 5);                                                         // motion lines, staggered
    b.box(1, 7, 5, 7);
    return b;
  }

  function glyph(clip, d) {
    const m = /^digit-(\d)$/.exec(clip);
    if (m) return digitBody(Number(m[1]), d);
    if (clip === 'crit') return burst(d.stroke > 1, d.round);
    if (clip === 'miss') return dodge(d.stroke);
    // plus and minus: one size per style, so the arms always sit exactly in the middle (6 px with 2 px arms, or 5 with 1)
    const side = d.stroke + 4, b = glyphGrid(side, side), a0 = (side - d.stroke) / 2;
    b.box(0, a0, side - 1, a0 + d.stroke - 1);
    if (clip === 'plus') b.box(a0, 0, a0 + d.stroke - 1, side - 1);
    return b;
  }
  return portGenerator({
    id: 'damage.digits', family: 'ui', units: 20, size: [16, 16], origin: [8, 8],
    states: { 'digit-0': { frames: 1 }, 'digit-1': { frames: 1 }, 'digit-2': { frames: 1 }, 'digit-3': { frames: 1 }, 'digit-4': { frames: 1 }, 'digit-5': { frames: 1 }, 'digit-6': { frames: 1 }, 'digit-7': { frames: 1 }, 'digit-8': { frames: 1 }, 'digit-9': { frames: 1 }, plus: { frames: 1 }, minus: { frames: 1 }, crit: { frames: 1 }, miss: { frames: 1 } },
    about: 'Thick outlined digits, plus, minus, a critical-hit burst and a miss mark for pop-up numbers.',
    args: {
      style: word(['chunky', 'slim', 'rounded'], { default: 'chunky', about: 'Style' }),
      slant: flag({ default: false, about: 'Slant' }),
      shadow: flag({ default: true, about: 'Shadow' }),
      size: share({ default: 0.5, about: 'Size: Small to Big' }),
      body: paint({ about: 'Body' }),
      edge: paint({ about: 'Edge' }),
    },
    draw(g, { clip, p }) {
    const d = digitSize(p.size, p.style), b = glyph(clip, d);
    // leaning: the rows above the middle move 1 px right (digits, plus and minus; the burst and the dodge mark stay)
    const lean = p.slant && clip !== 'crit' && clip !== 'miss';
    const shadow = p.shadow ? 1 : 0, extra = p.slant ? 1 : 0, leanW = lean ? 1 : 0;
    // one box for the ten digits, centred in the 14x14 inside the frame's border; other marks are centred on it
    const inkW = d.w + 4 + extra + shadow, inkH = d.h + 4 + shadow;
    const boxLeft = 1 + Math.floor((14 - inkW) / 2) + shadow + 2, boxTop = 1 + Math.floor((14 - inkH) / 2) + 2;
    let left = boxLeft + Math.floor((d.w + extra - b.w - leanW) / 2), top = boxTop + Math.floor((d.h - b.h) / 2);
    // body, 1 px rim, 1 px ink and the shadow must all stay inside the frame's 1 px border
    left = Math.max(3 + shadow, Math.min(left, 13 - b.w - leanW));
    top = Math.max(3, Math.min(top, 13 - b.h - shadow));
    rimmed(g, b, left, top, { colour: p.body, edge: p.edge, shadow: p.shadow, lean });
  },
  });
})();


// ---- status.icons@1 (tests/fixtures/code-sprites/ui-status-icons.js) ---------------------------------------------------

/** status.icons@1: Ten tiny status marks: poison, sleep, stun, burn, freeze, attack and defence up and down, and haste (port of tests/fixtures/code-sprites/ui-status-icons.js). */
export const statusIconsPort = (() => {
  const P = PALETTE.hearthvale;
  const SIZE = [16, 16];

  // Per mark: its label, whether it is a boost (the rest are ailments), and the colour of the thing it is shown with.
  const MARKS = {
    poison: { label: 'Poison' },
    sleep: { label: 'Sleep' },
    stun: { label: 'Stun' },
    burn: { label: 'Burn' },
    freeze: { label: 'Freeze' },
    'attack-up': { label: 'Attack up', boost: true, second: P.steel },
    'defence-up': { label: 'Defence up', boost: true, second: P.steel },
    'attack-down': { label: 'Attack down', second: P.steel },
    'defence-down': { label: 'Defence down', second: P.steel },
    haste: { label: 'Haste', boost: true, second: P.cream },
  };
  return portGenerator({
    id: 'status.icons', family: 'ui', units: 25, size: [16, 16], origin: [8, 8],
    states: { poison: { frames: 1 }, sleep: { frames: 1 }, stun: { frames: 1 }, burn: { frames: 1 }, freeze: { frames: 1 }, 'attack-up': { frames: 1 }, 'defence-up': { frames: 1 }, 'attack-down': { frames: 1 }, 'defence-down': { frames: 1 }, haste: { frames: 1 } },
    about: 'Ten tiny status marks: poison, sleep, stun, burn, freeze, attack and defence up and down, and haste.',
    args: {
      backing: word(['none', 'round', 'square'], { default: 'none', about: 'Backing' }),
      bold: flag({ default: false, about: 'Bold' }),
      shine: flag({ default: true, about: 'Shine' }),
      face: paint({ about: 'Plate' }),
      good: paint({ about: 'Boost' }),
      bad: paint({ about: 'Ailment' }),
    },
    draw(g, { clip, p }) {
    const mark = MARKS[clip], picture = statusMark(clip, { bold: p.bold });
    // the picture is centred in the 14x14 a glyph may fill; its outline goes on before the plate is put behind it
    const s = new Surface(...SIZE);
    drawGlyph(s, picture, 1 + ((14 - picture.w) >> 1), 1 + ((14 - picture.h) >> 1), { main: mark.boost ? p.good : p.bad, second: mark.second, shine: p.shine });
    s.outline(INK);
    if (p.backing !== 'none') glyphPlate(g, 1, 1, 14, { shape: p.backing, face: p.face, shine: p.shine });
    g.blit(s);
  },
  });
})();


// ---- crosshair@1 (tests/fixtures/code-sprites/ui-crosshair.js) ---------------------------------------------------------

/** crosshair@1: An aiming cursor that breathes, kicks when firing, shows a reload sweep and flashes a hit marker (port of tests/fixtures/code-sprites/ui-crosshair.js). */
export const crosshairPort = (() => {
  const P = PALETTE.derelict;
  const C = 16;                                        // the centre point: pivot, hot spot and centre of every turn
  const KICK = 3;
  const FAR = 11;                                      // cross, circle, arrow heads: no mark reaches further along its axis at rest. With the kick that is 14, and the ink line stays off the frame's edge
  const BOX = 10;                                      // brackets: half the widest box. Its corners are the farthest points of any style: at 10, with the kick, their ink line is on pixel 13
  const WING = 5;                                      // columns of an arrow head on each side of its point: the notch between the wings is then 3 px deep inside the ink
  const LANE = 13;                                     // reload: the widest arc that stays in the frame has its middle line 13 px out (2 px of arc, then its ink line on pixel 14)
  const INNER = 5;                                     // reload: the middle line of an arc that goes round the dot instead, one clear pixel outside the dot's ink line
  const CLEAR = 4.2;                                   // from a mark's last pixel to the middle line of the arc: ink, a clear pixel, ink, half the arc, and the slack of the pixel grid on a slant
  const EDGE = 13;                                     // hit: the last pixel out along a diagonal that a tick may cover (its ink line is then on pixel 14)
  const TURN = [0, Math.atan(0.5), PI / 4, Math.atan(2)];
  const SPINS = ['cross', 'circle', 'chevrons'];       // the styles that can turn (see the header for why brackets cannot)

  const fps = (base) => (p) => base * lerp(0.65, 1.45, p.speed);

  /**
   * Sizes in pixels from the settings, per style.
   * cross, circle: th thickness, gap clear space round the centre, R reach from the centre.
   * brackets: th thickness, open from an axis to the end of an arm (so two neighbours never close the box), S half the box.
   * chevrons: deep thickness of the arrow head measured along its axis, gap from the centre to its point, wing columns on each side.
   */
  function dims(p) {
    const chunky = p.thickness >= 0.5, size = Math.round(lerp(7, FAR, p.size));
    if (p.style === 'brackets') {
      // the opening between two neighbours is twice `open`, less their ink lines: 4 px at the tightest (3 for the moment one
      // pair breathes in). An arm is at least 3 px longer than it is thick: shorter, the ink line fills the corner and the
      // piece is only a block. The box is never more than BOX px to a side of the centre
      const th = chunky ? 3 : 2, open = Math.round(lerp(3, BOX - th - 3, p.gap));
      return { th, open, S: Math.max(Math.round(lerp(7, BOX, p.size)), open + th + 3) };
    }
    if (p.style === 'chevrons') {
      // the wings come first (never fewer than WING columns), then the gap, then the size, in what room the frame leaves.
      // The point is never closer than 3 px: closer, the ink lines of two neighbours' wings would touch
      const deep = chunky ? 3 : 2, gap = Math.round(lerp(3, FAR + 1 - deep - WING, p.gap));
      return { deep, gap, wing: Math.max(size, gap + deep + WING - 1) + 1 - deep - gap };
    }
    const th = chunky ? 4 : 2, gap = Math.round(lerp(th / 2 + 1, th / 2 + 4, p.gap));
    return { th, gap, R: Math.max(size, gap + 3) };               // 3 px of mark at the least
  }

  /** The marks as they wait out a reload, drawn in to leave the arc a lane outside them: a cross no longer than 9 px, a circle no wider than 8, arrow heads in their smallest form. Brackets keep their shape and step out instead (see render). */
  function waiting(style, D) {
    if (style === 'brackets') return D;
    if (style === 'chevrons') return { deep: 2, gap: 3, wing: WING - 1 };
    return { ...D, R: Math.min(D.R, style === 'circle' ? 8 : 9) };
  }

  /** One straight mark (cross, circle), drawn round (0, 0) at the top, moved `d` px outward: a shape test for spunIn, which also turns it. */
  function mark(style, D, d) {
    if (style === 'cross') return rectIn(-D.th / 2, -D.R - d, D.th, D.R - D.gap);
    // a quarter of a ring, shorter the wider the gap: tight leaves a 2 px break at each diagonal
    const { th, gap } = D, out = D.R + d, o2 = out * out, i2 = (out - th) * (out - th), k = lerp(0.82, 0.42, (gap - th / 2 - 1) / 3);
    return (x, y) => { const r2 = x * x + y * y; return y < 0 && r2 <= o2 && r2 > i2 && Math.abs(x) < -y * k; };
  }

  /** One corner piece (brackets) or arrow head (chevrons) round (0, 0), moved `d` px outward: two clean bars from its tip. An arrow head is first turned by `angle`. */
  function corner(style, D, d, angle = 0) {
    // brackets: the corner at the top right of a box; both arms stop `open` px short of the axes
    if (style === 'brackets') { const S = D.S + d, len = D.S - D.open; return cornerIn(S - 0.5, 0.5 - S, -len, 0, 0, len, D.th); }
    // chevrons: an arrow head pointing at the centre, its point `gap` px away, its wings sloping back and out. Turned, its point
    // and its wings are turned and the bars drawn afresh; it then moves outward by whole pixels, along the nearest of the eight ways
    const c = Math.cos(angle), s = Math.sin(angle), turn = (x, y) => [x * c - y * s, x * s + y * c];
    const [tx, ty] = turn(0, -D.gap - 0.5), [ox, oy] = turn(0, -1), most = Math.max(Math.abs(ox), Math.abs(oy));
    const step = (v) => (Math.abs(v) > 0.6 * most ? Math.sign(v) * d : 0);
    // its wings are `deep` px per column on the slant, which is deep / 1.41 px across; never under 1.6, so no turn thins them to a hairline
    return cornerIn(tx + step(ox), ty + step(oy), ...turn(D.wing, -D.wing), ...turn(-D.wing, -D.wing), Math.max(1.6, D.deep / Math.SQRT2));
  }

  /** The four marks as two pairs (upright and level), each moved outward by its own amount and all turned by `angle`. */
  function marks(style, D, dA, dB, angle = 0) {
    const bars = style === 'brackets' || style === 'chevrons';
    const a = bars ? spunIn(corner(style, D, dA, angle), C, C, 2) : spunIn(mark(style, D, dA), C, C, 2, angle);
    const b = bars ? spunIn(corner(style, D, dB, angle), C, C, 2, PI / 2) : spunIn(mark(style, D, dB), C, C, 2, angle + PI / 2);
    return (px, py) => a(px, py) || b(px, py);
  }

  /** Four diagonal ticks of a hit marker, covering pixels `from` to `to` counted out from the centre: a shape test. */
  function ticks(from, to) {
    const one = (x, y) => { const far = Math.max(x, -y); return x > 0 && y < 0 && Math.abs(x + y) < 1.25 && far > from && far < to + 1; };
    return spunIn(one, C, C, 4);
  }

  /**
   * Where the hit ticks may lie so that they never touch the marks: [from, to], pixels counted out from the centre along a diagonal.
   * Brackets hold them inside the box, from the dot to the last pixel clear of the corner piece. Every other style has them start
   * where the diagonal is clear all the way out: between the arms of a cross, through the breaks of an open circle, beyond a ring.
   * "Clear" is one pixel between tick and mark, which the ink line fills; arrow heads run alongside the ticks and would still read
   * as one shape with them, so there it is two, and the ticks start beyond the wings.
   */
  function tickRoom(style, shape) {
    const near = grownIn(shape, style === 'chevrons' ? 2 : 1);
    const clear = (i) => !(near(C + i + 0.5, C - i - 0.5) || near(C + i + 0.5, C - i + 0.5) || near(C + i - 0.5, C - i - 0.5));      // the three pixels of a tick, `i` out
    let from = EDGE, to = 2;
    if (style === 'brackets') { while (to < EDGE && clear(to + 1)) to++; return [2, to]; }
    while (from > 2 && clear(from - 1)) from--;
    return [from, EDGE];
  }
  return portGenerator({
    id: 'crosshair', family: 'ui', units: 60, size: [32, 32], origin: [16, 16],
    states: { idle: { frames: 8 }, shoot: { frames: 4, loop: false }, reload: { frames: 8 }, hit: { frames: 4, loop: false } },
    about: 'An aiming cursor that breathes, kicks when firing, shows a reload sweep and flashes a hit marker.',
    args: {
      style: word(['cross', 'circle', 'brackets', 'chevrons'], { default: 'cross', about: 'Style' }),
      size: share({ default: 0.6, about: 'Size: Small to Big' }),
      gap: share({ default: 0.35, about: 'Gap: Tight to Open' }),
      thickness: share({ default: 0.25, about: 'Thickness: Thin to Chunky' }),
      spin: flag({ default: false, about: 'Spin' }),
      body: paint({ about: 'Body' }),
      accent: paint({ about: 'Accent' }),
    },
    draw(g, { clip, t, frame, p }) {
    let D = dims(p), dA = 0, dB = 0, angle = 0, colour = p.body;
    if (clip === 'idle') {
      // each pair is out for half the loop, a quarter of a loop apart; both are in on frame 0
      // (when it spins the breathing falls on the frames between two turns, so every frame moves)
      const spins = p.spin && SPINS.includes(p.style), late = spins ? 0.125 : 0, breath = p.style === 'brackets' ? -1 : 1;
      dA = fract(t + late) < 0.5 ? 0 : breath;
      dB = fract(t + 0.25 + late) < 0.5 ? 0 : breath;
      // spinning: a quarter turn per loop in four steps whose lines are clean in pixels (level, one up
      // for two along, the diagonal, two up for one along), two frames each
      if (spins) angle = TURN[frame >> 1];
    } else if (clip === 'shoot') dA = dB = KICK - frame;
    else if (clip === 'reload') {
      D = waiting(p.style, D);
      colour = tone(p.body, -1.4);
      // brackets step out until the arc has room to go round the dot inside them
      if (p.style === 'brackets') while (reachOf(marks(p.style, D, dA, dA), C, C, 32).near < INNER + CLEAR) dA++;
      dB = dA;
    }
    const shape = marks(p.style, D, dA, dB, angle);
    g.fill(0, 0, 32, 32, shape, colour);

    if (clip === 'reload') {
      // the arc is 2 px wide and its ink line starts 2 px beyond the farthest pixel of the marks; where that
      // would leave the frame it goes round the dot instead, with a longer sweep to make up for the small circle.
      // It runs clockwise from the top: a bright head, and a tail between the head and the dimmed marks in value
      const round = Math.ceil(reachOf(shape, C, C, 32).far + CLEAR), r = round <= LANE ? round : INNER;
      const start = PI - TAU * t, head = lerp(1.2, 0.6, (r - INNER) / (LANE - INNER)), tail = 2.3 * head;
      g.arc(C, C, r, start + head, start + head + tail, 2, tone(p.body, -0.7));
      g.arc(C, C, r, start, start + head, 2, p.body);
    }
    if (clip === 'hit' && frame < 3) {
      // five pixels long while they flash, then four, two further out (or as far out as their room goes)
      const [from, to] = tickRoom(p.style, shape), start = frame === 2 ? Math.min(from + 2, to - 1) : from;
      g.fill(0, 0, 32, 32, ticks(start, Math.min(to, start + (frame === 2 ? 3 : 4))), frame === 0 ? '#ffffff' : p.accent);
    }

    // the centre dot marks the hot spot
    g.rect(C - 1, C - 1, 2, 2, p.accent);
    g.outline(INK);
  },
  });
})();


// ---- battle.menu@1 (tests/fixtures/code-sprites/ui-battle-menu.js) -----------------------------------------------------

/** battle.menu@1: A stretchable command panel with a highlight row, a diamond-headed arrow cursor and a bouncing turn marker (port of tests/fixtures/code-sprites/ui-battle-menu.js). */
export const battleMenuPort = (() => {
  const P = PALETTE.hearthvale;
  const SIZE = [96, 64];
  const ROW = { x: 8, y: 25, w: 80, h: 14 };         // the highlight, centred in the frame
  const CURSOR = { x: 38, y: 32, shaft: 9, head: 4 }; // the arrow: left end of its shaft, its middle row, and the diamond's reach

  const fps = (base) => (p) => base * lerp(0.65, 1.45, p.speed);
  const slide = (t) => Math.round(1 + wave(t));      // 0..2 px towards the command and back
  function oldTextArea(clip, p) {
    if (clip === 'row') return { x: ROW.x + 3, y: ROW.y + 3, w: ROW.w - 6, h: ROW.h - 6 };
    const out = panel9(new Surface(...SIZE), 1, 1, SIZE[0] - 2, SIZE[1] - 2, { style: p.style, corner: p.corner, border: p.border, face: p.face, frame: p.frame, accent: p.accent });
    return { ...out.inner, edge: { x: SIZE[0] >> 1, y: out.body.y + (p.style === 'scroll' ? 2 : borderPx(p.border)) } };
  }
  return portGenerator({
    id: 'battle.menu', family: 'ui', units: 120, size: [96, 64], origin: [48, 32],
    states: { panel: { frames: 1 }, row: { frames: 1 }, cursor: { frames: 8 }, 'turn-marker': { frames: 8 } },
    about: 'A stretchable command panel with a highlight row, a diamond-headed arrow cursor and a bouncing turn marker.',
    args: {
      style: word(['plain', 'ornate', 'scroll'], { default: 'plain', about: 'Style' }),
      corner: share({ default: 0.5, about: 'Corner: Square to Round' }),
      border: share({ default: 0.5, about: 'Border: Thin to Thick' }),
      face: paint({ about: 'Face' }),
      frame: paint({ about: 'Frame' }),
      accent: paint({ about: 'Accent' }),
    },
    draw(g, { clip, t, p }) {
    if (clip === 'panel') {
      panel9(g, 1, 1, SIZE[0] - 2, SIZE[1] - 2, { style: p.style, corner: p.corner, border: p.border, face: p.face, frame: p.frame, accent: p.accent });
      return;
    }
    if (clip === 'row') { highlight(g, ROW.x, ROW.y, ROW.w, ROW.h, { colour: p.accent, fill: tone(p.face, -0.6), corner: p.corner }); return; }
    if (clip === 'cursor') {
      // a short shaft in the frame colour and a diamond head in the accent colour, pointing right
      const x = CURSOR.x + slide(t), y = CURSOR.y, r = CURSOR.head, cx = x + CURSOR.shaft - 1 + r;
      g.rect(x, y - 1, CURSOR.shaft, 3, ramp(p.frame), { shade: 1 });
      g.fill(cx - r, y - r, cx + r + 1, y + r + 1, (px, py) => Math.abs(Math.floor(px) - cx) + Math.abs(Math.floor(py) - y) <= r, ramp(p.accent), { shade: 1, light: 1 });
      g.outline(INK);
      return;
    }
    // turn-marker: an arrow head that hops over the fighter: up fast, a moment at the top, down again
    const lift = Math.round(3 * Math.sin(PI * t));
    triangle(g, 48, 33 - lift, 11, 'down', ramp(p.accent), { shade: 1 });
    g.outline(INK);
  },
    measure(clip, p) { return { textArea: oldTextArea(clip, p), slice: { panel: slice9(), row: { rect: ROW, left: 4, top: 4, right: 4, bottom: 4 } }[clip] }; },
    // the cursor's hot spot: the middle of the pixel at its point, sliding with the arrow (the old sockets(); review M9 round 2)
    points: (clip, p, t) => (clip === 'cursor' ? { tip: { x: CURSOR.x + slide(t) + CURSOR.shaft - 1 + 2 * CURSOR.head + 1.5, y: CURSOR.y + 0.5, angle: PI / 2 } } : {}),
  });
})();


// ---- hud.platformer@1 (tests/fixtures/code-sprites/ui-hud-platformer.js) -----------------------------------------------

/** hud.platformer@1: Hearts (full, half, empty), a coin, a key, a star and a gem for the top of the screen, with a heart breaking and a heart filling (port of tests/fixtures/code-sprites/ui-hud-platformer.js). */
export const hudPlatformerPort = (() => {
  const P = PALETTE.thornwood;
  const N = 16;
  const ALL = [0, 0, N, N];
  const HEARTS = ['classic', 'round', 'pixel'];

  // The heart, 10 or 11 px wide: the same three shapes as the heart pickup, at the sizes where each keeps a clean
  // notch and a one-pixel tip. Its middle column is column 8.
  function heartShape(style) {
    if (style === 'pixel') return placedIn(heartIn(0, 0, 20, 16, 'pixel'), 8, 8, { sx: 0.5 });
    return style === 'round' ? heartIn(8.5, 8, 11, 10, 'round') : heartIn(8.5, 7.5, 11, 9, 'classic');
  }
  // The crack of a breaking heart: a zigzag from the notch to the tip.
  const CRACK = [[7, 4], [7, 5], [8, 6], [9, 7], [8, 8], [7, 9], [8, 10], [8, 11]];

  // A key standing on its tip, bow up and teeth to the right (engine/glyphs.js: one character is one pixel).
  const KEY = glyphPicture([
    '.#oo*..',
    '#o..o*.',
    '#o..oo.',
    'x#..oo.',
    '.x#oo..',
    '..#o...',
    '..#o...',
    '..#ooo.',
    '..#o...',
    '..#ooo.',
    '..x#...',
  ]);
  const KEY_AT = [5, 2];

  // Where a heart is cut for a half (its left half stays lit) and the rows its level climbs between.
  const HEART_LEVEL = { split: 9, top: 3, bottom: 13 };

  /** A heart: `level` 1 full, 0 empty; 'half' keeps its left half; a number between fills it from the tip up. */
  function heart(s, level, p, { glint = true } = {}) {
    slotFill(s, heartShape(p.shape), p.body, p.accent, { on: levelIn(level, HEART_LEVEL), shine: p.shine });
    // the gloss on the right lobe: a short white mark with a dot under it
    if (p.shine && glint && level !== 'half' && level >= 1) {
      const [gx, gy] = p.shape === 'pixel' ? [10, 5] : p.shape === 'round' ? [11, 4] : [11, 4];
      s.rect(gx, gy, 2, 1, '#ffffff'); s.dot(gx + 1, gy + 1, '#ffffff');
    }
  }

  function coin(s, p) {
    const M = ramp(p.metal);
    s.fill(...ALL, ellipseIn(8, 8, 5, 5), M, { shade: 1, light: p.shine ? 1 : 0 });
    s.fill(...ALL, ellipseIn(8, 8, 3, 3), M.light);                     // the raised middle
    s.rect(7, 7, 2, 2, M.dark);                                         // the square hole stamped in it
    if (p.shine) { s.dot(10, 4, '#ffffff'); s.dot(11, 5, '#ffffff'); s.dot(11, 6, '#ffffff'); }
  }

  function star(s, p, empty) {
    slotFill(s, markIn('star', 8, 8, 9), p.metal, p.accent, { on: levelIn(empty ? 0 : 1), shine: p.shine });
    if (!empty && p.shine) { s.dot(8, 5, '#ffffff'); s.dot(9, 6, '#ffffff'); s.dot(10, 7, '#ffffff'); }
  }

  function key(s, p, empty) {
    // an empty slot is the same key in the socket's colours: the accent colour, unlit
    drawGlyph(s, KEY, KEY_AT[0], KEY_AT[1], empty ? { main: socketTones(p.accent).mark, shine: false } : { main: p.metal, shine: p.shine });
  }

  const still = (label) => ({ frames: 1, fps: 1, loop: true, label });
  const moving = (label) => ({ frames: 4, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: false, label });
  return portGenerator({
    id: 'hud.platformer', family: 'ui', units: 50, size: [16, 16], origin: [8, 8],
    states: { 'heart-full': { frames: 1 }, 'heart-half': { frames: 1 }, 'heart-empty': { frames: 1 }, coin: { frames: 1 }, key: { frames: 1 }, 'key-empty': { frames: 1 }, star: { frames: 1 }, 'star-empty': { frames: 1 }, gem: { frames: 1 }, 'heart-lose': { frames: 4, loop: false }, 'heart-gain': { frames: 4, loop: false } },
    about: 'Hearts (full, half, empty), a coin, a key, a star and a gem for the top of the screen, with a heart breaking and a heart filling.',
    args: {
      shape: word(['classic', 'round', 'pixel'], { default: 'classic', about: 'Shape' }),
      shine: flag({ default: true, about: 'Shine' }),
      shadow: flag({ default: true, about: 'Shadow' }),
      body: paint({ about: 'Hearts' }),
      accent: paint({ about: 'Empty' }),
      metal: paint({ about: 'Coin, key and star' }),
    },
    draw(g, { clip, frame, p }) {
    const s = new Surface(N, N);
    let dy = 0, flash = false;
    if (clip === 'heart-full') heart(s, 1, p);
    else if (clip === 'heart-half') heart(s, 'half', p);
    else if (clip === 'heart-empty') heart(s, 0, p);
    else if (clip === 'coin') coin(s, p);
    else if (clip === 'key' || clip === 'key-empty') key(s, p, clip === 'key-empty');
    else if (clip === 'star' || clip === 'star-empty') star(s, p, clip === 'star-empty');
    else if (clip === 'gem') drawGem(s, 8, 8, 5, 5, P.magic, { cut: 'diamond', facets: true });
    else if (clip === 'heart-lose') {
      // 0 a white jolt upward, 1 cracked, 2 cracked and half drained, 3 empty
      if (frame === 0) { heart(s, 1, p, { glint: false }); flash = true; dy = -1; }
      else if (frame === 3) heart(s, 0, p);
      else {
        heart(s, frame === 1 ? 1 : 0.42, p, { glint: frame === 1 });
        const H = heartShape(p.shape);
        for (const [x, y] of CRACK) if (H(x + 0.5, y + 0.5)) s.dot(x, y, INK);
      }
    } else {
      // heart-gain: 0 empty, 1 filled half way from the tip, 2 full and white, 3 full
      if (frame === 0) heart(s, 0, p);
      else if (frame === 1) heart(s, 0.5, p, { glint: false });
      else if (frame === 2) { heart(s, 1, p, { glint: false }); flash = true; }
      else heart(s, 1, p);
    }
    if (flash) s.tint('#ffffff');
    const layer = dy ? new Surface(N, N).blit(s, 0, dy) : s;
    stampGlyph(g, layer, { shadow: p.shadow ? 1 : 0 });
  },
  });
})();


// ---- hud.roguelite@1 (tests/fixtures/code-sprites/ui-hud-roguelite.js) -------------------------------------------------

/** hud.roguelite@1: Health and shield pips, a credit, a key and floor-map rooms (current, boss, shop, unknown) for the top of the screen (port of tests/fixtures/code-sprites/ui-hud-roguelite.js). */
export const hudRoguelitePort = (() => {
  const P = PALETTE.derelict;
  const N = 16, C = 8;                                 // the frame, and its centre point
  const ALL = [0, 0, N, N];

  // The outline of a pip, 10x10 before its ink line.
  const PIPS = {
    block: () => cutRectIn(3, 3, 10, 10, [3, 1, 3, 1]),
    diamond: () => (px, py) => Math.abs(px - C) + Math.abs(py - C) < 5.25,
    cell: () => { const can = cutRectIn(3, 5, 10, 8, 1), nub = rectIn(6, 3, 4, 2); return (px, py) => can(px, py) || nub(px, py); },
  };
  // Where the glint goes on each pip: four pixels by the top right edge.
  const GLINT = { block: [[9, 4], [10, 4], [11, 5], [11, 6]], diamond: [[8, 4], [9, 5], [10, 6], [10, 7]], cell: [[9, 6], [10, 6], [11, 7], [11, 8]] };

  const dark = (c) => mix(INK, c, 0.3);                // the unlit inside of an empty pip, an unknown room
  const dim = (c) => mix(INK, c, 0.62);                // a mark that is there but switched off

  /** A pip: `kind` hp or shield, `level` full, half or empty. The lit part takes the colour, the rest is a socket in the accent colour. */
  function pip(s, kind, level, p) {
    const outer = PIPS[p.shape](), inner = insetIn(outer, 1);
    // half a pip: a block and a diamond keep their left half, a cell its lower half
    const on = level === 'full' ? () => true : level === 'empty' ? () => false : p.shape === 'cell' ? (px, py) => py > C : (px) => px < C;
    const colour = kind === 'hp' ? p.body : p.lit, off = notIn(on);
    s.fill(...ALL, allIn(outer, on), ramp(colour), { shade: 1, light: 1 });
    s.fill(...ALL, allIn(outer, off), p.accent);
    s.fill(...ALL, allIn(inner, off), dark(p.accent));
    if (kind === 'hp') {
      const plus = allIn(crossIn(C, C, 6, 2), inner);
      s.fill(...ALL, allIn(plus, on), P.cream);
      s.fill(...ALL, allIn(plus, off), dim(p.accent));
    } else {
      const hole = insetIn(outer, 3), ring = allIn(insetIn(outer, 2), notIn(hole));
      s.fill(...ALL, allIn(hole, on), dark(colour));
      s.fill(...ALL, allIn(ring, off), dim(p.accent));
    }
    if (p.shine) for (const [x, y] of GLINT[p.shape]) if (inner(x + 0.5, y + 0.5) && on(x + 0.5, y + 0.5)) s.dot(x, y, '#ffffff');
  }

  /** A credit chip: six sides, and on the big one a ring stamped round its flat middle. `r` is half its width (5 for the HUD mark, 3 inside a shop). */
  function chip(s, r, p) {
    const hex = hexIn(C, C, 2 * r, r >= 5 ? 2 * r : 2 * r + 2), M = ramp(p.metal);
    s.fill(...ALL, hex, M, { shade: 1, light: 1 });
    if (r >= 5) {
      // one closed loop, 4 px across: a flat rim 2 px wide stays between it and the shadow down the left and along the bottom
      s.fill(...ALL, ringIn(C, C, 2, 1), M.dark);
      if (p.shine) for (const [x, y] of [[9, 4], [10, 5], [11, 6], [11, 7]]) s.dot(x, y, '#ffffff');
    }
  }

  /** A keycard: an upright pass with one corner cut, a slot to hang it by, a dark stripe and a small light. */
  function card(s, p) {
    const body = cutRectIn(4, 3, 8, 10, [0, 3, 0, 0]), M = ramp(p.metal);
    s.fill(...ALL, body, M, { shade: 1, light: 1 });
    s.rect(6, 4, 3, 1, dark(p.metal));                 // the slot
    s.rect(4, 7, 8, 2, dim(p.metal));                  // the stripe
    s.rect(6, 10, 2, 2, P.cyan);                       // the light
    if (p.shine) for (const [x, y] of [[9, 5], [10, 6], [9, 7], [10, 7]]) s.dot(x, y, '#ffffff');   // a gleam down the corner and across the stripe
  }

  /** A room of the floor map: walls round a floor, and what the room holds. */
  function room(s, what, p) {
    const outer = cutRectIn(3, 3, 10, 10, 1), floor = rectIn(4, 4, 8, 8);
    // walls one tone lighter than the floor they stand round: a known room is light, an unknown one dark
    const tones = what === 'current' ? ramp(p.lit) : what === 'boss' ? ramp(P.red) : ramp(p.accent);
    const [wall, ground] = what === 'boss' ? [tones.base, tones.deep] : what === 'unknown' ? [tones.base, dark(p.accent)] : what === 'shop' ? [tones.light, tones.dark] : [tones.light, tones.base];
    s.fill(...ALL, outer, wall);
    s.fill(...ALL, floor, ground);
    if (what === 'current') {
      s.rect(C - 1, C - 1, 2, 2, P.cream);             // you are here
      if (p.shine) for (const [x, y] of [[9, 4], [10, 4], [11, 5], [11, 6]]) s.dot(x, y, '#ffffff');
    }
    if (what === 'boss') drawMark(s, 'skull', C, C - 1, 7, P.cream);
    if (what === 'shop') chip(s, 3, p);
    if (what === 'plain') s.rect(4, 4, 8, 1, tones.dark);            // the far wall's shadow on the floor
    if (what === 'unknown') drawMark(s, 'question', C, C - 1, 7, tones.light);
  }

  const CLIPS = {
    'hp-full': 'Health', 'hp-half': 'Half health', 'hp-empty': 'No health', 'shield-full': 'Shield', 'shield-empty': 'No shield',
    credit: 'Credit', key: 'Key', room: 'Room', 'room-current': 'Current room', 'room-boss': 'Boss room', 'room-shop': 'Shop', 'room-unknown': 'Unknown room',
  };
  return portGenerator({
    id: 'hud.roguelite', family: 'ui', units: 25, size: [16, 16], origin: [8, 8],
    states: { 'hp-full': { frames: 1 }, 'hp-half': { frames: 1 }, 'hp-empty': { frames: 1 }, 'shield-full': { frames: 1 }, 'shield-empty': { frames: 1 }, credit: { frames: 1 }, key: { frames: 1 }, room: { frames: 1 }, 'room-current': { frames: 1 }, 'room-boss': { frames: 1 }, 'room-shop': { frames: 1 }, 'room-unknown': { frames: 1 } },
    about: 'Health and shield pips, a credit, a key and floor-map rooms (current, boss, shop, unknown) for the top of the screen.',
    args: {
      shape: word(['block', 'diamond', 'cell'], { default: 'block', about: 'Shape' }),
      bold: flag({ default: true, about: 'Bold' }),
      shine: flag({ default: true, about: 'Shine' }),
      body: paint({ about: 'Health' }),
      lit: paint({ about: 'Shield' }),
      accent: paint({ about: 'Empty' }),
      metal: paint({ about: 'Credits and keys' }),
    },
    draw(g, { clip, p }) {
    const s = new Surface(N, N);
    if (clip.startsWith('hp-')) pip(s, 'hp', clip.slice(3), p);
    else if (clip.startsWith('shield-')) pip(s, 'shield', clip.slice(7), p);
    else if (clip === 'credit') chip(s, 5, p);
    else if (clip === 'key') card(s, p);
    else room(s, clip === 'room' ? 'plain' : clip.slice(5), p);
    // bold: a heavier ink line, and the whole mark again in ink 1 px down and to the left, under it
    stampGlyph(g, s, { heavy: p.bold, shadow: p.bold ? 1 : 0 });
  },
  });
})();


// ---- score.counter@1 (tests/fixtures/code-sprites/ui-score-counter.js) -------------------------------------------------

/** score.counter@1: A score plate for the top of the screen: a case with a picture and a row of digit windows, a digit that rolls up like an odometer and a bump when points arrive, plus the empty plate for the game's own digits (port of tests/fixtures/code-sprites/ui-score-counter.js). */
export const scoreCounterPort = (() => {
  const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
  const SIZE = [96, 24];
  const CASE = { x: 1, y: 1, w: 94, h: 22 };     // the frame less its 1 px border, in every clip
  const BORDER = 0.5;                            // a 2 px band
  const INSIDE = 1 + (1 + Math.round(BORDER)) + 1;   // ink, band, ink: where the case's inside starts
  const LEAD = 13;                               // the picture (12 px with its ink) and 1 px before the windows
  const SAMPLE = 1250;

  // The sample as the windows show it: the last `digits` places, padded with zeros or left empty (null).
  function sample(n, p) {
    const s = String(n).slice(-p.digits), pad = p.digits - s.length;
    return [...Array(pad).fill(p.zeros ? '0' : null), ...s];
  }

  // The case and its windows, the same in every clip.
  function plate(g, p) {
    return styledCounterPlate(g, CASE.x, CASE.y, CASE.w, CASE.h, {
      count: p.digits, metrics: fontMetrics(p.size, 'chunky'), style: p.style, face: p.face, frame: p.frame,
      border: BORDER, lead: p.icon === 'none' ? 0 : LEAD,
    });
  }

  // The picture just left of the first window (2 px of case between their inks): 10 px of fixed colour inside a
  // 1 px ink line, lifted `dy` px.
  function picture(g, kind, first, dy) {
    if (kind === 'none') return;
    const s = new Surface(...SIZE), cx = first.x - 8, cy = CASE.y + INSIDE + 7;
    if (kind === 'star') s.fill(cx - 6, cy - 6, cx + 6, cy + 6, starIn(cx, cy + 0.6, 5.6, 5, { inner: 0.45 }), ramp(P.gold), { light: 1 });
    else if (kind === 'heart') s.fill(cx - 6, cy - 6, cx + 6, cy + 6, heartIn(cx, cy, 10, 9), ramp(P.crimson), { light: 1 });
    else {
      s.ellipse(cx, cy, 5, 5, ramp(P.gold), { light: 1 });
      s.ellipse(cx, cy, 3, 3, ramp(P.gold).dark, { shade: 0 });
      s.ellipse(cx, cy, 2, 2, ramp(P.gold).light, { shade: 0 });
    }
    s.outline(INK);
    g.blit(s, 0, dy);
  }
  function oldTextArea(clip, p) {
    if (clip !== 'frame') return null;
    const out = plate(new Surface(...SIZE), p);
    return out.text.map((r) => ({ ...r, text: SKIN_TEXT.flat, edge: out.edge }));
  }
  return portGenerator({
    id: 'score.counter', family: 'ui', units: 80, size: [96, 24], origin: [48, 12],
    states: { idle: { frames: 1 }, roll: { frames: 6, loop: false }, bump: { frames: 4, loop: false }, frame: { frames: 1 } },
    about: 'A score plate for the top of the screen: a case with a picture and a row of digit windows, a digit that rolls up like an odometer and a bump when points arrive, plus the empty plate for the game\'s own digits.',
    args: {
      style: word(['plate', 'strip', 'drum'], { default: 'plate', about: 'Style' }),
      digits: px(3, 7, { default: 6, about: 'Digits: Few to Many' }),
      size: share({ default: 0.5, about: 'Size: Small to Big' }),
      icon: word(['none', 'star', 'coin', 'heart'], { default: 'star', about: 'Picture' }),
      zeros: flag({ default: true, about: 'Leading zeros' }),
      face: paint({ about: 'Windows' }),
      frame: paint({ about: 'Case' }),
      lit: paint({ about: 'Digits' }),
    },
    draw(g, { clip, frame, p }) {
    const { windows } = plate(g, p), metrics = fontMetrics(p.size, 'chunky');
    const lift = clip === 'bump' && frame === 1 ? -1 : 0;
    picture(g, p.icon, windows[0], lift);
    if (clip === 'frame') return;
    const now = sample(SAMPLE, p), next = sample(SAMPLE + 1, p), last = windows.length - 1;
    const colour = clip === 'bump' && frame === 0 ? '#ffffff' : p.lit;
    windows.forEach((win, i) => {
      if (clip === 'roll' && i === last && frame > 0) {
        // frames 1 to 4 the last digit on its way up, 5 the next digit at rest
        rollDigit(g, win, Number(now[i]), Number(next[i]), Math.min(1, frame / 5), metrics, { colour });
      } else if (now[i] !== null) windowDigit(g, win, now[i], metrics, { colour, dy: lift });
    });
  },
    measure(clip, p) { return { textArea: oldTextArea(clip, p) }; },
  });
})();


// ---- timer@1 (tests/fixtures/code-sprites/ui-timer.js) -----------------------------------------------------------------

/** timer@1: A countdown or lap timer for the screen: a small clock beside the time, a colon that blinks and red digits that flash and shake when time is short, plus the empty case for the game's own digits (port of tests/fixtures/code-sprites/ui-timer.js). */
export const timerPort = (() => {
  const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
  const SIZE = [64, 24];
  const CASE = { x: 1, y: 1, w: 62, h: 22 };     // the frame less its 1 px border, in every clip and format
  const BORDER = 0.5;                            // a 2 px band
  const INSIDE = 1 + (1 + Math.round(BORDER)) + 1;   // ink, band, ink: where the case's inside starts
  const LEAD = 11;                               // the clock: its ink circle shares the case's inner ink on the left
  const FORMATS = { seconds: { sample: '30', colon: -1 }, minutes: { sample: '130', colon: 1 }, clock: { sample: '0130', colon: 2 } };

  function plate(g, p) {
    const f = FORMATS[p.format];
    const out = styledCounterPlate(g, CASE.x, CASE.y, CASE.w, CASE.h, {
      count: f.sample.length, metrics: fontMetrics(p.size, 'chunky'), style: p.style, face: p.face, frame: p.frame,
      border: BORDER, colon: f.colon, lead: p.icon ? LEAD : 0,
    });
    if (f.colon > 0) bridgeColonGap(g, out.windows, f.colon);
    return out;
  }

  // The clock: a 1 px ink circle, the dial in the Windows colour, the ring and hands (a quarter past twelve) in cream.
  function clock(g, p) {
    const cx = CASE.x + INSIDE + 5, cy = CASE.y + INSIDE + 7;
    g.ellipse(cx, cy, 6, 6, INK, { shade: 0 });
    g.ellipse(cx, cy, 5, 5, p.face, { shade: 0 });
    g.fill(cx - 5, cy - 5, cx + 5, cy + 5, clockIn(cx, cy, 5, { hour: 0.25 / 12, minute: 0.25 }), P.cream);
  }

  // Crimson alone is about 1.5 to 1 on the Windows colours, so the warn digits get a lit edge: every body pixel with
  // no body pixel above it or to its left in the crimson's light tone (3.1 to 1 or more on every Windows swatch).
  // Drawn from the glyph's body (engine/pixel-font.js), at the place windowDigit puts it, clipped to the window.
  function warnDigit(g, win, ch, metrics, dx, colour, light) {
    const gl = fontGlyph(ch, metrics), pen = windowPen(win, ch, metrics), x0 = pen.x + dx, y0 = pen.base - gl.rise;
    for (let j = 0; j < gl.h; j++) for (let i = 0; i < gl.w; i++) {
      const x = x0 + i, y = y0 + j;
      if (!gl.body.at(i, j) || x < win.x || y < win.y || x >= win.x + win.w || y >= win.y + win.h) continue;
      g.dot(x, y, !gl.body.at(i, j - 1) || !gl.body.at(i - 1, j) ? light : colour);
    }
  }
  function oldTextArea(clip, p) {
    if (clip !== 'frame') return null;
    const out = plate(new Surface(...SIZE), p);
    return out.text.map((r) => ({ ...r, text: SKIN_TEXT.flat, edge: out.edge }));
  }
  return portGenerator({
    id: 'timer', family: 'ui', units: 60, size: [64, 24], origin: [32, 12],
    states: { idle: { frames: 1 }, tick: { frames: 8 }, warn: { frames: 8 }, frame: { frames: 1 } },
    about: 'A countdown or lap timer for the screen: a small clock beside the time, a colon that blinks and red digits that flash and shake when time is short, plus the empty case for the game\'s own digits.',
    args: {
      style: word(['plate', 'strip', 'drum'], { default: 'plate', about: 'Style' }),
      format: word(['seconds', 'minutes', 'clock'], { default: 'minutes', about: 'Format' }),
      size: share({ default: 0.5, about: 'Size: Small to Big' }),
      icon: flag({ default: true, about: 'Clock face' }),
      face: paint({ about: 'Windows' }),
      frame: paint({ about: 'Case' }),
      lit: paint({ about: 'Digits' }),
    },
    draw(g, { clip, frame, p }) {
    const { windows } = plate(g, p), metrics = fontMetrics(p.size, 'chunky'), f = FORMATS[p.format];
    if (p.icon) clock(g, p);
    if (clip === 'frame') return;
    const warn = clip === 'warn';
    const colour = warn ? (frame <= 1 ? '#ffffff' : P.crimson) : p.lit;
    const dx = warn ? (frame === 2 ? -1 : frame === 6 ? 1 : 0) : 0;
    const lit = clip === 'tick' && p.format === 'seconds' && frame <= 3 ? '#ffffff' : undefined;
    if (warn && frame > 1) {
      // the danger red, with a lit edge; the colon's dots are in the light tone
      const light = ramp(P.crimson).light;
      windows.forEach((win, i) => warnDigit(g, win, f.sample[i], metrics, dx, colour, light));
      if (f.colon > 0) wideCounterColon(g, windows, f.colon, metrics, { colour: light });
      return;
    }
    windows.forEach((win, i) => windowDigit(g, win, f.sample[i], metrics, { colour, dx, lit: i === windows.length - 1 ? lit : undefined }));
    if (f.colon > 0 && !(clip === 'tick' && frame >= 4)) wideCounterColon(g, windows, f.colon, metrics, { colour });
  },
    measure(clip, p) { return { textArea: oldTextArea(clip, p) }; },
  });
})();


// ---- upgrade.card@1 (tests/fixtures/code-sprites/ui-upgrade-card.js) ---------------------------------------------------

// Version 1 kept the colours of the disabled card (its golden was pinned while the port's desaturate returned its paint);
// version 2 (review M9 round 1, issue 8) greys each colour before the tones laid over it are worked out, exactly as the
// code did, through the `grey` colour rule (engine/gen/ports/ui.js desaturate). Both are one drawing, made by upgradeCard.
function upgradeCard(v, greyOf) {
  const P = PALETTE.derelict;
  const SIZE = [64, 96];
  const ICON = 32;                                     // the clear square
  // Where the body's top edge is in each state, and how much lip shows under it. Body 90 px, bottom edge on row 94.
  const STATES = { normal: { top: 3, lip: 2 }, hover: { top: 1, lip: 4 }, pressed: { top: 5, lip: 0 }, disabled: { top: 3, lip: 2 } };
  const HEAD = 51;                                     // rows from the body's top edge down to the text area
  const WELL = { x: 14, dy: 9, size: ICON + 4 };       // the icon square with its two rims, from the body's top edge
  const DEEP = 4;                                      // how much deeper a rarity's cut corners are

  /** Corners that carry a light, per rarity: top left, top right, bottom right, bottom left. */
  const LIGHTS = { common: [1, 0, 0, 0], rare: [1, 0, 1, 0], epic: [1, 1, 1, 1] };

  function shapeOf(p) {
    const k = cutPx(p.corner), deep = k + DEEP;
    return {
      cutPx: p.rarity === 'common' ? k : p.rarity === 'rare' ? [deep, k, deep, k] : deep,
      tab: p.rarity === 'epic' ? { inset: 12, rise: 3 } : undefined,
    };
  }

  /** Where things are in a state: the icon square's middle, the text area. Used by render, slice and sockets. */
  function layout(clip) {
    const { top } = STATES[clip];
    return { top, icon: { x: SIZE[0] / 2, y: top + WELL.dy + 2 + ICON / 2 }, text: { x: 8, y: top + HEAD, w: 48, h: 90 - HEAD - 7 } };
  }

  /** The card itself, drawn by the helper; everything else is laid over it. */
  function slab(g, clip, p) {
    const st = STATES[clip];
    return techPanel(g, 1, st.top, SIZE[0] - 2, SIZE[1] - 1 - st.top, {
      style: p.style, face: p.face, frame: p.frame, glow: p.lit, border: p.border, ...shapeOf(p), lip: st.lip, lights: LIGHTS[p.rarity], lit: clip === 'hover', off: clip === 'disabled', grey: greyOf,
    });
  }

  // The bottom border is the helper's: it covers the lip, the frame, a deep-cut corner and its light.
  const slice = (clip, p) => ({ left: 24, right: 24, top: layout(clip).text.y, bottom: 1 + slab(new Surface(...SIZE), clip, p).slice.bottom });
  function oldTextArea(clip) { const t = layout(clip).text; return { ...t, edge: { x: 2, y: t.y + (t.h >> 1) } }; }
  return portGenerator({
    id: 'upgrade.card', v, family: 'ui', units: 400, size: [64, 96], origin: [32, 48],
    states: { normal: { frames: 1 }, hover: { frames: 1 }, pressed: { frames: 1 }, disabled: { frames: 1 } },
    about: 'A tall sci-fi card with a square for an icon and a clear area for text, in normal, hover, pressed and disabled states.',
    args: {
      style: word(['plate', 'hologram', 'glass'], { default: 'plate', about: 'Style' }),
      rarity: word(['common', 'rare', 'epic'], { default: 'common', about: 'Rarity' }),
      corner: share({ default: 0.5, about: 'Corner: Square to Cut' }),
      border: share({ default: 0.5, about: 'Border: Thin to Thick' }),
      lines: flag({ default: true, about: 'Tech lines' }),
      face: paint({ about: 'Face' }),
      frame: paint({ about: 'Frame' }),
      lit: paint({ about: 'Glow' }),
    },
    draw(g, { clip, p }) {
    const st = STATES[clip], L = layout(clip), off = clip === 'disabled';
    const card = slab(g, clip, p);
    const T = card.tones, grey = (c) => (off ? greyOf(c) : c);

    // the head: one tone lighter than the text area, from the frame down to the rarity light
    const wx = WELL.x, wy = st.top + WELL.dy;
    scanLines(g, card.face.x, st.top, card.face.w, L.text.y - 4 - st.top, tone(T.face, 0.3), { pitch: 1, over: T.face });

    // the icon square: a rim in the tone of the lit edge, an ink line, a dark clear middle
    g.rect(wx, wy, WELL.size, WELL.size, T.edge);
    g.rect(wx + 1, wy + 1, WELL.size - 2, WELL.size - 2, INK);
    g.rect(wx + 2, wy + 2, ICON, ICON, grey(mix(INK, p.face, 0.5)));

    // vents: thin lines across the head, beside the icon square
    if (p.lines) scanLines(g, L.text.x, wy + 2, L.text.w, WELL.size - 3, T.face, { pitch: 3, skip: { x: wx - 1, y: wy, w: WELL.size + 2, h: WELL.size } });

    // the rarity light: a bar across the card between the head and the text
    g.rect(card.face.x, L.text.y - 4, card.face.w, 1, T.glow);
    g.rect(card.face.x, L.text.y - 3, card.face.w, 1, T.glowLow);
  },
    measure(clip, p) { return { textArea: oldTextArea(clip, p), slice: slice(clip, p) }; },
    // `icon`: the icon square's middle; `text`: the text area's top left; both move with the state (the old sockets(); review M9 round 2)
    points: (clip) => { const L = layout(clip); return { icon: { ...L.icon, angle: 0 }, text: { x: L.text.x, y: L.text.y, angle: 0 } }; },
  });
}
/** upgrade.card@1: A tall sci-fi card with a square for an icon and a clear area for text, in normal, hover, pressed and disabled states (port of tests/fixtures/code-sprites/ui-upgrade-card.js); its disabled card keeps its colours. */
export const upgradeCardPort = upgradeCard(1, ungreyed);
/** upgrade.card@2: upgrade.card@1 with its disabled card greyed exactly as the code greyed it, each colour before the tones laid over it (the grey colour rule). */
export const upgradeCard2Port = upgradeCard(2, desaturate);

