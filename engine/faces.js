// Face helper: head-and-shoulders portraits for dialogue boxes and party menus (docs/style-guide.md
// section 8, "Portrait set"). Pure drawing on a Surface: runs in Node and in the browser.
//
//   import { PORTRAIT_SIZE, PORTRAIT_PIVOT, faceClips, parseFaceClip, talkStep, portrait } from '../engine/faces.js';
//
//   const PEOPLE = { hero: (p) => ({ skin: p.skin, hair: { style: 'short', colour: P.wood },
//     headgear: { kind: 'helmet', metal: P.steel, plume: P.crimson }, outfit: { colour: p.hero, collar: 'mantle', trim: P.crimson, clasp: P.gold } }) };
//   clips: faceClips(['hero', 'mage'], ['neutral', 'happy', 'hurt'], { talk: true }),       // hero-neutral ... hero-talk, mage-neutral ...
//   render(g, { clip, frame, p }) {
//     const { who, mood, talk } = parseFaceClip(clip);
//     portrait(g, PEOPLE[who](p), { mood, mouth: talk ? talkStep(frame) : 0, zoom: p.size, frame: p.frame, backing: p.backing });
//   }
//
// A PERSON IS DATA. A sprite file says who somebody is; this file draws them. Every field but `skin` may be left out:
//   skin        colour
//   age         one of FACE_AGES: 'adult' | 'child' (smaller shoulders, bigger eyes, no nose line) | 'elder' (brow lines, narrow shoulders)
//   build       0..1, narrow to broad shoulders (default 0.5);  neck: 0..1, short to long (default 0.3)
//   hair        { style: one of FACE_HAIR, colour }
//   brows       'thin' (default) | 'bushy'
//   beard       { kind: one of FACE_BEARDS, colour, length (0.65 to 1.35) }
//   headgear    { kind: one of FACE_HEADGEAR, colour (cloth), metal, plume, band, jewel }   the names are the rigs' names
//   spectacles  { frame, lens }                                                               round wire spectacles
//   outfit      { colour, collar: one of FACE_COLLARS, trim, clasp, panel }
//   carried     { kind: one of FACE_CARRIED, metal, wood }                                    a pole weapon standing behind one shoulder
//
// HOW A FACE IS LAID OUT. The head faces three quarters to the picture's right, so the near eye is the left one and
// the hair, an ear and the back of the headgear show on the left. Light comes from the top right. Zoom (0..1) goes
// from head and shoulders to a close face; headgear that does not fit is cut by the frame, as a photograph would be.
// Eyes, brows, nose and mouth are placed on whole pixels and keep whole-pixel sizes at every zoom.
//
// MOODS (FACE_MOODS) change brows, eyes and mouth; `hurt` also tips the head back and shuts the far eye, `worried`
// adds a drop of sweat. `mouth` (0 closed, 1 half open, 2 open) is for a `talk` clip: talkStep(frame) gives the four steps.
//
// THE FRAME (PORTRAIT_FRAMES). 'none': the bust alone, cut along the frame's 1 px border and inked all round.
// 'round' and 'square': a medallion or a plate, with the border of a thin panel of engine/ui.js (ink, a flat 2 px
// band, ink, the backing colour), and the bust cut to the backing.
//
// Colours: a part painted over another gets a rim wherever it covers what is drawn (ink between things at
// different depths, a darker tone of its own colour between hair and skin when the two are close in value), so a
// face stays readable under every whole-bundle look. A portrait uses 9 to 13 colours, and up to 16 with a frame
// (more than the 10 of an icon: skin, hair, cloth, trim and metal each need two tones to read at this size).
// It reads pixels back while drawing (the rims), so it suits the pixel style only.

import { Surface, ellipseIn, capsuleIn, polyIn, rectIn, masked } from './surface.js';
import { ramp, tone, brightness, INK } from './color.js';
import { roundRectIn } from './ui.js';

/** The frame of a portrait: 48x48 (docs/style-guide.md section 1). No arguments: a frozen pair [w, h]. */
export const PORTRAIT_SIZE = Object.freeze([48, 48]);
/** The pivot of a portrait: the frame centre. No arguments: a frozen pair [x, y]. */
export const PORTRAIT_PIVOT = Object.freeze([24, 24]);
/** The moods portrait() can draw: each is a set of brows, eyes and mouth. No arguments: a frozen list. */
export const FACE_MOODS = Object.freeze(['neutral', 'happy', 'worried', 'hurt', 'angry', 'surprised']);
/** The ages portrait() knows: they set the shoulders, the size of the eyes and the lines of the face. No arguments: a frozen list. */
export const FACE_AGES = Object.freeze(['adult', 'child', 'elder']);
/** The hair styles portrait() can draw; the first five are the body rigs' names. No arguments: a frozen list. */
export const FACE_HAIR = Object.freeze(['short', 'long', 'spiky', 'ponytail', 'bald', 'bowl', 'pigtails', 'balding']);
/** The headgear portrait() can draw, by the body rigs' names. No arguments: a frozen list. */
export const FACE_HEADGEAR = Object.freeze(['none', 'helmet', 'kettle hat', 'hat-pointed', 'hat-wide', 'hood', 'turban', 'cap']);
/** The beards portrait() can draw, by the body rigs' names. No arguments: a frozen list. */
export const FACE_BEARDS = Object.freeze(['none', 'short', 'long']);
/** What portrait() can put round the neck and over the chest: a cape's mantle, a wound scarf, a round collar, a robe's V neck, an apron, a tabard. No arguments: a frozen list. */
export const FACE_COLLARS = Object.freeze(['none', 'mantle', 'scarf', 'collar', 'vee', 'apron', 'tabard']);
/** The pole weapons portrait() can stand behind a shoulder, by the body rigs' names. No arguments: a frozen list. */
export const FACE_CARRIED = Object.freeze(['halberd', 'spear']);
/** The borders portrait() can draw round a face. No arguments: a frozen list. */
export const PORTRAIT_FRAMES = Object.freeze(['none', 'round', 'square']);
/** How many frames a `talk` clip has (closed, half open, open, half open); it plays at TALK_FPS. No arguments: a number. */
export const TALK_FRAMES = 4;
/** The fixed speed of a `talk` clip in frames per second (docs/style-guide.md section 10: a portrait set has no Speed control). No arguments: a number. */
export const TALK_FPS = 8;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mixn = (a, b, t) => a + (b - a) * t;
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const oneOf = (what, value, list) => { if (!list.includes(value)) throw new Error(`faces: ${what} "${value}" is not one of ${list.join(', ')}`); return value; };

