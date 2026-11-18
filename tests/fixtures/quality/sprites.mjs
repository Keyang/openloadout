// Tiny sprites for the quality-bar tests. `good()` passes every check; every other
// export breaks exactly one rule, named in its comment. Each export is a function
// that returns a fresh defineSprite() result, because defineSprite fills in defaults
// on the object it is given.
import { defineSprite, range, choice, color, toggle } from '../../../engine/sprite.js';
import { lerp, pulse } from '../../../engine/motion.js';
import { INK } from '../../../engine/color.js';

const W = 32, GROUND = 28, CX = 16;

export const META = { type: 'creature', role: 'characters/enemy', themes: ['neutral'], gameTypes: ['platformer'], view: 'side', words: ['blob', 'slime', 'goo', 'monster', 'enemy', 'bounce'], license: 'draft' };

// A blob with a face, a hat part, a shine and two motion controls.
// opts let a broken fixture swap one piece of the drawing.
function blobDef(opts = {}) {
  const sizeLo = opts.sizeLo ?? 7, sizeHi = opts.sizeHi ?? 10;
  return {
    id: 'q-good', name: 'Good blob', kind: 'Creature', blurb: 'Test blob.',
    meta: { ...META },
    size: [W, W], pivot: [CX, GROUND],
    sounds: { squash: [{ sound: 'q-blip', frame: 1, preset: 'Soft', when: { hat: ['cap', 'spike'] } }] },
    params: {
      size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
      mood: choice('Mood', 'calm', ['calm', 'angry', 'sleepy']),
      hat: choice('Hat', 'cap', ['none', 'cap', 'spike']),
      hatSize: range('Hat size', 0.5, { lo: 'Small', hi: 'Big' }),
      hatColour: color('Hat colour', '#c9423a', ['#c9423a', '#3f6fd1', '#e6c545']),
      shine: toggle('Shine', true),
      body: color('Colour', '#5fc46b', ['#5fc46b', '#9a62d6', '#e89a35']),
      bounce: range('Bounce', 0.5, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),
      speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
    },
    parts: { hat: { label: 'Hat', params: ['hat', 'hatSize', 'hatColour'], none: 'none' } },
    clips: {
      idle: { frames: 4, fps: (p) => 6 * lerp(0.65, 1.45, p.speed), loop: true },
      squash: { frames: 4, fps: (p) => 9 * lerp(0.65, 1.45, p.speed), loop: false },
    },
    render(g, { clip, t, p }) {
      const r = lerp(sizeLo, sizeHi, p.size), ry = Math.round(r * 0.8);
      const amp = lerp(1, 3, p.bounce);
      const lift = opts.frozenIdle && clip === 'idle' ? 0 : clip === 'idle' ? Math.round(amp * pulse(t)) : Math.round(amp * 2 * Math.sin(Math.PI * t));
      const cy = GROUND + 0.5 - ry - lift + (opts.sink ?? 0);
      g.ellipse(CX, cy, r, ry, p.body);
      if (p.shine) g.rect(CX + Math.round(r * 0.3), Math.round(cy - ry * 0.6), 3, 2, '#ffffff');
      const ey = Math.round(cy - ry * 0.2);
      for (const ex of [CX - 3, CX + 2]) {
        const mood = opts.moodAlias && p.mood === opts.moodAlias ? 'calm' : p.mood;
        if (mood === 'calm' || mood === 'angry') g.rect(ex, ey, 2, 2, INK);
        if (mood === 'angry') g.rect(ex - 1, ey - 2, 3, 1, INK);
        if (mood === 'sleepy') g.rect(ex - 1, ey + 1, 3, 1, INK);
      }
      if (opts.freckle && p.freckle) { g.dot(CX - 5, ey + 2, INK); g.dot(CX + 5, ey + 2, INK); }
      if (opts.freckleSize) { g.dot(CX - 5, ey + 2, INK); if (p.freckleSize > 0.5) { g.dot(CX - 6, ey + 2, INK); g.dot(CX + 5, ey + 2, INK); } }
      if (opts.dozy && p.mood === 'dozy') for (const ex of [CX - 3, CX + 2]) { g.rect(ex - 1, ey + 1, 3, 1, INK); g.dot(ex, ey, INK); }
      if (opts.spot && p.size < 0.95) g.rect(CX - 6, Math.round(cy), 1 + Math.round(p.spot * 3), 2, '#ffffff');
      if (opts.scarf && p.scarf) g.rect(CX - 5, Math.round(cy + ry * 0.4), 10, 2, p.scarfColour);
      if (opts.cape && p.cape) g.rect(CX - 7, Math.round(cy - 1), 2, 6, '#7a4fc4');
      if (opts.cape && opts.drawTrim && p.cape && p.hat === 'spike') g.rect(CX + 5, Math.round(cy - 1), 2, 6, p.trim);
      if (opts.trimAny && (p.cape || p.hat === 'spike')) g.rect(CX + 5, Math.round(cy - 1), 2, 6, p.trim);
      const top = Math.round(cy - ry);
      const hatColour = opts.capIgnoresColour && p.hat === 'cap' ? '#888888' : p.hatColour;
      const sizeForHat = opts.hatIgnoresSize ? 0.5 : p.hatSize;
      if (p.hat === 'cap') {
        const hw = Math.round(lerp(3, 5, sizeForHat)), hh = Math.round(lerp(2, 4, sizeForHat));
        g.rect(CX - hw, top - hh, hw * 2, hh, hatColour);
      } else if (p.hat === 'spike') {
        const hh = lerp(3, 6, sizeForHat);
        g.poly([[CX - 3, top + 1], [CX + 3, top + 1], [CX, top - hh]], hatColour);
      }
      if (opts.counter) { opts.counter.n++; g.dot(1 + (opts.counter.n % 3), 1, INK); }
      if (opts.throwAbove !== undefined && p.size > opts.throwAbove) throw new Error('too big to draw');
      if (opts.alwaysThrow) throw new Error('cannot draw');
      if (opts.emptyLast && clip === 'vanish' && t === 1) g.clear();
    },
  };
}

