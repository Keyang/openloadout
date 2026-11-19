// Framework addition made with helper batch H4a (bundles/specs/core-sprites-3.md, "New helpers"):
// engine/pixel-font.js, a pixel font in four styles at three sizes, and lines of text on one baseline.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { INK, col, ramp } from '../../engine/color.js';
import { digitBody, rimmed } from '../../engine/ui.js';
import {
  FONT_STYLES, FONT_HEIGHTS, FONT_CHARS, FONT_HAND, FONT_SAME,
  fontMetrics, fontGlyph, textBody, textWidth, drawText,
} from '../../engine/pixel-font.js';

const SIZES = [0, 0.5, 1];
const ALL = [...FONT_CHARS.upper, ...FONT_CHARS.lower, ...FONT_CHARS.digits, ...FONT_CHARS.marks];
const LETTERS = [...FONT_CHARS.upper, ...FONT_CHARS.lower];
const ink = col(INK);

// pixels that differ between two glyphs set on one pen point and one baseline
function differ(a, b) {
  let n = 0;
  const up = Math.max(a.rise, b.rise), down = Math.max(a.h - a.rise, b.h - b.rise), W = Math.max(a.w, b.w);
  for (let r = -up; r < down; r++) for (let x = 0; x < W; x++) n += (a.body.at(x, r + a.rise) ? 1 : 0) !== (b.body.at(x, r + b.rise) ? 1 : 0) ? 1 : 0;
  return n;
}
const same = (a, b) => a.w === b.w && a.h === b.h && a.rise === b.rise && differ(a, b) === 0;
const pixels = (g) => { const out = []; for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.get(x, y)) out.push([x, y, g.get(x, y)]); return out; };

test('the lists say what the spec says', () => {
  assert.deepEqual([...FONT_STYLES], ['chunky', 'slim', 'rounded', 'serif']);
  assert.deepEqual([...FONT_HEIGHTS], [5, 7, 9]);
  assert.equal(FONT_CHARS.upper.length, 26);
  assert.equal(FONT_CHARS.lower.length, 26);
  assert.equal(FONT_CHARS.digits, '0123456789');
  assert.equal(FONT_CHARS.marks, '.,:;!?\'"-+=/()%#*&');
  assert.ok(Object.isFrozen(FONT_STYLES) && Object.isFrozen(FONT_HEIGHTS) && Object.isFrozen(FONT_CHARS) && Object.isFrozen(FONT_HAND) && Object.isFrozen(FONT_SAME));
  for (const [key, hand] of Object.entries(FONT_HAND)) {
    const [, style, cap, ch] = /^(\w+)\/(\d+)\/(.)$/.exec(key);
    assert.ok(FONT_STYLES.includes(style) && FONT_HEIGHTS.includes(Number(cap)) && ALL.includes(ch), key);
    for (const row of hand.rows) assert.match(row, /^[#.]+$/, key);
  }
});

test('fontMetrics gives the table of sizes and names the styles when one is unknown', () => {
  assert.deepEqual(SIZES.map((s) => fontMetrics(s).cap), [5, 7, 9]);
  assert.equal(fontMetrics(0.34).cap, 7);
  assert.equal(fontMetrics(0.67).cap, 9);
  const want = { 5: [3, 2, 5, 2], 7: [5, 2, 7, 3], 9: [6, 3, 9, 4] };
  const digitW = { chunky: [5, 6, 7], rounded: [5, 6, 7], slim: [3, 4, 5], serif: [4, 5, 6] };
  for (const style of FONT_STYLES) SIZES.forEach((s, i) => {
    const m = fontMetrics(s, style);
    assert.deepEqual([m.x, m.descent, m.maxW, m.space], want[m.cap]);
    assert.equal(m.track, 1);
    assert.equal(m.digitW, digitW[style][i]);
    assert.equal(m.style, style);
    assert.equal(m.round, style === 'rounded');
    assert.equal(m.serif, style === 'serif');
    assert.equal(m.stroke, style === 'slim' ? 1 : style === 'serif' && m.cap === 5 ? 1 : 2);
    assert.equal(m.bar, (style === 'chunky' || style === 'rounded') && m.cap === 9 ? 2 : 1);
  });
  assert.throws(() => fontMetrics(0.5, 'gothic'), /chunky, slim, rounded, serif/);
});

test('(1) every glyph fits its width and stands on the baseline at its height', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style);
    for (const ch of ALL) {
      const g = fontGlyph(ch, m), at = `${style} ${m.cap} "${ch}"`;
      assert.ok(g.w <= m.maxW, `${at}: ${g.w} wide`);
      assert.equal(g.body.w, g.w); assert.equal(g.body.h, g.h);
      if (/[A-Z0-9]/.test(ch)) assert.equal(g.rise, m.cap, `${at} rises ${g.rise}`);
      if (/[a-z]/.test(ch)) {
        // i and j: their dot sits one row clear above the x-height (spec deviation: (1) does not mention the dots)
        // s at cap 5: 4 rows, as tall as t (3 rows have no room for s's S turn; test 27); e at cap 5: 5 rows (4 rows
        // have no room for a counter between its top bar and crossbar as well as a bottom bar; tests 29, 40)
        const rise = 'bdfhkl'.includes(ch) || (ch === 'e' && m.cap === 5) ? m.cap : ch === 't' || (ch === 's' && m.cap === 5) ? m.cap - 1 : 'ij'.includes(ch) ? m.x + 2 : m.x;
        assert.equal(g.rise, rise, `${at} rises ${g.rise}`);
        assert.equal(g.h - g.rise, 'gjpqy'.includes(ch) ? m.descent : 0, `${at} hangs ${g.h - g.rise}`);
      }
      if (/[A-PR-Z0-9]/.test(ch) || '.:!?'.includes(ch)) assert.equal(g.h - g.rise, 0, `${at} hangs`);
      if (ch === ',' || ch === 'Q') assert.ok(g.h - g.rise >= (ch === 'Q' ? 0 : 1) && g.h - g.rise <= m.descent, `${at} hangs ${g.h - g.rise}`);
    }
  }
});

// the one pixel two glyphs differ by, when it stands apart from every pixel of both (a whole dot: '.' against ':')
function looseDot(a, b) {
  const up = Math.max(a.rise, b.rise), down = Math.max(a.h - a.rise, b.h - b.rise), W = Math.max(a.w, b.w);
  const pa = (x, r) => (x >= 0 && x < a.w && a.body.at(x, r + a.rise) ? 1 : 0), pb = (x, r) => (x >= 0 && x < b.w && b.body.at(x, r + b.rise) ? 1 : 0);
  const odd = [];
  for (let r = -up; r < down; r++) for (let x = 0; x < W; x++) if (pa(x, r) !== pb(x, r)) odd.push([x, r]);
  if (odd.length !== 1) return false;
  const [x, r] = odd[0];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && (pa(x + dx, r + dy) || pb(x + dx, r + dy))) return false;
  return true;
}

test('(2) within a style and size every two characters differ by 2 pixels, the look-alike pairs by 3', () => {
  const strict = ['O0', 'I1', 'l1', 'Il', 'S5', 'B8', 'Z2', 'G6'];
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style), G = Object.fromEntries(ALL.map((c) => [c, fontGlyph(c, m)]));
    for (let i = 0; i < ALL.length; i++) for (let j = i + 1; j < ALL.length; j++) {
      const d = differ(G[ALL[i]], G[ALL[j]]);
      // in the 1 px styles a stop is 1 px, so '.' and ':' (',' and ';') differ by one whole dot standing apart
      assert.ok(d >= 2 || (d === 1 && looseDot(G[ALL[i]], G[ALL[j]])), `${style} ${m.cap}: "${ALL[i]}" and "${ALL[j]}" differ by ${d}`);
      assert.ok(d >= 1, `${style} ${m.cap}: "${ALL[i]}" and "${ALL[j]}" are the same glyph`);
    }
    for (const [a, b] of strict) assert.ok(differ(G[a], G[b]) >= 3, `${style} ${m.cap}: ${a} and ${b} differ by ${differ(G[a], G[b])}`);
  }
});