/**
 * Clip entries for a portrait set: one clip of one frame per person and mood, named `<who>-<mood>`, person by person in the order given.
 * Arguments: people: a list of short names ('hero', 'elder'), or [name, label] pairs; moods: a list from FACE_MOODS;
 * options { talk (true: each person also gets `<who>-talk`, TALK_FRAMES frames looping at TALK_FPS) }.
 */
export function faceClips(people, moods, { talk = false } = {}) {
  const out = {};
  for (const entry of people) {
    const [who, label] = Array.isArray(entry) ? entry : [entry, cap(entry)];
    for (const mood of moods) out[`${who}-${oneOf('mood', mood, FACE_MOODS)}`] = { frames: 1, fps: 1, loop: true, label: `${label}, ${mood}` };
    if (talk) out[`${who}-talk`] = { frames: TALK_FRAMES, fps: TALK_FPS, loop: true, label: `${label}, talking` };
  }
  return out;
}

/**
 * Splits a portrait clip name made by faceClips into who it is and what the face does.
 * Arguments: clip: a name such as 'hero-happy' or 'mage-talk'. Returns { who, mood, talk }: `talk` is true for a talk clip, whose mood is 'neutral'.
 */
export function parseFaceClip(clip) {
  const i = clip.lastIndexOf('-'), who = clip.slice(0, i), last = clip.slice(i + 1);
  if (i < 1) throw new Error(`faces: "${clip}" is not a <who>-<mood> clip name`);
  if (last === 'talk') return { who, mood: 'neutral', talk: true };
  return { who, mood: oneOf('mood', last, FACE_MOODS), talk: false };
}

/**
 * How far the mouth is open on one frame of a talk clip: 0 closed, 1 half open, 2 open, 1 half open, and round again.
 * Arguments: frame: the frame number, counted from 0.
 */
export const talkStep = (frame) => [0, 1, 2, 1][((Math.round(frame) % TALK_FRAMES) + TALK_FRAMES) % TALK_FRAMES];

// ---- painting ----------------------------------------------------------------------------

// Paints a shape over what is there, with a 1 px rim wherever it covers pixels already drawn.
function lay(L, inside, paint, o = {}) {
  const rim = o.rim === undefined ? INK : o.rim;
  if (rim) {
    const hits = [];
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      if (!L.get(x, y)) continue;
      const px = x + 0.5, py = y + 0.5;
      if (inside(px, py)) continue;
      if (inside(px + 1, py) || inside(px - 1, py) || inside(px, py + 1) || inside(px, py - 1)) hits.push([x, y]);
    }
    for (const [x, y] of hits) L.dot(x, y, rim);
  }
  L.fill(0, 0, L.w, L.h, inside, paint, { shade: o.shade, light: o.light });
  return L;
}

// Pastes a layer over another, with a rim wherever it covers pixels already drawn (the head over the shoulders).
function pasteOver(dst, src, rim = INK) {
  const has = (x, y) => src.get(x, y) !== 0, hits = [];
  for (let y = 0; y < dst.h; y++) for (let x = 0; x < dst.w; x++) {
    if (!dst.get(x, y) || has(x, y)) continue;
    if (has(x + 1, y) || has(x - 1, y) || has(x, y + 1) || has(x, y - 1)) hits.push([x, y]);
  }
  for (const [x, y] of hits) dst.dot(x, y, rim);
  dst.blit(src);
  return dst;
}

const any = (...tests) => (px, py) => { for (const f of tests) if (f(px, py)) return true; return false; };
const both = (a, b) => (px, py) => a(px, py) && b(px, py);
const less = (a, b) => (px, py) => a(px, py) && !b(px, py);
// the rim of something that lies on skin: none when the two differ clearly in value, else a darker tone of its own
const softRim = (colour, skin) => (Math.abs(brightness(colour) - brightness(skin)) < 0.25 ? tone(colour, -1) : null);
// a second cloth that was given the first one's colour is moved a tone lighter, so the two stay apart
const apart = (colour, from) => (colour && from && colour.toLowerCase() === from.toLowerCase() ? tone(colour, 0.85) : colour);
// metal is worn one tone darker than its colour, as the body rigs wear it, so steel stays apart from skin
const worn = (metal) => { const m = ramp(metal); return { isRamp: true, light: m.base, base: m.dark, dark: m.deep, deep: m.deep }; };

