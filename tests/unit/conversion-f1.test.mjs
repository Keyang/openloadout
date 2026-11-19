// Studio item F1: sprites/rogue-battler.js and sprites/road-bandit.js are studio library files (data, Contract 14 rule
// 8) that draw as the code files they replaced. tests/unit/conversion-c1.test.mjs is the guard every conversion passes
// (identity, wording, sockets, pixels at the defaults, quarter points, slider ends, every choice, versions and seeded
// random settings); this file adds what its last review found it does not draw (review C1 #3, issues 2 and 3): two
// colour controls set to the same colour (what F.apart exists for) and colours outside the swatch lists (any colour
// can be picked on the page and kept in a link). The originals are tests/fixtures/conversion/<id>.js.txt.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderFrame, frameSockets, defaultParams, cleanParams, randomParams } from '../../engine/sprite.js';
import { readDataFile, checkDataFile } from '../../tools/lib/data-file.mjs';
import { renderThemedFrame, randomTheme, spriteMaterials } from '../../engine/theme.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const IDS = ['rogue-battler', 'road-bandit'];
const MOST = 0.02;
// looks (Contract 7) a converted sprite is drawn with as the original was: one hue turn and two seeded random looks (review F1, issue 2)
const LOOKS = [{ name: 'hue 120', theme: { colour: { hue: 120 } } }, { name: 'randomTheme(7)', theme: randomTheme(7) }, { name: 'randomTheme(31)', theme: randomTheme(31) }];
const OFF_SWATCH = ['#123456', '#808080', '#fafafa'];
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-conversion-'));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

let n = 0;
async function original(id) {
  const file = path.join(TMP, `${id}-${n++}.mjs`);
  fs.writeFileSync(file, fs.readFileSync(path.join(ROOT, 'tests/fixtures/conversion', `${id}.js.txt`), 'utf8').replace(/(['"])\.\.\//g, `$1${pathToFileURL(ROOT).href}/`));
  return (await import(pathToFileURL(file).href)).default;
}

/** The settings the C1 guard leaves out: every pair of colour controls on one colour (both ways round), every colour at colours no swatch list has, and seeded random settings with colours off the swatches. */
function colourSettings(s) {
  const P = defaultParams(s), colours = Object.keys(s.params).filter((k) => s.params[k].kind === 'color'), out = [];
  for (const a of colours) for (const b of colours) if (a !== b) out.push({ name: `${b}=${a}`, p: { ...P, [b]: P[a] } });
  for (const a of colours) for (const b of colours) if (a < b) for (const c of s.params[a].swatches) if (s.params[b].swatches.includes(c)) out.push({ name: `${a}=${b}=${c}`, p: { ...P, [a]: c, [b]: c } });
  for (const k of colours) for (const c of OFF_SWATCH) out.push({ name: `${k}=${c}`, p: { ...P, [k]: c } });
  for (let i = 0; i < 6; i++) {
    const p = cleanParams(s, randomParams(s, 0xf1 + i));
    colours.forEach((k, j) => { p[k] = OFF_SWATCH[(i + j) % OFF_SWATCH.length]; });
    out.push({ name: `random off-swatch ${i + 1}`, p });
  }
  return out;
}

const drawn = (g) => { let c = 0; for (const v of g.data) if (v) c++; return c; };
const differ = (a, b) => { let c = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) c++; return c; };

for (const id of IDS) {
  test(`F1 ${id}: the file in sprites/ is a studio library file (the fixed form, strict) and no longer code`, () => {
    const text = fs.readFileSync(path.join(ROOT, 'sprites', `${id}.js`), 'utf8');
    const r = readDataFile(text, { file: `sprites/${id}.js`, strict: true });
    assert.equal(r.ok, true, r.errors.join('\n'));
    assert.equal(r.value.body.library, 'humanoid');
    assert.ok(checkDataFile(text, `sprites/${id}.js`));
    assert.doesNotMatch(text, /=>|function|rigs\//, 'no code and no rig import: the format says it all');
  });

  test(`F1 ${id}: two colours on one colour, and colours off the swatches, draw as the original (pixels within 2%, sockets within 1 px)`, async (t) => {
    const was = await original(id), now = (await import(`../../sprites/${id}.js`)).default;
    let worst = { share: 0, at: 'nothing differs' };
    const over = [];
    for (const { name, p } of colourSettings(was)) {
      const pw = cleanParams(was, p), pn = cleanParams(now, p);
      for (const [clip, c] of Object.entries(was.clips)) for (let f = 0; f < c.frames; f++) {
        const a = renderFrame(was, clip, f, pw), share = differ(a, renderFrame(now, clip, f, pn)) / Math.max(1, drawn(a));
        if (share > worst.share) worst = { share, at: `${clip} ${f}, ${name}` };
        if (share > MOST) over.push(`${clip} ${f} at ${name}: ${(share * 100).toFixed(2)}%`);
        const sa = frameSockets(was, clip, f, pw), sb = frameSockets(now, clip, f, pn);
        for (const [k, x] of Object.entries(sa)) if (!sb[k] || Math.hypot(sb[k].x - x.x, sb[k].y - x.y) > 1) over.push(`${clip} ${f} at ${name}: socket ${k}`);
      }
    }
    t.diagnostic(`${id}: worst ${(worst.share * 100).toFixed(2)}% (${worst.at})`);
    assert.deepEqual(over.slice(0, 12), []);
  });
}

for (const id of IDS) {
  test(`F1 ${id}: a data sprite is not one made on this visit (no truthy made, no prepare); where it came from stays on its definition`, async () => {
    const now = (await import(`../../sprites/${id}.js`)).default;
    assert.ok(!now.made, 'sprite.made means "drawn in a worker" to app/api-core.js render and engine/theme.js; a data sprite is drawn here');
    assert.equal(typeof now.prepare, 'undefined');
    assert.deepEqual(now.definition.made, { in: 'library', from: `code:${id}` }, 'converted from its code file, not made in the studio (studio item F2)');
  });

  test(`F1 ${id}: looks (Contract 7) recolour it as they recoloured the original: the same materials, every frame within 2%`, async (t) => {
    const was = await original(id), now = (await import(`../../sprites/${id}.js`)).default;
    const P = defaultParams(was);
    const mw = spriteMaterials(was, P), mn = spriteMaterials(now, cleanParams(now, P));
    assert.ok(mw.total > 0, 'the original has a material table');
    assert.ok(Math.abs(mn.total - mw.total) <= Math.max(2, mw.total * MOST), `materials total: ${mn.total} now, ${mw.total} before`);
    let worst = { share: 0, at: 'nothing differs' };
    const over = [];
    for (const { name, theme } of LOOKS) {
      for (const [clip, c] of Object.entries(was.clips)) for (let f = 0; f < c.frames; f++) {
        const a = renderThemedFrame(was, clip, f, P, theme), share = differ(a, renderThemedFrame(now, clip, f, cleanParams(now, P), theme)) / Math.max(1, drawn(a));
        if (share > worst.share) worst = { share, at: `${clip} ${f}, ${name}` };
        if (share > MOST) over.push(`${clip} ${f} in ${name}: ${(share * 100).toFixed(2)}%`);
      }
    }
    t.diagnostic(`${id}: worst themed ${(worst.share * 100).toFixed(2)}% (${worst.at})`);
    assert.deepEqual(over.slice(0, 12), []);
  });
}
