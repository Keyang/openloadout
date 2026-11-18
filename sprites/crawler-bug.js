// Crawler: the basic melee bug of the Derelict Station kit, a segmented six-legged hive bug the size of a dog,
// seen from above in three directions. It is built on the hive bug rig (rigs/hive-bug.js), which draws and poses
// everything from one description of the body: the armoured segments, the six legs walking in two groups of three,
// the open face with its lit eyes, the jaws, the horns, the tail, the back spikes, the bite and the death on its back.
// This file only says which of those the crawler is (Contract 13): its choices, colours, clips and sounds.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { PALETTE, swatchesBetween } from '../engine/palettes.js';
import * as B from '../rigs/hive-bug.js';

const D = PALETTE.derelict;
// three lists that never share a colour or a value: the eyes are bright, the shell pale, the legs and underside dark
const GLOWS = swatchesBetween('derelict', ['glow', 'core'], { lead: 'acid', min: 0.62 });
const SHELLS = swatchesBetween('derelict', ['shell', 'body', 'metal'], { lead: 'chitin', min: 0.6, max: 0.8 }).filter((c) => !GLOWS.includes(c)).slice(0, 4);
const SOFTS = swatchesBetween('derelict', ['flesh', 'accent', 'wall'], { lead: 'flesh', min: 0.36, max: 0.5 });

/** One frame of the crawler: the rig's pose with the chosen length, spikes, horns and tail. */
const crawlerFrame = (clip, t, p) => B.crawler(clip, t, p, {
  length: p.length, spikes: p.spikes,
  horns: { kind: p.horns, length: p.hornLength }, tail: { kind: p.tail, length: p.tailLength },
});

const STEPS = () => [{ sound: 'footstep-metal', frame: 0, preset: 'Light scuttle', volume: 0.3 }, { sound: 'footstep-metal', frame: 4, preset: 'Light scuttle', volume: 0.3 }];
const BITE = () => [{ sound: 'bolt-impact', frame: 4, preset: 'On flesh', volume: 0.85 }];

export default defineSprite({
  id: 'crawler-bug',
  name: 'Crawler',
  kind: 'Creature',
  blurb: 'A segmented six-legged hive bug that scuttles in four directions, lunges to bite and dies on its back. Change its size, legs, length, spikes, horns, tail and colours.',
  meta: {
    type: 'creature', role: 'characters/enemy', themes: ['sci-fi', 'space', 'horror'], gameTypes: ['roguelike-action', 'shooter'], view: 'top-down',
    words: ['crawler', 'bug', 'alien', 'insect', 'beetle', 'pincers', 'stinger', 'scuttle', 'bite', 'melee', 'enemy', 'hive', 'segmented', 'creepy'], license: 'draft',
  },
  size: B.SIZE,
  pivot: B.PIVOT,
  preview: 'walk_down',
  // sounds that play with each animation: frame is counted from 0; preset is one of the sound's named styles
  sounds: {
    walk_down: STEPS(), walk_up: STEPS(), walk_side: STEPS(),
    attack_down: BITE(), attack_up: BITE(), attack_side: BITE(),
    hurt: [{ sound: 'bolt-impact', frame: 0, preset: 'On flesh', volume: 0.9 }],
    die: [{ sound: 'bug-splat', frame: 0, preset: 'Crawler', volume: 1 }],
  },
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    legs: range('Legs', 0.5, { lo: 'Short', hi: 'Long' }),
    length: choice('Length', 'medium', B.LENGTHS),
    spikes: toggle('Back spikes', false),
    // horns
    horns: choice('Horns', 'pincers', [...B.HORNS, 'none']),
    hornLength: range('Length', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Short', hi: 'Long' }),
    // tail
    tail: choice('Tail', 'none', ['none', ...B.TAILS]),
    tailLength: range('Length', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Short', hi: 'Long' }),
    body: color('Shell', D.chitin, SHELLS),
    accent: color('Legs and underside', D.flesh, SOFTS),
    glow: color('Eyes', D.acid, GLOWS),
    bounce: range('Bounce', 0.5, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),
    stride: range('Stride', 0.5, { lo: 'Small steps', hi: 'Big steps', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  // What grows on its head and behind it. The first key of each list picks which one (or none); the rest are that part's own settings.
  parts: {
    horns: { label: 'Horns', params: ['horns', 'hornLength'], none: 'none', socket: 'head' },
    tail: { label: 'Tail', params: ['tail', 'tailLength'], none: 'none', socket: 'tail' },
  },
  // idle facing the camera, then walk and bite in three directions, then hurt and die (drawn facing down, used for every direction)
  clips: B.clips((p) => p.speed, ['idle_down', 'walk*', { name: 'attack*', label: 'Bite' }, 'hurt', 'die']),

  // attach points for every frame: head (the nose: the horns, and where a bite lands), tail, back, feet
  sockets: (clip, t, p) => crawlerFrame(clip, t, p).sockets(),

  render(g, { clip, t, p }) {
    const F = crawlerFrame(clip, t, p);
    const look = { body: p.body, accent: p.accent, glow: p.glow, bone: D.cream };
    F.draw(g, look);
    F.finish(g, look);
  },
});
