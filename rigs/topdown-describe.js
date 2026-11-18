// What the top-down character rig has (rigs/topdown.js and its side module rigs/topdown-riot.js), as plain data a
// program can read: its poses, carries and manners, body, hair, every part it can wear and every kind it can hold,
// its attach points, each with the function that draws it and the options that function takes. First step of
// Contract 13 (docs/architecture.md): a rig that lists itself. Nothing in the rig reads this file.
//
//   import { RIG } from '../rigs/topdown-describe.js';    // or (await loadout.framework).topdownDescribe.RIG, or generated/api.json -> rigs
//   node tools/rig.mjs topdown                             // the same as tables; --sheet draws every part and held kind
//
// Names are '<module>.<export>' with the module's name on window.loadout.framework (topdown = rigs/topdown.js,
// topdownRiot = rigs/topdown-riot.js). Each thing is listed once, under the function that draws it; where the same
// idea exists more than once it is under `duplicates`, with the calls a tidy-up would merge.
// tests/unit/rig-describe-*.test.mjs prove every line: each thing listed is drawn through the function named, in the
// directions given, at both ends of every range; and every export and every name list of the two modules is listed
// here. Add to the rig, add here, or those tests fail. The shape is written out in docs/framework-api.md, "Rigs".

const num = (min, max, def, what) => ({ min, max, default: def, ...(what ? { what } : {}) });
const pick = (choices, def, list) => ({ choices, default: def ?? choices[0], ...(list ? { list } : {}) });
const colour = (def, what) => ({ colour: true, ...(def ? { default: def } : {}), ...(what ? { what } : {}) });
const flag = (def, what) => ({ flag: true, default: def, ...(what ? { what } : {}) });

const ALL = ['down', 'up', 'side'], FRONT = ['down', 'side'], BACK = ['up'];      // FRONT: nothing shows from behind
const HAT = num(0.5, 1.8, 1, 'its Size setting');             // headgear: the range every sprite's Size slider uses
const GEAR = num(0.65, 1.35, 1, 'its Size setting');          // shields, packs
const LENGTH = num(0.65, 1.35, 1, 'the length setting; 1 = the standard size in px');
const MOTION = { bounce: num(0, 1, 0.5, 'how lively'), stride: num(0, 1, 0.5, 'how long the steps are') };
const HATTED = { hatted: true };                               // look.hatted: no hair rises above the skull

const pose = (name, frames, fps, loop, what, extra = {}) => ({ name, fn: 'topdown.pose', list: 'topdown.STANDARD', table: 'topdown.STANDARD', frames, fps, loop, directions: ALL, standardFor: [name], options: MOTION, what, ...extra });
const part = (name, fn, layer, socket, directions, options, what, extra = {}) => ({ name, fn, layer, socket, directions, options, what, ...extra });
const rise = (fn, ...args) => ({ rise: { fn, args } });
const held = (name, fn, size, list, px, carry, clips, options, what, extra = {}) => ({ name, fn, size, list, px, length: LENGTH, carry, layer: 'item', socket: 'hand', directions: ALL, clips, options, what, ...extra });

const METAL = colour(undefined, 'a colour or a ramp'), WOOD = colour(undefined, 'the shaft or grip');

