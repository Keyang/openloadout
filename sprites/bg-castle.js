// Castle backdrop: three layers that tile sideways (docs/style-guide.md, section 7).
//   far   a dusk sky with a moon, and a far range of towers on crags
//   mid   a long castle wall: battlements, turrets, blind arches and a row of windows
//   near  an arcade seen from inside: columns from the floor to the vault, and hanging banners
// Drawn with engine/backdrop.js. Buildings repeat evenly, so everything is placed on a
// spacing that divides 320 px (320 / n) and nothing has to be wrapped by hand except what
// sits on the join. This file is the worked example for a built background.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, hash } from '../engine/motion.js';
import { tone, mix, brightness } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import {
  LAYER, PIVOT, TIMES, layerClips, skyLook, recede, hazed, standOut, litTone, ridge, battlements, litEdge, scatter,
  fillBands, fillBelow, fillBetween, wrapped, disc, stars, mistBand, tidy,
} from '../engine/backdrop.js';

const P = PALETTE.thornwood;
const [W, H] = LAYER;
const DUSK = mix(P.sky, P.thorn, 0.45);          // the default sky: sky blue turning violet

// The main tone of each layer, farthest first: receded into the air (0 = right behind the game,
// 1 = at the horizon; "Haze" moves all of them), then made to stand out from what it is seen
// against (standOut), so the layers stay apart under any whole-bundle colour preset. At night
// the sky is dark and the stone is moonlit: a smaller step, and lighter instead of darker.
function mainTones(p, sky) {
  const air = sky.air, h = p.haze, night = p.time === 'night';
  const out = (c, sure, also) => (night ? standOut(c, [], { also: [...sure, ...also], step: 0.05 }) : standOut(c, sure, { also }));
  const crags = out(recede(p.land, hazed(0.6, h), air), [air], [sky.bands[2]]);
  const wall = out(recede(p.land, hazed(0.32, h), air), [crags], [air]);
  const near = out(recede(tone(p.land, -1.1), hazed(0, h), air), [wall], [crags]);
  return { crags, wall, near };
}

// Stone in three tones (and a fourth for openings) around its main tone. The shadow tones stay
// mild: a wall's shadows must not be as dark as the columns of the layer in front of it.
const stone = (base, air, lit = 0.55, shade = 0.55) => ({ light: litTone(base, air, lit), base, dark: tone(base, -shade), deep: tone(base, -0.3 - shade) });

// A round-headed opening (arch, window): w wide, from row `top` (its crown) down to row `bottom`.
function arch(g, x, top, bottom, w, colour) {
  const r = w / 2;
  g.ellipse(x, top + r, r, r, colour);
  g.rect(x - r, top + r, w, bottom - top - r, colour);
}