test('(3) the mirror-image glyphs are symmetric to the pixel in every style', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style);
    for (const ch of 'AHIMOTUVWXYovwx08-+=*#') {
      const { body, w, h } = fontGlyph(ch, m);
      // a slashed 0 (hand-set where it is as wide as O) is the same turned half round, not mirrored; across a counter
      // an even number of pixels wide (2 px at cap 7) no slash can be, so there it is only checked to cut the counter (25)
      const slashed = ch === '0' && FONT_HAND[`${style}/${m.cap}/0`];
      if (slashed && (w - 2 * m.stroke) % 2 === 0) continue;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) assert.equal(body.at(x, y), slashed ? body.at(w - 1 - x, h - 1 - y) : body.at(w - 1 - x, y), `${style} ${m.cap} "${ch}" at ${x},${y}`);
    }
  }
});

test('(4) any two styles of a letter differ by 2 pixels, except FONT_SAME, which only holds letters with nothing to round or no foot to add (or, at one cap height, no room)', () => {
  const allowed = new Set(FONT_SAME);
  for (const s of SIZES) for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
    const ma = fontMetrics(s, FONT_STYLES[a]), mb = fontMetrics(s, FONT_STYLES[b]);
    for (const ch of LETTERS) {
      if (allowed.has(`${ch}:${ma.style}:${mb.style}`) || allowed.has(`${ch}:${ma.style}:${mb.style}:${ma.cap}`)) continue;
      const d = differ(fontGlyph(ch, ma), fontGlyph(ch, mb));
      assert.ok(d >= 2, `"${ch}" ${ma.style} and ${mb.style} at cap ${ma.cap} differ by ${d}`);
    }
  }
  for (const entry of FONT_SAME) {
    const [ch, s1, s2, cap] = entry.split(':');
    assert.ok(LETTERS.includes(ch), entry);
    assert.ok(FONT_STYLES.indexOf(s1) >= 0 && FONT_STYLES.indexOf(s1) < FONT_STYLES.indexOf(s2), `${entry}: two styles in FONT_STYLES order`);
    if (cap !== undefined) {
      // a no-room entry: one cap height, where a hand-set glyph says so (test (2) still tells it from every other letter)
      assert.ok(FONT_HEIGHTS.includes(Number(cap)), `${entry}: cap ${cap}`);
      assert.ok(FONT_HAND[`${s1}/${cap}/${ch}`] || FONT_HAND[`${s2}/${cap}/${ch}`], `${entry}: no hand-set glyph at cap ${cap}`);
      continue;
    }
    for (const s of SIZES) {
      // no turn to round: rounding this letter changes nothing; no foot to add: the serif feet change nothing
      if ([s1, s2].includes('rounded')) {
        const m = fontMetrics(s, 'rounded');
        assert.ok(same(fontGlyph(ch, m), fontGlyph(ch, { ...m, round: false })), `${entry}: "${ch}" has a turn to round at cap ${m.cap}`);
        const c = fontMetrics(s, 'chunky');
        assert.ok(same(fontGlyph(ch, c), fontGlyph(ch, { ...c, round: true })), `${entry}: "${ch}" has a turn to round at cap ${c.cap}`);
      }
      if ([s1, s2].includes('serif')) {
        // spec deviation: M, m, W and w are drawn without serif feet (nofeet in engine/pixel-font.js: no room
        // at maxW), so they pass here although the spec gives every upright a foot
        const m = fontMetrics(s, 'serif');
        assert.ok(same(fontGlyph(ch, m), fontGlyph(ch, { ...m, serif: false })), `${entry}: "${ch}" has a foot at cap ${m.cap}`);
      }
    }
  }
});

test('(5) the digits are digitBody of engine/ui.js, with feet in the serif style', () => {
  const hand = [];
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style);
    for (const ch of FONT_CHARS.digits) {
      if (FONT_HAND[`${style}/${m.cap}/${ch}`]) { hand.push(`${style}/${m.cap}/${ch}`); continue; }
      const want = digitBody(Number(ch), { w: m.digitW, h: m.cap, stroke: m.stroke, bar: m.bar, round: m.round });
      const g = fontGlyph(ch, m);
      assert.equal(g.rise, m.cap);
      if (style !== 'serif') { assert.ok(same(g, { body: want, w: want.w, h: want.h, rise: m.cap }), `${style} ${m.cap} ${ch}`); continue; }
      // serif: every pixel of digitBody, and anything more only on the bottom row (a foot)
      for (let y = 0; y < want.h; y++) for (let x = 0; x < want.w; x++) if (want.at(x, y)) assert.ok(g.body.at(x, y), `serif ${m.cap} ${ch} lost ${x},${y}`);
      for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.body.at(x, y) && !want.at(x, y)) assert.equal(y, g.h - 1, `serif ${m.cap} ${ch}: ${x},${y} is not a foot`);
    }
  }
  // the hand-set digits, named: at 3 and 4 px wide, digitBody's 5, 6 and 9 differ by one pixel; the 0 is marked at
  // every size of every style (a box or ring alone, or one with a dot, read as O; round 4 added slim and serif); the
  // serif 1 has a sloped flag (digitBody's flat flag on a stem with a foot read as the serif l)
  assert.deepEqual(hand, [
    'chunky/5/0', 'chunky/7/0', 'chunky/9/0', 'slim/5/0', 'slim/5/6', 'slim/5/9', 'slim/7/0', 'slim/9/0',
    'rounded/5/0', 'rounded/7/0', 'rounded/9/0', 'serif/5/0', 'serif/5/1', 'serif/5/6', 'serif/5/9', 'serif/7/0', 'serif/7/1', 'serif/9/0', 'serif/9/1',
  ]);
  assert.ok(fontGlyph('4', fontMetrics(0.5, 'serif')).w > fontMetrics(0.5, 'serif').digitW, 'the serif 4 has its feet');
});

test('(6) textBody lays glyphs track apart and spaces space wide; textWidth agrees; unknown characters throw', () => {
  const m = fontMetrics(0.5, 'chunky');
  for (const text of ['A', 'SCORE', 'Game over!', ' 42 ', 'a  b', 'x+y=(3*4)%#&']) {
    const glyphs = [...text].filter((c) => c !== ' ').map((c) => fontGlyph(c, m));
    const spaces = [...text].filter((c) => c === ' ').length;
    const t = textBody(text, m);
    const w = glyphs.reduce((n, g) => n + g.w, 0) + m.track * Math.max(0, glyphs.length - 1) + m.space * spaces;
    assert.equal(t.w, w, text);
    assert.equal(t.body.w, w, text);
    assert.equal(textWidth(text, m), w, text);
    assert.equal(t.advances.length, text.length);
    for (let i = 1; i < t.advances.length; i++) assert.ok(t.advances[i] > t.advances[i - 1], `${text}: advances increase`);
    assert.equal(t.rise, Math.max(...glyphs.map((g) => g.rise)));
  }
  assert.equal(textWidth('AB', m, { track: 3 }), fontGlyph('A', m).w + fontGlyph('B', m).w + 3);
  assert.equal(textBody('', m).w, 0);
  assert.throws(() => textBody('HI~', m), /"~"/);
  assert.throws(() => textWidth('é', m), /"é"/);
  assert.throws(() => fontGlyph('@', m), /"@"/);
});

