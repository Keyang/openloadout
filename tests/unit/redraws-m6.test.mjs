// Migration batch M6 (docs/data-sprites.md sections 7 and 9): the side-view characters redrawn as data on
// base:person-side keep what their code sprites showed. Written for the batch's second review, whose side-by-side renders
// found looks the first redraw lost: a staff across the wizard's face, a skeleton that fell over instead of collapsing,
// a rogue that threw and tossed nothing, a bandit with its club held out stiff. Each sprite is held against its frozen
// code copy (tests/fixtures/code-sprites/, codeSprite) at its defaults, frame by frame. (The rogue and the bandit were
// library bodies, a path that is removed with its frozen copies in build item R1: they are held to the silhouettes it
// drew by tests/unit/redraws-library-body-silhouettes.test.mjs, and keep here the checks that need no code copy.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultParams, cleanParams, renderFrame, frameSockets } from '../../engine/sprite.js';
import { col, ramp, farRamp } from '../../engine/color.js';
import { librarySprite, codeSprite } from '../helpers/library.mjs';

const IDS = ['knight', 'wizard', 'spear-goblin', 'bone-soldier', 'rogue-battler', 'road-bandit'];
const DATA = Object.fromEntries(await Promise.all(IDS.map(async (id) => [id, await librarySprite(id)])));
const CODE_IDS = IDS.filter((id) => id !== 'rogue-battler' && id !== 'road-bandit');
const look = (s, over = {}) => cleanParams(s, { ...defaultParams(s), ...over });
const frames = (s, clip) => Array.from({ length: s.clips[clip].frames }, (_, f) => f);
const tones = (hex) => { const r = ramp(hex); return [r.light, r.base, r.dark, r.deep]; };
const pixelsOf = (g, hexes) => { const want = new Set(hexes.map((h) => col(h))); const out = []; for (let i = 0; i < g.data.length; i++) if (want.has(g.data[i])) out.push([i % g.w, Math.floor(i / g.w)]); return out; };
/** How much of two frames' drawn pixels are drawn in both: the overlap over the union of their silhouettes. */
function overlap(a, b) {
  let both = 0, either = 0;
  for (let i = 0; i < a.data.length; i++) { const p = a.data[i] >>> 24 ? 1 : 0, q = b.data[i] >>> 24 ? 1 : 0; both += p & q; either += p | q; }
  return either ? both / either : 1;
}

test('Rogue: the throw sends a knife out of the far hand and the victory tosses the dagger into the air', () => {
  const s = DATA['rogue-battler'], p = look(s), metal = [...tones('#c2c9d6'), '#ffffff'];
  // shoot frame 1: steel well in front of the far hand (the knife has left it)
  const off = frameSockets(s, 'shoot', 1, p).offhand, flying = pixelsOf(renderFrame(s, 'shoot', 1, p), metal).filter(([x]) => x > off.x + 4);
  assert.ok(flying.length >= 3, `shoot 1: ${flying.length} pixels of a knife in front of the far hand`);
  // victory: on some frame the dagger is high above the near hand, and it is back in the hand at the start
  const up = frames(s, 'victory').map((f) => { const h = frameSockets(s, 'victory', f, p).hand; return pixelsOf(renderFrame(s, 'victory', f, p), metal).filter(([, y]) => y < h.y - 9).length; });
  assert.ok(Math.max(...up) >= 4, `victory: no dagger in the air (${up.join(', ')})`);
  assert.equal(up[0], 0, 'victory 0: the dagger is in the hand');
  // daggers: one in each hand, the far one drawn at the far hand (in the far side's darker tones)
  const g = renderFrame(s, 'idle', 0, p), fh = frameSockets(s, 'idle', 0, p).offhand, far = farRamp('#c2c9d6');
  assert.ok(pixelsOf(g, [...metal, far.light, far.base, far.dark]).filter(([x, y]) => Math.hypot(x + 0.5 - fh.x, y + 0.5 - fh.y) < 6).length >= 3, 'idle: no dagger at the far hand');
});

test('Bandit: the steal holds the coin bag up in the far hand', () => {
  const s = DATA['road-bandit'], p = look(s);
  const shown = frames(s, 'steal').filter((f) => {
    const o = frameSockets(s, 'steal', f, p).offhand;
    return pixelsOf(renderFrame(s, 'steal', f, p), tones('#e6c96a')).filter(([x, y]) => Math.hypot(x + 0.5 - o.x, y + 0.5 - o.y) < 5).length >= 4;
  });
  assert.ok(shown.length >= 2 && shown.every((f) => f >= 4), `steal: the bag is shown in the far hand on frames ${shown.join(', ')}`);
});

// ---- the third review of M6: what a setting or a part shows, measured against the code copy ----------------------
/** Pixels that differ between two settings of one frame. */
const changed = (s, clip, f, a, b) => { const x = renderFrame(s, clip, f, look(s, a)), y = renderFrame(s, clip, f, look(s, b)); let n = 0; for (let i = 0; i < x.data.length; i++) if (x.data[i] !== y.data[i]) n++; return n; };
/** The data sprite changes at least `share` of the pixels the code sprite changes between two settings, frame by frame. */
function keepsChange(id, frames, a, b, share, what) {
  for (const [clip, f] of frames) {
    const c = changed(CODE[id], clip, f, a, b), d = changed(DATA[id], clip, f, a, b);
    assert.ok(c > 0, `${id} ${clip} ${f}: the code changes something for ${what}`);
    assert.ok(d >= share * c, `${id} ${clip} ${f}: ${what} changes ${d} pixels; the code changes ${c}`);
  }
}

test('Rogue: the long scarf streams out behind, and Scarf and Length show it', () => {
  // the second redraw drew a stub under the arm: long vs none idle 0 36 of the code's 78, walk 20 of 72, run 11 of 62
  // (the code copy is gone, build item R1: the pixels the code changed for long vs none are the numbers its comment kept, 78, 72 and 62)
  for (const [clip, code] of [['idle', 78], ['walk', 72], ['run', 62]]) {
    const d = changed(DATA['rogue-battler'], clip, 0, { scarf: 'long' }, { scarf: 'none' });
    assert.ok(d >= 0.6 * code, `${clip} 0: Scarf long vs none changes ${d} pixels; the code changed ${code}`);
  }
  for (const [clip, f] of [['idle', 0], ['walk', 0], ['run', 0]]) {
    assert.ok(changed(DATA['rogue-battler'], clip, f, { scarf: 'short' }, { scarf: 'none' }) > 0, `${clip} ${f}: Scarf short vs none shows`);
    assert.ok(changed(DATA['rogue-battler'], clip, f, { scarfLength: 0.65 }, { scarfLength: 1.35 }) > 0, `${clip} ${f}: Length short vs long shows`);
  }
  // and it streams: running, the cloth reaches further back from the neck than standing
  const reach = (clip) => { const s = DATA['rogue-battler'], p = look(s), g = renderFrame(s, clip, 0, p), n = renderFrame(s, clip, 0, look(s, { scarf: 'none' })); let far = 99; for (let i = 0; i < g.data.length; i++) if (g.data[i] !== n.data[i]) far = Math.min(far, i % g.w); return frameSockets(s, clip, 0, p).head.x - far; };
  assert.ok(reach('run') >= reach('idle') + 3, `the scarf streams back running (${reach('run')} px behind the head) more than standing (${reach('idle')})`);
});
