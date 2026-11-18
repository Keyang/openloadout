// Swarm mite: the horde bug of the Derelict Station kit, a tiny hive bug drawn to be shown fifty at a time: one
// strong shape, bright eyes, the same from every side. It is built on the hive bug rig (rigs/hive-bug.js), which
// draws and poses everything: the glossy body, the fan of thin legs, the fangs, the lit eyes, the jittery skitter,
// the hop of a nip and the pop it dies in. This file only says which of those the mite is (Contract 13): its
// choices, colours, clips and its one sound.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { PALETTE, swatchesBetween } from '../engine/palettes.js';
import * as B from '../rigs/hive-bug.js';

const D = PALETTE.derelict;
// two lists that never share a colour or a value: the eyes are bright, the body darker than they are
const GLOWS = swatchesBetween('derelict', ['glow', 'core'], { lead: 'acid', min: 0.62 });
// (never the grey of the station's own steel, which would sink into the floor, nor the blue of the player's trim)
const BODIES = swatchesBetween('derelict', ['flesh', 'shell', 'accent'], { lead: 'flesh', min: 0.36, max: 0.58 }).filter((c) => c !== D.hull && c !== D.signal);

/** One frame of the mite: the rig's pose with the chosen legs, body and eyes. */
const miteFrame = (clip, t, p) => B.mite(clip, t, p, { legs: p.legs, shape: p.shape, eyes: p.eyes });

export default defineSprite({
  id: 'swarm-mite',
  name: 'Swarm mite',
  kind: 'Creature',
  blurb: 'A tiny hive bug made for crowds of fifty: it skitters, nips and pops. Change its size, legs, body, eyes and colours.',
  meta: {
    type: 'creature', role: 'characters/enemy', themes: ['sci-fi', 'space', 'horror'], gameTypes: ['roguelike-action', 'shooter'], view: 'top-down',
    words: ['mite', 'swarm', 'bug', 'tick', 'critter', 'insect', 'horde', 'skitter', 'nip', 'pop', 'tiny', 'enemy', 'alien', 'survivors'], license: 'draft',
  },
  size: B.MITE_SIZE,
  pivot: B.MITE_PIVOT,
  preview: 'walk',
  // only the pop has a sound: fifty of these on screen must not make fifty footsteps
  sounds: {
    die: [{ sound: 'bug-splat', frame: 0, preset: 'Mite pop', volume: 0.7 }],
  },
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    legs: choice('Legs', 'six', B.MITE_LEGS),
    shape: choice('Shape', 'round', B.MITE_SHAPES),
    eyes: choice('Eyes', 'two', B.MITE_EYES),
    body: color('Body', D.flesh, BODIES),
    glow: color('Eyes', D.acid, GLOWS),
    bounce: range('Bounce', 0.5, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: B.clips((p) => p.speed, ['idle', { name: 'walk', label: 'Skitter' }, { name: 'attack', frames: 6, label: 'Nip' }, 'hurt', { name: 'die', frames: 6, label: 'Pop' }]),

  render(g, { clip, t, p }) {
    const F = miteFrame(clip, t, p);
    const look = { body: p.body, glow: p.glow, bone: D.cream };
    F.draw(g, look);
    F.finish(g, look);
  },
});
