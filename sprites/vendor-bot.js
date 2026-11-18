// Vendor bot: the shop of the Derelict Station kit, a friendly vending kiosk that hovers in place over a small jet and
// always faces the camera. It is built on the kiosk robot rig (rigs/kiosk.js), which draws and poses everything: the
// cabinet, the screen and its faces, the hatch and the tray that slides out of it, the arms, what stands on top and
// what is held. This file only says which of those the vendor is (Contract 13): its choices, colours, clips and sounds.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import * as K from '../rigs/kiosk.js';

const D = PALETTE.derelict;
// a machine: its cabinet is one of the station's greys, never the dark of the floor it floats over
const BODIES = [D.panel, D.steel, D.hull, D.suit];
// the trim is a colour, clearly apart from every grey; never hazard amber or hostile red, which a shop is not
const ACCENTS = swatches('derelict', 'accent', { lead: 'teal' }).filter((c) => c !== D.amber && c !== D.red && c !== D.cyan);
// the screen is friendly energy: never the red of an enemy's lights
const GLOWS = swatches('derelict', 'glow', { lead: 'cyan' }).filter((c) => c !== D.red && !ACCENTS.includes(c));

/** One frame of the vendor: the rig's pose with the chosen body, face, arms, headgear and held thing. */
const vendorFrame = (clip, t, p, frame) => K.frame(clip, t, p, {
  shape: p.shape, face: p.eyes, arms: p.arms, frame,
  headgear: { kind: p.headgear, size: p.headgearSize }, held: { kind: p.held, size: p.heldSize },
});

export default defineSprite({
  id: 'vendor-bot',
  name: 'Vendor bot',
  kind: 'Character',
  blurb: 'A friendly shop robot that hovers in place, chats and serves from its hatch. Change its body, screen face, arms, what it wears and holds, and its colours.',
  meta: {
    type: 'character', role: 'characters/npc', themes: ['sci-fi', 'space'], gameTypes: ['roguelike-action', 'shooter'], view: 'top-down',
    words: ['vendor', 'shop', 'shopkeeper', 'merchant', 'robot', 'kiosk', 'vending machine', 'store', 'talk', 'sell', 'buy', 'hover', 'friendly'], license: 'draft',
  },
  size: K.SIZE,
  pivot: K.PIVOT,
  preview: 'idle',
  sounds: {
    talk: [{ sound: 'tech-click', frame: 0, preset: 'Hover', volume: 0.6 }, { sound: 'tech-click', frame: 4, preset: 'Hover', volume: 0.6 }],
    sell: [{ sound: 'credit-pickup', frame: 3, preset: 'Credit chip', volume: 0.7 }],
  },
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shape', 'boxy', K.SHAPES),
    eyes: choice('Eyes', 'smile', K.FACES),
    arms: toggle('Arms', true),
    // headgear
    headgear: choice('Headgear', 'antenna', [...K.HEADGEAR, 'none']),
    headgearSize: range('Size', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Small', hi: 'Big' }),
    // held
    held: choice('Held', 'none', ['none', ...K.HELD]),
    heldSize: range('Size', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Small', hi: 'Big' }),
    body: color('Body', D.panel, BODIES),
    accent: color('Trim', D.teal, ACCENTS),
    glow: color('Screen', D.cyan, GLOWS),
    bob: range('Float', 0.5, { lo: 'Still', hi: 'Floaty', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  // What the vendor wears and holds. The first key of each list picks which one (or none); the rest are that part's own settings.
  parts: {
    headgear: { label: 'Headgear', params: ['headgear', 'headgearSize'], none: 'none', socket: 'head' },
    held: { label: 'Held', params: ['held', 'heldSize'], none: 'none', socket: 'hand' },
  },
  // idle (hovering), talk (the face flickers and an arm waves), sell (a tray slides out of the hatch)
  clips: K.clips((p) => p.speed, ['idle', 'talk', 'sell']),

  // attach points for every frame: head, hand (what it holds), offhand, feet, and hatch (where what it sells appears)
  sockets: (clip, t, p) => vendorFrame(clip, t, p).sockets(),

  render(g, { clip, t, frame, p }) {
    const F = vendorFrame(clip, t, p, frame);
    const look = { body: p.body, accent: p.accent, glow: p.glow, metal: D.steel, dark: D.plate, goods: D.gold, sign: D.cream, core: D.cream };
    F.draw(g, look);
    F.finish(g, look);
  },
});
