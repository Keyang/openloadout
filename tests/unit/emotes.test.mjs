// Framework addition made with helper batch H4c (bundles/specs/core-sprites-3.md, "New helpers"):
// engine/emotes.js, marks over a character's head with their idle motion and their pop-in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { INK, col } from '../../engine/color.js';
import { rimmed } from '../../engine/ui.js';
import { fontMetrics, fontGlyph } from '../../engine/pixel-font.js';
import { EMOTES, emoteBody, drawEmote, emotePop } from '../../engine/emotes.js';

const cells = (g) => { const out = new Set(); for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.at(x, y)) out.add(`${x},${y}`); return out; };
const xor = (a, b) => { const A = cells(a), B = cells(b); let n = 0; for (const c of A) if (!B.has(c)) n++; for (const c of B) if (!A.has(c)) n++; return n; };
function bbox(g) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.at(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { w: x1 - x0 + 1, h: y1 - y0 + 1, y1 };
}
const STROKED = ['exclaim', 'question', 'anger', 'sleep', 'music', 'spark', 'swirl'];

test('EMOTES lists the nine marks, and an unknown one throws naming them', () => {
  assert.deepEqual([...EMOTES], ['exclaim', 'question', 'heart', 'anger', 'sweat', 'sleep', 'music', 'spark', 'swirl']);
  assert.ok(Object.isFrozen(EMOTES));
  assert.throws(() => emoteBody('wink', 16), /exclaim, question/);
});

test('(1) every kind at sizes 10, 15 and 20 is that tall (plus or minus 1) and at most size + 4 wide', () => {
  for (const kind of EMOTES) for (const size of [10, 15, 20]) {
    const g = emoteBody(kind, size), b = bbox(g);
    assert.ok(Math.abs(b.h - size) <= 1, `${kind} ${size}: ${b.h} tall`);
    assert.ok(b.w <= size + 4, `${kind} ${size}: ${b.w} wide`);
    assert.equal(g.w, size + 4); assert.equal(g.h, size + 4);
  }
});

test('(2) every two kinds differ by 15% or more of the larger silhouette at size 16', () => {
  for (let i = 0; i < EMOTES.length; i++) for (let j = i + 1; j < EMOTES.length; j++) {
    const a = emoteBody(EMOTES[i], 16), b = emoteBody(EMOTES[j], 16);
    const big = Math.max(cells(a).size, cells(b).size);
    assert.ok(xor(a, b) >= 0.15 * big, `${EMOTES[i]} and ${EMOTES[j]} differ by ${xor(a, b)} of ${big}`);
  }
});

test('(3) the idle motion loops, moves 4 or more pixels over 8 frames, and moves more with bounce 1 than bounce 0', () => {
  for (const kind of EMOTES) for (const size of [10, 16, 20]) {
    assert.equal(xor(emoteBody(kind, size, { t: 0 }), emoteBody(kind, size, { t: 1 })), 0, `${kind} ${size}: t 0 and t 1`);
    const moved = (bounce) => {
      const rest = emoteBody(kind, size, { t: 0, bounce });
      let n = 0;
      for (let f = 1; f < 8; f++) n += xor(rest, emoteBody(kind, size, { t: f / 8, bounce }));
      return n;
    };
    const changed = new Set();
    const rest = emoteBody(kind, size);
    for (let f = 1; f < 8; f++) { const now = cells(emoteBody(kind, size, { t: f / 8 })); for (const c of now) if (!cells(rest).has(c)) changed.add(c); for (const c of cells(rest)) if (!now.has(c)) changed.add(c); }
    assert.ok(changed.size >= 4, `${kind} ${size}: ${changed.size} pixels change`);
    assert.ok(moved(1) > moved(0), `${kind} ${size}: bounce 1 moves ${moved(1)}, bounce 0 ${moved(0)}`);
  }
});

test('(3b) the idle motion never cuts the mark off the grid: rigid marks keep every pixel, the others shrink no more than the motion explains', () => {
  // exclaim and sweat slide, question tilts and spark trades ray length between its arms: their pixel count
  // is the same at every phase, so any pixel pushed off the glyphGrid shows up as a drop
  const RIGID = ['exclaim', 'sweat', 'question', 'spark'];
  const count = (g) => cells(g).size;
  for (const kind of EMOTES) for (const size of [10, 13, 16, 20]) for (const bounce of [0, 0.5, 1]) for (const bold of [false, true]) {
    const A = 1 + Math.round(bounce * 2), rest = emoteBody(kind, size, { t: 0, bounce, bold }), n0 = count(rest);
    for (let f = 0; f < 16; f++) {
      const g = emoteBody(kind, size, { t: f / 16, bounce, bold }), b = bbox(g), at = `${kind} ${size} bounce ${bounce}${bold ? ' bold' : ''} t ${f}/16`;
      if (RIGID.includes(kind)) assert.equal(count(g), n0, `${at}: ${count(g)} pixels, ${n0} at rest`);
      // the most any motion shrinks a mark is A px from each end (anger's throb, spark's rays); sleep's top z
      // goes away for the last quarter of the loop, which is its motion, so it is held to this only before then
      // swirl turns, and a turning spiral is not round, so its height is held to 70% of the size instead
      if (kind === 'swirl') assert.ok(b.h >= 0.7 * size, `${at}: ${b.h} tall`);
      else if (kind !== 'sleep' || f / 16 < 0.75) assert.ok(b.h >= size - 1 - 2 * A, `${at}: ${b.h} tall`);
    }
  }
});