test('(7) drawText: none is the body, ink adds a line, rimmed is rimmed, shadow falls down-left, shine lights the top rows, all inside the box', () => {
  const colour = '#e8b04a', edge = '#7a3b1e';
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const metrics = fontMetrics(s, style), text = 'Ab9?', base = 16, x = 4;
    const t = textBody(text, metrics);
    const draw = (opt) => { const g = new Surface(64, 28); const box = drawText(g, text, x, base, { metrics, colour, ...opt }); return { g, box }; };

    const none = draw({ outline: 'none' });
    const body = new Set();
    for (let y = 0; y < t.h; y++) for (let i = 0; i < t.w; i++) if (t.body.at(i, y)) body.add(`${x + i},${base - t.rise + y}`);
    assert.deepEqual(new Set(pixels(none.g).map(([px, py]) => `${px},${py}`)), body, `${style} ${metrics.cap}: none draws the body`);

    const inked = draw({ outline: 'ink' });
    for (const [px, py, c] of pixels(inked.g)) {
      if (body.has(`${px},${py}`)) { assert.equal(c, col(colour)); continue; }
      assert.equal(c, ink, `${style}: only ink round the body`);
      assert.ok([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => body.has(`${px + dx},${py + dy}`)), `${style}: ink touches the body`);
    }

    const rim = draw({ outline: 'rimmed', edge });
    const ref = new Surface(64, 28);
    rimmed(ref, t.body, x, base - t.rise, { colour, edge });
    assert.deepEqual([...rim.g.data], [...ref.data], `${style} ${metrics.cap}: rimmed`);

    for (const outline of ['none', 'ink']) {
      const plain = draw({ outline }), shade = draw({ outline, shadow: true });
      for (const [px, py, c] of pixels(shade.g)) {
        if (plain.g.get(px, py) === c) continue;
        assert.equal(c, ink, `${style} ${outline}: the shadow is ink`);
        assert.ok(plain.g.get(px + 1, py - 1), `${style} ${outline}: the shadow falls down and to the left`);
      }
    }

    for (const [ch, i] of [...text].map((c, k) => [c, k])) {
      const g = fontGlyph(ch, metrics);
      if (g.h <= 3) continue;
      const a = new Surface(20, 24), b = new Surface(20, 24);
      drawText(a, ch, 4, 14, { metrics, colour, outline: 'none' });
      drawText(b, ch, 4, 14, { metrics, colour, outline: 'none', shine: true });
      const lit = col(ramp(colour).light);
      assert.ok(pixels(b).some(([px, py, c]) => c === lit && a.get(px, py) !== c), `${style} ${metrics.cap} "${ch}" (${i}): shine changes a row`);
    }

    for (const opt of [{ outline: 'none' }, { outline: 'ink', shadow: true }, { outline: 'rimmed', edge, shadow: true, shine: true }, { outline: 'ink', offsets: [0, 2, 1, -1] }]) {
      const { g, box } = draw(opt);
      for (const [px, py] of pixels(g)) assert.ok(px >= box.x && py >= box.y && px < box.x + box.w && py < box.y + box.h, `${style} ${JSON.stringify(opt)}: ${px},${py} outside the box`);
      assert.ok(pixels(g).length > 0);
    }
  }
});

test('drawText offsets raise single characters and draws nothing outside the surface', () => {
  const metrics = fontMetrics(0.5, 'chunky'), colour = '#ffffff';
  const flat = new Surface(40, 20), bounce = new Surface(40, 20);
  drawText(flat, 'AB', 2, 12, { metrics, colour, outline: 'none' });
  drawText(bounce, 'AB', 2, 12, { metrics, colour, outline: 'none', offsets: [0, 2] });
  const a = fontGlyph('A', metrics);
  for (let y = 0; y < 20; y++) for (let x = 2; x < 2 + a.w; x++) assert.equal(flat.get(x, y), bounce.get(x, y), 'the first letter stays');
  assert.ok(bounce.bounds().y0 === flat.bounds().y0 - 2, 'the second rises 2 px');
  const tiny = new Surface(6, 6);
  assert.doesNotThrow(() => drawText(tiny, 'WIDE TEXT', -3, 4, { metrics, colour, outline: 'rimmed', edge: '#000000', shadow: true }));
});

test('(8) a font sheet frame fits: every character, large, rimmed, with shadow, at (4, 13) of 16x20', () => {
  for (const style of FONT_STYLES) {
    const metrics = fontMetrics(1, style);
    for (const ch of ALL) {
      const g = new Surface(16, 20);
      drawText(g, ch, 4, 13, { metrics, colour: '#f0d060', edge: '#80602a', outline: 'rimmed', shadow: true });
      for (let i = 0; i < 16; i++) { assert.equal(g.get(i, 0), 0, `${style} "${ch}" row 0`); assert.equal(g.get(i, 19), 0, `${style} "${ch}" row 19`); }
      for (let j = 0; j < 20; j++) { assert.equal(g.get(0, j), 0, `${style} "${ch}" column 0`); assert.equal(g.get(15, j), 0, `${style} "${ch}" column 15`); }
    }
  }
});

test('(9) the same arguments give the same pixels', () => {
  for (const style of FONT_STYLES) {
    const metrics = fontMetrics(0.5, style), opt = { metrics, colour: '#5ac8e0', edge: '#1d4f73', outline: 'rimmed', shadow: true, shine: true, offsets: [1, 0, 2] };
    const a = new Surface(48, 20), b = new Surface(48, 20);
    drawText(a, 'Hi 5!', 3, 13, opt);
    drawText(b, 'Hi 5!', 3, 13, opt);
    assert.deepEqual([...a.data], [...b.data]);
    const g1 = fontGlyph('Q', metrics), g2 = fontGlyph('Q', metrics);
    assert.ok(same(g1, g2));
    g1.body.set(0, 0, 1);                                     // a caller's copy: changing it changes nothing else
    assert.ok(same(fontGlyph('Q', metrics), g2));
  }
});

// ---- round 1 fixes: each test below catches one kind of defect seen on the font sheets ----------------------

// a row's runs of ink, as [first, last] columns
function runs(g, y) {
  const out = [];
  let s = -1;
  for (let x = 0; x <= g.w; x++) {
    const on = x < g.w && g.body.at(x, y);
    if (on && s < 0) s = x;
    if (!on && s >= 0) { out.push([s, x - 1]); s = -1; }
  }
  return out;
}