// ---- layout ------------------------------------------------------------------------------

const AGES = {
  adult: { shoulders: 1.42, eyeDrop: 0, eyeTall: 0, jaw: 0.14, shade: 2 },
  child: { shoulders: 1.05, eyeDrop: 1, eyeTall: 1, jaw: 0.06, shade: 1 },
  elder: { shoulders: 1.22, eyeDrop: 0.4, eyeTall: -1, jaw: 0.18, shade: 2 },
};
// how far each headgear rises above the skull, in pixels at zoom 0.5
const RISE = { none: 0, helmet: 7, 'kettle hat': 2.5, 'hat-pointed': 6.5, 'hat-wide': 1.5, hood: 3.5, turban: 5, cap: 2 };

// Where everything is: the head, the rows and columns of the features, the neck and the shoulders.
function layout(person, zoom, w, h, mood) {
  const age = AGES[oneOf('age', person.age ?? 'adult', FACE_AGES)];
  const gear = oneOf('headgear', person.headgear?.kind ?? 'none', FACE_HEADGEAR);
  const style = oneOf('hair style', person.hair?.style ?? 'bald', FACE_HAIR);
  const z = clamp01(zoom), u = mixn(0.8, 1.12, z), R = 12 * u, ry = R * 1.05;
  const cx = w / 2 - 0.5 + (person.carried ? Math.round(2 * u) : 0);       // room for a pole beside the head
  let rise = RISE[gear] * u;
  if (gear === 'none' && style === 'spiky') rise = 3 * u;
  if (gear === 'none' && style !== 'bald' && style !== 'balding') rise = Math.max(rise, 2 * u);
  const base = mixn(20.5, 24, z);
  const cy = Math.round(base + Math.max(0, Math.min(5 * u, 3 + ry + rise - base))) + 0.5 + (mood === 'hurt' ? 1 : 0);
  const eyeW = u >= 0.93 ? 3 : 2, eyeH = Math.max(3, Math.round(4 * u) + age.eyeTall);
  const eyeTop = Math.round(cy + (0.6 + age.eyeDrop) * u);
  const nearX = Math.round(cx - 5.3 * u), farX = Math.round(cx + 3.7 * u);
  const faceX = (nearX + farX + eyeW) / 2;                     // the middle of the face, between the eyes
  const browY = eyeTop - 2 - (person.spectacles ? 1 : 0);
  const mouthY = Math.max(eyeTop + eyeH + 2, Math.round(cy + 8 * u));
  const chinY = cy + ry;
  const sy = Math.round(chinY + (1.2 + 3.2 * clamp01(person.neck ?? 0.3)) * u);
  const W = age.shoulders * R * mixn(0.9, 1.1, clamp01(person.build ?? 0.5));
  // hurt: the head tips back (its top to the left), by sliding rows; shapes and features move together
  const tip = mood === 'hurt' ? 0.14 : 0;
  const slide = (y) => Math.round(tip * (chinY - y));
  return { w, h, u, R, ry, cx, cy, age, gear, style, eyeW, eyeH, eyeTop, nearX, farX, faceX, browY, mouthY, chinY, sy, W, bx: cx - 0.6 * u, nx: cx + 0.2 * u, tip, slide, jaw: age.jaw };
}

// The skull, a rounded block that narrows a little to the chin; `grow` adds pixels all round.
function skullIn(G, grow = 0) {
  const { cx, cy, R, ry, jaw, u } = G;
  return (px, py) => {
    const dy = (py - cy) / (ry + grow), low = dy > 0 ? dy * dy : 0;
    const dx = (px - cx - low * 0.9 * u) / ((R + grow) * (1 - jaw * low));
    return Math.abs(dx) ** 2.6 + Math.abs(dy) ** 2.6 <= 1;
  };
}

// The shoulders: a rounded slope from the neck and straight down to the bottom of the frame.
function bodyIn(G, lift = 0) {
  const { bx, sy, W, h } = G, drop = 0.42 * W, top = sy - lift;
  const slope = ellipseIn(bx, top + drop, W, drop);
  return (px, py) => py >= top && py < h && (slope(px, py) || (py >= top + drop && Math.abs(px - bx) <= W));
}

// ---- the body ------------------------------------------------------------------------------

function drawCarried(B, G, c) {
  const { bx, W, u, cy, R, h } = G, kind = oneOf('carried', c.kind, FACE_CARRIED);
  const wood = ramp(c.wood ?? '#9a6a3e'), metal = worn(c.metal ?? '#c2c9d6');       // the tones of a helmet, so the two add no colours
  // the pole stands just outside the head, on the near side; its head is level with the brow
  const x = Math.max(6, Math.round(bx - W + 3.5 * u)), top = Math.max(5, Math.round(cy - G.ry - 4 * u));
  lay(B, rectIn(x, top + 3 * u, 2, h), wood, { shade: 0 });
  if (kind === 'spear') {
    lay(B, polyIn([[x - 1.6 * u, top + 5 * u], [x + 1, top - 3 * u], [x + 2 + 1.6 * u, top + 5 * u], [x + 1, top + 7.5 * u]]), metal, { light: 1 });
    return;
  }
  // a halberd: a spike above, and an axe blade that flares to the outer side
  lay(B, polyIn([[x - 0.6, top + 3.5 * u], [x + 1, top - 3.4 * u], [x + 2.6, top + 3.5 * u]]), metal, { light: 1 });
  lay(B, less(polyIn([[x + 2, top + 3 * u], [x - 4.6 * u, top + 0.4 * u], [x - 5.6 * u, top + 6 * u], [x - 4.6 * u, top + 11.6 * u], [x + 2, top + 9 * u]]), ellipseIn(x - 1.2 * u, top + 12.4 * u, 2.6 * u, 2.6 * u)), metal, { light: 1 });
}