test('(4) drawEmote with a rim is rimmed of emoteBody and stays in its box; bold thickens the stroked marks', () => {
  const colour = '#f2c84b', edge = '#8a5a1c';
  for (const kind of EMOTES) for (const t of [0, 0.375]) {
    const g = new Surface(40, 40), cx = 20, by = 33;
    const { box } = drawEmote(g, kind, cx, by, 16, { t, colour, edge, shadow: true });
    const body = emoteBody(kind, 16, { t }), ref = new Surface(40, 40);
    rimmed(ref, body, cx - Math.floor(body.w / 2), by - (body.h - 1), { colour, edge, shadow: true });
    assert.deepEqual([...g.data], [...ref.data], `${kind} t ${t}`);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) if (g.get(x, y)) assert.ok(x >= box.x && y >= box.y && x < box.x + box.w && y < box.y + box.h, `${kind}: ${x},${y} outside the box`);

    const plain = new Surface(40, 40), r = drawEmote(plain, kind, cx, by, 16, { t, colour, rim: false });
    const ink = col(INK), c = col(colour);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
      const v = plain.get(x, y);
      if (!v) continue;
      assert.ok(v === c || v === ink, `${kind}: rim false draws only the colour and ink`);
      assert.ok(x >= r.box.x && y >= r.box.y && x < r.box.x + r.box.w && y < r.box.y + r.box.h);
    }
  }
  for (const kind of STROKED) for (const size of [10, 16, 20]) {
    const d = xor(emoteBody(kind, size), emoteBody(kind, size, { bold: true }));
    assert.ok(d >= 4, `${kind} ${size}: bold changes ${d} pixels`);
  }
  for (const kind of ['heart', 'sweat']) assert.equal(xor(emoteBody(kind, 16), emoteBody(kind, 16, { bold: true })), 0, `${kind} ignores bold`);
});

test('(5) emotePop grows from a dot, overshoots a pixel high, settles a pixel low and ends at rest', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((f) => emotePop(f)), [
    { size: 0, dy: 0, dot: true }, { size: 0.6, dy: 0, dot: false }, { size: 1.15, dy: -1, dot: false },
    { size: 1, dy: 0, dot: false }, { size: 1, dy: 1, dot: false }, { size: 1, dy: 0, dot: false },
  ]);
  for (const frames of [3, 4, 6, 8, 12]) {
    assert.equal(emotePop(0, frames).dot, true);
    const last = emotePop(frames - 1, frames);
    assert.equal(last.size, 1); assert.equal(last.dy, 0); assert.equal(last.dot, false);
  }
});

test('(6) the Zs of sleep are the chunky font\'s Z and z', () => {
  const sizes = [0, 0.5, 1].map((s) => fontMetrics(s, 'chunky'));
  const contains = (g, glyph) => {
    for (let oy = 0; oy + glyph.h <= g.h; oy++) for (let ox = 0; ox + glyph.w <= g.w; ox++) {
      let all = true;
      for (let y = 0; y < glyph.h && all; y++) for (let x = 0; x < glyph.w; x++) if (glyph.body.at(x, y) && !g.at(ox + x, oy + y)) { all = false; break; }
      if (all) return true;
    }
    return false;
  };
  for (const size of [10, 14, 16, 20]) {
    const g = emoteBody('sleep', size);
    assert.ok(sizes.some((m) => contains(g, fontGlyph('Z', m))), `sleep ${size}: a chunky Z`);
    assert.ok(sizes.some((m) => contains(g, fontGlyph('z', m))), `sleep ${size}: a chunky z`);
  }
});

test('(7) the same arguments give the same pixels', () => {
  for (const kind of EMOTES) {
    const opt = { t: 0.3, bounce: 0.8, bold: true };
    assert.equal(xor(emoteBody(kind, 17, opt), emoteBody(kind, 17, opt)), 0, kind);
    const a = new Surface(32, 32), b = new Surface(32, 32);
    drawEmote(a, kind, 16, 26, 17, { ...opt, colour: '#e05050', edge: '#701818' });
    drawEmote(b, kind, 16, 26, 17, { ...opt, colour: '#e05050', edge: '#701818' });
    assert.deepEqual([...a.data], [...b.data], kind);
  }
});