test('(10) serif: no foot closes a gap of 2 px or less, or stands beside a 1 px gap (H, K, N, X and h, k, n, x read as one bar)', () => {
  // the letters that stand on separate legs: anything joining two legs on their bottom row is a foot
  const legs = 'AHKMNRXhkmnx';
  for (const s of SIZES) {
    const m = fontMetrics(s, 'serif');
    for (const ch of ALL) {
      const g = fontGlyph(ch, m), at = (x, y) => (x >= 0 && x < g.w && y >= 0 && y < g.h ? g.body.at(x, y) : 0);
      // the rows a glyph stands on: the baseline and, for a descender, the bottom row
      for (const y of new Set([g.rise - 1, g.h - 1])) {
        if (y < 1) continue;
        const row = runs(g, y);
        row.forEach(([a, b], k) => {
          // a toe: the end pixel of a run, nothing above it, beside a stroke that comes down to the row
          for (const [x, dir] of [[a, -1], [b, 1]]) {
            if (at(x, y - 1) || !at(x - dir, y - 1)) continue;
            const next = row[k + dir];
            if (!next) continue;
            const gap = dir > 0 ? next[0] - b - 1 : a - next[1] - 1;
            assert.ok(gap >= 2, `serif ${m.cap} "${ch}": the foot at ${x},${y} leaves a ${gap} px gap to the next stroke`);
          }
          // a closed gap: inside one run, pixels with nothing above between two legs that come down to it
          if (!legs.includes(ch)) return;
          let x = a;
          while (x <= b) {
            if (at(x, y - 1)) { x++; continue; }
            let e = x;
            while (e + 1 <= b && !at(e + 1, y - 1)) e++;
            assert.ok(!(x > a && e < b && e - x + 1 <= 2), `serif ${m.cap} "${ch}": feet at ${x}..${e},${y} close the gap between two legs`);
            x = e + 1;
          }
        });
      }
    }
  }
});

test('(11) serif: the letters told apart by their feet differ in their bottom row', () => {
  const base = (g) => { let out = ''; for (let x = 0; x < g.w; x++) out += g.body.at(x, g.rise - 1) ? '#' : '.'; return out; };
  for (const s of SIZES) {
    const m = fontMetrics(s, 'serif');
    for (const [a, b] of ['XI', 'NM', 'KX', 'HN', 'NX', 'xz', 'kx', 'nx', 'lL', 'lI']) {
      assert.notEqual(base(fontGlyph(a, m)), base(fontGlyph(b, m)), `serif ${m.cap}: "${a}" and "${b}" stand on the same bottom row`);
    }
  }
});

test('(12) from cap 7 a V or v keeps its arms 2 px apart or more until its last rows: no filled wedge, no doubled rows at the point', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style);
    if (m.cap < 7) continue;                                  // 3 rows of a small v have no room
    for (const ch of 'Vv') {
      const g = fontGlyph(ch, m);
      let met = 0;
      for (let y = 0; y < g.h; y++) {
        const r = runs(g, y);
        if (r.length === 1 || (r.length === 2 && r[1][0] - r[0][1] - 1 < 2)) met++;
      }
      // a 1 px stroke closes in 2 rows (1 px apart, then the point), a 2 px stroke in 3
      assert.ok(met <= m.stroke + 1, `${style} ${m.cap} "${ch}": ${met} rows where the arms touch or stand 1 px apart`);
    }
  }
});

test('(13) the hand-set marks read as themselves: # has bars that overhang its uprights and a hole, * has open spokes, & has an open tail', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style), at = `${style} ${m.cap}`;
    // #: two full-width bars, uprights that stop short of the edges, a hole between them
    const hash = fontGlyph('#', m), full = [];
    for (let y = 0; y < hash.h; y++) if (runs(hash, y).length === 1 && runs(hash, y)[0][0] === 0 && runs(hash, y)[0][1] === hash.w - 1) full.push(y);
    assert.ok(full.length >= 2, `${at} "#": ${full.length} bars`);
    assert.ok(!hash.body.at(0, 0) && !hash.body.at(hash.w - 1, hash.h - 1), `${at} "#": the bars overhang the uprights`);
    assert.ok(!hash.body.at(0, full[0] - 1) && full[0] > 0, `${at} "#": the uprights stand above the top bar`);
    // from cap 7 the uprights stand 3 px apart: 2 px reads as an H with a second bar
    if (m.cap >= 7) {
      const r = runs(hash, 0);
      assert.ok(r.length === 2 && r[1][0] - r[0][1] - 1 >= 3, `${at} "#": the uprights stand ${r.length === 2 ? r[1][0] - r[0][1] - 1 : '?'} px apart`);
    }
    // *: no 2x2 block of ink anywhere outside its middle column (a filled bow-tie has them)
    const star = fontGlyph('*', m), mid = (star.w - 1) / 2;
    let blocks = 0;
    for (let y = 0; y + 1 < star.h; y++) for (let x = 0; x + 1 < star.w; x++) {
      if (Math.abs(x + 0.5 - mid) <= 1) continue;
      if (star.body.at(x, y) && star.body.at(x + 1, y) && star.body.at(x, y + 1) && star.body.at(x + 1, y + 1)) blocks++;
    }
    assert.equal(blocks, 0, `${at} "*": ${blocks} filled blocks off the middle`);
    // &: the bottom row is not one solid bar (a closed bowl reads as b)
    const amp = fontGlyph('&', m);
    assert.ok(runs(amp, amp.h - 1).length >= 2, `${at} "&": its bottom row is one bar`);
  }
});

// ---- round 2 fixes: each test below catches one kind of defect seen on the round 2 font sheets ---------------

const rowText = (g, y) => { let out = ''; for (let x = 0; x < g.w; x++) out += g.body.at(x, y) ? '#' : '.'; return out; };

// the closed counters of a glyph, as pixel counts
function holes(g) {
  const W = g.w + 2, H = g.h + 2, seen = new Uint8Array(W * H), solid = (x, y) => x >= 1 && y >= 1 && x <= g.w && y <= g.h && g.body.at(x - 1, y - 1);
  const flood = (start) => {
    const todo = [start]; seen[start] = 1; let n = 0;
    while (todo.length) {
      const i = todo.pop(), x = i % W, y = (i - x) / W; n++;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx] || solid(nx, ny)) continue;
        seen[ny * W + nx] = 1; todo.push(ny * W + nx);
      }
    }
    return n;
  };
  flood(0);
  const out = [];
  for (let i = 0; i < W * H; i++) if (!seen[i] && !solid(i % W, (i - (i % W)) / W)) out.push(flood(i));
  return out;
}

// pixels that differ between two glyphs on one baseline, b moved dx px to the right
function differAt(a, b, dx) {
  let n = 0;
  const up = Math.max(a.rise, b.rise), down = Math.max(a.h - a.rise, b.h - b.rise);
  for (let r = -up; r < down; r++) for (let x = Math.min(0, dx); x < Math.max(a.w, b.w + dx); x++) {
    const pa = x >= 0 && x < a.w && a.body.at(x, r + a.rise) ? 1 : 0, pb = x - dx >= 0 && x - dx < b.w && b.body.at(x - dx, r + b.rise) ? 1 : 0;
    n += pa !== pb ? 1 : 0;
  }
  return n;
}

test('(14) W and w show three strokes and two points: a row of three strokes, and no more solid full-width rows than the bar is tall', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style);
    for (const ch of 'Ww') {
      const g = fontGlyph(ch, m), at = `${style} ${m.cap} "${ch}"`;
      let three = false, solid = 0;
      for (let y = 0; y < g.h; y++) {
        const r = runs(g, y);
        if (r.length >= 3) three = true;
        if (r.length === 1 && r[0][0] === 0 && r[0][1] === g.w - 1) solid++;
      }
      assert.ok(three, `${at}: no row shows its three strokes`);
      assert.ok(solid <= (ch === 'w' ? 1 : m.bar), `${at}: ${solid} solid rows (a filled block, not two Vs)`);
    }
  }
});