function drawBody(B, G, person) {
  const { bx, nx, sy, W, u, chinY, h } = G, o = person.outfit ?? {};
  const kind = oneOf('collar', o.collar ?? 'none', FACE_COLLARS);
  const cloth = ramp(o.colour ?? '#a8a4a0'), skin = ramp(person.skin), body = bodyIn(G);
  const trimC = apart(o.trim ?? o.colour ?? '#c9423a', o.colour), trim = ramp(trimC);
  if (person.carried) drawCarried(B, G, person.carried);
  if (kind === 'scarf') {
    // the two loose ends fly up behind the near shoulder: drawn first, so the shoulders lie over where they are tied
    const xl = Math.max(3.5, bx - W - 2.5 * u), xr = nx - 3 * u;
    lay(B, capsuleIn(xr, sy - 0.5 * u, xl + 0.6, sy - 10.5 * u, 1.8 * u, 1.3 * u), trim, { shade: 1 });
    lay(B, capsuleIn(xr, sy + 1 * u, xl, sy - 3.6 * u, 1.8 * u, 1.3 * u), trim, { shade: 1 });
  }
  lay(B, body, cloth, { shade: 2 });
  const neckW = 3.6 * u, neckTop = chinY - 4 * u;
  // the neck, in the chin's shadow for its first rows
  const neck = () => { lay(B, rectIn(nx - neckW, neckTop, 2 * neckW, sy + 2.5 * u - neckTop), skin, { shade: 1 }); lay(B, rectIn(nx - neckW, neckTop, 2 * neckW, chinY + 2.2 * u - neckTop), skin.dark, { rim: null }); };
  if (kind === 'vee') {
    // a robe: the neck shows in a V, edged with a band of trim
    const v = (wide) => (px, py) => body(px, py) && Math.abs(px - nx) <= wide * u - (py - sy) * 0.55;
    neck();
    lay(B, v(10.4), trim, { shade: 0 });
    lay(B, v(7), skin, { rim: null, shade: 0 });
    lay(B, both(v(7), (px, py) => py < chinY + 2.2 * u), skin.dark, { rim: null, shade: 0 });
    return;
  }
  if (kind === 'tabard') {
    // a tabard over mail: a panel down the chest with a border, open round the neck
    const half = 0.56 * W, hole = ellipseIn(nx, sy, 5.6 * u, 4.4 * u);
    const panel = (px, py) => body(px, py) && Math.abs(px - nx) <= half;
    lay(B, panel, trim, { shade: 0 });
    lay(B, both(panel, (px, py) => Math.abs(px - nx) <= half - 2 && !ellipseIn(nx, sy, 5.6 * u + 2, 4.4 * u + 2)(px, py)), ramp(o.panel ?? '#3f6fd1'), { rim: null, shade: 0 });
    lay(B, both(panel, hole), cloth.dark, { shade: 0 });
    neck();
    return;
  }
  if (kind === 'apron') {
    // a bib on the chest, hung from two straps
    const top = sy + 5 * u, half = 5.6 * u;
    neck();
    lay(B, both(body, any(capsuleIn(nx - half + 1, top, nx - 4.2 * u, sy - 1, 1.2 * u), capsuleIn(nx + half - 1, top, nx + 4.2 * u, sy - 1, 1.2 * u))), trim, { shade: 0 });
    lay(B, both(body, rectIn(nx - half, top, 2 * half, h)), trim);
    return;
  }
  if (kind === 'mantle') {
    // the band of a cape along the shoulders, pinned at the throat
    // (thinner when little of the shoulders is in the picture, so the cloth under it still shows)
    const deep = Math.min(3.3 * u, Math.max(1.6, (h - 2 - sy) * 0.42));
    const band = less(body, bodyIn(G, -deep));
    lay(B, any(band, both(body, polyIn([[nx - 5 * u, sy], [nx + 5 * u, sy], [nx + 0.5, sy + 2 * deep]]))), trim, { shade: 1 });
    neck();
    if (o.clasp) { const s = u >= 0.93 ? 3 : 2; lay(B, rectIn(Math.round(nx - s / 2 + 0.5), Math.round(sy + 0.8 * deep), s, s), o.clasp); }
    return;
  }
  neck();
  // a wide round collar, parted at the front
  if (kind === 'collar') for (const sg of [-1, 1]) lay(B, both(body, both(ellipseIn(nx, sy + 1.2 * u, 9 * u, 4.4 * u), (px) => (px - nx - 0.5) * sg > 0)), trim, { shade: 1 });
}

// What lies over the head and the body both: the wound part of a scarf.
function drawFront(C, G, person) {
  const { nx, sy, u } = G, o = person.outfit ?? {};
  if (o.collar !== 'scarf') return;
  const s = ramp(apart(o.trim ?? '#5a5f7a', o.colour));
  const y = sy + 0.6 * u, wrap = capsuleIn(nx - 6.4 * u, y, nx + 5.8 * u, y + 0.5 * u, 3 * u, 2.7 * u);
  lay(C, wrap, s, { shade: 1 });
  lay(C, both(wrap, capsuleIn(nx - 4.5 * u, y + 0.2 * u, nx + 3.5 * u, y + 1 * u, 0.5)), s.dark, { rim: null, shade: 0 });      // a fold
}

