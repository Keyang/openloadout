// What the side-view character rig has (rigs/humanoid.js and its side module rigs/humanoid-figure.js), as plain
// data a program can read: its poses, moves and stances, the three bodies it paints, hair, every part it can wear and
// every kind it can hold, its attach points, each with the function that draws it and the options that function
// takes. First step of Contract 13 (docs/architecture.md): a rig that lists itself. Nothing in the rig reads this file.
//
//   import { RIG } from '../rigs/humanoid-describe.js';   // or (await loadout.framework).humanoidDescribe.RIG, or generated/api.json -> rigs
//   node tools/rig.mjs humanoid                            // the same as tables; --sheet draws every part and held kind
//
// Names are '<module>.<export>' with the module's name on window.loadout.framework (humanoid = rigs/humanoid.js,
// humanoidFigure = rigs/humanoid-figure.js). Each thing is listed once, under the function that draws it; where the
// same idea exists more than once it is under `duplicates`, and what a sprite file still draws itself is under
// `inSprites`.
// tests/unit/rig-describe-*.test.mjs prove every line: each thing listed is drawn through the function named, at both
// ends of every range; and every export and every name list of the two modules is listed here. Add to the rig, add
// here, or those tests fail. The shape is written out in docs/framework-api.md, "Rigs".

const num = (min, max, def, what) => ({ min, max, default: def, ...(what ? { what } : {}) });
const pick = (choices, def, list) => ({ choices, default: def ?? choices[0], ...(list ? { list } : {}) });
const colour = (def, what) => ({ colour: true, ...(def ? { default: def } : {}), ...(what ? { what } : {}) });

const SIDE = ['side'];
const HAT = num(0.5, 1.8, 1, 'its Size setting');
const GEAR = num(0.65, 1.35, 1, 'its Size setting');
const LENGTH = num(0.65, 1.35, 1, 'the length setting; 1 = the standard size in px');
const MOTION = { bounce: num(0, 1, 0.5, 'how lively'), stride: num(0, 1, 0.5, 'how long the steps are') };
const PAINT = colour(undefined, 'a colour or a ramp');

const pose = (name, frames, fps, loop, what, extra = {}) => ({ name, fn: 'humanoid.pose', list: 'humanoid.POSES', table: 'humanoid.clipsFor', frames, fps, loop, directions: SIDE, standardFor: [name], options: MOTION, what, ...extra });
const move = (name, clipOf, frames, fps, loop, what) => ({ name, fn: 'humanoidFigure.move', list: 'humanoidFigure.MOVES', table: 'humanoid.clipsFor', clipOf, frames, fps, loop, directions: SIDE, standardFor: [], options: {}, what });
const part = (name, fn, layer, socket, options, what, extra = {}) => ({ name, fn, layer, socket, directions: SIDE, options, what, ...extra });
const held = (name, fn, drawnBy, size, list, px, clips, options, what, extra = {}) => ({ name, fn, drawnBy, size, list, px, length: LENGTH, layer: 'item', socket: 'hand', directions: SIDE, clips, options, what, ...extra });
const figureHeld = (name, what) => ({ name, fn: 'humanoidFigure.render', via: { def: 'held' }, list: 'humanoidFigure.HELD', what });