export default defineSprite({
  id: 'bg-castle',
  name: 'Castle backdrop',
  kind: 'Effect',
  blurb: 'Far towers, a castle wall and a row of columns with banners, in three layers that repeat sideways: scroll far at 0.1, mid at 0.4 and near at 0.7 of the camera\'s speed. Change the time of day, the stone, the banners, the lit windows and the height of the walls.',
  meta: {
    type: 'background', role: 'environment/background', themes: ['fantasy', 'dungeon'], gameTypes: ['platformer'], view: 'side',
    words: ['castle', 'fortress', 'wall', 'towers', 'battlements', 'columns', 'banners', 'arcade', 'cloister', 'interior', 'backdrop', 'parallax', 'dusk', 'night'],
    license: 'draft',
  },
  size: LAYER,
  pivot: PIVOT,
  grounded: false,
  preview: 'far',
  params: {
    time: choice('Time of day', 'dusk', TIMES),
    windows: range('Lit windows', 0.45, { lo: 'Few', hi: 'Many' }),
    height: range('Height', 0.5, { lo: 'Low walls', hi: 'High walls' }),
    density: range('Density', 0.5, { lo: 'Few columns', hi: 'Many columns' }),
    haze: range('Haze', 0.35, { lo: 'Clear', hi: 'Misty' }),
    sky: color('Sky', DUSK, swatches('thornwood', 'sky', { lead: DUSK })),
    land: color('Stone', P.slate, swatches('thornwood', 'stone', { lead: 'slate' })),
    accent: color('Banners', P.crimson, swatches('thornwood', 'accent', { lead: 'crimson' })),
  },
  clips: layerClips(),

  render(g, { clip, p }) {
    const sky = skyLook(p.sky, p.time);
    const air = sky.air;
    const T = mainTones(p, sky);
    const lamp = recede(mix(P.gold, P.ember, 0.35), 0.1, air);      // a lit window: it glows, so the air dims it little

    if (clip === 'far') {
      fillBands(g, sky.bands, [20, 38, 56]);      // the towers stand in the last, lightest band
      if (p.time === 'night') stars(g, 40, 8, mix(sky.glow, sky.bands[1], 0.35), { top: 2, bottom: 70 });
      // a sun by day, a moon at dusk and at night
      if (p.time === 'day') disc(g, 84, 24, 10, sky.glow);
      else {
        const moon = p.time === 'dusk' ? mix(sky.glow, P.cream, 0.6) : sky.glow, crater = mix(moon, sky.bands[0], 0.25);
        disc(g, 84, 28, 12, moon);
        g.ellipse(80, 25, 3, 3, crater).ellipse(88, 32, 3.5, 3, crater).ellipse(86, 21, 2, 2, crater);
      }
      // crags with a tower or two on each: a row of several, so no single one marks the repeat
      const S = stone(T.crags, air, 0.5);
      const crags = ridge({ base: 128, height: 36, seed: 11, peaks: 5, shape: 'jagged', rough: 0.5 });
      const lit = Math.round(lerp(1, 9, p.windows));
      scatter(9, 6, { jitter: 0.5 }).forEach((t) => {
        const w = 8 + Math.round(t.u * 5), foot = Math.round(crags(t.x)) + 6, top = foot - 18 - Math.round(t.v * 14);
        wrapped(t.x, w + 4, (x) => {
          g.rect(x - w / 2, top, w, foot - top + 8, S.base);
          if (t.w < 0.5) g.poly([[x - w / 2 - 2, top], [x + w / 2 + 2, top], [x, top - w - 2]], S.base);      // a pointed roof
          else { g.rect(x - w / 2 - 2, top - 3, w + 4, 5, S.base); g.rect(x - w / 2 - 2, top - 6, 3, 3, S.base); g.rect(x - 1, top - 6, 3, 3, S.base); g.rect(x + w / 2 - 1, top - 6, 3, 3, S.base); }
          if (t.i < lit) g.rect(x - 2, top + 6, 3, 5, lamp);
        });
      });
      fillBelow(g, crags, S.base);
      fillBetween(g, crags, litEdge(crags, { depth: 0.7 }), S.light);
      mistBand(g, 128, lerp(0, 12, p.haze), air, 21);
      tidy(g);
      return;
    }

    if (clip === 'mid') {
      const S = stone(T.wall, air);
      const top = Math.round(lerp(122, 92, p.height));       // the walkway behind the battlements
      const BAY = 80;                                         // four bays in 320 px; odd and even bays differ, so nothing repeats inside 160 px
      // the wall and its teeth
      fillBelow(g, battlements(top, { tooth: 10, gap: 6, depth: 7 }), S.base);
      g.rect(0, top + 6, W, 3, S.light);                      // a string course under the teeth
      // a few courses of stone, as short bars
      for (const s of scatter(14, 5, { jitter: 0.9 })) wrapped(s.x, 10, (x) => g.rect(x - 5, top + 18 + Math.round(s.v * 7) * 9, 9, 3, S.dark));
      const windows = [];
      for (let k = 0; k < W / BAY; k++) {
        const ax = k * BAY, tx = k * BAY + BAY / 2, odd = k % 2 === 1;
        if (!odd) {
          // even bays: one tall blind arch, in deep shadow with a paler reveal up its left side ...
          wrapped(ax, 24, (x) => { arch(g, x, top + 30, H, 36, S.dark); arch(g, x + 2, top + 33, H, 32, S.deep); });
          // ... and a slim turret, standing proud of the wall and well above it
          const tt = top - 18;
          g.rect(tx - 9, tt, 18, H - tt, S.base);
          g.rect(tx - 11, tt - 3, 22, 6, S.base);
          for (const dx of [-11, -3, 5]) g.rect(tx + dx, tt - 9, 6, 6, S.base);
          g.rect(tx + 5, tt + 3, 4, H - tt, S.light);
          g.rect(tx - 9, tt + 3, 3, H - tt, S.dark);
          g.rect(tx - 11, tt + 3, 22, 3, S.dark);
          windows.push([tx - 1, tt + 12], [tx - 1, tt + 40], [ax - 26, top + 22], [ax + 26, top + 22]);
        } else {
          // odd bays: a pair of narrow arches under a hood ...
          wrapped(ax, 30, (x) => {
            g.rect(x - 24, top + 34, 48, 4, S.light);
            for (const dx of [-11, 11]) { arch(g, x + dx, top + 42, H, 16, S.dark); arch(g, x + dx + 1, top + 44, H, 13, S.deep); }
          });
          // ... and a broad low bastion with a sloping foot
          const tt = top - 7;
          g.rect(tx - 15, tt, 30, H - tt, S.base);
          g.poly([[tx - 15, top + 44], [tx + 15, top + 44], [tx + 21, H], [tx - 21, H]], S.base);
          g.rect(tx - 17, tt - 3, 34, 6, S.base);
          for (const dx of [-17, -8, 1, 10]) g.rect(tx + dx, tt - 9, 7, 6, S.base);
          g.rect(tx + 10, tt + 3, 5, H - tt, S.light);
          g.rect(tx - 15, tt + 3, 4, H - tt, S.dark);
          g.rect(tx - 17, tt + 3, 34, 3, S.dark);
          windows.push([tx - 7, tt + 16], [tx + 5, tt + 16], [ax - 32, top + 20], [ax + 32, top + 20]);
        }
      }
      // windows: more of them are lit as the slider rises
      const lit = Math.round(lerp(2, windows.length, p.windows));
      const order = windows.map((_, i) => i).sort((a, b) => hash(a, 91) - hash(b, 91));
      windows.forEach(([x, y], i) => wrapped(x, 6, (wx) => arch(g, wx, y, y + 11, 6, order.indexOf(i) < lit ? lamp : S.deep)));
      tidy(g);
      return;
    }

    // near: an arcade seen from inside, the darkest layer. Columns stand floor to vault, an arch
    // springs between each pair, and a banner drops from the top edge over each column.
    const S = stone(T.near, air);
    const cloth0 = recede(p.accent, hazed(0.06, p.haze), air);
    const cloth = brightness(cloth0) > brightness(air) - 0.04 && p.time !== 'night' ? standOut(cloth0, [], { also: [air], step: 0.04 }) : cloth0;      // a pale banner never outshines the sky
    const C = { light: litTone(cloth, air, 0.5), base: cloth, dark: tone(cloth, -0.8) };
    const n = Math.round(lerp(2, 4, p.density)), span = W / n, shaft = 18, half = (span - shaft) / 2;
    const CROWN = 10, SPRING = 56;
    const vault = (x) => {
      const d = Math.abs(((x % span) + span) % span - span / 2);      // distance from the middle of the opening
      return d >= half ? H : CROWN + (SPRING - CROWN) * (1 - Math.sqrt(1 - (d / half) ** 2));
    };
    fillBetween(g, () => 0, vault, S.base);
    fillBetween(g, (x) => Math.max(0, vault(x) - 3), (x) => Math.min(vault(x), SPRING), S.dark);      // the arch ring, in shadow
    for (let k = 0; k < n; k++) {
      const x = Math.round(k * span);                                  // a column stands on the join and on every span
      wrapped(x, 20, (cx) => {
        const l = cx - shaft / 2;
        g.rect(l, SPRING, 4, H - SPRING, S.dark);
        g.rect(l + shaft - 4, SPRING, 3, H - SPRING, S.light);
        g.rect(l - 4, SPRING - 2, shaft + 8, 6, S.base);              // capital
        g.rect(l - 4, SPRING - 2, shaft + 8, 3, S.light);
        g.rect(l - 2, SPRING + 4, shaft + 4, 3, S.dark);
        g.rect(l - 3, 154, shaft + 6, 5, S.base);                     // foot
        g.rect(l - 3, 154, shaft + 6, 3, S.light);
        g.rect(l - 7, 159, shaft + 14, H - 159, S.base);
        g.rect(l - 7, 159, shaft + 14, 3, S.light);
        // the banner: swallow-tailed, a shadow down its left side; every other one is shorter with two bands in place of the diamond
        const bw = 22, bl = cx - bw / 2, len = k % 2 ? 28 : 36;
        g.poly([[bl, 0], [bl + bw, 0], [bl + bw, len + 12], [cx, len + 4], [bl, len + 12]], C.base);
        g.poly([[bl, 0], [bl + 4, 0], [bl + 4, len + 9], [bl, len + 12]], C.dark);
        g.rect(bl + 4, len - 8, bw - 4, 4, C.light);
        if (k % 2) g.rect(bl + 4, len - 16, bw - 4, 4, C.light);
        else g.poly([[cx + 2, 8], [cx + 7, 16], [cx + 2, 24], [cx - 3, 16]], C.light);
      });
    }
    // the floor: a ledge across the whole bottom edge
    g.rect(0, 168, W, 12, S.base);
    g.rect(0, 168, W, 3, S.light);
    g.rect(0, 176, W, 4, S.dark);
    tidy(g);
  },
});