// ---- the head ------------------------------------------------------------------------------

function drawHead(H, G, person, mood, mouth) {
  const { u, R, ry, cx, cy, eyeW, eyeH, eyeTop, nearX, farX, faceX, browY, mouthY, chinY, gear, style, tip, slide } = G;
  // every shape of the head goes through T, which tips it for `hurt`; features are moved by slide()
  const T = (test) => (tip ? (px, py) => test(px + tip * (chinY - py), py) : test);
  const put = (inside, paint, o) => lay(H, T(inside), paint, o);
  const px = (x, y, w, h, c) => H.rect(x - slide(y + h / 2), y, w, h, c);
  const skin = ramp(person.skin), skull = skullIn(G);
  const hairC = person.hair?.colour ?? '#9a6a3e', hair = ramp(hairC), hairRim = softRim(hairC, person.skin);
  const hatted = gear !== 'none', hooded = gear === 'hood';
  const hg = person.headgear ?? {};
  const a = (x) => (x - cx) / R;                               // -1 at the back of the head, 1 at the front
  const rimY = browY - 2;                                      // headgear comes down to here: its ink line, then a row of skin (or a bushy brow), then the brows

  // -- behind the skull --
  if (!hooded) {
    if (style === 'long') put(both(any(capsuleIn(cx - 0.8 * R, cy - 0.3 * R, cx - 0.92 * R, cy + 1.3 * R, 0.34 * R, 0.2 * R), capsuleIn(cx + 0.92 * R, cy, cx + 0.98 * R, cy + 1.1 * R, 0.2 * R, 0.12 * R)), (qx, qy) => !hatted || qy >= rimY - 1), hair, { shade: 1 });
    if (style === 'ponytail') put(any(capsuleIn(cx - R + 1, cy - 0.15 * R, cx - 1.32 * R, cy + 0.25 * R, 0.24 * R), capsuleIn(cx - 1.32 * R, cy + 0.25 * R, cx - 1.2 * R, cy + 0.95 * R, 0.24 * R, 0.1 * R)), hair);
    if (style === 'pigtails') for (const sg of [-1, 1]) put(ellipseIn(cx + sg * (R + 1.5 * u), cy + 0.55 * R, 0.26 * R, 0.4 * R), hair);
  }
  if (gear === 'turban') put(capsuleIn(cx - R - 0.5 * u, rimY - 3 * u, cx - R - 2 * u, rimY + 3.5 * u, 1.8 * u, 1.2 * u), ramp(hg.colour ?? '#c8553a'));
  if (hooded) {
    // the cowl of a hood, round the neck
    put(capsuleIn(cx - 0.72 * R, cy + 0.82 * R, cx + 0.74 * R, cy + 0.9 * R, 0.42 * R), ramp(hg.colour ?? '#2f8f9d'), { shade: 2 });
  }

  // -- the ear on the near side, then the skull --
  const earShows = !hooded && gear !== 'helmet' && !['long', 'bowl', 'pigtails'].includes(style);
  if (earShows) {
    put(ellipseIn(cx - R + 0.4 * u, cy + 0.3 * R, 2 * u, 2.9 * u), skin, { shade: 1 });
  }
  put(skull, skin, { shade: G.age.shade });

  // -- hair on the head --
  if (!hooded && style !== 'bald') {
    const capIn = skullIn(G, 1.6 * u), side = cy + 0.34 * R;
    if (style === 'balding') {
      put(any(ellipseIn(cx - R + 0.6 * u, cy + 0.02 * R, 3.3 * u, 4.6 * u), ellipseIn(cx + R - 0.2 * u, cy + 0.05 * R, 1.9 * u, 3.6 * u)), hair, { rim: hairRim });
    } else {
      const bowl = style === 'bowl' || style === 'pigtails';
      const line = (qx) => {
        const k = a(qx);
        if (bowl) return k < -0.62 ? cy + 0.55 * R : k > 0.84 ? cy + 0.42 * R : browY - 0.5;
        if (k < -0.56) return side;                                           // the side of the head, down to the ear
        if (k > 0.8) return side - 1.5 * u;                                    // the far temple
        return browY - 1.5 - Math.max(0, Math.round((k + 0.2) * 3.2));          // a fringe swept up towards the far side
      };
      const grown = bowl ? skullIn(G, 2.2 * u) : capIn;
      put((qx, qy) => qy < line(qx) && (skull(qx, qy) || (grown(qx, qy) && (bowl || qy < cy - 0.25 * R || qx < cx - 0.5 * R))), hair, { rim: hairRim, shade: hatted ? 0 : 2 });
      if (style === 'spiky' && !hatted) {
        const top = cy - ry;
        for (const i of [-2, -1, 0, 1, 2]) put(polyIn([[cx + i * 4.4 * u - 2.6 * u, top + 2.5 * u], [cx + i * 4.4 * u + 2.6 * u, top + 2.5 * u], [cx + i * 5.2 * u + 1.5 * u, top - (3.4 - Math.abs(i) * 0.7) * u]]), hair, { rim: null, shade: 0 });
      }
    }
  }

  // -- the beard --
  const bd = person.beard, beardKind = oneOf('beard', bd?.kind ?? 'none', FACE_BEARDS);
  let whisker = null;
  if (beardKind !== 'none') {
    const c = ramp(bd.colour ?? hairC), len = bd.length ?? 1, grown = skullIn(G, 1.3 * u);
    whisker = softRim(bd.colour ?? hairC, person.skin) ?? c.dark;
    const jaw = (qx, qy) => grown(qx, qy) && a(qx) > -0.8 && (qy >= mouthY - 1 || (qy >= eyeTop + eyeH && (a(qx) < -0.66 || a(qx) > 0.86)));
    const hang = beardKind === 'long'
      ? any(polyIn([[cx - 0.7 * R, chinY - 4 * u], [cx + 0.92 * R, chinY - 4 * u], [faceX + 2.6 * u, chinY + 8.4 * u * len], [faceX - 1.6 * u, chinY + 9.4 * u * len]]), ellipseIn(faceX + 0.5 * u, chinY + 8.6 * u * len, 2.3 * u, 2 * u))
      : ellipseIn(cx + 0.6 * u, chinY - 1.2 * u, 0.8 * R, 3.6 * u);
    put(any(jaw, hang), c, { rim: whisker, shade: 2 });
    // the moustache, one tone down where it lies on the beard
    put(any(capsuleIn(faceX - 0.4 * u, mouthY - 1.6, faceX - 5 * u, mouthY + 0.3, 1.5 * u, 0.9 * u), capsuleIn(faceX + 1.4 * u, mouthY - 1.6, faceX + 5.4 * u, mouthY + 0.3, 1.5 * u, 0.9 * u)), c, { rim: whisker, shade: 0 });
  }

  // -- the face: brows, eyes, nose, mouth --
  const white = '#ffffff';
  // brows are the hair's colour; when that is close to the skin's value they are a darker tone of it, or ink on dark skin
  const browC = Math.abs(brightness(hairC) - brightness(person.skin)) >= 0.3 ? hairC : brightness(person.skin) < 0.5 ? INK : tone(hairC, -1);
  const bushy = person.brows === 'bushy', browW = eyeW + 2;
  // brows: each is drawn column by column; `rise` is how far its inner end (towards the nose) is lifted
  const brow = (x0, inner, lift, tilt) => {
    for (let i = 0; i < browW; i++) {
      const k = inner > 0 ? i / (browW - 1) : 1 - i / (browW - 1);          // 0 at the outer end, 1 at the inner end
      const y = browY - lift - Math.round(tilt * (k - 0.5) * 2);
      px(x0 + i, y - (bushy ? 1 : 0), 1, bushy ? 2 : 1, browC);
    }
  };
  const BROW = { neutral: [0, 0], happy: [1, 0], worried: [0, 1], hurt: [-1, -1], angry: [-1, -1], surprised: [2, 0] }[mood];
  const lift = BROW[0] + (mouth === 2 ? 1 : 0);
  brow(nearX - 1, 1, lift, BROW[1]);
  brow(farX - 1, -1, lift, BROW[1]);

  // eyes: ink, looking to the right, with the white on the near side
  const eye = (x0, shut) => {
    const y0 = eyeTop + (mood === 'surprised' ? -1 : 0), hh = eyeH + (mood === 'surprised' ? 1 : 0);
    if (mood === 'happy') {                                                  // an arch
      px(x0, y0 + 2, 1, 1, INK); px(x0 + eyeW - 1, y0 + 2, 1, 1, INK); px(x0 + (eyeW > 2 ? 1 : 0), y0 + 1, eyeW > 2 ? eyeW - 2 : eyeW, 1, INK);
      return;
    }
    if (shut) {                                                              // screwed shut: a line with its outer end turned up
      px(x0 - 1, y0 + 2, eyeW + 1, 1, INK); px(x0 + eyeW - 1, y0 + 1, 1, 1, INK);
      return;
    }
    const top = mood === 'angry' || mood === 'hurt' ? 1 : 0;
    px(x0, y0 + top, eyeW, hh - top, INK);
    px(x0, y0 + top + 1, 1, Math.max(1, hh - top - 2), white);
    if (mood === 'surprised') px(x0 + eyeW - 1, y0 + 1, 1, 1, white);
  };
  eye(nearX, false);
  eye(farX, mood === 'hurt');

  const noseX = Math.floor(faceX) + 1, noseY = eyeTop + eyeH;
  if (G.age !== AGES.child) { px(noseX, noseY - 1, 1, 2, skin.dark); px(noseX - 1, noseY + 1, 2, 1, skin.dark); }
  else px(noseX, noseY, 1, 1, skin.dark);
  if (G.age === AGES.elder) {
    // two lines on the brow
    const y = browY - 3 - (bushy ? 1 : 0);
    px(Math.round(faceX) - 3, y, 5, 1, skin.dark); px(Math.round(faceX) - 2, y - 2, 4, 1, skin.dark);
  }
  if (G.age === AGES.child || mood === 'happy') {
    // warm cheeks
    px(nearX, eyeTop + eyeH + 1, 2, 1, skin.dark); px(farX + eyeW - 2, eyeTop + eyeH + 1, 2, 1, skin.dark);
  }

  const mx = Math.round(faceX - 0.5), my = mouthY;             // the mouth's middle column and its row
  if (mouth > 0) {
    const wide = mouth > 1 ? 2 : 1, deep = mouth > 1 ? 3 : 2;
    px(mx - wide, my, 2 * wide + 1, deep, INK);
    if (mouth > 1) px(mx - 1, my, 3, 1, white);
  } else if (mood === 'happy') {
    px(mx - 3, my - 1, 1, 1, INK); px(mx + 3, my - 1, 1, 1, INK);
    px(mx - 2, my, 5, 1, INK); px(mx - 1, my, 3, 1, white);
    px(mx - 1, my + 1, 3, 1, INK);
  } else if (mood === 'worried') {
    px(mx - 1, my, 3, 1, INK); px(mx - 2, my + 1, 1, 1, INK); px(mx + 2, my + 1, 1, 1, INK);
  } else if (mood === 'hurt') {
    px(mx - 2, my - 1, 6, 3, INK); px(mx - 1, my, 4, 1, white);
  } else if (mood === 'angry') {
    px(mx - 2, my, 5, 1, INK); px(mx - 2, my + 1, 1, 1, INK); px(mx + 2, my + 1, 1, 1, INK);
  } else if (mood === 'surprised') {
    px(mx - 1, my - 1, 3, 3, INK);
  } else {
    px(mx - 1, my, 4, 1, INK);
  }

  // -- headgear --
  if (gear === 'helmet' || gear === 'kettle hat') {
    const m = ramp(hg.metal ?? '#c2c9d6'), steel = worn(hg.metal ?? '#c2c9d6'), shell = skullIn(G, 1.8 * u);
    const edge = (qx) => rimY + Math.round(3.4 * u * clamp01((-0.3 - a(qx)) / 0.45));      // lower at the back of the head
    const dome = (qx, qy) => shell(qx, qy) && qy < edge(qx);
    // the plume: a crest that rises from the crown and sweeps back
    if (gear === 'helmet' && hg.plume) { const top = cy - ry; put(any(ellipseIn(cx + 1 * u, top - 3 * u, 3.2 * u, 3.4 * u), ellipseIn(cx - 3.2 * u, top - 3.2 * u, 3 * u, 2.9 * u), ellipseIn(cx - 6.8 * u, top - 1.4 * u, 2.4 * u, 2.3 * u), capsuleIn(cx - 6.8 * u, top - 1.4 * u, cx - 10 * u, top + 2 * u, 1.8 * u, 0.9 * u), rectIn(cx - 1.5 * u, top - 3 * u, 5 * u, 5 * u)), hg.plume); }
    put(dome, steel, { shade: 2, light: 1 });
    // the rim, a tone lighter and a pixel wider than the dome
    const wide = skullIn(G, 2.8 * u);
    put((qx, qy) => wide(qx, qy) && qy < edge(qx) && qy >= edge(qx) - 2.2, m.base, { shade: 0 });
    if (gear === 'helmet') px(Math.floor(faceX), rimY, 2, Math.round(3 * u), steel.base);        // the nose guard
    else put(ellipseIn(cx + 0.5 * u, rimY - 1.2 * u, R + 4.2 * u, 2.3 * u), { isRamp: true, light: m.base, base: m.base, dark: steel.base }, { shade: 1 });
  }
  if (gear === 'hat-pointed' || gear === 'hat-wide') {
    const c = ramp(hg.colour ?? '#7a4fc4'), by = rimY - 2.8 * u;          // the middle of the brim
    const crown = gear === 'hat-pointed'
      ? any(both(skullIn(G, 1.8 * u), (qx, qy) => qy < by), polyIn([[cx - R + 1 * u, by - 2 * u], [cx + R - 1 * u, by - 2 * u], [cx + 3.6 * u, by - 9.5 * u], [cx - 0.5 * u, by - 10.5 * u]]), capsuleIn(cx + 1.4 * u, by - 9.6 * u, cx + 8 * u, by - 12.4 * u, 2.5 * u, 1 * u))
      : both(ellipseIn(cx, by, R - 0.5 * u, 7.5 * u), (qx, qy) => qy < by);
    put(crown, c, { shade: 2 });
    if (hg.band) put(both(crown, (qx, qy) => qy >= by - 5.6 * u && qy < by - 2.6 * u), ramp(hg.band), { rim: null, shade: 0 });
    put(ellipseIn(cx + 0.3 * u, by, R + 5.6 * u, 2.9 * u), c, { shade: 1 });
  }
  if (gear === 'hood') {
    const c = ramp(hg.colour ?? '#2f8f9d');
    const out = any(skullIn(G, 2.7 * u), ellipseIn(cx - 3 * u, cy - ry - 0.6 * u, 6 * u, 3.4 * u));
    const open = (dx, dy) => ellipseIn(cx + (1.7 + dx) * u, cy + (2.4 + dy) * u, 0.8 * R, 0.96 * R);
    put(less(out, open(0, 0)), c, { shade: 2 });
    put(both(skull, less(open(0, 0), open(1.3, 1.5))), c.dark, { rim: null, shade: 0 });         // the shadow inside the hood
  }
  if (gear === 'turban') {
    const c = ramp(hg.colour ?? '#c8553a'), shell = skullIn(G, 1.2 * u);
    const body = (qx, qy) => qy < rimY && (shell(qx, qy) || ellipseIn(cx - 0.3 * u, rimY - 6.2 * u, R + 2.6 * u, 8.6 * u)(qx, qy));
    put(body, c, { shade: 2 });
    // the folds, wound round a knot over the brow
    const kx = faceX + 1, ky = rimY - 1;
    const fold = (qx, qy) => { const v = Math.hypot((qx - kx) / 1.5, qy - ky); return Math.abs(v - 4.2 * u) < 0.55 || Math.abs(v - 8 * u) < 0.55; };
    put((qx, qy) => fold(qx, qy) && body(qx, qy) && body(qx, qy - 1) && body(qx - 1, qy) && body(qx + 1, qy) && body(qx, qy + 1), c.dark, { rim: null, shade: 0 });
    if (hg.jewel) { const s = u >= 0.93 ? 3 : 2; H.rect(Math.round(kx - s / 2) - slide(rimY - 4), Math.round(rimY - 1 - s - u), s, s, hg.jewel); }
  }
  if (gear === 'cap') {
    const c = ramp(hg.colour ?? '#c8553a'), shell = skullIn(G, 1.4 * u);
    put((qx, qy) => shell(qx, qy) && qy < rimY - 1, c, { shade: 2 });
    put(ellipseIn(cx + 0.72 * R, rimY - 1.4, 0.62 * R, 1.7 * u), ramp(c.dark), { shade: 0 });
  }

  // -- spectacles --
  if (person.spectacles) {
    const wire = person.spectacles.frame ?? '#5a5f7a', lens = person.spectacles.lens ?? '#f0ead8';
    const nearC = nearX + eyeW / 2, farC = farX + eyeW / 2, ey = eyeTop + eyeH / 2;
    const r = Math.min(Math.max(3, 3.7 * u), (farC - nearC) / 2 - 0.6);            // the two glasses never overlap
    const ring = (ex) => (qx, qy) => Math.abs(Math.hypot(qx - ex, qy - ey) - r) < 0.62;
    put(any(ring(nearC), ring(farC), rectIn(nearC + r, ey - 1, farC - nearC - 2 * r, 1), both(skull, rectIn(0, ey - 1, nearC - r, 1))), wire, { rim: null, shade: 0 });
    px(Math.round(nearC - r) + 1, Math.round(ey - 2), 1, 1, lens); px(Math.round(farC - r) + 1, Math.round(ey - 2), 1, 1, lens);
  }

  // -- a drop of sweat --
  if (mood === 'worried') {
    const x = Math.round(cx + 0.62 * R), y = Math.round(cy - 0.62 * R);
    put(any(rectIn(x, y + 1, 2, 3), rectIn(x + 1, y, 1, 1)), '#ffffff', { shade: 0 });
  }
}

