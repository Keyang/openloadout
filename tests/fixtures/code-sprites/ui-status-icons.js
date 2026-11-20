// FROZEN COPY, not a sprite: sprites/ui-status-icons.js as it was on 2026-11-20 (migration batch M9), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only for the tests about the framework its code uses (tests/helpers/library.mjs
// codeSprite, codeSpriteSource); imports point at ../../../. Never edit it; the build never scans tests/.
// Status marks (kit-rpg-fantasy, batch R17): ten tiny marks a game shows beside a fighter, one
// clip each. The pictures are the status marks of the glyph helper (engine/glyphs.js), which also
// draws the plate; this file only says which mark each clip is, whether it is a boost or an
// ailment, and what colour the thing it is shown with has.
//
// Outlines, so each reads without its colour: a drop (poison), a big and a small z (sleep), stars
// in a ring (stun), a flame (burn), a six-armed flake (freeze), an upright blade or a shield with
// an arrow up or down beside it (attack and defence, up and down), and a boot with three wing
// feathers streaming behind it (haste). Boosts are drawn in the Boost colour and ailments in the
// Ailment colour; blades and shields are steel and the wing is cream, whatever the colours.
//
// A picture is at most 10x10 and its outline makes 12x12, which is the inside of the 14x14 plate:
// the regular pictures leave a little of the plate showing all round, the bold ones fill it.
import { defineSprite, choice, color, toggle } from '../../../engine/sprite.js';
import { Surface } from '../../../engine/surface.js';
import { INK } from '../../../engine/color.js';
import { PALETTE } from '../../../engine/palettes.js';
import { iconClips } from '../../../engine/icons.js';
import { statusMark, drawGlyph, glyphPlate } from '../../../engine/glyphs.js';

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

export default defineSprite({
  id: 'ui-status-icons',
  name: 'Status marks',
  kind: 'Item',
  blurb: 'Ten tiny status marks: poison, sleep, stun, burn, freeze, attack and defence up and down, and haste; put a round or square plate behind them, make them bold, and change the colours of boosts and ailments.',
  meta: {
    type: 'ui', role: 'interface/icon', themes: ['fantasy', 'neutral'], gameTypes: ['turn-based-rpg', 'roguelike-action', 'arcade'], view: 'none',
    words: ['status', 'poison', 'sleep', 'stun', 'burn', 'freeze', 'haste', 'buff', 'debuff', 'ailment', 'condition', 'attack', 'defence', 'badge'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [8, 8],
  grounded: false,
  preview: 'poison',
  params: {
    backing: choice('Backing', 'none', ['none', 'round', 'square']),
    bold: toggle('Bold', false),
    shine: toggle('Shine', true),
    face: color('Plate', P.panel, [P.panel, P.slate, P.wood, P.rogue, P.pine, P.bandit], { when: { backing: ['round', 'square'] } }),
    good: color('Boost', P.heal, [P.heal, P.meadow, P.magic, P.thunder, P.gold, P.ice]),
    bad: color('Ailment', P.mage, [P.mage, P.crimson, P.fire, P.bandit, P.roof]),
  },
  // noText: the plate only sits behind a mark and never carries text, so the text-contrast rule does not
  // apply to its colour (engine/ui.js, CONTRAST); the mark keeps its own ink outline on any plate
  clips: Object.fromEntries(Object.entries(iconClips(Object.entries(MARKS).map(([name, m]) => [name, m.label]))).map(([name, c]) => [name, { ...c, noText: true }])),

  render(g, { clip, p }) {
    const mark = MARKS[clip], picture = statusMark(clip, { bold: p.bold });
    // the picture is centred in the 14x14 a glyph may fill; its outline goes on before the plate is put behind it
    const s = new Surface(...SIZE);
    drawGlyph(s, picture, 1 + ((14 - picture.w) >> 1), 1 + ((14 - picture.h) >> 1), { main: mark.boost ? p.good : p.bad, second: mark.second, shine: p.shine });
    s.outline(INK);
    if (p.backing !== 'none') glyphPlate(g, 1, 1, 14, { shape: p.backing, face: p.face, shine: p.shine });
    g.blit(s);
  },
});
