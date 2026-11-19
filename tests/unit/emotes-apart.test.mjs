// engine/emotes.js, drawEmote's `apart` (added with sprite batch K24, emote-bubbles: rimless Zs that stay apart at the
// small sizes of a balloon).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col } from '../../engine/color.js';
import { PALETTE } from '../../engine/palettes.js';
import { EMOTES, drawEmote } from '../../engine/emotes.js';

const P = PALETTE.thornwood;
const shot = (kind, size, opt) => { const g = new Surface(48, 48); drawEmote(g, kind, 24, 40, size, { colour: P.hero, edge: P.cream, ...opt }); return g; };
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);
const PHASES = [0, 0.25, 0.5, 0.8];

// 8-connected groups of the pixels holding `want`
function groups(g, want) {
  const seen = new Uint8Array(g.w * g.h);
  let n = 0;
  for (let i = 0; i < seen.length; i++) {
    const x0 = i % g.w, y0 = (i - x0) / g.w;
    if (seen[i] || g.get(x0, y0) !== want) continue;
    n++; seen[i] = 1;
    const todo = [i];
    while (todo.length) {
      const j = todo.pop(), x = j % g.w, y = (j - x) / g.w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, k = ny * g.w + nx;
        if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h || seen[k] || g.get(nx, ny) !== want) continue;
        seen[k] = 1; todo.push(k);
      }
    }
  }
  return n;
}

test('apart changes nothing but rimless sleep; off is the default', () => {
  for (const kind of EMOTES) for (const size of [10, 14, 20]) for (const t of PHASES) {
    assert.ok(same(shot(kind, size, { t, rim: false }), shot(kind, size, { t, rim: false, apart: false })), `${kind} ${size}: default off`);
    assert.ok(same(shot(kind, size, { t, rim: true }), shot(kind, size, { t, rim: true, apart: true })), `${kind} ${size}: rimmed ignores it`);
    if (kind !== 'sleep') assert.ok(same(shot(kind, size, { t, rim: false }), shot(kind, size, { t, rim: false, apart: true })), `${kind} ${size}: only sleep`);
  }
});

test('rimless sleep, apart: the same outline, and every letter its own patch of colour', () => {
  for (let size = 10; size <= 20; size++) for (const t of PHASES) for (const bounce of [0, 0.5, 1]) for (const bold of [false, true]) {
    const what = `size ${size} t ${t} bounce ${bounce} bold ${bold}`;
    const a = shot('sleep', size, { t, bounce, bold, rim: false, apart: true }), b = shot('sleep', size, { t, bounce, bold, rim: false });
    for (let i = 0; i < a.data.length; i++) assert.equal(!!a.data[i], !!b.data[i], `${what}: the same pixels drawn`);
    const letters = t >= 0.75 ? 2 : 3;
    assert.equal(groups(a, col(P.hero)), letters, `${what}: ${letters} letters, none touching`);
  }
});

test('same arguments, same pixels', () => {
  assert.ok(same(shot('sleep', 11, { rim: false, apart: true, bounce: 0 }), shot('sleep', 11, { rim: false, apart: true, bounce: 0 })));
});
