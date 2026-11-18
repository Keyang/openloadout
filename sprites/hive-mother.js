// Hive mother: the first boss of the Derelict Station kit, a bloated queen that hardly moves and always faces the
// camera. She is built on the brood queen rig (rigs/brood-queen.js), which draws and poses everything: the pale
// abdomen studded with glowing egg sacs, the armoured head with its visor of eyes, the scythe legs, the walking
// legs, the horns and the wings, and every move (stab, acid spray, spawn, enrage, the burst she dies in).
// This file only says which of those the hive mother is (Contract 13): her choices, colours, clips and sounds.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { PALETTE, swatchesBetween } from '../engine/palettes.js';
import * as Q from '../rigs/brood-queen.js';

const D = PALETTE.derelict;
// three lists that never share a colour or a value: the acid is bright, the shell pale, the sacs dark
const GLOWS = swatchesBetween('derelict', ['glow', 'core'], { lead: 'acid', min: 0.62 });
const SHELLS = swatchesBetween('derelict', ['shell', 'body', 'metal'], { lead: 'chitin', min: 0.6 }).filter((c) => !GLOWS.includes(c)).slice(0, 5);
// (never the colour of the floor she stands on: her wings would sink into it)
const SACS = swatchesBetween('derelict', ['flesh', 'accent', 'wall'], { lead: 'flesh', min: 0.36, max: 0.5 }).filter((c) => c !== D.deck);

/** One frame of the hive mother: the rig's pose with the chosen legs, egg sacs, horns and wings. */
const motherFrame = (clip, t, p) => Q.frame(clip, t, p, {
  legs: p.legs, sacs: p.pieces,
  horns: { kind: p.horns, length: p.hornLength }, wings: { kind: p.wings, span: p.wingSpan },
});

export default defineSprite({
  id: 'hive-mother',
  name: 'Hive mother',
  kind: 'Creature',
  blurb: 'A boss: a bloated alien queen with a small armoured head, scythe legs and a huge pale abdomen studded with glowing egg sacs. Change her size, abdomen, legs, egg sacs, horns, wings and colours.',
  meta: {
    type: 'creature', role: 'characters/boss', themes: ['sci-fi', 'space', 'horror'], gameTypes: ['roguelike-action', 'shooter'], view: 'top-down',
    words: ['queen', 'mother', 'hive', 'alien', 'bug', 'insect', 'brood', 'egg sac', 'stab', 'acid spray', 'spawn', 'enrage', 'boss fight', 'bloated'], license: 'draft',
  },
  size: Q.SIZE,
  pivot: Q.PIVOT,
  preview: 'idle',
  // sounds that play with each animation: frame is counted from 0; preset is one of the sound's named styles
  sounds: {
    attack: [{ sound: 'bolt-impact', frame: 6, preset: 'On flesh', volume: 1 }],
    shoot: [{ sound: 'laser-shot', frame: 5, preset: 'Alien ray', volume: 1 }],
    spawn: [{ sound: 'bug-splat', frame: 4, preset: 'Mite pop', volume: 1 }],
    enrage: [{ sound: 'hive-shriek', frame: 2, preset: 'Enraged', volume: 1 }],
    hurt: [{ sound: 'bolt-impact', frame: 0, preset: 'On flesh', volume: 0.9 }],
    die: [{ sound: 'hive-shriek', frame: 0, preset: 'Hive mother', volume: 1 }, { sound: 'bug-splat', frame: 7, preset: 'Big burst', volume: 1 }],
  },
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    bulk: range('Abdomen', 0.5, { lo: 'Lean', hi: 'Bloated' }),
    legs: choice('Legs', 'six', Q.LEGS),
    pieces: range('Egg sacs', 0.5, { lo: 'Few', hi: 'Many' }),
    // horns
    horns: choice('Horns', 'crown', [...Q.HORNS, 'none']),
    hornLength: range('Length', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Short', hi: 'Long' }),
    // wings
    wings: choice('Wings', 'none', ['none', ...Q.WINGS]),
    wingSpan: range('Span', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Small', hi: 'Wide' }),
    body: color('Shell', D.chitin, SHELLS),
    accent: color('Sacs', D.flesh, SACS),
    glow: color('Acid', D.acid, GLOWS),
    bounce: range('Bounce', 0.5, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),      // how much she pulses as she breathes
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  // What stands on her head and behind her abdomen. The first key of each list picks which one (or none); the rest are that part's own settings.
  parts: {
    horns: { label: 'Horns', params: ['horns', 'hornLength'], none: 'none', socket: 'head' },
    wings: { label: 'Wings', params: ['wings', 'wingSpan'], none: 'none', socket: 'back' },
  },
  clips: Q.clips((p) => p.speed, ['idle', { name: 'attack', label: 'Stab' }, { name: 'shoot', label: 'Acid spray' }, 'spawn', 'enrage', 'hurt', 'die']),

  // attach points for every frame: head (the horns), back (the wings), feet, muzzle (the mouth, where the acid appears),
  // and spawn1 to spawn3 (the floor beside each brood sac, where a game places what hatches in `spawn`)
  sockets: (clip, t, p) => motherFrame(clip, t, p).sockets(),

  render(g, { clip, t, p }) {
    const F = motherFrame(clip, t, p);
    const look = { body: p.body, accent: p.accent, glow: p.glow, bone: D.cream, core: D.cream, dust: D.steel };
    F.draw(g, look);
    F.finish(g, look);
  },
});