test('(15) O, D and Q have one open counter (no 1 px pinhole, no bar across it), O is the same upside down, 0 marks its middle where it is as wide as O or D', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style);
    for (const ch of 'ODQ') {
      const g = fontGlyph(ch, m), h = holes(g), at = `${style} ${m.cap} "${ch}"`;
      assert.equal(h.length, 1, `${at}: ${h.length} counters`);
      assert.ok(h[0] >= 2, `${at}: a ${h[0]} px counter`);
    }
    const O = fontGlyph('O', m);
    for (let y = 0; y < O.h; y++) assert.equal(rowText(O, y), rowText(O, O.h - 1 - y), `${style} ${m.cap} "O" is lopsided top to bottom at row ${y}`);
    // the middle: the one, two or four pixels at the centre
    const zero = fontGlyph('0', m), mid = (g) => [(g.w - 1) >> 1, g.w >> 1].some((x) => [(g.h - 1) >> 1, g.h >> 1].some((y) => g.body.at(x, y)));
    for (const ch of 'OD') {
      if (fontGlyph(ch, m).w !== zero.w) continue;
      const d = differ(zero, fontGlyph(ch, m));
      assert.ok((mid(zero) && !mid(fontGlyph(ch, m))) || d >= 6, `${style} ${m.cap}: "0" and "${ch}" are both ${zero.w} px rings, ${d} px apart`);
    }
  }
});

test('(16) C is open on the right over 3 rows or more (round 4: a 1 px notch read as O): the rows beside its opening are not solid across', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style), g = fontGlyph('C', m), at = `${style} ${m.cap} "C"`;
    // the opening: rows whose ink stops left of the right-hand column
    const open = [];
    for (let y = 1; y < g.h - 1; y++) if (!g.body.at(g.w - 1, y) && !g.body.at(g.w - 2, y)) open.push(y);
    assert.ok(open.length >= 3, `${at}: open over ${open.length} rows (${Array.from({ length: g.h }, (_, y) => rowText(g, y)).join('/')})`);
    for (const y of [open[0] - 1, open[open.length - 1] + 1]) {
      const r = runs(g, y);
      assert.ok(!(r.length === 1 && r[0][1] - r[0][0] + 1 >= g.w - 1 && y > 0 && y < g.h - 1), `${at}: row ${y} beside the opening is solid (${rowText(g, y)})`);
    }
  }
});

test('(17) ? has a hook with an open curl above its gap and dot', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style), g = fontGlyph('?', m), at = `${style} ${m.cap} "?"`;
    let gap = -1;
    for (let y = g.h - 2; y > 0; y--) if (runs(g, y).length === 0) { gap = y; break; }
    assert.ok(gap > 0, `${at}: no gap above the dot`);
    let curl = false;
    for (let y = 1; y < gap; y++) if (runs(g, y).length >= 2) curl = true;
    assert.ok(curl, `${at}: the hook is a solid block`);
  }
});

test('(18) X crosses: no three rows in a row the same (a straight column reads as I)', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style);
    for (const ch of 'Xx') {
      const g = fontGlyph(ch, m);
      for (let y = 0; y + 2 < g.h; y++) {
        const a = rowText(g, y);
        assert.ok(!(a === rowText(g, y + 1) && a === rowText(g, y + 2)), `${style} ${m.cap} "${ch}": rows ${y}..${y + 2} are all ${a}`);
      }
    }
  }
});

test('(19) U and u stand on a flat bottom wider than the point of V and v', () => {
  const bottom = (g) => Math.max(...runs(g, g.rise - 1).map(([a, b]) => b - a + 1));
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style);
    for (const [u, v] of ['UV', 'uv']) {
      const gu = fontGlyph(u, m), gv = fontGlyph(v, m);
      assert.ok(bottom(gu) > bottom(gv), `${style} ${m.cap}: "${u}" ends in ${rowText(gu, gu.rise - 1)}, as narrow as the point of "${v}" (${rowText(gv, gv.rise - 1)})`);
    }
  }
});

test('(20) l and 1, stems lined up, differ above their bottom row (not one flagged stem whose foot alone tells them apart)', () => {
  // the stem: the left edge of the ink on the middle row
  const stem = (g) => runs(g, g.h >> 1)[0][0];
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style), l = fontGlyph('l', m), one = fontGlyph('1', m), dx = stem(one) - stem(l);
    let rows = 0;
    for (let y = 0; y < Math.min(l.h, one.h) - 1; y++) {
      let differs = false;
      for (let x = Math.min(0, -dx) - 1; x <= Math.max(l.w, one.w) + Math.abs(dx); x++) {
        const a = x - dx >= 0 && x - dx < l.w && l.body.at(x - dx, y) ? 1 : 0, b = x >= 0 && x < one.w && one.body.at(x, y) ? 1 : 0;
        if (a !== b) differs = true;
      }
      if (differs) rows++;
    }
    assert.ok(rows >= 1, `${style} ${m.cap}: "l" and "1" differ only in their bottom row`);
  }
});

test('(21) R is built on the stem and bowl of P, and in a 1 px style its leg is 1 px', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style), R = fontGlyph('R', m), P = fontGlyph('P', m);
    assert.equal(rowText(R, 1).replace(/\.+$/, ''), rowText(P, 1).replace(/\.+$/, ''), `${style} ${m.cap}: "R" and "P" stand on different stems (${rowText(R, 1)} / ${rowText(P, 1)})`);
    if (m.stroke > 1) continue;
    // the leg, from two rows under the middle down to the row over the feet: 1 px strokes only
    for (let y = (R.h >> 1) + 2; y < R.h - 1; y++) for (const [a, b] of runs(R, y)) assert.equal(b, a, `${style} ${m.cap} "R": a ${b - a + 1} px leg at row ${y} (${rowText(R, y)})`);
  }
});

test('(22) s is no z: the stroke under its top bar stands left of the middle, under the top bar\'s left end', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style), g = fontGlyph('s', m), at = `${style} ${m.cap} "s"`;
    const top = runs(g, 0), next = runs(g, 1);
    const left = next[0][0], centre = (next[0][0] + next[next.length - 1][1]) / 2;
    assert.ok(centre < (g.w - 1) / 2, `${at}: the stroke under the top bar (${rowText(g, 1)}) is not left of the middle`);
    assert.ok(left <= top[0][0], `${at}: the stroke under the top bar starts right of the bar's left end (${rowText(g, 0)} / ${rowText(g, 1)})`);
  }
});

test('(23) e has a crossbar to its right wall and an open lower right', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style), g = fontGlyph('e', m), at = `${style} ${m.cap} "e"`;
    let bar = -1;
    for (let y = 1; y < g.h - 1; y++) { const r = runs(g, y); if (r.length === 1 && r[0][0] === 0 && r[0][1] === g.w - 1) bar = y; }
    assert.ok(bar > 0, `${at}: no crossbar`);
    assert.ok(!g.body.at(g.w - 1, bar + 1), `${at}: the lower right is closed (${rowText(g, bar + 1)})`);
  }
});

// ---- round 3 fixes: each test below catches one kind of defect seen on the round 3 font sheets ---------------

// the pieces of a glyph's ink: 8-connected (pixels touching at a corner are one stroke) or 4-connected
function pieces(g, eight = true) {
  const seen = new Set(), out = [];
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    if (!g.body.at(x, y) || seen.has(`${x},${y}`)) continue;
    const todo = [[x, y]], piece = [];
    seen.add(`${x},${y}`);
    while (todo.length) {
      const [a, b] = todo.pop(); piece.push([a, b]);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || (!eight && dx && dy)) continue;
        const c = a + dx, d = b + dy;
        if (c < 0 || d < 0 || c >= g.w || d >= g.h || !g.body.at(c, d) || seen.has(`${c},${d}`)) continue;
        seen.add(`${c},${d}`); todo.push([c, d]);
      }
    }
    out.push(piece);
  }
  return out;
}