/** The side-view character rig described as data: id, view, frame, poses, stances, bodies, hair, parts, held kinds, sockets, what overlaps and what sprite files still draw. No arguments: a constant. */
export const RIG = {
  id: 'humanoid',
  name: 'Side-view character',
  about: 'A two-legged character seen from the side, facing right, for platformers and battle screens. A game mirrors it for left.',
  view: 'side',
  size: [64, 64],
  pivot: [28, 58],
  ground: 58,
  directions: SIDE,
  directionClips: false,
  modules: { humanoid: 'rigs/humanoid.js', humanoidFigure: 'rigs/humanoid-figure.js' },

  frames: [
    { fn: 'humanoidFigure.render', args: ['g', 'clip', 't', 'definition'], what: 'Paints one frame from a definition (data): body, stance, the pose the clip asks for, every part in its layer, the white flash, the outline, then the light. The nearest thing to the renderer of Contract 13; rogue-battler and road-bandit use it.' },
    { fn: 'humanoidFigure.frame', what: 'Everything render() and sockets() share for one frame of a definition: pose, measurements, what is held.' },
    { fn: 'humanoidFigure.sockets', what: 'The attach points of one frame of a definition.' },
    { fn: 'humanoid.pose', what: 'rigs/humanoid.js has no frame(): a sprite calls pose(), changes it, then fit(), solve(), a body painter, tint, outline and the trail itself. Five sprite files each wrap this in a function of their own (see duplicates).' },
    { fn: 'humanoid.fit', what: 'Keeps a pose with a long weapon or tall headgear inside the frame.' },
    { fn: 'humanoid.solve', what: 'Joint positions for a pose.' },
    { fn: 'humanoid.layerPose', what: 'Lays the motion of a clip over a resting pose of your own (a hover).' },
    { fn: 'humanoid.inFrame', what: 'Fits a body drawn on this rig into a frame of another size (the 48 x 48 imp).' },
    { fn: 'humanoid.clips', duplicateOf: 'humanoid.clipsFor', what: 'The clip table of the first characters: six fixed clips.' },
    { fn: 'humanoid.clipsFor', what: 'Standard clip entries for the named clips, in the order given.' },
  ],

  // the hooks of draw(), drawSkeleton() and drawImp(), in the order they are called
  layers: [
    { name: 'behind', what: 'before anything else: capes, wings, tails, a pack' },
    { name: 'offhand', what: 'after the far arm, behind the body: a shield' },
    { name: 'torso', what: 'after the legs and the body, before the head: belts, the skirt of a robe' },
    { name: 'head', what: 'after the head and its hair: hats, helmets, horns; the rig turns it with the head' },
    { name: 'item', what: 'after the head, under the near hand: the thing held' },
    { name: 'front', what: 'last, over the near arm: a raised shield, anything nearest the viewer' },
  ],

  poses: [
    pose('idle', 8, 7, true, 'Standing, breathing, one blink.'),
    pose('walk', 8, 10, true, 'A walk cycle.'),
    pose('run', 8, 14, true, 'A run cycle.'),
    pose('jump', 8, 11, false, 'Crouch, leave the ground, land.'),
    pose('attack', 8, 13, false, 'A swing of the held thing.', { options: { ...MOTION, swing: num(0.5, 1.3, 1, 'how far the held thing travels') } }),
    pose('punch', 8, 13, false, 'The unarmed attack: used in place of attack when nothing is held.', { table: 'humanoid.clipsFor', clipOf: 'attack', standardFor: ['attack'], when: 'nothing is held' }),
    pose('thrust', 8, 13, false, 'The attack for a point, not an edge: a lunge with a spear.', { table: 'humanoid.clipsFor', clipOf: 'attack', standardFor: [], when: 'a sprite asks for it (spear-goblin, bone-soldier with a spear)' }),
    pose('shoot', 6, 14, false, 'A shot: P.fire early in the clip.'),
    pose('cast', 8, 10, false, 'A spell: P.glow rises and falls.'),
    pose('block', 6, 10, false, 'A guard held for the middle frames.'),
    pose('hurt', 4, 9, false, 'Knocked back; the first frame is drawn white (P.flash).'),
    pose('die', 8, 10, false, 'Falls and lies on the ground (P.lie); the head turns (P.headTurn).'),
    pose('victory', 8, 8, true, 'A cheer that loops.'),
    pose('talk', 8, 7, true, 'Standing, the mouth opening.'),
    move('stab', 'attack', 8, 13, false, 'Two fast jabs: the near hand strikes on frame 3, the far hand or the near hand again on 5.'),
    move('throw', 'shoot', 6, 14, false, 'The far hand flicks a knife from the hip: it leaves on frame 1 (P.fire).'),
    move('toss', 'victory', 8, 8, true, 'The near hand flicks what it holds into the air and catches it.'),
    move('steal', 'attack', 8, 13, false, 'Coil, dart forward, snatch with the far hand, hop back with the prize held up.'),
  ],

  stances: [
    { name: 'upright', fn: 'humanoidFigure.render', via: { def: 'stance' }, list: 'humanoidFigure.STANCES', what: 'The rig as it stands: no offsets.' },
    { name: 'crouched', fn: 'humanoidFigure.render', via: { def: 'stance' }, list: 'humanoidFigure.STANCES', what: 'Low and forward with the hands up: a rogue. A run becomes a low dash.' },
    { name: 'slouched', fn: 'humanoidFigure.render', via: { def: 'stance' }, list: 'humanoidFigure.STANCES', what: 'Heavy, the head hanging forward: a thug.' },
  ],

  body: {
    fn: 'humanoid.draw',
    dims: 'humanoid.dims',
    solve: 'humanoid.solve',
    fit: 'humanoid.fit',
    controls: { height: num(0, 1, 0.5, 'legs, torso and arms'), build: num(0, 1, 0.5, 'chest and hips, limb thickness'), head: num(0, 1, 0.5, 'the head from 4.6 to 6.6 px in radius') },
    kinds: [
      { name: 'human', fn: 'humanoid.draw', dims: 'humanoid.dims', look: { skin: '#f6d3b0', top: '#7f9a5f', bottom: '#566b46', boots: '#3d4a36', hair: '#5a3a22', hairStyle: 'short' }, lookKeys: ['skin', 'top', 'bottom', 'boots', 'hair', 'hairStyle', 'bareArms'], what: 'A person: skin, a top, legs, boots and hair.' },
      { name: 'skeleton', fn: 'humanoid.drawSkeleton', dims: 'humanoid.dims', joints: 'humanoid.skeletonJoints', look: { bone: '#f0ead8', glow: '#4fd8ee', thick: 2 }, lookKeys: ['bone', 'glow', 'thick', 'jaw', 'rattle', 'beat', 'fall', 'seed'], options: { thick: num(1, 3, 2, 'limb width in px'), jaw: num(0, 1, 0, 'how far the jaw drops'), rattle: num(0, 1.3, 0, 'px a bone may be out of place'), fall: num(0, 1, 0, '0 standing to 1 a heap at rest') }, what: 'Bones on the same joints: thin limbs with knobs, a rib cage, a skull with lit eye sockets. It can rattle and collapse into a heap.' },
      { name: 'imp', fn: 'humanoid.drawImp', dims: 'humanoid.impDims', look: { body: '#4f9d57', glow: '#f2c230' }, lookKeys: ['body', 'accent', 'glow', 'ears', 'perk', 'earRim', 'eyes', 'rim', 'claw'], options: { eyes: pick(['sly', 'wide', 'angry'], 'sly', 'humanoid.IMP_EYES'), ears: num(0, 1.3, 0.5, 'small to huge'), perk: num(0, 1, 0, 'swept back to standing up') }, controls: { size: num(0, 1, 0.5), belly: num(0, 1, 0.5), head: num(0, 1, 0.5) }, what: 'A small body with short legs, a pot belly and a big head with pointed ears (a goblin, a gremlin), about 20 px tall; impDims() takes size, belly and head.' },
    ],
  },

  hair: [
    { name: 'short', fn: 'humanoid.drawHair', via: { look: { hairStyle: 'short' }, bare: { hairStyle: 'bald' } }, list: 'humanoid.HAIR_STYLES', directions: SIDE, what: 'Short hair; draw() paints it from look.hairStyle.' },
    { name: 'long', fn: 'humanoid.drawHair', via: { look: { hairStyle: 'long' }, bare: { hairStyle: 'bald' } }, list: 'humanoid.HAIR_STYLES', directions: SIDE, what: 'Hair that hangs behind the head.' },
    { name: 'spiky', fn: 'humanoid.drawHair', via: { look: { hairStyle: 'spiky' }, bare: { hairStyle: 'bald' } }, list: 'humanoid.HAIR_STYLES', directions: SIDE, what: 'Spikes over the crown.' },
    { name: 'ponytail', fn: 'humanoid.drawHair', via: { look: { hairStyle: 'ponytail' }, bare: { hairStyle: 'bald' } }, list: 'humanoid.HAIR_STYLES', directions: SIDE, what: 'Short hair with a tail behind.' },
    { name: 'bald', fn: 'humanoid.drawHair', via: { look: { hairStyle: 'bald' }, bare: { hairStyle: 'bald' } }, list: 'humanoid.HAIR_STYLES', directions: [], what: 'No hair: under a full helmet or a hood.' },
  ],

  parts: [
    // on the head
    part('headgear', 'humanoid.headgear', 'head', 'head', { kind: pick(['helmet', 'crown', 'horned'], 'helmet', 'humanoid.HEADGEAR_KINDS'), size: GEAR, metal: colour('#c2c9d6', 'a colour or a ramp'), trim: colour('#c9423a', "the helmet's crest and the crown's jewel"), horn: PAINT }, 'Metal headgear: an open-faced helmet with a crest, a crown, or a cap with two curved horns.', { rise: { fn: 'humanoid.headgearRise', args: [{ option: 'kind' }, { option: 'size' }] } }),
    part('hood', 'humanoid.hood', 'head', 'head', { colour: PAINT, size: HAT }, 'A hood: cloth over the top and back of the head, with a point that hangs behind.', { look: { hairStyle: 'bald' }, reach: { fn: 'humanoid.hoodReach', args: ['d', { option: 'size' }] } }),
    part('skullcap', 'humanoid.skullcap', 'head', 'head', { colour: PAINT, size: HAT }, 'A close cap with a rim and a small spike. It rises 1 + 2 * size px; there is no function for that (sprites/spear-goblin.js repeats the sum).'),
    part('bone topknot', 'humanoid.boneTopknot', 'head', 'head', { size: HAT, colour: PAINT, knot: PAINT }, 'A bone tied across a topknot on the crown.', { rise: { fn: 'humanoid.boneTopknotRise', args: [{ option: 'size' }] } }),
    part('bandana', 'humanoidFigure.bandana', 'head', 'head', { colour: colour(), size: HAT }, 'A band of cloth across the brow, knotted behind the head with two short tails.'),
    part('mask', 'humanoidFigure.mask', 'head', 'head', { colour: colour(), size: HAT, drape: { ...num(0, 4, 1, 'px it hangs below the chin; default from size') } }, 'A cloth mask over the nose, mouth and chin; with a drape it hangs like a kerchief.'),
    part('wide hat', 'humanoidFigure.wideHat', 'head', 'head', { colour: colour(), band: colour('#c9423a'), size: HAT }, 'A wide-brimmed hat: a low crown over a broad brim that droops at both ends.', { rise: { fn: 'humanoidFigure.wideHatRise', args: [{ option: 'size' }] }, reach: { fn: 'humanoidFigure.wideHatReach', args: ['d', { option: 'size' }] } }),
    part('wear', 'humanoidFigure.wear', 'head', 'head', { kind: pick(['hood', 'bandana', 'mask', 'wide hat', 'helmet', 'crown', 'horned'], 'hood', 'humanoidFigure.HEADGEAR'), size: HAT, colour: colour(), band: colour('#c9423a') }, 'Any headgear by name: it passes each kind on to the function above that draws it. This is the one call a definition uses.', { drawnBy: ['humanoid.hood', 'humanoidFigure.bandana', 'humanoidFigure.mask', 'humanoidFigure.wideHat', 'humanoid.headgear'], reachBy: 'humanoidFigure.wearReach', duplicateOf: 'the seven kinds are the parts above, listed again under one call' }),
    part('pointed ear', 'humanoid.pointedEar', 'head', 'head', { length: num(4, 12, 6, 'px from root to tip'), angle: { data: 'the way it points, rig convention; default back and a little up' }, colour: PAINT, inner: colour('#c9423a', 'the hollow of the ear, or none') }, 'A long pointed ear on the side of the head; draw it after a hood, so it pokes through.'),
    part('nose', 'humanoid.nose', 'head', 'head', { kind: pick(['stub', 'long', 'hooked'], 'stub', 'humanoid.NOSES'), colour: PAINT, size: GEAR }, 'A nose that sticks out of the front of the face.', { tipBy: 'humanoid.noseTip' }),
    part('horns', 'humanoid.horns', 'head', 'head', { kind: pick(['nubs', 'curled', 'twig'], 'nubs', 'humanoid.HORN_KINDS'), length: GEAR, bone: colour(), wood: colour() }, 'A pair of horns: two nubs, a ram\'s curl, or forked twigs. Its arguments are (g, J, d, options): no pose.', { args: ['g', 'J', 'd', 'options'] }),
    // on the body
    part('tunic', 'humanoid.tunic', 'torso', null, { colour: PAINT, belt: colour('#f2c230', 'a rope belt, or none'), ragged: num(0, 1, 1, '0 a straight hem to 1 deep notches'), length: num(0.2, 0.6, 0.4, 'how far it hangs, as a share of the leg') }, 'A tunic skirt below the waist, with a rope belt if asked.'),
    part('belt', 'humanoidFigure.belt', 'torso', null, { colour: colour('#5a3a22'), buckle: colour('#f2c230', 'or none') }, 'A belt across the hips: one row of leather with a buckle.'),
    part('scarf wrap', 'humanoidFigure.scarfWrap', 'torso', null, { colour: colour('#c9423a') }, 'The part of a scarf that goes round the neck.'),
    // on the back
    part('scarf', 'humanoidFigure.scarf', 'behind', 'back', { colour: colour('#c9423a'), length: num(4, 17, 10, 'pixels'), flow: num(0, 1, 0.3, '0 hanging to 1 streaming straight back'), wave: { data: 'a list of -1..1 from the neck to the tip; default [P.sway]' } }, 'The tail of a scarf: a ribbon that hangs from the back of the neck and streams out behind.', { goesWith: ['scarf wrap'] }),
    part('pack', 'humanoidFigure.pack', 'behind', 'back', { kind: pick(['loot sack', 'quiver'], 'loot sack', 'humanoidFigure.PACKS'), size: GEAR, colour: colour('#c9a06a'), trim: colour('#9a6a3e'), leather: colour('#9a6a3e'), fletching: colour('#f0ead8'), shaft: colour() }, 'A pack on the back: a bulging loot sack or a quiver of arrows.', { drawnBy: ['humanoidFigure.lootSack', 'humanoidFigure.quiver'] }),
    part('wing', 'humanoid.wing', 'behind', 'back', { kind: pick(['leaf', 'bat', 'moth'], 'leaf', 'humanoid.WING_KINDS'), length: num(8, 16, 12, 'px from root to tip'), angle: { data: 'rig angle it points along; change it for a flap' }, fold: num(0, 1, 0, '0 open to 1 pulled in'), paint: PAINT }, 'One wing from its root; for a pair draw the far wing first, shorter and darker.', { args: ['g', 'at', 'options'] }),
    part('tail', 'humanoid.tail', 'behind', 'back', { kind: pick(['thin', 'leafy'], 'thin', 'humanoid.TAIL_KINDS'), length: GEAR, sway: { ...num(-1, 1, 0, 'it curls further as the body sways'), subtle: true }, body: colour('#4f9d57'), tip: colour('#c9423a') }, 'A tail that sets off back and down and curls up at the end. Its root is the back of the hip, which is not a socket of the rig: sprites/thicket-imp.js adds a `tail` socket of its own.', { args: ['g', 'at', 'options'], at: { joint: 'hip', dx: -2 } }),
    // on the far arm
    part('shield', 'humanoid.shield', 'offhand', 'offhand', { kind: pick(['round', 'kite', 'broken'], 'round', 'humanoid.SHIELD_KINDS'), size: GEAR, metal: PAINT }, 'A shield, its middle at shieldAt(J, kind, size, raised): carried behind the hip in the offhand hook, and drawn in the front hook while shieldPose() says it is raised (a block). On a body that shieldPose() has not posed it is hidden behind the hip.', { args: ['g', 'at', 'options'], at: { fn: 'humanoid.shieldAt', args: ['J', { option: 'kind' }, { option: 'size' }] }, shownWith: { posedBy: { fn: 'humanoid.shieldPose', args: ['P', 'name', 't'] } }, sizeBy: 'humanoid.shieldSize' }),
    // what a move of a figure shows in the far hand
    part('throwing knife', 'humanoidFigure.throwingKnife', 'front', 'offhand', { length: num(4, 7, 5, 'pixels'), metal: colour('#c2c9d6'), hilt: colour() }, 'A small knife: what the throw and toss moves show (a definition\'s `thrown`).', { args: ['g', 'at', 'options'] }),
    part('coin bag', 'humanoidFigure.coinBag', 'front', 'offhand', { colour: colour('#c9a06a'), tie: colour(), coin: colour(), size: GEAR }, 'A coin bag hanging from a hand: the prize of the steal move (a definition\'s `loot`).', { args: ['g', 'at', 'options'] }),
  ],

  held: [
    held('sword', 'humanoid.heldItem', 'humanoid.sword', 'humanoid.itemSize', ['humanoid.ITEM_KINDS', 'humanoid.ITEMS'], { length: 13, back: 1.5, pad: 1 }, ['idle', 'walk', 'run', 'attack', 'die'], { metal: PAINT, hilt: colour() }, 'A sword.', { also: [figureHeld('short sword', 'The sword at 11 px, carried lower, that a figure can toss and catch.')] }),
    held('axe', 'humanoid.heldItem', 'humanoid.axe', 'humanoid.itemSize', ['humanoid.ITEM_KINDS', 'humanoid.ITEMS'], { length: 12, back: 2, pad: 4 }, ['idle', 'walk', 'attack'], { metal: PAINT, wood: colour() }, 'An axe.'),
    held('spear', 'humanoid.heldItem', 'humanoid.spear', 'humanoid.itemSize', ['humanoid.ITEM_KINDS', 'humanoid.ITEMS'], { length: 15, back: 4, pad: 1 }, ['idle', 'walk', 'thrust'], { metal: PAINT, wood: colour() }, 'A spear; its attack is the thrust pose.'),
    held('staff', 'humanoid.heldItem', 'humanoid.staff', 'humanoid.itemSize', ['humanoid.ITEM_KINDS', 'humanoid.ITEMS'], { length: 18, back: 10, pad: 3 }, ['idle', 'walk', 'cast'], { wood: colour(), orb: PAINT, glow: { ...num(0, 1, 0), subtle: true } }, 'A staff with an orb. Its length is the whole staff, not hand to tip as for the other kinds: the orb is drawn 0.45 of it above the hand, so fit() keeps more room than the drawing needs and a muzzle socket at this length is past the orb.'),
    held('bow', 'humanoid.heldItem', 'humanoid.bow', 'humanoid.itemSize', ['humanoid.ITEM_KINDS', 'humanoid.ITEMS'], { length: 15, back: 5, pad: 8 }, ['idle', 'shoot'], { wood: colour(), string: colour() }, 'A bow, held upright in the far hand at bowGrip(J, P, length) and drawn in the item hook. Length is tip to tip.', { socket: 'offhand', at: { fn: 'humanoid.bowGrip', args: ['J', 'P', 'length'] } }),
    held('gun', 'humanoid.heldItem', 'humanoid.gun', 'humanoid.itemSize', ['humanoid.ITEM_KINDS', 'humanoid.ITEMS'], { length: 8, back: 1.5, pad: 2 }, ['idle', 'walk', 'shoot'], { metal: PAINT, grip: colour() }, 'A gun: a barrel and a grip.'),
    held('club', 'humanoid.drawItem', 'humanoid.club', 'humanoid.itemSizeOf', 'humanoid.EXTRA_ITEMS', { length: 11, back: 1.5, pad: 3 }, ['idle', 'walk', 'attack'], { wood: PAINT }, 'A club that swells to a knobbly head.', { also: [figureHeld('club', 'The same club: its size is written a second time in the figure module\'s table.')] }),
    held('dagger', 'humanoid.drawItem', 'humanoid.dagger', 'humanoid.itemSizeOf', 'humanoid.EXTRA_ITEMS', { length: 7.5, back: 1.5, pad: 1.5 }, ['idle', 'walk', 'attack'], { metal: PAINT, hilt: colour() }, 'A dagger: a short blade, a cross-guard and a pommel.', { also: [figureHeld('daggers', 'A dagger in each hand, the far one a step darker; the figure tosses and catches one.')] }),
    held('cutlass', 'humanoidFigure.drawHeld', 'humanoidFigure.cutlass', 'humanoidFigure.heldSize', 'humanoidFigure.HELD', { length: 12, back: 2, pad: 2.5 }, ['idle', 'walk', 'attack'], { metal: colour('#c2c9d6'), hilt: colour() }, 'A cutlass: a curved blade with a knuckle bow.'),
    held('claws', 'humanoidFigure.drawHeld', 'humanoidFigure.claws', 'humanoidFigure.heldSize', 'humanoidFigure.HELD', { length: 5.5, back: 0, pad: 2.5 }, ['idle', 'walk', 'attack'], { metal: colour('#c2c9d6') }, 'Three thin blades on a fist; a figure wears a pair.'),
    held('sling', 'humanoidFigure.drawHeld', 'humanoidFigure.sling', 'humanoidFigure.heldSize', 'humanoidFigure.HELD', { length: 6, back: 0, pad: 2.5 }, ['idle', 'walk', 'attack'], { cord: colour(), wood: colour('#9a6a3e', 'the pouch'), fling: { ...num(0, 1, 0.2, '0 hanging to 1 flung out'), subtle: true }, floor: { data: 'the ground row it never hangs into (J.gy); default the rig\'s ground' } }, 'A sling: two cords down to a pouch with a stone; it flies out when swung.'),
  ],

  effects: [
    { name: 'slash trail', fn: 'humanoid.slashTrail', args: ['g', 'poseAt', 't', 'd', 'length', { option: 'colour' }], layer: 'after', directions: SIDE, options: { colour: colour('#ffffff') }, shownWith: { pose: 'attack', t: 4 / 7, held: 'sword' }, what: 'The white arc that follows a fast swing; call it after the outline.' },
    { name: 'thrust trail', fn: 'humanoid.thrustTrail', args: ['g', 'poseAt', 't', 'd', 'length', { option: 'colour' }], layer: 'after', directions: SIDE, options: { colour: colour('#ffffff') }, shownWith: { pose: 'thrust', t: 3 / 7, held: 'spear' }, what: 'Short white speed lines behind the tip of a thrust or a punch.' },
    { name: 'muzzle flash', fn: 'humanoid.muzzleFlash', args: ['g', 'at', { option: 'size' }, { option: 'colour' }], layer: 'after', socket: 'muzzle', directions: SIDE, options: { size: num(2, 5, 3, 'the length of the ray in px'), colour: colour('#ffffff') }, shownWith: { pose: 'shoot', t: 1 / 5, held: 'gun' }, what: 'The light of a shot at the muzzle socket; call it after the outline on the frame where the pose says fire.' },
    { name: 'speed lines', fn: 'humanoidFigure.speedLines', args: ['g', { value: [4, 30] }, { value: [14, 30] }, 'options'], layer: 'after', directions: SIDE, options: { colour: colour('#ffffff'), least: num(1, 6, 4, 'px the point must have moved'), gap: num(1, 4, 2.2, 'half the distance between the two lines') }, shownWith: { pose: 'idle', t: 0 }, what: 'Two short white lines behind a point that is moving fast; render() draws them for a stab, a dart and a thrown knife. It reads the picture back, so it suits the pixel style only.' },
  ],

  sockets: [
    { name: 'hand', what: 'the near hand; angle = the direction a held item points' },
    { name: 'offhand', what: 'the far hand; angle = along its forearm' },
    { name: 'head', what: 'the top of the head; angle = the way the head points' },
    { name: 'back', what: 'between the shoulders, where a cape or pack hangs' },
    { name: 'feet', what: 'the ground under the body' },
    { name: 'muzzle', when: 'only when sockets() is given { muzzle: length }, or a definition has `thrown`', what: 'the tip of the held item, where a projectile and the muzzle flash appear' },
  ],

  helpers: {
    'humanoid.SIZE': 'the frame', 'humanoid.GROUND': 'the ground row', 'humanoid.CX': 'the pivot column', 'humanoid.PIVOT': 'the pivot',
    'humanoid.sockets': 'the attach points of a solved pose',
    'humanoid.muzzle': 'the muzzle attach point from the joints (sockets() with { muzzle } gives the same)',
    'humanoid.scaleFrom': 'a number moved toward or away from its resting value',
    'humanoid.itemTip': 'the tip of an item held in the near hand',
    'humanoid.holdAngle': 'a Hold angle slider in degrees as the `hold` pose() takes',
    'humanoid.itemClearOf': 'the angle that keeps a carried item clear of some points (a nose)',
    'humanoid.itemRest': 'the angle at which an item that was let go lies on the ground',
    'humanoid.itemAboveGround': 'an attach point moved up so the item is on the ground, not in it',
    'humanoid.heldBetween': 'the middle of a ball held between the two hands',
    'humanoid.ramp': 'passed on from engine/color.js', 'humanoid.farRamp': 'passed on from engine/color.js', 'humanoid.mix': 'passed on from engine/color.js', 'humanoid.INK': 'passed on from engine/color.js',
    'humanoidFigure.clothRamp': 'the ramp a cloth of a colour is painted with (a derived colour rule)',
    'humanoidFigure.apart': 'a colour moved lighter or darker until it can be told from its neighbours (a derived colour rule)',
  },
  drawingHelpers: {},

  poseFields: [],   // the library body's key fields went with it (build item R1)

  duplicates: [
    {
      what: 'Headgear is drawn in three places: the rig (headgear: helmet, crown, horned; hood; skullcap; boneTopknot), the figure module (wear() over seven kinds, with bandana, mask and wideHat), and sprites/knight.js, which still draws its own helmet and crown with its own rise sum. The Hero\'s helmet and the rig\'s helmet are two different drawings.',
      calls: ['humanoid.headgear', 'humanoid.hood', 'humanoid.skullcap', 'humanoid.boneTopknot', 'humanoidFigure.wear', 'humanoidFigure.wideHat', 'humanoidFigure.bandana', 'humanoidFigure.mask', 'sprites/knight.js#drawHeadgear', 'sprites/knight.js#headgearRise', 'humanoid.headgearRise', 'humanoid.boneTopknotRise', 'humanoid.hoodReach', 'humanoidFigure.wideHatRise', 'humanoidFigure.wideHatReach', 'humanoidFigure.wearReach', 'humanoid.HEADGEAR_KINDS', 'humanoidFigure.HEADGEAR'],
      merge: 'One registry of headgear in the rig { name: { draw, reach(size, d) -> [above, behind] } } and one call, wear(); skullcap and boneTopknot join it, and the Hero\'s helmet and crown move in as kinds (keeping their pixels).',
    },
    {
      what: 'Three functions draw a held thing, each passing on to the one before, with three size functions and three tables; club is sized in two of the tables. Five kinds also keep an older form that takes the joints and the pose.',
      calls: ['humanoid.heldItem', 'humanoid.drawItem', 'humanoidFigure.drawHeld', 'humanoid.itemSize', 'humanoid.itemSizeOf', 'humanoidFigure.heldSize', 'humanoid.ITEMS', 'humanoid.EXTRA_ITEMS', 'humanoidFigure.HELD', 'humanoid.ITEM_KINDS', 'humanoid.sword', 'humanoid.axe', 'humanoid.spear', 'humanoid.staff', 'humanoid.gun'],
      merge: 'One registry of held kinds { kind: { length, back, pad, rest, pair, toss, hangs, draw(g, at, item) } }, one size function and one draw function.',
    },
    {
      what: 'There is no frame() in rigs/humanoid.js, so six places each build a posed frame their own way: the figure module (from a definition) and a wrapper in each of five sprite files (pose, changes to it, fit).',
      calls: ['humanoidFigure.frame', 'humanoidFigure.render', 'sprites/knight.js#heroPose', 'sprites/wizard.js#wizPose', 'sprites/spear-goblin.js#goblinPose', 'sprites/bone-soldier.js#frameOf', 'sprites/thicket-imp.js#frameOf'],
      merge: 'frame(clip, t, definition) in the rig, as rigs/topdown.js and rigs/kiosk.js have; the figure module is most of it. A body kind (human, skeleton, imp) becomes a field of the definition.',
    },
    {
      what: 'Two clip tables for the same clips (clips() has six of them fixed; clipsFor() has all twelve by name), and four moves whose frames are borrowed from another clip by the sprite.',
      calls: ['humanoid.clips', 'humanoid.clipsFor', 'humanoidFigure.MOVES', 'humanoid.POSES'],
      merge: 'One table of poses (name -> frames, fps, loop) that also holds punch, thrust and the moves.',
    },
    {
      what: 'Three belts: the figure module\'s belt, the rope belt inside tunic(), and the belt and buckle sprites/knight.js draws in its torso hook.',
      calls: ['humanoidFigure.belt', 'humanoid.tunic', 'sprites/knight.js#buckle'],
      merge: 'One belt part with a style (leather, rope).',
    },
    {
      what: 'Three trails of light for a strike, with three argument lists, and two ways to get the muzzle point.',
      calls: ['humanoid.slashTrail', 'humanoid.thrustTrail', 'humanoidFigure.speedLines', 'humanoid.muzzle', 'humanoid.sockets'],
      merge: 'One trail(g, frame, { kind }) chosen by the pose; muzzle() goes (sockets() gives it).',
    },
    {
      what: 'Things that hang from the back are drawn by the rig (wing, tail), by the figure module (scarf, pack) and by sprites/knight.js (its cape); the tail has no socket.',
      calls: ['humanoid.wing', 'humanoid.tail', 'humanoidFigure.scarf', 'humanoidFigure.pack', 'sprites/knight.js#drawCape'],
      merge: 'A cape part in the rig (the top-down rig has one), and a `tail` socket at the back of the hip.',
    },
  ],

  inSprites: [
    { sprite: 'knight', functions: ['drawHeadgear', 'headgearRise', 'drawCape', 'drawCapeOnGround', 'drawNapeHair', 'heroPose', 'buckle'], draws: 'A helmet and a crown of its own, a cape (plain or tattered) and its edge on the ground when lying, hair below a helmet, a belt with a buckle: 19 drawing calls. Its pose wrapper turns an unarmed attack into a punch and fits the headgear.', belongs: 'Rig parts (headgear kinds, a cape, a belt) and frame().' },
    { sprite: 'wizard', functions: ['wizPose', 'sleeve', 'capIn', 'drawStaffTop', 'staffSize', 'staffTilt'], draws: 'Almost everything that makes it a wizard: the robe and its skirt, wide sleeves, four hats, a beard and nose, three staff tops, the magic; 46 drawing calls and a pose function that re-poses every clip so the hand never leaves a planted staff.', belongs: 'Rig parts (robe, sleeves, hats, beard, staff tops), a planted-staff manner and a cast effect. It is the largest job of a conversion.' },
    { sprite: 'spear-goblin', functions: ['goblinPose', 'dimsOf', 'earLength', 'rise', 'CARRY'], draws: 'Two knuckle dots on a bare fist. Its pose wrapper stoops the body, carries each weapon at its own angle and keeps it clear of the nose; its measurements stretch the rig\'s Height scale below 0.', belongs: 'A stance (stooped), a rest angle per held kind (the figure module has `rest`), a body kind (goblin), claws on a fist.' },
    { sprite: 'bone-soldier', functions: ['frameOf', 'dimsOf', 'twinkle'], draws: 'A twinkle in each eye socket during the attack. Its frame wrapper times the collapse, the jaw and the rattle per clip and drops the weapon.', belongs: 'A collapse pose and per-clip settings of the skeleton body in the rig.' },
    { sprite: 'thicket-imp', functions: ['frameOf', 'attach', 'dimsOf', 'heldBetween', 'particles', 'puffs', 'leaves'], draws: 'The puff of glow it rides, the hex ball and its trail, the burst of leaves when it dies (engine/fx.js calls and one dot). Its frame wrapper builds a hover from layerPose and adds a `tail` socket.', belongs: 'A hover stance, a tail socket, and effects of the rig.' },
  ],
};
