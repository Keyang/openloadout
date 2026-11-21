// The arms and the lean of the nine top-down redraws' walks and runs at the ends of Bounce and Stride (M7b review 2,
// issue 3). The code rig moved more than the head and the feet with these sliders (rigs/topdown.js pose, deleted in R2):
//   walk: the hands swing A = lerp(2.8, 4.8, (bounce + stride) / 2) each way, and the body leans 0.3 + 0.4 * stride;
//   run:  the hands swing lerp(3, 5, bounce), and the body leans 1.6 + stride.
// m7-topdown-travel measures only the head's bob and the feet's spread, so a redraw whose travel scaled the legs alone
// could change its walks far less than the code's at the slider ends. Held here:
//   1. every walk and run clip's travel scales the arms by Bounce, the walk's by Stride too (an entry naming the upper arm
//      bones the clip keys: the trooper's shield arm is not keyed facing down or up, so only bones.armB is), and every
//      side-view walk and run clip's scales the spine (the lean) by Stride;
//   2. at each end of Bounce and Stride, over each walk and run clip, the data changes from its defaults at least
//      MOVE_SHARE as many pixels as the code sprite does from its own (where the code changes 100 pixels or more).
// R2: the code sprites are gone; check 2 reads what they did from tests/fixtures/m7-topdown-motion.json (`shifted`,
// recorded from the frozen copies at commit 7e328c3). SHORT, NO_LEAN and NO_ARMS list what was measured against the code
// then ("off the code" numbers are those old ones).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadDataSprite } from '../../tools/lib/assets.mjs';
import { cleanParams, defaultParams, renderPixels } from '../../engine/sprite.js';

const IDS = ['village-elder', 'farm-kid', 'hero-walker', 'mage-walker', 'merchant', 'town-guard', 'void-ranger', 'shield-trooper', 'rogue-walker'];
/** The least share of the code's change a slider end must make in the data, over a walk or run clip. */
const MOVE_SHARE = 0.5;
/** Clip ends that move less than MOVE_SHARE of the code's, and why ("off": pixels the clip differs from the code there, from the fit). */
const SHORT = {
  'farm-kid': {
    'run_up stride=0': 'code 711, data 26: the code lowers the shoulders a row (round(-0.25 * lean) goes from -1 to 0); no torso (stretch.spine) factor from 0 to 2 comes nearer the code than 1207 off',
    'run_side stride=0': 'code 869, data 113: as run_up, the shoulders a row; the torso and lean factors stay 1 (594 off), every other value draws further from the code',
  },
  'town-guard': {
    'walk_down bounce=0': 'code 131, data 54: the arms at 0.9 draw 682 off, at 1 675',
    'walk_down stride=0': 'code 117, data 54: the arms at 0.9 draw 642 off, at 1 633',
    'walk_side bounce=0': 'code 126, data 8: the arms at 0.9 draw 993 off, at 1 925',
    'walk_side stride=0': 'code 571, data 171: the arms at 0.9 draw 984 off, at 1 916; for the lean see NO_LEAN',
  },
  'rogue-walker': {
    'run_side bounce=1': 'code 894, data 159: the arms at 1.2 are the nearest (1080 off); further draws further from the code',
    'run_down bounce=1': 'code 1071, data 445 (M7c): the daggers are solid blades now (held:topdown-blades@2), so the swing changes fewer pixels than the read-back blades\' broken strokes did; 1306 off the code there, 217 at the defaults',
    'run_side stride=1': 'code 1254, data 308: the code leans a pixel further (3 px, not 2); turning the spine 1.25 times moves 1553 pixels but draws 1428 off the code, against 1281 without it',
  },
};
/** Side-view walks and runs with no lean entry, and why. */
const NO_LEAN = {
  'town-guard': { walk_side: 'turning the spine turns the 24 px halberd with it: at Stride 0 a lean of 0.5 draws 1958 pixels off the code, 966 without it' },
  'rogue-walker': { run_side: 'the code leans a pixel further only at Stride 1; turning the spine 1.25 times draws 1428 pixels off the code there, 1281 without it' },
};
/** Walks and runs with no arm entry for a slider, and why: every factor tried (0.4 to 0.9, 1.1 to 2) drew further from the code than none. */
const NO_ARMS = {
  'hero-walker': { 'walk_down bounce': 'with the arms at 0.9 and 1.1 the clip draws 802 and 696 pixels off the code at Bounce 0 and 1, with none 727 and 692' },
  'mage-walker': { 'walk_up bounce': 'at 0.9 and 1.1: 854 and 974 off, with none: 726 and 809' },
  'farm-kid': { 'run_down bounce': 'at 0.9 and 1.1: 916 and 1092 off, with none: 912 and 1073' },
  'rogue-walker': { 'walk_up bounce': 'at 0.9 and 1.1: 748 and 690 off, with none: 729 and 679', 'walk_up stride': 'at 0.9 and 1.1: 709 and 694 off, with none: 689 and 679' },
  'void-ranger': { 'walk_down stride': 'at 0.9 and 1.1: 435 and 435 off, with none: 403 and 433' },
};
const def = (id) => JSON.parse(fs.readFileSync(path.join(ROOT, 'sprites', `${id}.json`), 'utf8'));
const motion = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'm7-topdown-motion.json'), 'utf8'));
const data = (id) => loadDataSprite(ROOT, path.join(ROOT, 'sprites', `${id}.json`));
const at = (s, set) => cleanParams(s, { ...defaultParams(s), ...set });
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (((a[i] >>> 24) ? a[i] : 0) !== ((b[i] >>> 24) ? b[i] : 0)) n++; return n; };
/** Pixels a clip changes over its frames when one setting moves from its default. */
function moved(s, clip, set) {
  let n = 0;
  for (let f = 0; f < s.clips[clip].frames; f++) n += diff(renderPixels(s, clip, f, at(s, set)).data, renderPixels(s, clip, f, at(s, {})).data);
  return n;
}
const names = (e, k) => e.by?.from === k;