const make = (opts, edit = (d) => d) => () => defineSprite(edit(blobDef(opts)));

export const good = make({});

// every slider changes the picture
export const deadSlider = make({}, (d) => { d.params.wiggle = range('Wiggle', 0.5); return d; });
// on/off control that changes only 2 pixels (at most N): a warning, not an error
export const weakToggle = make({ freckle: true }, (d) => { d.params.freckle = toggle('Freckles', false); return d; });
// a slider that changes only 2 pixels (at most N): an error
export const weakSlider = make({ freckleSize: true }, (d) => { d.params.freckleSize = range('Freckle size', 0.5); return d; });
// two choice options that look exactly the same ('grumpy' draws what 'calm' draws): an error
export const sameChoice = make({ moodAlias: 'grumpy' }, (d) => { d.params.mood = choice('Mood', 'calm', ['calm', 'angry', 'sleepy', 'grumpy']); return d; });
// two choice options 2 pixels apart ('dozy' is 'sleepy' plus a dot per eye): a warning
export const nearChoice = make({ dozy: true }, (d) => { d.params.mood = choice('Mood', 'calm', ['calm', 'angry', 'sleepy', 'dozy']); return d; });
// every colour control changes the picture
export const deadColour = make({}, (d) => { d.params.eyeColour = color('Eye colour', '#ffffff', ['#ffffff', '#3f6fd1', '#e6c545']); return d; });
// no undeclared dead control: without the parts declaration, hat size does nothing when hat = none
export const deadForChoice = make({}, (d) => { delete d.parts; return d; });
// (passes) the same drawing, with `when` saying when the hat controls are in effect
export const whenDeclared = make({}, (d) => {
  delete d.parts;
  d.params.hatSize = { ...d.params.hatSize, when: { hat: ['cap', 'spike'] } };
  d.params.hatColour = { ...d.params.hatColour, when: { hat: ['cap', 'spike'] } };
  return d;
});
// (passes) a part whose selector is an on/off control
// A colour whose `when` needs two settings away from the default (hat = spike AND cape on):
// no tested setting has both, so the checker must build that setting itself.
const twoKeyWhen = (d) => {
  d.params.cape = toggle('Cape', false);
  d.params.trim = { ...color('Trim', '#e6c545', ['#e6c545', '#3f6fd1', '#c9423a']), when: { hat: ['spike'], cape: [true] } };
  return d;
};
// (passes) ... and the trim is drawn there
export const twoKeyWhenDrawn = make({ cape: true, drawTrim: true }, twoKeyWhen);
// ... and the trim is never drawn: an error, although no tested setting has it in effect
export const twoKeyWhenNeverDrawn = make({ cape: true }, twoKeyWhen);
// a control whose `when` can never hold (the hat colour only when there is no hat)
export const cannotApply = make({}, (d) => { d.params.hatColour = { ...d.params.hatColour, when: { hat: ['none'] } }; return d; });
// `when` as a list ("any of these"): the trim shows with a spike hat, or with the cape on
export const listWhenDrawn = make({ cape: true, trimAny: true }, (d) => {
  twoKeyWhen(d);
  d.params.trim = { ...d.params.trim, when: [{ hat: ['spike'] }, { cape: [true] }] };
  return d;
});
export const togglePart = make({ scarf: true }, (d) => {
  d.params.scarf = toggle('Scarf', true);
  d.params.scarfColour = color('Scarf colour', '#3f6fd1', ['#3f6fd1', '#e6c545', '#c9423a']);
  d.parts.scarf = { label: 'Scarf', params: ['scarf', 'scarfColour'] };
  return d;
});
// (passes) a part whose none is a list of values
export const listNonePart = make({}, (d) => { d.parts.hat.none = ['none']; return d; });
// a control that does nothing only with every slider at its highest: a warning (a deliberate clamp)
export const deadAtExtreme = make({ spot: true }, (d) => { d.params.spot = range('Spot', 0.5); return d; });
// defineSprite refuses a part that lists a key that is not a control (the engine throws)
export const partMissingKey = make({}, (d) => { d.parts.hat.params = ['hat', 'hatSize', 'hatColour', 'hatShape']; return d; });
// defineSprite refuses a part whose selector is a slider
export const partSelectorNotChoice = make({}, (d) => { d.parts.hat.params = ['hatSize', 'hat', 'hatColour']; d.parts.hat.none = undefined; return d; });
// parts: each part control changes the picture while the part is present (hat colour does nothing on a cap)
export const partControlDead = make({ capIgnoresColour: true });
// a part with more than 6 controls: a warning
export const bigPart = make({}, (d) => {
  for (const k of ['hatTilt', 'hatBand', 'hatFeather', 'hatShine']) d.params[k] = range(k, 0.5);
  d.parts.hat.params = ['hat', 'hatSize', 'hatColour', 'hatTilt', 'hatBand', 'hatFeather', 'hatShine'];
  return d;
});
// 15 controls outside parts plus a 3-control part: not "too many controls" (part settings are not counted)
export const manyWithPart = make({}, (d) => { for (let i = 0; i < 8; i++) d.params[`extra${i}`] = range(`Extra ${i}`, 0.5); return d; });
// 17 controls outside parts: "too many controls"
export const tooMany = make({}, (d) => { delete d.parts; for (let i = 0; i < 8; i++) d.params[`extra${i}`] = range(`Extra ${i}`, 0.5); return d; });
// smallest look fills less than a quarter of the frame along its longer side
export const tinyLook = make({ sizeLo: 2 });
// smallest look fills between a quarter and a third: a warning, not an error
export const smallLook = make({ sizeLo: 4.5 });
// nothing touches the frame edge
export const edgeTouch = make({ sizeHi: 17 });
// (passes the edge rule) icons and interface pieces may fill the frame
export const iconFull = make({ sizeHi: 17 }, (d) => { d.meta.type = 'icon'; d.meta.role = 'items/icon'; return d; });
// same input gives the same pixels
export const nondeterministic = () => defineSprite(blobDef({ counter: { n: 0 } }));
// renders without error at every tested combination
export const throwsSometimes = make({ throwAbove: 0.95 });
// a sprite that never draws: one error for the cause, and no "never changes the picture" on top
export const alwaysThrows = make({ alwaysThrow: true });
// a creature moves in every clip
export const frozenClip = make({ frozenIdle: true });
// a frame with nothing drawn (the last frame of 'vanish') is an error for a creature
export const emptyFrame = make({ emptyLast: true }, (d) => { d.clips.vanish = { frames: 3, fps: 8, loop: false }; return d; });
// ... and only a warning for an effect, whose last frame may be empty
export const emptyEffectEnd = make({ emptyLast: true }, (d) => { d.meta.type = 'effect'; d.meta.role = 'effects/magic'; d.clips.vanish = { frames: 3, fps: 8, loop: false }; return d; });
// a character or creature has no one-frame clip
export const stillCharacter = make({}, (d) => { d.meta.type = 'character'; d.clips.pose = { frames: 1, fps: 1, loop: false }; return d; });
// (passes) a prop may have a one-frame clip
export const stillProp = make({}, (d) => { d.meta.type = 'prop'; d.meta.role = 'world/prop'; d.clips.pose = { frames: 1, fps: 1, loop: false }; return d; });
// metadata present when a validator is given
export const noMeta = make({}, (d) => { delete d.meta; return d; });
// metadata passes the validator (type is not an allowed value)
export const badMeta = make({}, (d) => { d.meta.type = 'spaceship'; return d; });
// sound ids exist (checked even on a cue with `when`)
export const unknownSound = make({}, (d) => { d.sounds = { squash: [{ sound: 'q-nope', frame: 1, when: { hat: ['spike'] } }] }; return d; });
// sound styles (presets) exist
export const unknownPreset = make({}, (d) => { d.sounds = { squash: [{ sound: 'q-blip', frame: 1, preset: 'Loud' }] }; return d; });
// sprites take sound effects, not music
export const musicOnSprite = make({}, (d) => { d.sounds = { squash: [{ sound: 'q-song', frame: 1 }] }; return d; });
// every control has a label
export const noLabel = make({}, (d) => { d.params.size = { ...d.params.size, label: '' }; return d; });
// a colour control has at least 3 swatches
export const twoSwatches = make({}, (d) => { d.params.body = color('Colour', '#5fc46b', ['#5fc46b', '#9a62d6']); return d; });
// feet rest on the pivot line
export const floating = make({ sink: -5 });

