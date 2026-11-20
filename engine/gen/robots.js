// Robot ports (migration batch C3): the four Derelict Station machines, each its code sprite's drawing ported whole, pixel
// for pixel, as one generator, the way batch M9 ported the interface pictures and E1 and E2 the effects
// (engine/gen/port-sprite.js). A family module: engine/gen/index.js imports it once.
//
//   robot.security-bot@1   the guard robot rig (rigs/guard-bot.js) as sprites/security-bot.js chose it: treads or legs,
//                          three heads, cannon, saw or claw, siren or exhaust, in three directions
//   robot.vendor-bot@1     the kiosk robot rig (rigs/kiosk.js) as sprites/vendor-bot.js chose it: the hovering shop
//   robot.warden-mech@1    the walking war machine rig (rigs/mech-walker.js) as sprites/warden-mech.js chose it: the boss
//   robot.scout-drone@1    sprites/scout-drone.js's own drawing (hulls, lenses, weapon, wings, the break-up)
//
// The drawing they share is ported once, under engine/gen/ports/c3/: the top-down creature rig they all stand on
// (creature-topdown.js: the view, the clip names, the hover), engine/warmachine.js (armour blocks, heads, weapon arms),
// engine/groundbot.js, engine/mech.js (the rotor), engine/breaking.js and engine/rock.js, beside the effect helpers batch
// E2 already ported (engine/gen/ports/e2/fx.js, solids.js, fx-floor.js, shots.js, blast.js, spells.js, shapes.js,
// palettes.js), which they import as they are. Each generator's arguments are its sprite's settings (Speed only sets the
// clips' fps, so it is not one), its picture the clip it draws; the colours the sprite file wrote out (steel, plate,
// cream, amber, gold) are written out here as it wrote them, and the three colour controls are paint arguments (`lights`
// for the sprite's `glow`, a name a call keeps for itself).
//
// Each has attach points that move with the clip, the frame and the settings (the code's sockets()). A pictures body's
// points are fixed on its nodes, so each robot also has a motion, robot.<id>.points@1, which moves one empty node per
// point to where the code's sockets() put it this frame and turns it to the code's angle; the data file names that node
// in a top-level `points` entry, so sprite.sockets() gives what the code gave (creature batch C1's way, written again
// here: its helpers are private to engine/gen/creature-c1.js). The Warden's 96 x 96 frame is bigger than a frame's stamp
// cap (9,216 pixels against SHAPE_CAPS.stampPixels 8,192), so, as E1's explosion-large and C1's golem, its port gives
// the pixels inside a 90 x 90 box as stamps and those round it as one-row whole-pixel rects: the same pixels either way.
// Pure: Node and browser, no clock, no Math.random.
import { defineGenerator } from './registry.js';
import { portGenerator, portPhase } from './port-sprite.js';
import { PortSurface, withPaintTable, portTiles, shiftTo } from './port-surface.js';
import { workCost } from './pixels.js';
import { point, word, flag, share, px, paint } from './args.js';
import { pick } from './ports/c3/colour.js';
import { PALETTE } from './ports/e2/palettes.js';
import * as B from './ports/c3/guard-bot.js';
import * as KI from './ports/c3/kiosk.js';
import * as M from './ports/c3/mech-walker.js';
import * as SD from './ports/c3/scout-drone.js';

const D = PALETTE.derelict;
/** A word option for a code option with spaces ('cannon arms' -> 'cannon-arms'), as engine/gen/args.js word needs. */
const dashed = (o) => o.replace(/ /g, '-');
/** The code option of a word option (the reverse of dashed). */
const spaced = (o) => o.replace(/-/g, ' ');
const length = (about) => px(0.65, 1.35, { default: 1, about });
const body = paint({ about: 'Body: the main colour (its Body colour control)' });
const accent = paint({ about: 'The trim or hazard paint (its second colour control)' });
const lights = paint({ about: 'Its lights, lens and screen (the sprite\'s `glow` colour control)' });
/** The clip states of a port from a code clip table: { name: { frames, loop } }. */
const statesOf = (table) => Object.fromEntries(Object.entries(table).map(([k, c]) => [k, { frames: c.frames, loop: c.loop !== false }]));