test('(24) every glyph drawn in one stroke is one piece: no broken S spine, no dot loose inside a 0', () => {
  // the characters made of separate marks; % has its own test (28)
  const marks = 'ij:;!?"=%';
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style);
    for (const ch of ALL) {
      if (marks.includes(ch)) continue;
      const n = pieces(fontGlyph(ch, m)).length;
      assert.equal(n, 1, `${style} ${m.cap} "${ch}": ${n} separate pieces`);
    }
  }
});

test('(25) 0 is slashed in every style at every size: its counter is cut in two (a box or ring, alone or with a dot, reads as O); in a 1 px style with a counter under 3 px wide it may have the two opposite corners off instead', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style), g = fontGlyph('0', m), h = holes(g), at = `${style} ${m.cap} "0"`;
    const c = (x, y) => g.body.at(x, y), cut = !c(0, 0) && !c(g.w - 1, g.h - 1) && c(g.w - 1, 0) && c(0, g.h - 1);
    if (m.stroke === 1 && g.w - 2 < 3 && cut && h.length === 1) continue;
    assert.equal(h.length, 2, `${at}: ${h.length} counters`);
    assert.ok(differ(g, fontGlyph('O', m)) >= 3, `${at}: differs from "O" by ${differ(g, fontGlyph('O', m))}`);
  }
});

test('(26) G is no 6: below its top bar no row runs solid from the stem to the right wall', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style), g = fontGlyph('G', m);
    for (let y = m.bar; y < g.h - m.bar; y++) {
      const r = runs(g, y);
      assert.ok(!(r.length === 1 && r[0][0] <= 1 && r[0][1] === g.w - 1), `${style} ${m.cap} "G": row ${y} (${rowText(g, y)}) is a bar from the stem across, as in 6`);
    }
  }
});

test('(27) s turns like an S: a join on the left only, then lower down a join on the right only (not c, r or a slanted bar)', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style), g = fontGlyph('s', m), at = `${style} ${m.cap} "s"`;
    const left = [], right = [];
    for (let y = 1; y < g.h - 1; y++) {
      const l = g.body.at(0, y), r = g.body.at(g.w - 1, y);
      if (l && !r) left.push(y);
      if (r && !l) right.push(y);
    }
    assert.ok(left.length && right.length && Math.min(...left) < Math.max(...right), `${at}: no S turn (${Array.from({ length: g.h }, (_, y) => rowText(g, y)).join('/')})`);
    // and the turn is drawn, not hinted: s differs from c, r and z by more than a corner
    for (const other of 'crz') {
      const d = differ(g, fontGlyph(other, m));
      assert.ok(d >= 4, `${at}: differs from "${other}" by ${d}`);
    }
  }
});

test('(28) % has two dots apart from its slash: the piece at each corner is the dot alone (a slash run into both dots reads as X)', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style), g = fontGlyph('%', m), at = `${style} ${m.cap} "%"`;
    const four = pieces(g, false), dot = Math.max(2, m.stroke);
    // the top-left dot: the piece holding the top-most ink in the left half; the bottom-right dot likewise
    const find = (rowsFrom, inHalf) => {
      for (const y of rowsFrom) for (let x = 0; x < g.w; x++) if (inHalf(x) && g.body.at(x, y)) return four.find((p) => p.some(([a, b]) => a === x && b === y));
      return null;
    };
    const ys = [...Array(g.h).keys()];
    const tl = find(ys, (x) => x < g.w / 2), br = find(ys.slice().reverse(), (x) => x >= g.w / 2);
    for (const [name, p, inHalf] of [['top-left', tl, (x) => x < g.w / 2], ['bottom-right', br, (x) => x >= g.w / 2]]) {
      assert.ok(p, `${at}: no ${name} dot`);
      assert.ok(p.length <= dot * dot && p.every(([x]) => inHalf(x)), `${at}: the ${name} dot runs into the slash (${p.length} px)`);
    }
    assert.ok(differ(g, fontGlyph('X', m)) >= 4, `${at}: differs from X by ${differ(g, fontGlyph('X', m))}`);
  }
});

test('(29) e has a bottom bar under its open lower right (without one it reads as r)', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style), g = fontGlyph('e', m), at = `${style} ${m.cap} "e"`;
    const last = runs(g, g.h - 1);
    assert.ok(last.length === 1 && last[0][1] - last[0][0] + 1 >= g.w - 2, `${at}: its bottom row is ${rowText(g, g.h - 1)}, no bar`);
    assert.ok(differ(g, fontGlyph('r', m)) >= 4, `${at}: differs from "r" by ${differ(g, fontGlyph('r', m))}`);
  }
});

// ---- round 4 fixes: each test below catches one kind of defect seen on the round 4 glyph-by-glyph review ---------

test('(30) M and N are no H: no row runs solid across them, M has a V notch 2 rows deep or more over its middle column, and both differ from H by 4 pixels', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style), H = fontGlyph('H', m);
    for (const ch of 'MN') {
      const g = fontGlyph(ch, m), at = `${style} ${m.cap} "${ch}"`;
      for (let y = 0; y < g.h; y++) {
        const r = runs(g, y);
        assert.ok(!(r.length === 1 && r[0][0] === 0 && r[0][1] === g.w - 1), `${at}: row ${y} (${rowText(g, y)}) is a bar across, as in H`);
      }
      assert.ok(differ(g, H) >= 4, `${at}: differs from "H" by ${differ(g, H)}`);
    }
    // the notch: empty rows down the middle column from the top, then the V's point, at or above the middle row
    const M = fontGlyph('M', m), mid = M.w >> 1;
    let depth = 0;
    while (depth < M.h && !M.body.at(mid, depth)) depth++;
    assert.ok(depth >= 2 && depth <= (M.h >> 1) + 1, `${style} ${m.cap} "M": a notch ${depth} rows deep (${Array.from({ length: M.h }, (_, y) => rowText(M, y)).join('/')})`);
    assert.ok(differ(M, fontGlyph('N', m)) >= 4, `${style} ${m.cap}: "M" and "N" differ by ${differ(M, fontGlyph('N', m))}`);
  }
});

test('(31) l has no sloped flag (that marks the 1): outside serif its top row is its stem, in serif a flat flag on the left of its top row only (as b, d, h, k: test 49), and l and 1 differ by 4 pixels', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style), l = fontGlyph('l', m), one = fontGlyph('1', m), at = `${style} ${m.cap}`;
    const top = runs(l, 0), stemRow = runs(l, l.h >> 1);
    assert.equal(top.length, 1, `${at} "l": top row ${rowText(l, 0)}`);
    if (style === 'serif') {
      assert.ok(top[0][0] < stemRow[0][0] && top[0][1] === stemRow[0][1], `${at} "l": its top row (${rowText(l, 0)}) is no flag on the left of its stem (${rowText(l, l.h >> 1)})`);
      for (let y = 1; y < l.h - 1; y++) assert.deepEqual(runs(l, y), stemRow, `${at} "l": row ${y} (${rowText(l, y)}) is not its stem: a sloped flag`);
    } else assert.deepEqual(top[0], stemRow[0], `${at} "l": its top row (${rowText(l, 0)}) is wider than its stem (${rowText(l, l.h >> 1)}), a flag`);
    assert.ok(differ(l, one) >= 4, `${at}: "l" and "1" differ by ${differ(l, one)}`);
  }
});

test('(32) the 2 px uprights of U keep their width to the top row (no splayed 1 px tops)', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style), g = fontGlyph('U', m), sw = m.stroke;
    assert.deepEqual(runs(g, 0), [[0, sw - 1], [g.w - sw, g.w - 1]], `${style} ${m.cap} "U": top row ${rowText(g, 0)}`);
  }
});