/** A sound index for the sprite tests: what the sprites' sound cues are checked against. */
export const SOUND_INDEX = new Map([
  ['q-blip', { id: 'q-blip', name: 'Blip', presets: { Soft: { pitch: 300 } } }],
  ['q-song', { id: 'q-song', name: 'Song', category: 'music', loop: true }],
]);

// ---- tilesets ------------------------------------------------------------------
// Two tiles: ground-top (grass over earth) and ground-fill (earth). 16x16.
const T = 16;
function tileDef(opts = {}) {
  return {
    id: 'q-tiles', name: 'Test tiles', kind: 'Item',
    meta: { ...META, type: 'tileset', role: 'world/tile', view: 'side' },
    size: [T, T], pivot: [0, T - 1], grounded: false,
    params: {
      grass: range('Grass depth', 0.5, { lo: 'Thin', hi: 'Thick' }),
      speckles: toggle('Stones', true),
      earth: color('Earth', '#8a5a34', ['#8a5a34', '#6b7280', '#c98a4a']),
      turf: color('Grass', '#4f9d57', ['#4f9d57', '#e6c545', '#3f7fd1']),
    },
    clips: {
      'ground-top': { frames: 1, fps: 1, loop: false },
      'ground-fill': { frames: 1, fps: 1, loop: false },
    },
    render(g, { clip, p }) {
      const earth = (x, y) => {
        if (opts.gradientFill) return `#${(0x30 + x * 10).toString(16)}3020`;
        if (p.speckles && x % 4 === 1 && y % 4 === 2) return '#3a3350';
        return p.earth;
      };
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
        if (clip === 'ground-fill') {
          if (opts.holeInFill && x === 7 && y === 7) continue;
          g.dot(x, y, earth(x, y));
        } else {
          const grassTop = 3, depth = Math.round(lerp(2, 5, p.grass));
          const surface = opts.slopedTop ? grassTop + Math.floor(x / 3) : grassTop;
          if (y < surface) continue;
          g.dot(x, y, opts.shadowBottom && y >= T - 2 ? '#231b33' : y < surface + depth ? p.turf : earth(x, y));
        }
      }
    },
  };
}
export const tilesetGood = () => defineSprite(tileDef());
// fill tiles are fully opaque
export const tilesetHole = () => defineSprite(tileDef({ holeInFill: true }));
// fill tiles repeat without a seam (dark-to-light gradient jumps back at the wrap)
export const tilesetSeam = () => defineSprite(tileDef({ gradientFill: true }));
// top tiles repeat side by side without a seam (the surface slopes down 5 px across the tile)
export const tilesetTopSeam = () => defineSprite(tileDef({ slopedTop: true }));
// the top tile sits on the fill tile without a seam (a dark band along the top tile's bottom edge)
export const tilesetUnderSeam = () => defineSprite(tileDef({ shadowBottom: true }));