/**
 * A port whose frame is bigger than a frame's stamp cap: portGenerator's arguments and drawing, but the pixels inside
 * `stampBox` ([x0, y0, x1, y1] in the old frame's pixels) come back as stamps and those outside it as one-row
 * whole-pixel rects (no stamp pixels). Its `picture` may also be `clip` (the default): the clip being drawn (ctx.clip;
 * the first picture when that is none of them), so a data file names it once for all its clips. A sprite's cost is the
 * sum of every call it writes, whatever clip it is in, so the Warden's seven clips written as seven calls of this one
 * (each priced for its rects round the box) would be over a frame's budget of 4,000. Returns the frozen registry entry.
 */
function boxedPort({ id, v = 1, family, about, size, origin, states, args, units, draw, stampBox }) {
  const [W, H] = size, [bx0, by0, bx1, by1] = stampBox, ring = W * H - (bx1 - bx0) * (by1 - by0), names = Object.keys(states);
  const inBox = (x, y) => x >= bx0 && x < bx1 && y >= by0 && y < by1;
  return defineGenerator({
    id, v, family, about,
    args: {
      at: point({ about: `Where the middle of its ${W} x ${H} picture goes (the old frame's point ${origin[0]}, ${origin[1]})` }),
      picture: word(['clip', ...names], { default: 'clip', about: 'Which of its pictures it draws: the clip of the same name, or clip (the default): the clip being drawn' }),
      ...args,
    },
    // the stamps of its box's tiles, a rect for every pixel round the box at most, and the shape tests of its frame or its measured work
    cost: () => portTiles(bx1 - bx0, by1 - by0) + ring + Math.max(workCost(W * H * 64), units),
    run(a, ctx) {
      const picture = a.picture !== 'clip' ? a.picture : Object.hasOwn(states, ctx?.clip) ? ctx.clip : names[0];
      const st = states[picture], frames = st.frames, loop = st.loop !== false;
      const frame = Number.isInteger(ctx.frame) ? Math.max(0, Math.min(frames - 1, ctx.frame)) : 0;
      return withPaintTable(() => {
        const g = new PortSurface(W, H);
        draw(g, { clip: picture, frame, frames, loop, t: portPhase(frame, frames, loop), p: a });
        const [dx, dy] = shiftTo(a.at, origin[0], origin[1]);
        const mid = g.blank(W, H), rects = [];
        for (let y = 0; y < H; y++) {
          let x = 0;
          while (x < W) {
            const c = g.data[y * W + x];
            if (!c) { x++; continue; }
            if (inBox(x, y)) { mid.data[y * W + x] = c; x++; continue; }
            let e = x + 1;
            while (e < W && g.data[y * W + e] === c && !inBox(e, y)) e++;
            rects.push({ kind: 'rect', at: [x + dx, y + dy], size: [e - x, 1], paint: g.table.ref(c), shade: 0 });
            x = e;
          }
        }
        return [...mid.stamps([dx, dy]), ...rects];
      });
    },
  });
}

/**
 * Declares the attach-point motion of a robot port (family motion, version 1; see the head of this file): its arguments
 * the port's settings; each frame it moves the empty node `<point>` of the data file (at [0, 0], no parent) to the
 * point's place in the old frame's pixels, moved so the old frame's `origin` is at `at`, and turns it so a point on it at
 * angle 0 has the code's angle. A clip the code did not know (a motion's goldens are made at clip "x") is read as the
 * first of `clips`. Returns the frozen registry entry.
 */
function pointsMotion({ id, about, origin, clips, args, sockets }) {
  return defineGenerator({
    id, v: 1, family: 'motion', about,
    args: { at: point({ default: [...origin], about: `Where the old frame's point ${origin[0]}, ${origin[1]} is: the node the picture is drawn on` }), ...args },
    cost: () => 0,
    run(a, ctx) {
      const clip = clips.includes(ctx?.clip) ? ctx.clip : clips[0];
      const t = Number.isFinite(ctx?.t) ? ctx.t : 0;
      const [dx, dy] = [Math.round(a.at[0]) - origin[0], Math.round(a.at[1]) - origin[1]];
      return Object.entries(sockets(clip, t, a)).slice(0, 16).map(([name, s]) => ({
        // nodeFrame (engine/draw-list.js) turns v, a node's down, to [-sin, cos] of its turn, so a point at angle 0 on a
        // node turned by -angle (in degrees) has the rig angle `angle`
        node: name, move: [s.x + dx, s.y + dy], turn: -s.angle * 180 / Math.PI,
      }));
    },
  });
}