// ---- the whole portrait --------------------------------------------------------------------

/**
 * Draws a person's head and shoulders on a Surface, with no outline and no frame: the three-quarter bust that portrait() cuts, inks and frames.
 * Arguments: g: the Surface (its size is the picture's size); person: who it is, as data (see the top of this file: skin, age, build, neck, hair, brows, beard, headgear, spectacles, outfit, carried);
 * options { mood (one of FACE_MOODS, default 'neutral'), mouth (0 closed, 1 half open, 2 open: talking; default 0), zoom (0..1, head and shoulders to a close face; default 0.5) }.
 */
export function faceBust(g, person, { mood = 'neutral', mouth = 0, zoom = 0.5 } = {}) {
  if (!person || !person.skin) throw new Error('faceBust: a person needs at least a skin colour');
  oneOf('mood', mood, FACE_MOODS);
  const G = layout(person, zoom, g.w, g.h, mood);
  const B = new Surface(g.w, g.h), H = new Surface(g.w, g.h);
  drawBody(B, G, person);
  drawHead(H, G, person, mood, Math.max(0, Math.min(2, Math.round(mouth))));
  pasteOver(B, H);
  drawFront(B, G, person);
  g.blit(B);
  return g;
}

/**
 * Draws the border and backing of a portrait and says where the face may go: a round medallion or a square plate with the interface border (ink, a flat 2 px band, ink, the backing).
 * Arguments: g: the Surface; kind: one of PORTRAIT_FRAMES; options { backing (the colour behind the head), band (the colour of the border) }.
 * Returns a shape test (px, py) of the backing, or null for 'none' (which draws nothing).
 */