test('(33) F is E without its bottom bar: above its middle bar F has no pixel E lacks (no lump in the corner)', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style), F = fontGlyph('F', m), E = fontGlyph('E', m);
    // stems lined up (the serif F stands on a foot, so its stem is 1 px in), then the rows above F's middle bar:
    // the first row below the top bar whose ink runs past the stem
    const stem = (g) => runs(g, g.h - 2)[0][0], dx = stem(F) - stem(E), end = (g, y) => runs(g, y)[0][1] - stem(g);
    let bar = m.bar;
    while (bar < F.h && end(F, bar) < m.stroke) bar++;
    for (let y = 0; y < bar; y++) for (let x = 0; x < F.w; x++) {
      if (F.body.at(x, y)) assert.ok(x - dx >= 0 && x - dx < E.w && E.body.at(x - dx, y), `${style} ${m.cap} "F": ${x},${y} is ink that E lacks (${rowText(F, y)} / ${rowText(E, y)})`);
    }
  }
});

test('(34) m and w of the x-height are no blobs: no solid row below m\'s top row or above w\'s bottom row, and w and m differ by 4 pixels (u and n are each other upside down, so m and w may be)', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style), at = `${style} ${m.cap}`;
    const solid = (g, y) => { const r = runs(g, y); return r.length === 1 && r[0][0] === 0 && r[0][1] === g.w - 1; };
    const w = fontGlyph('w', m), mm = fontGlyph('m', m);
    for (let y = 0; y < w.h - 1; y++) assert.ok(!solid(w, y), `${at} "w": row ${y} (${rowText(w, y)}) is solid`);
    for (let y = 1; y < mm.h; y++) assert.ok(!solid(mm, y), `${at} "m": row ${y} (${rowText(mm, y)}) is solid`);
    assert.ok(differ(w, mm) >= 4, `${at}: "w" and "m" differ by ${differ(w, mm)}`);
  }
});

test('(35) the legs of R and, from cap 7, the uprights of M are as wide as the stroke', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style);
    if (m.stroke < 2) continue;
    const R = fontGlyph('R', m);
    for (let y = (R.h >> 1) + 2; y < R.h - 1; y++) for (const [a, b] of runs(R, y)) assert.ok(b - a + 1 >= m.stroke, `${style} ${m.cap} "R": a ${b - a + 1} px leg at row ${y} (${rowText(R, y)})`);
    if (m.cap < 7) continue;
    const M = fontGlyph('M', m);
    for (let y = 0; y < M.h; y++) {
      const r = runs(M, y);
      assert.ok(r[0][1] - r[0][0] + 1 >= m.stroke && r[r.length - 1][1] - r[r.length - 1][0] + 1 >= m.stroke, `${style} ${m.cap} "M": row ${y} (${rowText(M, y)}) has a 1 px upright`);
    }
  }
});

test('(36) the stops are a stroke wide: . , : ; have dots no heavier than the dot of ! and ?', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style), at = `${style} ${m.cap}`;
    const dot = fontGlyph('.', m), bang = fontGlyph('!', m), bottom = runs(bang, bang.h - 1);
    assert.equal(dot.w, bottom[0][1] - bottom[0][0] + 1, `${at} ".": ${dot.w} px wide, the dot of "!" ${rowText(bang, bang.h - 1)}`);
    assert.equal(dot.w, m.stroke, `${at} ".": ${dot.w} px wide in a ${m.stroke} px style`);
    for (const ch of ':;,') {
      const g = fontGlyph(ch, m);
      for (const p of pieces(g, false)) assert.ok(p.length <= m.stroke * m.stroke + (ch === ':' ? 0 : 1), `${at} "${ch}": a ${p.length} px dot`);
    }
  }
});

test('(37) the diagonal of z and Z is an even stair (no two rows the same between the bars), and so is / (no three rows the same)', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style);
    for (const ch of 'zZ') {
      const g = fontGlyph(ch, m), bar = /[a-z]/.test(ch) ? 1 : m.bar;
      for (let y = bar; y + 1 < g.h - bar; y++) assert.notEqual(rowText(g, y), rowText(g, y + 1), `${style} ${m.cap} "${ch}": rows ${y} and ${y + 1} are both ${rowText(g, y)} (an upright, not a stair)`);
    }
    const g = fontGlyph('/', m);
    for (let y = 0; y + 2 < g.h; y++) {
      const a = rowText(g, y);
      assert.ok(!(a === rowText(g, y + 1) && a === rowText(g, y + 2)), `${style} ${m.cap} "/": rows ${y}..${y + 2} are all ${a} (an upright in the slash)`);
    }
  }
});

test('(39) + has arms as long as its stroke is wide or longer, above, below and to each side (at cap 5 a 2 px + has room for 1 px arms only)', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style), g = fontGlyph('+', m), at = `${style} ${m.cap} "+"`;
    let bar = -1;
    for (let y = 0; y < g.h; y++) if (runs(g, y).length === 1 && runs(g, y)[0][0] === 0 && runs(g, y)[0][1] === g.w - 1) bar = y;
    assert.ok(bar >= 0, `${at}: no bar`);
    const stem = runs(g, 0)[0], side = stem[0], arm = m.cap > 5 ? m.stroke : 1;
    assert.ok(Math.min(bar, g.h - 1 - bar, side) >= arm, `${at}: arms of ${bar} / ${g.h - 1 - bar} / ${side} px (${Array.from({ length: g.h }, (_, y) => rowText(g, y)).join('/')})`);
  }
});

test('(38) ( and ) are the same top and bottom, and each the mirror image of the other', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style), open = fontGlyph('(', m), close = fontGlyph(')', m), at = `${style} ${m.cap}`;
    for (let y = 0; y < open.h; y++) {
      assert.equal(rowText(open, y), rowText(open, open.h - 1 - y), `${at} "(": rows ${y} and ${open.h - 1 - y} differ`);
      assert.equal(rowText(close, y), [...rowText(open, y)].reverse().join(''), `${at} ")" is not "(" mirrored at row ${y}`);
    }
  }
});

// ---- round 5 fixes: each test below catches one kind of defect seen on the round 5 glyph-by-glyph review ---------

// the fewest pixels two glyphs differ by, on one baseline, b moved up to 2 px either way (a foot or a wider letter
// must not hide that the rest is the same)
const nearest = (a, b) => Math.min(...[-2, -1, 0, 1, 2].map((dx) => differAt(a, b, dx)));

test('(40) e has a closed counter between its top bar and its crossbar (a top bar sitting on the crossbar is a lump over a c)', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style), g = fontGlyph('e', m), at = `${style} ${m.cap} "e"`;
    let bar = -1;
    for (let y = 1; y < g.h - 1; y++) { const r = runs(g, y); if (r.length === 1 && r[0][0] === 0 && r[0][1] === g.w - 1) { bar = y; break; } }
    assert.ok(bar > 1, `${at}: the crossbar (row ${bar}) has no room above it for a counter (${Array.from({ length: g.h }, (_, y) => rowText(g, y)).join('/')})`);
    assert.ok(holes(g).length >= 1, `${at}: no closed counter (${Array.from({ length: g.h }, (_, y) => rowText(g, y)).join('/')})`);
    assert.ok(nearest(g, fontGlyph('c', m)) >= 4, `${at}: differs from "c" by ${nearest(g, fontGlyph('c', m))}`);
  }
});