// ---- robot.security-bot@1 and robot.security-bot.points@1 (sprites/security-bot.json) --------------------------------

// a picture is a word, which has no underscore: the clip walk_down is the picture walk-down
const SECURITY_CODE_CLIPS = statesOf(B.clips(() => 0.5, ['idle_down', 'walk*', { name: 'attack*', label: 'Charge' }, 'shoot*', 'hurt', 'die']));
const SECURITY_CLIPS = Object.fromEntries(Object.entries(SECURITY_CODE_CLIPS).map(([k, v]) => [k.replace(/_/g, '-'), v]));
/** The guard rig's frame as sprites/security-bot.js asked for it, from the port's arguments (picture walk-down: the clip walk_down). */
const securityFrame = (picture, t, p) => B.frame(picture.replace(/-/g, '_'), t, { size: p.size, bulk: p.bulk, bounce: p.bounce }, {
  drive: p.legs, head: p.shape, weapon: { kind: p.weapon, length: p.weaponLength }, pack: { kind: p.pack, size: p.packSize },
});
const SECURITY_SHAPE = {
  size: share({ default: 0.5, about: 'Size: Small to Big' }),
  bulk: share({ default: 0.5, about: 'Bulk: Light to Heavy' }),
  legs: word(B.DRIVES, { default: 'treads', about: 'What it runs on' }),
  shape: word(B.HEADS, { default: 'block', about: 'Its head' }),
  weapon: word([...B.WEAPONS, 'none'], { default: 'cannon', about: 'What it carries at its shoulder' }),
  weaponLength: length('How long the weapon is'),
  pack: word(['none', ...B.PACKS], { default: 'none', about: 'What stands on its rear deck' }),
  packSize: length('How big the pack is'),
  bounce: share({ default: 0.5, about: 'Bounce: Calm to Bouncy (how much it rumbles and dips)' }),
};

/** robot.security-bot@1: The Derelict Station's heavy robot guard on treads or legs, seen from above: patrol, charge, shoot and shutdown in three directions. Port of sprites/security-bot.js on rigs/guard-bot.js (engine/gen/ports/c3/guard-bot.js), pixel for pixel. */
export const securityBot = portGenerator({
  id: 'robot.security-bot', v: 1, family: 'robot', units: 300,
  about: 'The Derelict Station\'s heavy robot guard on treads or legs, seen from above: patrol, charge, shoot and shutdown in three directions.',
  size: B.SIZE, origin: [24, 24], states: SECURITY_CLIPS,
  args: { ...SECURITY_SHAPE, body, accent, lights },
  draw(g, { clip, t, p }) {
    const F = securityFrame(clip, t, p);
    const look = { body: p.body, accent: p.accent, glow: p.lights, metal: D.steel, dark: D.plate, core: D.cream, fire: D.amber };
    F.draw(g, look);
    F.finish(g, look);
  },
});

/** robot.security-bot.points@1: The security bot's attach points (hand, muzzle, head, back, feet), moved each frame to where sprites/security-bot.js sockets() put them. */
export const securityBotPoints = pointsMotion({
  id: 'robot.security-bot.points', origin: [24, 24], clips: Object.keys(SECURITY_CODE_CLIPS), args: SECURITY_SHAPE,
  about: 'Moves the security bot\'s points (hand, muzzle, head, back, feet) each frame to where its code put them.',
  sockets: (clip, t, p) => securityFrame(clip, t, p).sockets(),
});

// ---- robot.vendor-bot@1 and robot.vendor-bot.points@1 (sprites/vendor-bot.json) --------------------------------------

