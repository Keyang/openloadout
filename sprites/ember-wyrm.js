// Ember wyrm: the boss of the Hearthvale kit, a long-necked dragon for the side-view battle screen. It is built on
// the four-legged rig (rigs/quadruped.js), which draws and poses everything: the crouched body with its belly plates,
// the neck and the jawed head, the curling tail, the wings, horns and spines, and every move (the bite, the fire
// breath, the wing buffet, the fall it dies in). This file only says which of those the wyrm is (Contract 13): its
// choices, colours, clips and sounds.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { PALETTE, swatchesBetween } from '../engine/palettes.js';
import * as Q from '../rigs/quadruped.js';

const P = PALETTE.hearthvale;
// three lists that never share a colour: the hide is dark, the belly and wing skin pale, and the fire is neither
const HIDES = swatchesBetween('hearthvale', ['body', 'shell', 'outfit'], { lead: 'crimson', max: 0.5 });
const BELLIES = swatchesBetween('hearthvale', ['wheat', 'ground', 'stone', 'accent'], { lead: 'wheat', min: 0.64 }).filter((c) => ![P.cream, P.heal, '#e0b040'].includes(c));
const FIRES = swatchesBetween('hearthvale', ['glow', 'edge'], { lead: 'fire' }).filter((c) => !HIDES.includes(c) && !BELLIES.includes(c));

/** One frame of the wyrm: the rig's pose with the chosen neck, spines, wings, horns and tail. */
const wyrmFrame = (clip, t, p) => Q.frame(clip, t, p, {
  neck: p.length, spines: p.spines,
  wings: { kind: p.wings, span: p.wingSpan }, horns: { kind: p.horns, length: p.hornLength }, tail: { kind: p.tail, length: p.tailLength },
});

export default defineSprite({
  id: 'ember-wyrm',
  name: 'Ember wyrm',
  kind: 'Creature',
  blurb: 'A boss: a long-necked dragon crouched on four legs that bites, breathes fire and beats its wings. Change its size, neck, bulk, spines, wings, horns, tail and colours.',
  meta: {
    type: 'creature', role: 'characters/boss', themes: ['fantasy', 'dungeon'], gameTypes: ['turn-based-rpg', 'platformer'], view: 'side',
    words: ['dragon', 'wyrm', 'drake', 'wyvern', 'monster', 'wings', 'horns', 'bite', 'fire breath', 'burn', 'buffet', 'roar', 'boss fight', 'scaly'], license: 'draft',
  },
  size: Q.SIZE,
  pivot: Q.PIVOT,
  preview: 'idle',
  // sounds that play with each animation: frame is counted from 0; preset is one of the sound's named styles
  sounds: {
    attack: [{ sound: 'punch', preset: 'Heavy body blow', frame: 7, volume: 1 }],
    breath: [{ sound: 'wyrm-roar', preset: 'Fire breath', frame: 1, volume: 1 }],
    buffet: [{ sound: 'whoosh', preset: 'Heavy swing', frame: 4, volume: 1 }],
    hurt: [{ sound: 'punch', preset: 'Heavy body blow', frame: 0, volume: 0.9 }],
    die: [{ sound: 'wyrm-roar', preset: 'Distant growl', frame: 0, volume: 1 }, { sound: 'monster-fade', preset: 'Big beast falls', frame: 8, volume: 1 }],
  },
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    length: range('Neck', 0.5, { lo: 'Short', hi: 'Long' }),
    bulk: range('Bulk', 0.5, { lo: 'Lean', hi: 'Heavy' }),
    spines: choice('Spines', 'ridge', ['none', ...Q.SPINES]),
    // wings
    wings: choice('Wings', 'large', [...Q.WINGS, 'none']),
    wingSpan: range('Span', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Small', hi: 'Wide' }),
    // horns
    horns: choice('Horns', 'swept', [...Q.HORNS, 'none']),
    hornLength: range('Length', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Short', hi: 'Long' }),
    // tail: it cannot be taken off; the choice is what it ends in
    tail: choice('Tail', 'spade', Q.TAILS),
    tailLength: range('Length', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Short', hi: 'Long' }),
    body: color('Hide', P.crimson, HIDES),
    accent: color('Belly and wings', P.wheat, BELLIES),
    glow: color('Fire', P.fire, FIRES),
    bounce: range('Bounce', 0.5, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),      // how deeply it breathes
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  // What stands on its back and head, and what its tail ends in. The first key of each list picks which one (or none); the rest are that part's own settings.
  parts: {
    wings: { label: 'Wings', params: ['wings', 'wingSpan'], none: 'none', socket: 'back' },
    horns: { label: 'Horns', params: ['horns', 'hornLength'], none: 'none', socket: 'head' },
    tail: { label: 'Tail', params: ['tail', 'tailLength'], socket: 'tail' },
  },
  clips: Q.clips((p) => p.speed, ['idle', { name: 'attack', label: 'Bite' }, { name: 'breath', label: 'Fire breath' }, { name: 'buffet', label: 'Wing buffet' }, 'hurt', 'die']),

  // attach points for every frame: head (the horns), back (the wings), tail (its end), feet, and muzzle (the mouth, where the fire appears)
  sockets: (clip, t, p) => wyrmFrame(clip, t, p).sockets(),

  render(g, { clip, t, p }) {
    const F = wyrmFrame(clip, t, p);
    const look = { body: p.body, accent: p.accent, glow: p.glow, bone: P.cream, core: P.thunder, smoke: P.cobble };
    F.draw(g, look);
    F.finish(g, look);
  },
});