for (const id of IDS) {
  test(`${id}: every walk and run scales the arms by Bounce (the walk by Stride too), and from the side the lean by Stride`, () => {
    const d = def(id), stride = d.controls.some((c) => c.key === 'stride');
    const clips = Object.entries(d.clips).filter(([n]) => /^(walk|run)_/.test(n));
    for (const [clip, c] of clips) {
      const t = c.travel ?? [];
      const arms = (k) => t.some((e) => names(e, k) && (e.tracks.includes('bones.armF') || e.tracks.includes('bones.armB')));
      const known = (k) => NO_ARMS[id]?.[`${clip} ${k}`];
      for (const k of ['bounce', ...(stride && /^walk_/.test(clip) ? ['stride'] : [])]) {
        if (known(k)) assert.ok(!arms(k), `${id} ${clip}: NO_ARMS lists the arms by ${k}, which the travel now has: take it off the list`);
        else assert.ok(arms(k), `${id} ${clip}: the arms by ${k}`);
      }
      const lean = t.some((e) => names(e, 'stride') && e.tracks.includes('bones.spine'));
      if (NO_LEAN[id]?.[clip]) assert.ok(!lean, `${id} ${clip}: NO_LEAN lists it, but it has a lean: take it off the list`);
      else if (stride && /_side$/.test(clip)) assert.ok(t.some((e) => names(e, 'stride') && e.tracks.includes('bones.spine')), `${id} ${clip}: the lean (bones.spine) by Stride`);
    }
  });
}


for (const id of IDS) {
  test(`${id}: at each end of Bounce and Stride each walk and run changes at least ${MOVE_SHARE * 100}% as much as the code sprite's did (recorded)`, async () => {
    const s = await data(id), short = [];
    for (const k of ['bounce', 'stride']) {
      if (!s.params[k]) continue;
      for (const clip of Object.keys(motion[id].shifted[k][0])) {
        for (const v of [0, 1]) {
          const c = motion[id].shifted[k][v][clip];
          if (c < 100) { assert.ok(!SHORT[id]?.[`${clip} ${k}=${v}`], `${id} ${clip} ${k}=${v}: listed in SHORT, but the code moved only ${c}`); continue; }
          const m = moved(s, clip, { [k]: v });
          const known = SHORT[id]?.[`${clip} ${k}=${v}`];
          if (m < MOVE_SHARE * c && !known) short.push(`${clip} ${k}=${v}: code ${c}, data ${m}`);
          if (m >= MOVE_SHARE * c && known) short.push(`${clip} ${k}=${v}: listed in SHORT but moves ${m} of the code's ${c}: take it off the list`);
        }
      }
    }
    assert.deepEqual(short, [], `${id}: clips that change far less than the code's at a slider end`);
  });
}