const VENDOR_CLIPS = statesOf(KI.clips(() => 0.5, ['idle', 'talk', 'sell']));
/** The kiosk rig's frame as sprites/vendor-bot.js asked for it, from the port's arguments. */
const vendorFrame = (clip, t, p, frame) => KI.frame(clip, t, { size: p.size, bob: p.bob }, {
  shape: p.shape, face: spaced(p.eyes), arms: p.arms, frame,
  headgear: { kind: p.headgear, size: p.headgearSize }, held: { kind: p.held, size: p.heldSize },
});
const VENDOR_SHAPE = {
  size: share({ default: 0.5, about: 'Size: Small to Big' }),
  shape: word(KI.SHAPES, { default: 'boxy', about: 'The cabinet\'s shape' }),
  eyes: word(KI.FACES.map(dashed), { default: 'smile', about: 'The face on its screen' }),
  arms: flag({ default: true, about: 'Arms' }),
  headgear: word([...KI.HEADGEAR, 'none'], { default: 'antenna', about: 'What it wears on top' }),
  headgearSize: length('How big the headgear is'),
  held: word(['none', ...KI.HELD], { default: 'none', about: 'What it holds' }),
  heldSize: length('How big what it holds is'),
  bob: share({ default: 0.5, about: 'Float: Still to Floaty' }),
};

/** robot.vendor-bot@1: The Derelict Station's friendly shop robot, a kiosk hovering over a small jet: idle, talk (its screen face flickers, an arm waves) and sell (a tray slides out). Port of sprites/vendor-bot.js on rigs/kiosk.js (engine/gen/ports/c3/kiosk.js), pixel for pixel. */
export const vendorBot = portGenerator({
  id: 'robot.vendor-bot', v: 1, family: 'robot', units: 70,
  about: 'The Derelict Station\'s friendly shop robot, a kiosk hovering over a small jet: idle, talk (its screen face flickers, an arm waves) and sell (a tray slides out).',
  size: KI.SIZE, origin: [24, 24], states: VENDOR_CLIPS,
  args: { ...VENDOR_SHAPE, body, accent, lights },
  draw(g, { clip, t, frame, p }) {
    const F = vendorFrame(clip, t, p, frame);
    const look = { body: p.body, accent: p.accent, glow: p.lights, metal: D.steel, dark: D.plate, goods: D.gold, sign: D.cream, core: D.cream };
    F.draw(g, look);
    F.finish(g, look);
  },
});

/** robot.vendor-bot.points@1: The vendor bot's attach points (head, hand, offhand, feet, hatch), moved each frame to where sprites/vendor-bot.js sockets() put them. */
export const vendorBotPoints = pointsMotion({
  id: 'robot.vendor-bot.points', origin: [24, 24], clips: Object.keys(VENDOR_CLIPS), args: VENDOR_SHAPE,
  about: 'Moves the vendor bot\'s points (head, hand, offhand, feet, hatch) each frame to where its code put them.',
  sockets: (clip, t, p) => vendorFrame(clip, t, p).sockets(),
});

// ---- robot.warden-mech@1 and robot.warden-mech.points@1 (sprites/warden-mech.json) -----------------------------------

const WARDEN_CLIPS = statesOf(M.clips(() => 0.5, ['idle', 'walk', { name: 'shoot', label: 'Missile volley' }, 'beam', 'overheat', 'hurt', 'die']));
/** The war machine rig's frame as sprites/warden-mech.js asked for it, from the port's arguments. */
const wardenFrame = (clip, t, p) => M.frame(clip, t, { size: p.size, bulk: p.bulk, legs: p.legs, bounce: p.bounce }, {
  head: spaced(p.shape), weapon: { kind: spaced(p.weapon), length: p.weaponLength }, pack: { kind: spaced(p.pack), size: p.packSize },
});
const WARDEN_SHAPE = {
  size: share({ default: 0.5, about: 'Size: Small to Big' }),
  bulk: share({ default: 0.5, about: 'Bulk: Light to Heavy' }),
  legs: share({ default: 0.5, about: 'Legs: Short to Long' }),
  shape: word(M.HEADS.map(dashed), { default: 'cockpit', about: 'Its head' }),
  weapon: word(M.WEAPONS.map(dashed), { default: 'cannon-arms', about: 'Its weapon arms' }),
  weaponLength: length('How long the weapon arms are'),
  pack: word([...M.PACKS, 'none'].map(dashed), { default: 'missile-pods', about: 'What it carries on its back' }),
  packSize: length('How big the pack is'),
  bounce: share({ default: 0.5, about: 'Bounce: Calm to Bouncy' }),
};