/** The top-down character rig described as data: id, view, frame, poses, carries, manners, body, hair, parts, held kinds, sockets, and what overlaps. No arguments: a constant. */
export const RIG = {
  id: 'topdown',
  name: 'Top-down character',
  about: 'A two-legged character in the three-quarter view for map and room games. Three directions are drawn (down, up, side facing right) and a game mirrors the fourth.',
  view: 'top-down',
  size: [48, 48],
  pivot: [24, 42],
  ground: 42,
  directions: ALL,
  directionList: { list: 'topdown.DIRECTIONS', choices: ALL, what: 'the drawn directions, in clip order; clips are named <pose>_<direction>, and a pose with no direction is drawn facing down' },
  directionClips: true,
  modules: { topdown: 'rigs/topdown.js', topdownRiot: 'rigs/topdown-riot.js' },

  frames: [
    { fn: 'topdown.frame', args: ['clip', 't', 'p', 'options'], what: 'One frame, posed and fitted once: F.draw(g, look, hooks), F.finish(g, { trail, flash, outline }), F.sockets(), F.hand(J). options: { item, rise, points, far, carry, tall, muzzle }.' },
    { fn: 'topdown.frameWith', duplicateOf: 'topdown.poseFrame', what: 'frame() plus options.manner: the pose is changed after the fit and fitted again (without `far`); only the drawn frame is changed, so a swing arc follows the standard pose. A manner is given F.carry.' },
    { fn: 'topdown.poseFrame', duplicateOf: 'topdown.frameWith', what: 'A copy of frame() plus options.pose (a pose function), options.dims and options.manner, applied before the one fit; it has no `far`, gives a manner no F.carry, and moves the offhand socket to a waving hand.' },
    { fn: 'topdown.bracedFrame', what: 'frameWith() under the carry "braced" with bracedManner: a long gun in both hands. Adds F.grip(J) and moves the offhand socket there.' },
    { fn: 'topdownRiot.shieldFrame', what: 'poseFrame() with carryShield and strike, or bracedFrame() when there is no shield and a long gun. Adds F.shield and F.grip(J).' },
    { fn: 'topdown.clips', what: 'The clip table: idle_*, walk_*, the directed actions, then clips with no direction. options: { action, plain, walk, extra }.' },
    { fn: 'topdown.clipEntry', what: 'One standard clip entry, for clips() extra.' },
    { fn: 'topdown.parseClip', what: 'Splits a clip name into action and direction.' },
  ],

  // the hooks of draw(), in the order they are called facing down or sideways; facing up `item` and `offhand` come first
  layers: [
    { name: 'behind', what: 'on the back: capes, packs. Facing up it is drawn last, over the back' },
    { name: 'offhand', what: 'what the other hand holds: a shield' },
    { name: 'torso', what: 'after the legs and body, before the arms and the head: belts, robes, tabards' },
    { name: 'head', what: 'after the head and its hair: hats, helmets, hoods, beards' },
    { name: 'item', what: 'the thing in the weapon hand, under the hand' },
    { name: 'front', what: 'last, nearest the viewer: gloves, the near shoulder of a side clip' },
  ],

  poses: [
    pose('idle', 8, 7, true, 'Standing, breathing, one blink.'),
    pose('walk', 8, 10, true, 'A walk cycle: a foot lands on frames 0 and 4.'),
    pose('run', 8, 14, true, 'A run cycle.'),
    pose('attack', 8, 13, false, 'A swing of what the weapon hand holds; the blade is on its way to the hit while P.slash is set.', { standardFor: ['attack'] }),
    { name: 'punch', fn: 'topdown.pose', table: 'topdown.STANDARD', clipOf: 'attack', frames: 8, fps: 13, loop: false, directions: ALL, standardFor: ['attack'], when: 'nothing is held', options: MOTION, what: 'The unarmed attack: frame() uses it for `attack` when nothing is held. It is in no exported list: pose() knows it by name.' },
    pose('shoot', 6, 14, false, 'A shot: P.fire on frame 1.'),
    pose('cast', 8, 10, false, 'A spell: P.glow rises to 1 and falls.'),
    pose('block', 6, 10, false, 'A guard held for the middle frames.'),
    pose('dodge', 8, 14, false, 'A roll or dash: P.tuck is 1 while curled.'),
    pose('talk', 8, 7, true, 'Standing, the mouth opening and the free hand moving.'),
    pose('hurt', 4, 9, false, 'Knocked back; frame 0 is drawn white (P.flash).'),
    pose('die', 8, 10, false, 'Falls and lies on the ground (P.lie).'),
    { name: 'wave', fn: 'topdown.gesture', list: 'topdown.GESTURES', table: null, frames: 8, fps: 10, loop: false, directions: ALL, standardFor: [], options: {}, what: 'A gesture: the free arm is raised and the hand swings twice (P.wave; waveArm draws it). Not in STANDARD: the clip entry is written in sprites/merchant.js. Passed as poseFrame() options.pose.', needs: 'waveArm in the front hook' },
    { name: 'count', fn: 'topdown.gesture', list: 'topdown.GESTURES', table: 'topdown.STANDARD', clipOf: 'talk', frames: 8, fps: 7, loop: true, directions: ALL, standardFor: [], options: {}, what: 'A gesture: the free hand is held up and ticks off one, two, three fingers (P.count; fingers draws them). Used as the `talk` clip of a merchant.', needs: 'fingers in the front hook' },
    { name: 'strike', fn: 'topdownRiot.strike', args: ['direction', 't', 'm', 'd', 'options'], table: 'topdown.STANDARD', clipOf: 'shoot', frames: 6, fps: 14, loop: false, directions: ALL, standardFor: [], options: { using: pick(['item', 'shield', 'fist'], 'item') }, what: 'A jab timed for the six frames of `shoot`, for a body with no gun: it lands on frame 2. shieldFrame() uses it.' },
  ],

  carries: [
    { name: 'up', list: 'topdown.CARRY', what: 'tip up and out, about 40 degrees from upright: swords, axes, wands' },
    { name: 'upright', list: 'topdown.CARRY', what: 'nearly straight up, the hand held out: staffs, pole weapons' },
    { name: 'low', list: 'topdown.CARRY', what: 'tip down and out: canes, guns at rest' },
    { name: 'hang', list: 'topdown.CARRY', what: 'straight down whatever the arm does, with a small swing: lanterns, baskets' },
    { name: 'ready', list: 'topdown.CARRY', constant: 'topdown.CARRY_READY', what: 'a gun at the hip, pointing ahead (added to CARRY when the module loads)' },
    { name: 'braced', list: 'topdown.CARRY', constant: 'topdown.CARRY_BRACED', what: 'a long gun in both hands (added to CARRY when the module loads; needs bracedManner)' },
  ],

  manners: [
    { name: 'rock', fn: 'topdown.MANNERS.rock', list: 'topdown.MANNERS', appliesTo: ['idle'], shownWith: { pose: 'idle', t: 0.25 }, what: 'Rocks from heel to toe with both hands swinging: a child who cannot stand still.' },
    { name: 'flail', fn: 'topdown.MANNERS.flail', list: 'topdown.MANNERS', appliesTo: ['run'], shownWith: { pose: 'run', t: 0.25 }, what: 'Both hands above the shoulders, waving in turn.' },
    { name: 'bar', fn: 'topdown.MANNERS.bar', list: 'topdown.MANNERS', appliesTo: ['block'], shownWith: { pose: 'block', t: 0.5 }, what: 'With nothing held the weapon arm is held out level to bar the way; a pole weapon is brought level. Reads F.carry.' },
    { name: 'attention', fn: 'topdown.MANNERS.attention', list: 'topdown.MANNERS', appliesTo: ['idle', 'walk', 'talk'], shownWith: { pose: 'idle', t: 0, held: 'halberd' }, what: 'What is held is carried closer to upright: a guard with a pole weapon. Reads F.carry.' },
    { name: 'dash', fn: 'topdown.dashManner', appliesTo: ['run'], shownWith: { pose: 'run', t: 0.25 }, what: 'Turns run into a low, leaning dash with both arms swept back.' },
    { name: 'walking stick', fn: 'topdown.walkingStickManner', appliesTo: ['walk'], shownWith: { pose: 'walk', t: 0.125, held: 'staff' }, what: 'A thing carried upright is lifted with one step and planted with the next. Reads F.carry.' },
    { name: 'braced', fn: 'topdown.bracedManner', appliesTo: ['idle', 'walk', 'run', 'shoot', 'dodge', 'talk', 'hurt'], shownWith: { pose: 'idle', t: 0, held: 'beam', carry: 'braced' }, what: 'Both hands stay on a long gun under the carry "braced". bracedFrame() applies it.' },
    { name: 'carry shield', fn: 'topdownRiot.carryShield', make: ['ready'], appliesTo: ['idle', 'walk', 'shoot', 'block', 'hurt'], shownWith: { pose: 'block', t: 0.5 }, what: 'Made by carryShield(carry): the off arm is held bent and steady, and block plants the shield and crouches (P.guard). shieldFrame() applies it.' },
  ],
  mannerTools: {
    'topdown.stoop': 'bends a pose into an old stoop (P.stoop); hunch draws the back',
    'topdown.plantStick': 'puts the weapon hand on a stick whose tip stands on the ground',
    'topdown.holdWith': 'puts the free hand on what the weapon hand holds',
  },

  body: {
    fn: 'topdown.draw',
    dims: 'topdown.dims',
    solve: 'topdown.solve',
    fit: 'topdown.fit',
    controls: { height: num(0, 1, 0.5, 'the body from 26 to 34 px tall'), build: num(0, 1, 0.5, 'the chest 7, 9 or 11 px across'), head: num(0, 1, 0.5, 'the head 11, 13 or 15 px across') },
    look: { skin: 'colour', top: 'colour', bottom: 'colour', boots: 'colour', hair: 'colour', hairStyle: 'one of the hair styles', hatted: 'true when the head hook draws a hat, helmet or hood', cuffs: 'a colour for a band on each sleeve, or none' },
    kinds: [
      { name: 'adult', what: 'The standard body: 26 to 34 px tall.' },
      { name: 'child', via: { tall: [22, 27], body: { build: 0.2 } }, definedIn: 'sprites/farm-kid.js', what: 'A child: 22 to 27 px tall with a slight build. Not a named kind of the rig: the two numbers are constants in sprites/farm-kid.js, passed as dims() options.tall.' },
      { name: 'tall', via: { tall: [29, 35] }, definedIn: 'sprites/merchant.js', what: 'A head taller than the others (and, in the sprite, arms 2 px longer through poseFrame options.dims). Constants in sprites/merchant.js.' },
    ],
  },

  hair: [
    { name: 'short', fn: 'topdown.drawHair', via: { look: { hairStyle: 'short' }, bare: { hairStyle: 'bald' } }, list: 'topdown.HAIR_STYLES', directions: ALL, what: 'Short hair; draw() paints it from look.hairStyle.' },
    { name: 'long', fn: 'topdown.drawHair', via: { look: { hairStyle: 'long' }, bare: { hairStyle: 'bald' } }, list: 'topdown.HAIR_STYLES', directions: ALL, what: 'Hair that hangs behind the head to the shoulders.' },
    { name: 'spiky', fn: 'topdown.drawHair', via: { look: { hairStyle: 'spiky' }, bare: { hairStyle: 'bald' } }, list: 'topdown.HAIR_STYLES', directions: ALL, what: 'Spikes that rise 3 px above the skull (sprites pass rise 3 for it).' },
    { name: 'ponytail', fn: 'topdown.drawHair', via: { look: { hairStyle: 'ponytail' }, bare: { hairStyle: 'bald' } }, list: 'topdown.HAIR_STYLES', directions: ALL, what: 'Short hair with a tail behind.' },
    { name: 'bald', fn: 'topdown.drawHair', via: { look: { hairStyle: 'bald' }, bare: { hairStyle: 'bald' } }, list: 'topdown.HAIR_STYLES', directions: [], what: 'No hair: under a hood, or with balding hair drawn over it.' },
    { name: 'bowl', fn: 'topdown.hairdo', layer: 'head', fixed: { style: 'bowl' }, look: { hairStyle: 'short' }, list: 'topdown.HAIRDOS', directions: ALL, options: { colour: colour('#5a3a22'), tie: colour() }, what: 'A round cap of hair cut straight above the eyes, drawn in the head hook over short hair.' },
    { name: 'pigtails', fn: 'topdown.hairdo', layer: 'head', fixed: { style: 'pigtails' }, look: { hairStyle: 'short' }, list: 'topdown.HAIRDOS', directions: ALL, options: { colour: colour('#5a3a22'), tie: colour('#c9423a') }, what: 'A bunch at each ear, which lags the head; drawn in the head hook over short hair.' },
    { name: 'balding', fn: 'topdown.baldingHair', layer: 'head', look: { hairStyle: 'bald' }, directions: ALL, options: { colour: colour('#f0ead8') }, what: 'A bald crown ringed with hair, drawn in the head hook over a bald head.' },
  ],

  parts: [
    // on the back
    part('cape', 'topdown.cape', 'behind', 'back', ALL, { kind: pick(['plain', 'tattered']), length: num(0.3, 1.8, 1, '1 = to above the knee, 1.8 = to the floor'), colour: colour() }, 'A cape: behind the body facing down and sideways, over the back facing up.', { goesWith: ['mantle'] }),
    part('mantle', 'topdown.mantle', 'torso', 'back', FRONT, { colour: colour(), clasp: colour() }, 'The front of a cape: a mantle over the shoulders with a clasp at the neck.'),
    part('scarf', 'topdown.scarf', 'behind', 'back', ALL, { colour: colour('#c9423a'), length: num(4, 16, 10, 'pixels'), flow: num(0, 1, 0.3, '0 hanging to 1 streaming straight back'), wave: { data: 'a list of -1..1 from the neck to the tip; default [P.sway]' } }, 'The tail of a scarf, streaming back from the neck.', { goesWith: ['scarf wrap'] }),
    part('pack', 'topdown.pack', 'behind', 'back', ALL, { kind: pick(['tank', 'antenna', 'jet'], 'tank', 'topdown.PACK_KINDS'), size: GEAR, colour: colour(), glow: colour(), thrust: { ...num(0, 1, 0, "the flame of a jet (pass P.tuck); nothing on the other kinds"), except: ['tank', 'antenna'] } }, 'A pack on the back: a tank, a radio with a whip antenna, or a jet pack.', { ...rise('topdown.packRise', { option: 'kind' }, { option: 'size' }), far: 'topdown.packFar', goesWith: ['pack straps'] }),
    part('travel pack', 'topdown.travelPack', 'behind', 'back', ALL, { kind: pick(['backpack', 'crate', 'sack'], 'backpack', 'topdown.TRAVEL_PACK_KINDS'), size: GEAR, colour: colour(), wood: colour(), rug: colour('#7a4fc4', 'a rolled rug across its top, or none'), lantern: colour('#f2c230', 'a lantern hung from it, or none') }, "A traveller's pack over the shoulder of the weapon hand: a framed backpack, a crate or a tied sack.", { goesWith: ['pack straps'] }),
    // on the body
    part('belt', 'topdown.belt', 'torso', null, ALL, { colour: colour(), buckle: colour('#f2c230', 'or none') }, 'A belt across the waist.'),
    part('hem', 'topdown.hem', 'torso', null, ALL, { colour: colour() }, 'A band of colour along the hem of the tunic.'),
    part('stripe', 'topdown.stripe', 'torso', null, ALL, { colour: colour('#c9423a'), up: num(1, 5, 2, 'rows above the hip: 2 is a belt'), mark: colour('#f2c230', 'a buckle or badge in its middle, or none') }, 'One row of colour across the body: a belt in its own colour, a stripe across the chest.'),
    part('robe', 'topdown.robe', 'torso', null, ALL, { colour: colour(), length: num(0, 1, 1, '0 = to the knee, 1 = to the floor'), trim: colour('#f2c230', 'a band along its hem, or none') }, 'A robe or skirt that hides the legs and sways with the step.'),
    part('tabard', 'topdown.tabard', 'torso', null, ALL, { colour: colour('#c9423a'), border: colour('#f2c230', 'its edges and hem, or none'), length: num(0, 1, 1, '0 = to the hip, 1 = to the knee') }, 'A sleeveless panel of cloth over chest and back.'),
    part('apron', 'topdown.apron', 'torso', null, ALL, { colour: colour(), length: num(0, 1, 0.7, 'how far down the legs it comes') }, 'An apron: a bib and a panel with a pocket; only its strings from behind.'),
    part('scarf wrap', 'topdown.scarfWrap', 'torso', null, ALL, { colour: colour('#c9423a') }, 'The part of a scarf that goes round the neck.'),
    part('pack straps', 'topdown.packStraps', 'torso', null, FRONT, { colour: colour('#9a6a3e') }, 'The straps of a pack over the chest.'),
    part('spine', 'topdown.spine', 'torso', null, BACK, { colour: colour('#c9423a'), wide: pick([1, 3], 1) }, 'A stripe down the middle of the back, seen only from behind.'),
    part('neck', 'topdown.neck', 'torso', null, ALL, { skin: colour() }, 'The neck of a head carried high: it shows only when a manner has raised the head (P.headDy below 0).', { shownWith: { set: { headDy: -3 } } }),
    part('hunch', 'topdown.hunch', null, null, ['up', 'side'], { colour: colour('#c9423a'), amount: num(0.2, 1, 0.6, 'default P.stoop, which stoop() sets') }, 'The rounded back of a stooped body: a hump seen from the side, raised shoulders seen from behind.', { layers: [{ layer: 'torso' }, { layer: 'front', set: { front: true } }], goesWith: ['stoop (a manner tool)'] }),
    part('gloves', 'topdown.gloves', null, 'hand', ALL, { colour: colour('#c9423a') }, 'Gloves over both hands; called from three hooks so each hand is painted at its own depth.', { layers: [{ layer: 'offhand', set: { layer: 'offhand' } }, { layer: 'torso', set: { layer: 'torso' } }, { layer: 'front', set: { layer: 'front' } }] }),
    part('suit lights', 'topdown.suitLights', null, null, ALL, { colour: colour(), chest: flag(true), shoulders: flag(true) }, 'Small lights on the chest and each shoulder.', { layers: [{ layer: 'torso', set: { layer: 'torso' } }, { layer: 'front', set: { layer: 'front' } }] }),
    part('shoulder plates', 'topdownRiot.shoulderPlates', null, null, ALL, { colour: colour() }, 'A plate of armour over each shoulder.', { layers: [{ layer: 'torso', set: { layer: 'torso' } }, { layer: 'front', set: { layer: 'front' } }] }),
    // on the other arm
    part('shield', 'topdown.shield', 'offhand', 'offhand', ALL, { kind: pick(['round', 'kite'], 'round', 'topdown.SHIELD_KINDS'), size: GEAR, metal: METAL, boss: colour('#c9423a', 'a stud or cross on its face, or none') }, 'A shield on the other arm.'),
    part('body shield', 'topdownRiot.bodyShield', null, 'offhand', ALL, { kind: pick(['riot', 'energy', 'round'], 'riot', 'topdownRiot.BODY_SHIELD_KINDS'), size: GEAR, colour: colour(), glow: colour(), inset: colour(), core: colour() }, 'A shield as tall as the body: a slab with a window, a pane of light on an emitter, or a big disc. The energy pane is light, drawn after the outline.', { layers: [{ layer: 'offhand', set: { layer: 'offhand' } }, { layer: 'front', set: { layer: 'front' } }, { layer: 'after', set: { layer: 'light' } }], placedBy: 'topdownRiot.shieldPlace', goesWith: ['carry shield (a manner)'] }),
    // on the head
    part('helmet', 'topdown.helmet', 'head', 'head', ALL, { size: HAT, metal: METAL, plume: colour('#c9423a', 'or none') }, 'An open helmet with a plume.', { look: HATTED, ...rise('topdown.headgearRise', { value: 'helmet' }, { option: 'size' }) }),
    part('crown', 'topdown.crown', 'head', 'head', ALL, { size: HAT, metal: METAL, gem: colour('#c9423a', 'or none') }, 'A crown: a band of metal with points and a gem.', { ...rise('topdown.headgearRise', { value: 'crown' }, { option: 'size' }) }),
    part('hood', 'topdown.hood', 'head', 'head', ALL, { colour: colour(), depth: num(0, 2, 1, '0 = pushed back, 2 = pulled low over the brow') }, 'A hood: cloth round the head with the face showing.', { look: HATTED, ...rise('topdown.headgearRise', { value: 'hood' }) }),
    part('hat', 'topdown.hat', 'head', 'head', ALL, { kind: pick(['pointed', 'wide', 'cap']), size: { ...HAT, except: ['cap'], what: 'its Size setting; it does nothing to the cap' }, colour: colour(), band: colour('#f2c230', 'a band above the brim, or none') }, "A hat: a wizard's cone, a straw hat or a cap.", { look: HATTED, ...rise('topdown.headgearRise', { option: 'kind', prefix: 'hat-' }, { option: 'size' }) }),
    part('kettle hat', 'topdown.kettleHat', 'head', 'head', ALL, { size: HAT, metal: METAL }, 'A round steel bowl with a wide brim all the way round. It has no rise of its own: sprites/town-guard.js borrows the wide hat\'s.', { look: HATTED, ...rise('topdown.headgearRise', { value: 'hat-wide' }, { option: 'size' }) }),
    part('peaked cap', 'topdown.peakedCap', 'head', 'head', ALL, { size: HAT, colour: colour() }, 'A soft cap with a peak.', { look: HATTED, ...rise('topdown.peakedCapRise', { option: 'size' }) }),
    part('turban', 'topdown.turban', 'head', 'head', ALL, { size: HAT, colour: colour(), band: colour('#c9423a', 'the cap along its lower edge, or none'), jewel: colour() }, 'A turban: wound cloth wider than the head, with a jewel.', { look: HATTED, ...rise('topdown.turbanRise', { option: 'size' }) }),
    part('visor helmet', 'topdown.visorHelmet', 'head', 'head', ALL, { size: HAT, shell: colour(), visor: colour(), light: colour() }, 'A closed helmet with a lit visor over the eyes.', { look: HATTED, ...rise('topdown.visorHelmetRise', { option: 'size' }) }),
    part('visor', 'topdown.visor', 'head', 'head', ALL, { size: HAT, colour: colour(), strap: colour() }, 'A band of lit glass over the eyes, on a strap.'),
    part('circlet', 'topdown.circlet', 'head', 'head', ALL, { size: HAT, metal: METAL, gem: colour('#c9423a', 'or none') }, 'A thin band of metal round the brow with a stone.'),
    part('hair bow', 'topdown.hairBow', 'head', 'head', ALL, { size: HAT, colour: colour() }, 'A ribbon bow on top of the head.', { ...rise('topdown.hairBowRise', { option: 'size' }) }),
    part('bandana', 'topdown.bandana', 'head', 'head', ALL, { colour: colour(), size: HAT }, 'A band of cloth over the brow, knotted at the back.'),
    part('mask', 'topdown.mask', 'head', 'head', ALL, { colour: colour(), size: HAT }, 'A cloth mask over the mouth and chin.'),
    part('lens mask', 'topdownRiot.lensMask', 'head', 'head', ALL, { size: HAT, colour: colour(), lens: colour() }, 'A breathing mask with two lit lenses and a filter.'),
    part('beard', 'topdown.beard', 'head', 'head', FRONT, { kind: pick(['long', 'short']), length: num(0.65, 1.35, 1, 'a multiplier'), colour: colour() }, 'A beard: over the jaw and down the chest.'),
    part('spectacles', 'topdown.spectacles', 'head', 'head', FRONT, { frame: colour(), lens: colour() }, 'Round spectacles.'),
    // on the free hand, with a gesture
    part('fingers', 'topdown.fingers', 'front', 'offhand', ALL, { skin: colour(), count: num(1, 3, 3, 'default P.count, which the count gesture sets') }, 'The raised fingers of the free hand: one to three, a pixel apart.', { shownWith: { pose: 'count', t: 0.5 } }),
    part('wave arm', 'topdown.waveArm', 'front', 'offhand', ALL, { sleeve: colour('#7f9a5f'), skin: colour(), cuff: colour('#c9423a', 'a band at the wrist, or none') }, 'The raised forearm and open hand of a waving free arm; it draws only while the pose waves (P.wave).', { shownWith: { pose: 'wave', t: 0.5 }, placedBy: 'topdown.waveHand' }),
  ],

  held: [
    held('sword', 'topdown.heldItem', 'topdown.itemSize', ['topdown.ITEM_KINDS', 'topdown.ITEMS'], { length: 11, back: 1.5, pad: 1 }, 'up', ['idle', 'walk', 'attack', 'die'], { metal: METAL, hilt: colour() }, 'A sword.'),
    held('axe', 'topdown.heldItem', 'topdown.itemSize', ['topdown.ITEM_KINDS', 'topdown.ITEMS'], { length: 10, back: 2, pad: 4.5 }, 'up', ['idle', 'walk', 'attack'], { metal: METAL, wood: WOOD }, 'An axe; its edge leads the swing.'),
    held('spear', 'topdown.heldItem', 'topdown.itemSize', ['topdown.ITEM_KINDS', 'topdown.ITEMS'], { length: 14, back: 4, pad: 1 }, 'up', ['idle', 'walk', 'attack'], { metal: METAL, wood: WOOD }, 'A spear.'),
    held('staff', 'topdown.heldItem', 'topdown.itemSize', ['topdown.ITEM_KINDS', 'topdown.ITEMS'], { length: 12, back: 9, pad: 3 }, 'upright', ['idle', 'walk', 'cast'], { wood: WOOD, orb: colour(), glow: { ...num(0, 1, 0, 'how bright the orb is'), subtle: true } }, 'A staff with an orb; its shaft goes 9 px below the hand.'),
    held('lantern', 'topdown.heldItem', 'topdown.itemSize', ['topdown.ITEM_KINDS', 'topdown.ITEMS'], { length: 10, back: 0, pad: 4.5 }, 'hang', ['idle', 'walk', 'talk'], { metal: METAL, glow: colour(undefined, 'its light'), lit: flag(true) }, 'A lantern that hangs from the hand.'),
    held('cane', 'topdown.heldItem', 'topdown.itemSize', ['topdown.ITEM_KINDS', 'topdown.ITEMS'], { length: 11, back: 2, pad: 1.5 }, 'low', ['idle', 'walk', 'talk'], { wood: WOOD }, 'A cane.'),
    held('gun', 'topdown.heldItem', 'topdown.itemSize', ['topdown.ITEM_KINDS', 'topdown.ITEMS'], { length: 10, back: 3, pad: 3.5 }, 'low', ['idle', 'walk', 'shoot'], { metal: METAL, glow: colour(undefined, 'its cell') }, 'A long gun.'),
    held('pistol', 'topdown.heldItem', 'topdown.itemSize', ['topdown.ITEM_KINDS', 'topdown.ITEMS'], { length: 5, back: 1, pad: 3 }, 'low', ['idle', 'walk', 'shoot'], { metal: METAL }, 'A sidearm.', {
      also: [{ name: 'pistol', fn: 'topdownRiot.riotItem', size: 'topdownRiot.riotItemSize', list: 'topdownRiot.RIOT_ITEMS', carry: 'ready', what: "The same sidearm through the riot module's wrapper, which draws it end-on when it points at the camera." }],
    }),
    held('wand', 'topdown.smallItem', 'topdown.smallItemSize', 'topdown.SMALL_ITEMS', { length: 9, back: 1.5, pad: 1.5 }, 'up', ['idle', 'walk', 'cast'], { wood: WOOD, orb: colour(), glow: { ...num(0, 1, 0), subtle: true } }, 'A wand with a lit tip.'),
    held('orb', 'topdown.smallItem', 'topdown.smallItemSize', 'topdown.SMALL_ITEMS', { length: 5, back: 0, pad: 3 }, 'up', ['idle', 'walk', 'cast'], { orb: colour(), glow: { ...num(0, 1, 0), subtle: true } }, 'A ball that floats over the hand.'),
    held('dagger', 'topdown.smallItem', 'topdown.smallItemSize', 'topdown.SMALL_ITEMS', { length: 7, back: 1.5, pad: 1 }, 'low', ['idle', 'walk', 'run', 'attack'], { metal: METAL, hilt: colour() }, 'A dagger. A second one goes in the other hand at offGrip(J, P): the pair is wired in sprites/rogue-walker.js.', { pairAt: 'topdown.offGrip' }),
    held('claws', 'topdown.smallItem', 'topdown.smallItemSize', 'topdown.SMALL_ITEMS', { length: 5, back: 0, pad: 2.5 }, 'low', ['idle', 'walk', 'run', 'attack'], { metal: METAL }, 'Claws on the fist; a pair with offGrip(J, P).', { pairAt: 'topdown.offGrip' }),
    held('halberd', 'topdown.townItem', 'topdown.townItemSize', ['topdown.TOWN_ITEM_KINDS', 'topdown.TOWN_ITEMS'], { length: 24, back: 11, pad: 3 }, 'upright', ['idle', 'walk', 'block'], { metal: METAL, wood: WOOD }, 'A halberd taller than its bearer; its shaft stands on the ground.'),
    held('pike', 'topdown.townItem', 'topdown.townItemSize', ['topdown.TOWN_ITEM_KINDS', 'topdown.TOWN_ITEMS'], { length: 23, back: 11, pad: 1.5 }, 'upright', ['idle', 'walk', 'block'], { metal: METAL, wood: WOOD }, 'A long spear, taller than its bearer.'),
    held('stick', 'topdown.townItem', 'topdown.townItemSize', ['topdown.TOWN_ITEM_KINDS', 'topdown.TOWN_ITEMS'], { length: 9, back: 1.5, pad: 1.5 }, 'up', ['idle', 'walk', 'run'], { wood: WOOD }, 'A stick.'),
    held('basket', 'topdown.townItem', 'topdown.townItemSize', ['topdown.TOWN_ITEM_KINDS', 'topdown.TOWN_ITEMS'], { length: 7, back: 0, pad: 4 }, 'hang', ['idle', 'walk', 'run'], { wood: colour(undefined, 'the wicker'), fill: colour('#c9423a', 'what is in it, or none') }, 'A basket that hangs from the hand.'),
    held('flower', 'topdown.townItem', 'topdown.townItemSize', ['topdown.TOWN_ITEM_KINDS', 'topdown.TOWN_ITEMS'], { length: 8, back: 1, pad: 2.5 }, 'up', ['idle', 'walk', 'run'], { stem: colour(), petal: colour(), heart: colour() }, 'A flower.'),
    held('blaster', 'topdown.heldGun', 'topdown.gunSize', ['topdown.GUN_KINDS', 'topdown.GUNS'], { length: 8, back: 2, pad: 3 }, 'low', ['idle', 'walk', 'shoot', 'dodge'], { metal: METAL, glow: colour('#5fe0f0') }, 'A chunky sidearm with a lit cell.'),
    held('scatter', 'topdown.heldGun', 'topdown.gunSize', ['topdown.GUN_KINDS', 'topdown.GUNS'], { length: 9, back: 3, pad: 3.5 }, 'low', ['idle', 'walk', 'shoot', 'dodge'], { metal: METAL, glow: colour('#5fe0f0') }, 'A wide double barrel on a stock.'),
    held('beam', 'topdown.heldGun', 'topdown.gunSize', ['topdown.GUN_KINDS', 'topdown.GUNS'], { length: 13, back: 3, pad: 3 }, 'low', ['idle', 'walk', 'shoot', 'dodge'], { metal: METAL, glow: colour('#5fe0f0') }, 'A long emitter with rings and a lit tip.'),
    held('purse', 'topdown.tradeItem', 'topdown.tradeItemSize', 'topdown.TRADE_ITEMS', { length: 7, back: 0, pad: 3 }, 'hang', ['idle', 'talk'], { wood: colour(undefined, 'its leather'), hilt: colour(undefined, 'the coins') }, 'A coin purse that hangs from the hand.'),
    held('scale', 'topdown.tradeItem', 'topdown.tradeItemSize', 'topdown.TRADE_ITEMS', { length: 8, back: 0, pad: 5.5 }, 'hang', ['idle', 'talk'], { metal: METAL }, 'A balance scale whose beam tips as it swings.'),
    held('rifle', 'topdownRiot.riotItem', 'topdownRiot.riotItemSize', 'topdownRiot.RIOT_ITEMS', { length: 10, back: 3, pad: 3.5 }, 'ready', ['idle', 'walk', 'shoot', 'block'], { metal: METAL }, "The rig's long gun under another name, drawn end-on when it points at the camera.", { sameAs: 'gun' }),
    held('baton', 'topdownRiot.riotItem', 'topdownRiot.riotItemSize', 'topdownRiot.RIOT_ITEMS', { length: 9, back: 2, pad: 2 }, 'up', ['idle', 'walk', 'block'], { metal: METAL, grip: colour() }, 'A baton with a side handle; a `shoot` with it is a jab (strike).'),
  ],

  effects: [
    { name: 'slash trail', fn: 'topdown.slashTrail', via: { finish: { trail: '#ffffff' }, bareFinish: {} }, layer: 'after', directions: ALL, shownWith: { pose: 'attack', t: 4 / 7, held: 'sword' }, what: 'The white arc that follows a fast swing; frame().finish({ trail }) draws it while P.slash is set.' },
    { name: 'muzzle flash', fn: 'topdown.muzzleFlash', via: { finish: { flash: '#ffffff' }, bareFinish: { flash: false } }, layer: 'after', socket: 'muzzle', directions: ALL, shownWith: { pose: 'shoot', t: 1 / 5, held: 'gun' }, what: 'The light of a shot at the muzzle socket; frame().finish draws it on the frame where the pose says fire.' },
    { name: 'muzzle flare', fn: 'topdown.muzzleFlare', args: ['g', 'at', 'options'], layer: 'after', socket: 'muzzle', directions: ALL, options: { size: num(1, 4, 2, "the star's arms in px"), colour: colour(), core: colour(), ray: flag(true) }, shownWith: { pose: 'shoot', t: 1 / 5, held: 'blaster', finish: { flash: false } }, what: 'The flare of an energy shot: a four-point star, in place of the muzzle flash.' },
    { name: 'dash streaks', fn: 'topdown.dashStreaks', layer: 'after', directions: ALL, options: { colour: colour(), core: colour(), length: num(4, 12, 8, 'pixels'), fade: { ...num(0, 1, 0), subtle: true } }, shownWith: { pose: 'dodge', t: 3 / 7 }, what: 'Afterimage bars that trail from a tucked body in a dodge.' },
  ],

  sockets: [
    { name: 'hand', what: 'the weapon hand; angle = the way a held thing points, with `reach` (0.5..1): how long it looks' },
    { name: 'offhand', what: 'the other hand; angle = along its arm (bracedFrame and a waving poseFrame move it to where the hand is drawn)' },
    { name: 'head', what: 'the top of the head; angle = up' },
    { name: 'back', what: 'between the shoulders, where a cape or pack hangs' },
    { name: 'feet', what: 'the ground under the body' },
    { name: 'muzzle', what: 'the far end of the held thing: where a shot appears' },
  ],

  helpers: {
    'topdown.SIZE': 'the frame', 'topdown.GROUND': 'the ground row', 'topdown.CX': 'the pivot column', 'topdown.PIVOT': 'the pivot',
    'topdown.sockets': 'the attach points of a solved pose (frame().sockets() calls it)',
    'topdown.headIn': 'the shape test of the head, for a part of your own',
    'topdown.itemTip': 'the far end of a held thing',
    'topdown.offGrip': 'the attach point of a second thing in the other hand',
    'topdown.waveHand': 'where a waving forearm and hand are',
    'topdown.ramp': 'passed on from engine/color.js', 'topdown.farRamp': 'passed on from engine/color.js', 'topdown.mix': 'passed on from engine/color.js', 'topdown.brightness': 'passed on from engine/color.js', 'topdown.INK': 'passed on from engine/color.js',
    'topdownRiot.shieldPlace': 'where a body shield is this frame',
  },
  drawingHelpers: {
    'topdown.over': 'paints a shape with a rim where it covers what is drawn: a tool for parts, not a part',
    'topdown.drawOver': 'draws a thing with a rim where it lies over the body (a gun across the chest): wraps a held kind, not a part itself',
    'topdown.handAt': 'paints a hand at a point, for the free hand of a braced gun when the body hides its arm (bracedFrame F.grip)',
    'topdown.backOver': 'repaints the back over hands held in front of a body seen from behind: a repair for the braced carry, not a part',
  },

  duplicates: [
    {
      what: 'Six functions draw held things, in two chains that each fall through to the next; no one function draws every kind, so a sprite must know which wrapper has its kind. Six size tables and six size functions go with them, and "pistol" is in two tables.',
      calls: ['topdown.heldItem', 'topdown.smallItem', 'topdown.tradeItem', 'topdown.townItem', 'topdown.heldGun', 'topdownRiot.riotItem', 'topdown.itemSize', 'topdown.smallItemSize', 'topdown.tradeItemSize', 'topdown.townItemSize', 'topdown.gunSize', 'topdownRiot.riotItemSize', 'topdown.ITEMS', 'topdown.SMALL_ITEMS', 'topdown.TRADE_ITEMS', 'topdown.TOWN_ITEMS', 'topdown.GUNS', 'topdownRiot.RIOT_ITEMS', 'topdown.ITEM_KINDS', 'topdown.TOWN_ITEM_KINDS', 'topdown.GUN_KINDS'],
      merge: 'One registry of held kinds { kind: { length, back, pad, carry, hangs, long, melee, draw } }, one size function and one draw function; a side module registers its kinds instead of wrapping.',
    },
    {
      what: 'Five ways to build one frame. frameWith and poseFrame both lay a manner over a pose but differ: frameWith fits, changes, fits again and gives the manner F.carry; poseFrame changes before one fit, gives no F.carry (so the manners bar, attention and walking stick misread it), and has no `far`. poseFrame copies the body of frame().',
      calls: ['topdown.frame', 'topdown.frameWith', 'topdown.poseFrame', 'topdown.bracedFrame', 'topdownRiot.shieldFrame'],
      merge: 'One frame(clip, t, p, options) with options.pose, options.dims and options.manner; braced and shield become options (or manners) of it.',
    },
    {
      what: 'Three functions return a pose, with three argument orders, and the gesture wave has no clip entry in STANDARD (its frames and speed are written in sprites/merchant.js).',
      calls: ['topdown.pose', 'topdown.gesture', 'topdownRiot.strike', 'topdown.STANDARD', 'topdown.GESTURES'],
      merge: 'One table of poses (name -> function, frames, fps, loop) that pose() reads; gestures and strike register in it.',
    },
    {
      what: 'Manners are in three shapes: four in the MANNERS table, three loose functions, and one made by a function; three more functions are tools a manner calls. The carries "ready" and "braced" are added to CARRY by assignment when the module loads.',
      calls: ['topdown.MANNERS', 'topdown.dashManner', 'topdown.walkingStickManner', 'topdown.bracedManner', 'topdownRiot.carryShield', 'topdown.stoop', 'topdown.plantStick', 'topdown.holdWith', 'topdown.CARRY', 'topdown.CARRY_READY', 'topdown.CARRY_BRACED'],
      merge: 'One MANNERS table by name (dash, walkingStick, braced, carryShield, stoop, plantStick join it), so a definition can name a manner; CARRY written as one table.',
    },
    {
      what: 'Fourteen pieces of headgear and six ways to ask how far one rises: headgearRise(kind) knows four of them under names of its own ("hat-wide"), five have a function each, and the kettle hat has none (the sprite borrows the wide hat\'s). hat kind "cap" and peakedCap are two caps.',
      calls: ['topdown.headgearRise', 'topdown.hairBowRise', 'topdown.visorHelmetRise', 'topdown.peakedCapRise', 'topdown.turbanRise', 'topdown.packRise', 'topdown.hat', 'topdown.peakedCap', 'topdown.kettleHat'],
      merge: 'One registry of headgear { name: { draw, rise(size), hatted } } and one headgear(g, J, P, d, { kind, size, ... }), as rigs/humanoid-figure.js has wear().',
    },
    {
      what: 'Two pack functions with two kind lists; only one has the far points frame() needs in `die`.',
      calls: ['topdown.pack', 'topdown.travelPack', 'topdown.PACK_KINDS', 'topdown.TRAVEL_PACK_KINDS', 'topdown.packFar', 'topdown.packRise'],
      merge: 'One pack() over one list of kinds, each with its rise and far points.',
    },
    {
      what: 'Two shield functions with two kind lists, and "round" is in both.',
      calls: ['topdown.shield', 'topdownRiot.bodyShield', 'topdown.SHIELD_KINDS', 'topdownRiot.BODY_SHIELD_KINDS'],
      merge: 'One shield() over one list (round, kite, riot, energy), with the body-tall ones placed by shieldPlace.',
    },
    {
      what: 'Three one-row bands across the body that differ only in the row.',
      calls: ['topdown.belt', 'topdown.hem', 'topdown.stripe'],
      merge: 'stripe(up, colour, mark) is the general one; belt and hem become settings of it.',
    },
    {
      what: 'Hair is in three places: five styles in drawHair (through look.hairStyle), two more in hairdo (a head hook over short hair), and baldingHair (a head hook over a bald head).',
      calls: ['topdown.drawHair', 'topdown.hairdo', 'topdown.baldingHair', 'topdown.HAIR_STYLES', 'topdown.HAIRDOS'],
      merge: 'One list of eight hair styles that look.hairStyle accepts.',
    },
    {
      what: 'Two lights for a shot, and two helpers that rim a thing where it lies over the body.',
      calls: ['topdown.muzzleFlash', 'topdown.muzzleFlare', 'topdown.over', 'topdown.drawOver'],
      merge: 'One muzzle light with a style option; over() and drawOver() are one helper.',
    },
  ],

  inSprites: [
    { sprite: 'mage-walker', functions: ['starburst', 'sparkles', 'ring', 'particles', 'glow'], draws: 'The light of the cast and of the staff, wand or orb: five engine/fx.js calls placed at the muzzle socket, with their own timing.', belongs: 'An effect of the rig ("cast light") with the colour as its option.' },
    { sprite: 'rogue-walker', functions: ['FLY', 'TAIL', 'HELD'], draws: 'Nothing itself, but it holds the arithmetic of how a scarf flies in each action (the same FLY table is inside rigs/humanoid-figure.js) and the wiring of a second blade in the other hand.', belongs: 'The scarf part (flow and wave per action) and a `pair` flag on held kinds.' },
    { sprite: 'village-elder', functions: ['elderFrame', 'SHORT_STEPS'], draws: 'Nothing itself; a manner written in the file raises the lantern hand and the talking hand (four changes to the pose).', belongs: 'Two named manners (hold out, talk with the hand).' },
    { sprite: 'merchant', functions: ['merchantFrame', 'TALL', 'NECK'], draws: 'Nothing itself; a manner in the file carries the head high, holds the goods out and keeps the waving hand clear of a brim; the wave clip entry and a taller body with longer arms are constants here.', belongs: 'A body kind (tall), a clip entry for wave in STANDARD, and a manner.' },
    { sprite: 'farm-kid', functions: ['TALL', 'SLIGHT'], draws: 'Nothing itself; the child body is two constants here.', belongs: 'A body kind (child) of the rig.' },
  ],
};