export function portraitFrame(g, kind, { backing = '#4a609c', band = '#f0ead8' } = {}) {
  oneOf('frame', kind, PORTRAIT_FRAMES);
  if (kind === 'none') return null;
  const w = g.w, h = g.h;
  const shape = kind === 'round'
    ? (inset) => ellipseIn(w / 2, h / 2, w / 2 - inset, h / 2 - inset)
    : (inset) => roundRectIn(inset, inset, w - 2 * inset, h - 2 * inset, Math.max(0, 3 - inset));
  g.fill(0, 0, w, h, shape(1), INK);
  g.fill(0, 0, w, h, shape(2), band);
  g.fill(0, 0, w, h, shape(4), INK);
  g.fill(0, 0, w, h, shape(5), backing);
  return shape(5);
}

/**
 * Draws one whole portrait: the frame and backing, then the person's head and shoulders cut to fit and inked all round.
 * Arguments: g: the Surface (48x48: PORTRAIT_SIZE); person: who it is, as data (see the top of this file);
 * options { mood (one of FACE_MOODS), mouth (0, 1 or 2: how far open, for a talk clip), zoom (0..1), frame (one of PORTRAIT_FRAMES, default 'none'), backing, band (colours of a frame's inside and border) }.
 */
export function portrait(g, person, { mood = 'neutral', mouth = 0, zoom = 0.5, frame = 'none', backing, band } = {}) {
  const win = portraitFrame(g, frame, { backing, band });
  const L = faceBust(new Surface(g.w, g.h), person, { mood, mouth, zoom });
  let C = masked(L, win ?? rectIn(2, 2, g.w - 4, g.h - 4));
  C.outline(INK);
  if (win) C = masked(C, win);
  g.blit(C);
  return g;
}