/** robot.warden-mech@1: The Derelict Station's boss, a walking security machine with a glowing reactor in its chest: it stomps, fires a missile volley and a sweeping beam, overheats and blows apart. Port of sprites/warden-mech.js on rigs/mech-walker.js (engine/gen/ports/c3/mech-walker.js), pixel for pixel; its 96 x 96 frame's pixels round a 90 x 90 box come back as rects. */
export const wardenMech = boxedPort({
  id: 'robot.warden-mech', v: 1, family: 'robot', units: 2430, stampBox: [3, 3, 93, 93],
  about: 'The Derelict Station\'s boss, a walking security machine with a glowing reactor in its chest: it stomps, fires a missile volley and a sweeping beam, overheats and blows apart.',
  size: M.SIZE, origin: [48, 48], states: WARDEN_CLIPS,
  args: { ...WARDEN_SHAPE, body, accent, lights },
  draw(g, { clip, t, p }) {
    const F = wardenFrame(clip, t, p);
    // barrels, claws and the skull plate are bright steel, or the dark of the hull on a body that is itself bright steel
    const look = { body: p.body, accent: p.accent, glow: p.lights, metal: pick(p.body, D.steel, D.hull), dark: D.plate, core: D.cream, fire: D.amber };
    F.draw(g, look);
    F.finish(g, look);
  },
});

/** robot.warden-mech.points@1: The Warden's attach points (hand, offhand, head, back, feet, muzzle, core), moved each frame to where sprites/warden-mech.js sockets() put them. */
export const wardenMechPoints = pointsMotion({
  id: 'robot.warden-mech.points', origin: [48, 48], clips: Object.keys(WARDEN_CLIPS), args: WARDEN_SHAPE,
  about: 'Moves the Warden\'s points (hand, offhand, head, back, feet, muzzle, core) each frame to where its code put them.',
  sockets: (clip, t, p) => wardenFrame(clip, t, p).sockets(),
});

// ---- robot.scout-drone@1 and robot.scout-drone.points@1 (sprites/scout-drone.json) -----------------------------------

/** The settings the scout drone's own drawing reads, from the port's arguments. */
const droneSettings = (p) => ({ ...p, glow: p.lights });
const DRONE_SHAPE = {
  size: share({ default: 0.5, about: 'Size: Small to Big' }),
  shape: word(['round', 'wedge', 'box'], { default: 'round', about: 'The hull' }),
  eyes: word(['single', 'visor', 'triple'], { default: 'single', about: 'The lens' }),
  weapon: word(['blaster', 'stinger', 'none'], { default: 'blaster', about: 'What hangs under the hull' }),
  weaponLength: length('How long the weapon is'),
  wings: word(['rotors', 'fins', 'ring', 'none'], { default: 'rotors', about: 'What carries it' }),
  wingSpan: length('How big the wings are'),
  bob: share({ default: 0.5, about: 'Float: Still to Floaty' }),
};

/** robot.scout-drone@1: The Derelict Station's small flying security machine with one red eye: hover, alert, shoot, hurt, and a death in which it spins out, keels over and falls apart in three pieces. Port of sprites/scout-drone.js (engine/gen/ports/c3/scout-drone.js), pixel for pixel. */
export const scoutDrone = portGenerator({
  id: 'robot.scout-drone', v: 1, family: 'robot', units: 135,
  about: 'The Derelict Station\'s small flying security machine with one red eye: hover, alert, shoot, hurt, and a death in which it spins out, keels over and falls apart in three pieces.',
  size: SD.SIZE, origin: [24, 24], states: SD.CLIPS,
  args: { ...DRONE_SHAPE, body, accent, lights },
  draw(g, { clip, t, frame, p }) { SD.drone.render(g, { clip, t, frame, p: droneSettings(p) }); },
});

/** robot.scout-drone.points@1: The scout drone's attach points (hand, muzzle, back), moved each frame to where sprites/scout-drone.js sockets() put them. */
export const scoutDronePoints = pointsMotion({
  id: 'robot.scout-drone.points', origin: [24, 24], clips: Object.keys(SD.CLIPS), args: DRONE_SHAPE,
  about: 'Moves the scout drone\'s points (hand, muzzle, back) each frame to where its code put them.',
  sockets: (clip, t, p) => SD.drone.sockets(clip, t, p),
});