test('(41) in a 1 px style the walls of c, e, o, C and O are 1 px: no 2 px run outside a bar across the letter', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style);
    if (m.stroke > 1) continue;
    for (const ch of 'ceoCO') {
      const g = fontGlyph(ch, m);
      for (let y = 1; y < g.h - 1; y++) {
        const r = runs(g, y);
        if (r.length === 1 && r[0][0] === 0 && r[0][1] === g.w - 1) continue;          // a bar across: e's crossbar
        for (const [a, b] of r) assert.equal(b, a, `${style} ${m.cap} "${ch}": a ${b - a + 1} px stroke at row ${y} (${rowText(g, y)})`);
      }
    }
  }
});

test('(42) the diagonal of z and Z runs from top right to bottom left: its first row stands right of the middle, its last left of it', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style);
    for (const ch of 'zZ') {
      const g = fontGlyph(ch, m), bar = /[a-z]/.test(ch) ? 1 : m.bar, mid = (g.w - 1) / 2, at = `${style} ${m.cap} "${ch}"`;
      const centre = (y) => { const r = runs(g, y); return (r[0][0] + r[r.length - 1][1]) / 2; };
      const first = bar, last = g.h - bar - 1;
      // a lone middle pixel next to the left wall makes z a c or an equals sign: it must stand right of the middle
      assert.ok(centre(first) > mid, `${at}: the diagonal starts at ${rowText(g, first)}, not right of the middle`);
      if (last > first) assert.ok(centre(last) < mid, `${at}: the diagonal ends at ${rowText(g, last)}, not left of the middle`);
    }
  }
});

test('(43) the look-alike pairs differ by 4 pixels or more, however they are lined up: z and c, e and c, e and o, 0 and D, 0 and 8, U and V, and from cap 7 u and v (3 rows of a small u and v have room for 2 px only; 0 and O are held to 3 px by test (2) and to a slash by test (25))', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style);
    for (const [a, b] of ['zc', 'ec', 'eo', '0D', '08', 'UV', ...(m.cap > 5 ? ['uv'] : [])]) {
      const d = nearest(fontGlyph(a, m), fontGlyph(b, m));
      assert.ok(d >= 4, `${style} ${m.cap}: "${a}" and "${b}" differ by ${d}`);
    }
  }
});

test('(44) from cap 7 V and v narrow 2 rows or more before U and u turn in, unless U or u stands on a flat bottom (long uprights that curve in only at the end read as U)', () => {
  // the rows from the bottom up that differ from the top row (below a serif: the second row)
  const turn = (g) => { const top = rowText(g, 1); let y = g.h - 1; while (y > 1 && rowText(g, y) !== top) y--; return g.h - 1 - y; };
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style);
    if (m.cap < 7) continue;
    for (const [u, v] of ['UV', 'uv']) {
      const gu = fontGlyph(u, m), gv = fontGlyph(v, m), bottom = runs(gu, gu.h - 1);
      if (bottom.length === 1 && bottom[0][0] === 0 && bottom[0][1] === gu.w - 1) continue;
      assert.ok(turn(gv) >= turn(gu) + 2, `${style} ${m.cap}: "${v}" narrows over ${turn(gv)} rows, "${u}" turns in over ${turn(gu)}`);
    }
  }
});

// ---- round 6 fixes: each test below catches one kind of defect seen on the round 6 glyph-by-glyph review ---------

// a glyph with rows y0..y1 taken out (the rows that are left close up on the baseline)
function without(g, y0, y1) {
  const keep = [...Array(g.h).keys()].filter((y) => y < y0 || y > y1), body = { at: (x, y) => (y >= 0 && y < keep.length ? g.body.at(x, keep[y]) : 0) };
  return { body, w: g.w, h: keep.length, rise: g.rise - (y1 - y0 + 1) };
}

test('(45) s is no 5 with rows taken out: with any block of its middle rows gone, 5 still differs from s by 4 pixels however they are lined up (the square s of cap 7 and 9 was the 5 with two rows gone, and read as a small 5 beside digits)', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style);
    for (const [a, b] of ['5s']) {
      const ga = fontGlyph(a, m), gb = fontGlyph(b, m), cut = ga.h - gb.h;
      for (let y0 = 1; y0 + cut <= ga.h - 1; y0++) {
        const d = nearest(without(ga, y0, y0 + cut - 1), gb);
        assert.ok(d >= 4, `${style} ${m.cap}: "${b}" is "${a}" with rows ${y0}..${y0 + cut - 1} taken out, ${d} px apart (${Array.from({ length: gb.h }, (_, y) => rowText(gb, y)).join('/')})`);
      }
    }
  }
});

test('(46) W keeps its uprights to the top row as wide as U\'s (1 px tips made the rounded W of 5 rows the rounded M in its top two rows)', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style), W = fontGlyph('W', m), U = fontGlyph('U', m), at = `${style} ${m.cap} "W"`;
    const width = (g) => runs(g, 0).map(([a, b]) => b - a + 1);
    assert.deepEqual(width(W), width(U), `${at}: top row ${rowText(W, 0)}, the U's ${rowText(U, 0)}`);
  }
});

test('(47) from cap 7 the uprights of N are as wide as the stroke on every row, and its right upright stands in the same columns on every row (no serif sticking out on one row, no diagonal heavier than the uprights)', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style);
    if (m.cap < 7) continue;
    const N = fontGlyph('N', m), at = `${style} ${m.cap} "N"`, edge = N.w - 1;
    for (let y = 0; y < N.h; y++) {
      const r = runs(N, y);
      assert.ok(r[0][1] - r[0][0] + 1 >= m.stroke, `${at}: row ${y} (${rowText(N, y)}) has a thin left upright`);
      assert.ok(r[r.length - 1][1] === edge && edge - m.stroke + 1 >= r[r.length - 1][0], `${at}: row ${y} (${rowText(N, y)}) has a thin or shifted right upright`);
    }
  }
});

test('(48) V is no wider than W (the slim V of 7 rows was 7 px beside a 5 px W and left a hole in VW, AVE)', () => {
  for (const style of FONT_STYLES) for (const s of SIZES) {
    const m = fontMetrics(s, style), V = fontGlyph('V', m), W = fontGlyph('W', m);
    assert.ok(V.w <= W.w, `${style} ${m.cap}: "V" ${V.w} px wide, "W" ${W.w}`);
  }
});

test('(49) serif: every ascender stem (b, d, h, k, l) has a head flag left of its stem on its top row, l stands on a foot centred on its stem, and l differs from L by 4 pixels however they are lined up (a plain stem on a right-heavy foot read as L)', () => {
  for (const s of SIZES) {
    const m = fontMetrics(s, 'serif');
    for (const ch of 'bdhkl') {
      const g = fontGlyph(ch, m), at = `serif ${m.cap} "${ch}"`;
      // the stem: the run on the row under the top row that the ascender comes down through
      const stem = ch === 'd' ? runs(g, 1)[runs(g, 1).length - 1] : runs(g, 1)[0], top = runs(g, 0);
      assert.ok(top.some(([a, b]) => a < stem[0] && b >= stem[0]), `${at}: no head flag (${rowText(g, 0)} over ${rowText(g, 1)})`);
    }
    const l = fontGlyph('l', m), stem = runs(l, l.h >> 1)[0], foot = runs(l, l.h - 1);
    assert.equal(foot.length, 1, `serif ${m.cap} "l": foot ${rowText(l, l.h - 1)}`);
    assert.equal(stem[0] - foot[0][0], foot[0][1] - stem[1], `serif ${m.cap} "l": its foot (${rowText(l, l.h - 1)}) is not centred on its stem (${rowText(l, l.h >> 1)})`);
    const d = nearest(l, fontGlyph('L', m));
    assert.ok(d >= 4, `serif ${m.cap}: "l" and "L" differ by ${d}`);
  }
});