// ---- backgrounds ---------------------------------------------------------------
const BW = 48, BH = 24;
function bgDef(opts = {}) {
  const period = opts.period ?? BW;
  return {
    id: 'q-bg', name: 'Test hills', kind: 'Effect',
    meta: { ...META, type: 'background', role: 'environment/background', view: 'side' },
    size: [BW, BH], pivot: [0, BH - 1], grounded: false,
    params: {
      height: range('Hill height', 0.5, { lo: 'Low', hi: 'High' }),
      sky: color('Sky', '#9fd3f0', ['#9fd3f0', '#f0b080', '#3a3350']),
      hill: color('Hills', '#4f9d57', ['#4f9d57', '#2f8f9d', '#7a4fc4']),
      snow: toggle('Snow caps', false),
    },
    clips: { far: { frames: 1, fps: 1, loop: false }, near: { frames: 1, fps: 1, loop: false } },
    render(g, { clip, p }) {
      for (let x = 0; x < BW; x++) {
        if (opts.gap && clip === 'near' && x < 3) continue;
        const amp = lerp(3, 7, p.height) * (clip === 'far' ? 0.6 : 1);
        const top = Math.round(BH - 8 - amp * Math.sin((2 * Math.PI * x) / period) - (clip === 'far' ? 6 : 0));
        for (let y = 0; y < BH; y++) {
          if (y >= top) g.dot(x, y, p.snow && y < top + 2 ? '#ffffff' : clip === 'far' ? '#2f6f5d' : p.hill);
          else if (clip === 'far') g.dot(x, y, p.sky);
        }
      }
    },
  };
}
export const backgroundGood = () => defineSprite(bgDef());
// a background layer's left and right edges continue into each other (hills repeat every 64 px in a 48 px frame)
export const backgroundSeam = () => defineSprite(bgDef({ period: 64 }));
// a background layer fills the full width
export const backgroundGap = () => defineSprite(bgDef({ gap: true }));
