// The words of a download (docs/architecture.md, Contract 8): how-to-use.txt next to every sprite sheet, and
// read-me.txt and licence.txt at the top of a package. Written for a game developer who has never seen Loadout:
// the text depends on what the asset is (a figure, a tileset, a background, an interface piece, a set of
// pictures ...) and says nothing that is false for that kind.
//
// Everything here is worked out from the sheet's JSON as engine/sheet-info.js describes it (its kind, its rows,
// its tile rules, its layers, its stretch borders and text areas), so the text and the JSON cannot disagree, and
// a new asset or a new bundle needs no change here. Rows and frames are counted from 0 everywhere, as in the JSON.
//
//   spriteGuide({ json, description, licence, pictures, style })   -> how-to-use.txt
//   packageGuide(manifest, themed)                                  -> read-me.txt (opens with the contents list)
//   licenceText(assets)                                             -> licence.txt
//   whatItIs(json)   soundWhatItIs(entry)   licenceWords(value)
//
// Pure text: no page, no canvas. tests/unit/download-guide.test.mjs runs it over every sprite in sprites/.
import { TILE_FAMILIES, LIQUID_FAMILY, AROUND, meetable } from '../engine/tile-rules.js';

const KIND_WORD = { sprite: 'sprite', sound: 'sound effect', music: 'music track' };
const WIDTH = 100;

/** Break a sentence into lines no wider than the page, each starting with `indent`. */
function wrap(text, indent = '  ', first = indent) {
  const out = [];
  let line = first;
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    if (line.trim() && line.length + 1 + word.length > WIDTH) { out.push(line); line = indent + word; }
    else line += (line.trim() && !line.endsWith(' ') ? ' ' : '') + word;
  }
  if (line.trim()) out.push(line);
  return out.join('\n');
}
const num = (v) => String(Math.round(v * 100000) / 100000);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const quoted = (items) => list(items.map((n) => `"${n}"`));

// ---- what an asset is, in a few words ------------------------------------------------------------------

/**
 * What a sprite is, in a few everyday words with no article ("tileset for a top-down game"): for a title and for a contents list.
 * Arguments: json (the sheet's JSON as describeSheet() made it: kind, view, animations).
 */
export function whatItIs(json) {
  const anims = Object.entries(json.animations ?? {});
  const view = json.view, n = anims.length;
  const directional = anims.some(([, a]) => a.direction && a.direction !== 'any');
  const seen = view === 'side' ? ', seen from the side' : view === 'top-down' ? ' for a top-down game' : '';
  switch (json.kind) {
    case 'character': case 'creature': return `${json.kind}${directional ? ' for a top-down game, drawn in three directions' : seen}`;
    case 'object': return `object${seen}`;
    case 'pickup': return 'pickup (something to collect)';
    case 'projectile': return `projectile (something shot or thrown)${view === 'top-down' ? ' for a top-down game' : ''}`;
    case 'effect': return 'effect (a short burst or loop)';
    case 'tileset': return `tileset${view === 'top-down' ? ' for a top-down game' : view === 'side' ? ' for a side-view game' : ''}`;
    case 'background': return `background in ${plural(n, 'layer')}`;
    case 'interface': return n === 1 ? 'interface piece' : 'interface pieces';
    case 'pictures': return n === 1 ? 'picture' : 'set of pictures';
    default: return anims.every(([, a]) => a.frames === 1) ? 'picture' : 'animated picture';
  }
}

/**
 * What a sound or a track is, in a few everyday words ("sound effect", "music track that repeats").
 * Arguments: entry ({ kind: 'sound' | 'music', type, loop }).
 */
export function soundWhatItIs(entry) {
  if (entry.kind === 'music' || entry.type === 'music') return 'music track that repeats';
  if (entry.type === 'jingle') return 'short tune';
  if (entry.type === 'ambience' || entry.loop) return 'background sound that repeats';
  return KIND_WORD.sound;
}

// ---- the licence -------------------------------------------------------------------------------------------

/**
 * What a recorded licence value means, in one or two sentences, without inventing any terms: "draft" is said to be undecided, any other value is named and not explained.
 * Arguments: value (the asset's recorded `license`, or nothing when it records none).
 */
export function licenceWords(value) {
  if (value === undefined || value === null || value === '') return 'No licence value is recorded for it, so this download gives no terms of use. Check with the people who run Loadout before you publish anything made with it.';
  if (value === 'draft') return 'The terms for using it have not been decided yet, so this download gives none. Check with the people who run Loadout before you publish anything made with it.';
  return `This download does not spell out what "${value}" allows. Look it up where you got the asset.`;
}

/**
 * licence.txt of a package: every asset with where it is and the licence value it records, then what each value means. It lists what is recorded and adds nothing.
 * Arguments: assets (the manifest's entries: { name, folder or files, license }).
 */
export function licenceText(assets) {
  const where = (a) => a.folder ?? a.files?.[0] ?? '';
  const rows = [...assets].sort(byName);
  const w1 = Math.max(4, ...rows.map((a) => a.name.length)) + 2, w2 = Math.max(5, ...rows.map((a) => where(a).length)) + 2;
  const values = [...new Set(rows.map((a) => a.license ?? null))];
  return `Licence

Every asset in Loadout records a licence value. This file lists what each asset in this package
records, exactly as recorded. Nothing has been added.

  ${'Name'.padEnd(w1)}${'Where'.padEnd(w2)}Licence value
${rows.map((a) => `  ${a.name.padEnd(w1)}${where(a).padEnd(w2)}${a.license ?? 'no licence value recorded'}`).join('\n')}

What the values mean
${values.map((v) => wrap(licenceWords(v), '      ', `  ${v === null ? 'no value:' : `"${v}":`} `)).join('\n')}
`;
}

const byName = (a, b) => { const x = a.name.toLowerCase(), y = b.name.toLowerCase(); return x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0; };

// ---- how-to-use.txt: the parts every kind shares ----------------------------------------------------------

const DEFAULT_LABEL = (name) => name[0].toUpperCase() + name.slice(1);
/** A row's everyday name, when it says more than the row's own name does. */
function labelOf(name, a) {
  const l = a.label;
  if (typeof l !== 'string' || !l) return '';
  const flat = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return l === DEFAULT_LABEL(name) || flat(l) === flat(name) ? '' : l;
}
const speed = (a) => (a.frames === 1 ? 'one still picture' : `${a.frames} frames, ${a.fps} per second, ${a.loop ? 'repeats' : 'plays once'}`);
const rowsOf = (json) => Object.entries(json.animations).map(([name, a]) => ({ name, ...a }));
const padName = (rows) => Math.max(...rows.map((r) => r.name.length)) + 2;
const padRow = (rows) => String(Math.max(...rows.map((r) => r.row ?? 0))).length;
const rowAt = (r, wRow, wName) => `row ${String(r.row).padEnd(wRow)}  ${r.name.padEnd(wName)}`;

function counting(json, sheet) {
  return `How things are counted
${wrap(`Rows and frames are counted from 0, here and in ${json.sprite}.json: ${sheet ? 'row 0 is the top row of the picture and frame 0 is the leftmost picture in a row' : 'frame 0 is the first picture of an animation'}. Positions are in pixels, measured from the top left corner.`)}`;
}

function licenceSection(value) {
  return `Licence
${wrap(value === undefined || value === null || value === '' ? licenceWords(value) : `This asset records the licence value "${value}". ${licenceWords(value)}`)}`;
}

const SOCKET_WORDS = { tip: 'the exact spot a pointer or crosshair points at', muzzle: 'where a shot and its flash appear', hand: 'where a held thing goes', offhand: 'where a thing held in the other hand goes', head: 'where something worn on the head goes', back: 'where something carried on the back goes', feet: 'where it touches the floor', tail: 'the end of its tail', icon: 'the middle of the space for an icon', text: 'the top left corner of the space for text' };

/** The named points a sheet carries on its frames, with what the well-known ones are for; empty when it has none. */
function socketLines(json) {
  const names = [...new Set((json.frames ?? []).flatMap((f) => Object.keys(f.sockets ?? {})))];
  if (!names.length) return [];
  const known = names.filter((n) => SOCKET_WORDS[n]).map((n) => `"${n}" is ${SOCKET_WORDS[n]}`);
  return [wrap(`Named points: every frame's entry in ${json.sprite}.json has "sockets" with ${names.length === 1 ? 'the point' : 'the points'} ${quoted(names)}, as x and y inside the frame.${known.length ? ` ${known.join('; ')}.` : ''}`)];
}

// What a row of each kind of sheet is called in a sentence about its sound.
const ROW_NOUN = { tileset: 'tile', background: 'layer', interface: 'row', pictures: 'row' };
// The event that puts a button into a state, as each engine names it: where the sound of a state that is one still picture is played from.
const STATE_EVENTS = {
  pressed: { unity: 'Pointer Down', godot: 'button_down' },
  hover: { unity: 'Pointer Enter (and Select, for a gamepad or the keyboard)', godot: 'mouse_entered (and focus_entered, for a gamepad or the keyboard)' },
};

/**
 * The Sounds section: every sound with when it plays, said for the row it belongs to. A row that moves plays its sound on a frame;
 * a row that is one still picture (a button's state) has no frame to wait for, so its sound plays when that row starts being shown;
 * a sound that repeats runs for as long as its row is shown. The engine steps are only the ones those cases need.
 */
function soundSection(json) {
  const cues = Object.entries(json.sounds ?? {}).flatMap(([name, list]) => list.map((c) => ({ ...c, name, still: json.animations?.[name]?.frames === 1 })));
  if (!cues.length) return '';
  const ui = json.kind === 'interface', noun = ROW_NOUN[json.kind] ?? 'animation';
  const timed = cues.filter((c) => !c.loop && !c.still), stills = cues.filter((c) => !c.loop && c.still), loops = cues.filter((c) => c.loop);
  const when = (c) => (c.loop ? `repeats for as long as ${c.still || noun !== 'animation' ? `"${c.name}" is shown` : 'the animation plays'}`
    : c.still ? `plays once, when ${ui ? 'the piece changes to' : 'you start showing'} "${c.name}"`
      : `starts on frame ${c.frame} (${c.timeMs} ms in)`);
  const starts = `its ${noun} starts ${noun === 'animation' ? 'playing' : 'being shown'}`;
  const rows = cues.map((c) => `  ${c.name}: ${c.file} ${when(c)}${c.volume !== 1 ? `, volume ${Math.round(c.volume * 100)}%` : ''}`);
  const cases = [timed, stills, loops].filter((l) => l.length).length;
  const intro = [
    timed.length ? (cases === 1 ? `Play each sound when its ${noun} reaches the frame listed here.` : `A sound listed with a frame starts when its ${noun} reaches that frame.`) : '',
    stills.length ? `A row that is one still picture has nothing to wait for: its sound plays at the moment ${ui ? 'the piece changes to that row' : 'you start showing that row'}.` : '',
    loops.length ? `A sound that repeats is started when ${starts} and stopped when it ends.` : '',
    `The same list is in ${json.sprite}.json under "sounds".`,
  ].filter(Boolean).join(' ');
  // for each engine, one short paragraph for each case there is
  const names = [...new Set(stills.map((c) => c.name))];
  const events = (engine) => (ui ? names.filter((n) => STATE_EVENTS[n]).map((n) => `${STATE_EVENTS[n][engine]} for "${n}"`).join('; ') : '');
  const plain = names.filter((n) => !STATE_EVENTS[n]);
  const own = plain.length ? ` For ${quoted(plain)}, play the sound from your own script where you switch to that row.` : '';
  const scripted = noun === 'tile';                                   // a tile that moves is not an Animation Clip: there is no event to hang a sound on
  const ON_FRAME = 'a sound on a frame', STILL = 'a sound of a still row', REPEATS = 'a sound that repeats';
  const unity = [
    timed.length ? [ON_FRAME, scripted ? 'play the file from your own script when the tile shows that frame.' : 'add an Animation Event on that frame of the Animation Clip that calls AudioSource.PlayOneShot with that sound.'] : null,
    stills.length ? [STILL, events('unity') ? `on a Button, add an Event Trigger component with one entry for each state, and have each call AudioSource.PlayOneShot with its sound: ${events('unity')}. (The Button's own On Click () fires only when the press is let go.)${own}` : 'call AudioSource.PlayOneShot with the sound from the script that switches to that row.'] : null,
    loops.length ? [REPEATS, `put it on an Audio Source with Loop ticked; call Play() when ${starts} and Stop() when it ends.`] : null,
  ];
  const godot = [
    timed.length ? [ON_FRAME, scripted ? 'play the file from your own script when the tile shows that frame.' : 'add an audio track to an AnimationPlayer, or call play() on an AudioStreamPlayer when the frame changes.'] : null,
    stills.length ? [STILL, events('godot') ? `connect the button's signals to a function that calls play() on an AudioStreamPlayer with the sound: ${events('godot')}. (Its "pressed" signal fires only when the press is let go.)${own}` : 'call play() on an AudioStreamPlayer from the script that switches to that row.'] : null,
    loops.length ? [REPEATS, `select the WAV file, set Loop Mode to Forward in the Import tab and press Reimport; call play() on an AudioStreamPlayer when ${starts} and stop() when it ends.`] : null,
  ];
  const web = [
    timed.length ? [ON_FRAME, `play the file when your ${noun === 'animation' ? 'animation ' : ''}code switches to that frame.`] : null,
    stills.length ? [STILL, `play the file where your code switches to that row${events('unity') ? ' (the handler of the pointer event)' : ''}.`] : null,
    loops.length ? [REPEATS, `play the file with looping on when ${starts}, and stop it when it ends.`] : null,
  ];
  const para = (engine, list) => list.filter(Boolean).map(([label, text]) => wrap(text, '    ', cases > 1 ? `  ${engine}, ${label}: ` : `  ${engine}: `)).join('\n');
  return `
Sounds
${wrap(intro)}
${rows.join('\n')}
${para('Unity', unity)}
${para('Godot', godot)}
${para('Web', web)}
`;
}

const SHARP = `Keep pixel art sharp: always turn smoothing or filtering off, and scale by whole numbers (2x, 3x, 4x).
These steps are written from how the engines are known to work. They have not been tried out in the
engines themselves, so check them as you go: a menu may be named a little differently in your version.`;

const unityImport = (json, mode = 'Multiple', extra = '') => `Drag ${json.image} into your project's Assets folder. Select it and set in the Inspector: Texture Type: Sprite (2D and UI), Sprite Mode: ${mode}, ${extra}Filter Mode: Point (no filter), Compression: None. Press Apply.`;
const GODOT_SHARP = 'Keep it sharp: set Texture > Filter to Nearest on the node, or Project Settings > Rendering > Textures > Default Texture Filter to Nearest for the whole game.';
const grid = (json) => { const rows = rowsOf(json); return { cols: Math.max(...rows.map((r) => r.frames)), rows: rows.length }; };
/** How Unity names what it cuts out of the sheet, and how that maps to the rows. */
function unityNames(json) {
  const { cols } = grid(json), id = json.sprite;
  return cols === 1
    ? `Unity names the cut-out pictures ${id}_0, ${id}_1 and so on from the top: ${id}_0 is row 0.`
    : `Unity names the cut-out pictures ${id}_0, ${id}_1 and so on, from the top row down and left to right, leaving out empty cells. The "frames" list in ${id}.json is in the same order: its entry 0 is ${id}_0.`;
}
/** The number a web engine gives the picture of a row and a frame. */
const frameNumber = (json) => (grid(json).cols === 1 ? 'The picture of a row has the row\'s number.' : `The picture of a row and a frame has the number row x ${grid(json).cols} + frame.`);
const steps = (lines) => lines.map((l, i) => wrap(l, '     ', `  ${i + 1}. `)).join('\n');

// ---- figures, objects, pickups, projectiles, effects --------------------------------------------------------

function animatedGuide(json) {
  const rows = rowsOf(json), wN = padName(rows), wR = padRow(rows);
  const kind = json.kind, view = json.view;
  const has = (n) => !!json.animations[n];
  const still = rows.every((r) => r.frames === 1);
  const one = rows.length === 1 && still;
  const directional = rows.some((r) => r.direction && r.direction !== 'any');
  const fw = json.frameWidth, fh = json.frameHeight, px = json.pivot.x, py = json.pivot.y;
  const notes = [];

  // which way it faces
  if (directional) {
    const plainRows = rows.filter((r) => r.direction === 'any').map((r) => r.name);
    notes.push(`Directions: the end of an animation's name says which way it faces. "_down" faces the camera, "_up" faces away from it and "_side" faces right. Mirror the "_side" animations to face left.${plainRows.length ? ` An animation with no direction in its name (${list(plainRows)}) is drawn facing the camera and is used for every direction.` : ''}`);
  } else if (json.facing === 'right' && (kind === 'character' || kind === 'creature')) notes.push('It is drawn facing right. Flip it in your game to face left.');
  else if (json.facing === 'right' && kind === 'projectile') notes.push(view === 'top-down' ? 'It is drawn flying to the right. Turn it to the direction it flies.' : 'It is drawn flying to the right. Flip it to fly left, or turn it to the direction it flies.');
  // an effect may show a direction (a slash, a trail) or none (a ring of light, a bolt from above), and nothing records which: only ever "if"
  else if (view === 'side' && kind === 'effect') notes.push('If it shows a direction (a slash, dust kicked up behind a runner), it is drawn for an action that points to the right: flip it when the action points left. An effect that shows no direction (a ring of light, a bolt from above) is used as it is.');
  else if (view === 'top-down' && kind === 'effect') notes.push('If it shows a direction (a flash from a gun, a trail), it is drawn pointing to the right: turn it to match the action. An effect that shows no direction (a burst, a ring) is used as it is.');
  else if (view === 'top-down' && (kind === 'character' || kind === 'creature')) notes.push('It looks the same whichever way it moves, so one set of animations serves every direction.');

  // where it is
  if (json.grounded) notes.push(`The point where it stands on the ground is ${px}, ${py} inside each frame. Put that point where it stands in your game.`);
  else notes.push(`Its anchor point is ${px}, ${py} inside each frame (it does not rest on a floor). Put that point where the thing is in your game.`);

  // how its rows are used
  if (kind === 'object' && !still) notes.push('A row that repeats, or that is one still picture, is a state the object stays in. A row that plays once is a change (opening, breaking): play it once, then keep showing its last frame, or go to the row of the state it leads to.');
  if (kind === 'pickup') {
    const wait = rows.find((r) => r.loop);
    notes.push(`${wait ? `Show "${wait.name}" while it waits to be collected.` : ''}${has('collect') ? ' Play "collect" once when it is picked up, then remove it.' : ''}`.trim());
  }
  if (kind === 'projectile') notes.push(`${has('fly') ? 'Show "fly" while it travels.' : ''}${has('hit') ? ' Play "hit" once where it lands, then remove it.' : ''}`.trim());
  if (kind === 'effect') notes.push('Play a row that plays once from its first frame to its last, then remove the effect. Keep a row that repeats for as long as you need it.');
  if ((kind === 'character' || kind === 'creature') && has('die')) notes.push('After "die", keep showing its last frame.');
  notes.push(...socketLines(json).map((l) => l.trim()));

  const sheet = one
    ? `The picture
  One picture, ${fw} x ${fh} pixels. There is no animation.`
    : `The sheet
${wrap(`Each frame is ${fw} x ${fh} pixels. ${kind === 'object' ? (still ? 'Each row is one still picture of a state of the object. There is no animation.' : 'Each row is one state of the object, or one change from a state to the next; its frames run from left to right.') : (still ? 'Each row is one still picture. There is no animation.' : 'Each row is one animation; its frames run from left to right.')}`)}
${rows.map((r) => `  ${rowAt(r, wR, wN)}${labelOf(r.name, r) ? `${labelOf(r.name, r)}: ` : ''}${speed(r)}`).join('\n')}`;

  const { cols, rows: nRows } = grid(json);
  const aimed = kind === 'projectile' && view === 'top-down';      // turned to where it flies, never flipped
  const fx = kind === 'effect' && !directional ? view : null;      // an effect: steps only for the case that it shows a direction
  const flipU = fx === 'side' ? 'If it shows a direction: to make it point left, tick Flip X on the Sprite Renderer.' : fx === 'top-down' ? 'If it shows a direction: turn the object (its Rotation Z) to match the action.' : directional ? 'To face left with a "_side" animation, tick Flip X on the Sprite Renderer.' : aimed ? 'To aim it, turn the object (its Rotation Z) to the direction it flies.' : json.facing === 'right' ? `To ${kind === 'character' || kind === 'creature' ? 'face' : 'make it point'} left, tick Flip X on the Sprite Renderer.` : '';
  const flipG = fx === 'side' ? 'If it shows a direction: to make it point left, set the node\'s Scale x to -1 (it mirrors round that point).' : fx === 'top-down' ? 'If it shows a direction: set the node\'s Rotation to match the action.' : directional ? 'To face left with a "_side" animation, set the node\'s Scale x to -1 (it mirrors round that point).' : aimed ? 'To aim it, set the node\'s Rotation to the direction it flies.' : json.facing === 'right' ? `To ${kind === 'character' || kind === 'creature' ? 'face' : 'make it point'} left, set the node's Scale x to -1 (it mirrors round that point).` : '';
  const unity = one
    ? [`Drag ${json.image} into your project's Assets folder. Select it and set in the Inspector: Texture Type: Sprite (2D and UI), Sprite Mode: Single, Pivot: Custom, X ${num(px / fw)}, Y ${num(1 - py / fh)}, Filter Mode: Point (no filter), Compression: None. Press Apply. (Unity measures a custom pivot from the bottom left, as a share of the picture: these numbers are the point ${px}, ${py}.)`,
      'Drag it into the scene, or set it as the Sprite of a Sprite Renderer.']
    : [unityImport(json),
      `Open the Sprite Editor and choose Slice > Type: Grid By Cell Size, Pixel Size ${fw} x ${fh}, Pivot: Custom, X ${num(px / fw)}, Y ${num(1 - py / fh)}. Press Slice, then Apply. (Unity measures a custom pivot from the bottom left, as a share of the frame: these numbers are the point ${px}, ${py}.)`,
      unityNames(json),
      still ? 'Each cut-out picture is a sprite of its own: set the one you want as the Sprite of a Sprite Renderer, and swap it when the state changes.'
        : 'For each row that moves, select its frames and drag them into the scene: Unity makes an Animation Clip. In the Animation window set its Samples to the row\'s "per second" number, and on the Animation Clip switch Loop Time off for a row that plays once.',
      ...(flipU ? [flipU] : [])];
  const godot = one
    ? [`Add a Sprite2D and set its Texture to ${json.image}.`,
      `Untick Offset > Centered and set Offset to (-${px}, -${py}): the node's position is then the point ${px}, ${py}.`, GODOT_SHARP]
    : still
      ? [`Add a Sprite2D, set its Texture to ${json.image} and, under Animation, Hframes to ${cols} and Vframes to ${nRows}. Frame Coords picks the picture: x is the frame, y is the row.`,
        `Untick Offset > Centered and set Offset to (-${px}, -${py}): the node's position is then the point ${px}, ${py}.`, GODOT_SHARP]
      : ['Add an AnimatedSprite2D and give it a new SpriteFrames (Inspector > Sprite Frames > New SpriteFrames).',
        `In the SpriteFrames panel add one animation for each row, named as the row is. For each, press "Add frames from sprite sheet", pick ${json.image}, set Horizontal to ${cols} and Vertical to ${nRows}, and select that row's frames.`,
        'Set each animation\'s speed (FPS) to its "per second" number, and switch its loop button off for a row that plays once.',
        `In the Inspector untick Offset > Centered and set Offset to (-${px}, -${py}): the node's position is then the point ${px}, ${py}.`,
        ...(flipG ? [flipG] : []), GODOT_SHARP];

  return `${sheet}
${notes.filter(Boolean).map((n) => wrap(n)).join('\n')}
${soundSection(json)}
Unity
${steps(unity.filter(Boolean))}

Godot 4
${steps(godot)}
${one ? '' : `
Phaser and other web engines
${wrap(`Load it as a sprite sheet with frameWidth ${fw} and frameHeight ${fh}. ${frameNumber(json)}`)}
`}`;
}

// ---- tilesets ------------------------------------------------------------------------------------------------

const SIDE_WORDS = { up: 'above', upRight: 'above right', right: 'right', downRight: 'below right', down: 'below', downLeft: 'below left', left: 'left', upLeft: 'above left' };
const PLACE_WORDS = {
  on: 'put it over a middle tile of the group, here and there',
  above: 'put it in the empty cell above a top tile of the group, standing on it',
  below: 'put it in the empty cell under a bottom tile of the group, hanging from it',
  face: 'put it over a tile that shows the wall\'s front',
  rim: 'put it over a tile that has the group\'s top edge, hanging from it',
};

/** What a rule asks of the cells round a tile, in words: "needs path on every side", "needs path: right, below, left; no path: above". */
function needsWords(group, needs) {
  const yes = Object.keys(SIDE_WORDS).filter((k) => needs[k] === true), no = Object.keys(SIDE_WORDS).filter((k) => needs[k] === false);
  if (!yes.length && !no.length) return 'anywhere';
  if (yes.length === 8) return `needs ${group} on every side`;
  const sides = ['up', 'right', 'down', 'left'], corners = Object.keys(SIDE_WORDS).filter((k) => !sides.includes(k));
  if (sides.every((k) => needs[k] === true)) {
    const also = corners.filter((k) => needs[k] === true), cut = corners.filter((k) => needs[k] === false);
    return `needs ${group} on all four sides${also.length ? ` and ${also.map((k) => SIDE_WORDS[k]).join(', ')}` : ''}${cut.length ? `; no ${group}: ${cut.map((k) => SIDE_WORDS[k]).join(', ')}` : ''}`;
  }
  if (!yes.length && no.length === 4 && sides.every((k) => needs[k] === false)) return `no ${group} on any of its four sides`;
  return [yes.length ? `needs ${group}: ${yes.map((k) => SIDE_WORDS[k]).join(', ')}` : '', no.length ? `no ${group}: ${no.map((k) => SIDE_WORDS[k]).join(', ')}` : ''].filter(Boolean).join('; ');
}

/** Which of the eight cells round a tile hold its group, in words, for a complete arrangement: "all eight", "none", "all but above left", or the cells by name. */
function cellsWords(around) {
  const keys = Object.keys(SIDE_WORDS), on = keys.filter((k) => around[k]), off = keys.filter((k) => !around[k]);
  if (!off.length) return 'all eight';
  if (!on.length) return 'none';
  return off.length <= 2 ? `all but ${off.map((k) => SIDE_WORDS[k]).join(', ')}` : on.map((k) => SIDE_WORDS[k]).join(', ');
}

/**
 * The layers a tileset's map is built in, from the bottom up, in words; empty when no tile lies over another.
 * A grid of tiles holds one tile in a cell, so a base laid under everything, and decorations put over a tile, each need a layer of their own.
 */
function tileLayers(T, view, gname) {
  const floors = T.groups.filter((g) => g.kind === 'floor'), rest = T.groups.filter((g) => g.kind !== 'floor');
  const decos = T.groups.flatMap((g) => g.decorations);
  const over = (floors.length && rest.length) || decos.some((d) => ['on', 'face', 'rim'].includes(d.place));
  if (!over) return [];
  const layers = [];
  if (floors.length) layers.push(`${view === 'top-down' ? 'the base ground' : 'the wall behind the action'} (${list(floors.map(gname))})`);
  if (rest.length) layers.push(`${floors.length ? (view === 'top-down' ? 'what is laid over it' : 'what stands in front of it') : 'the tiles themselves'} (${list(rest.map(gname))})`);
  if (decos.length) layers.push('the decorations');
  return layers.length > 1 ? layers : [];
}

function groupHeading(g, view) {
  const blocks = g.solid ? 'It blocks the way.' : 'It does not block the way.';
  if (g.kind === 'floor' && view !== 'top-down') return `Group "${g.name}": a wall behind the action. Lay it behind the other tiles, wherever you want one. ${blocks}`;
  if (g.kind === 'floor') return `Group "${g.name}": the base ground. Lay it in every cell, under everything else. ${blocks}`;
  if (g.kind === 'liquid') return `Group "${g.name}": a liquid. Its sides and its bed are whatever holds it. ${blocks}`;
  if (g.kind === 'platform') return `Group "${g.name}": a thin platform, one tile high, drawn in the top part of its tile (the rest of the tile is see-through). It is stood on from above only: something lands on it from above and passes up through it from below. A row of it is as long as you like.`;
  if (g.kind === 'slope') return `Group "${g.name}": slopes, one tile wide and one tile high.${g.solid ? ' The part under its line is solid: something walks up or down the line.' : ''}`;
  if (g.kind === 'stack') return `Group "${g.name}": something that repeats up and down. It is as tall as you like. ${blocks}`;
  if (g.use === 'wall') return `Group "${g.name}": a wall.${view === 'top-down' ? ' It is seen from the front: its bottom tiles show the wall\'s front, the others its top.' : ''} ${blocks}`;
  if (g.use === 'hole') return `Group "${g.name}": a hole in the floor (a pit, water). ${blocks}`;
  return `Group "${g.name}": ground.${view === 'top-down' ? ' Lay it over the base ground.' : ''} ${blocks}`;
}

function tilesetGuide(json) {
  const T = json.tiles, id = json.sprite, view = json.view;
  const rows = rowsOf(json), wN = padName(rows), wR = padRow(rows);
  const row = Object.fromEntries(rows.map((r) => [r.name, r]));
  const tw = json.frameWidth, th = json.frameHeight;
  const moving = rows.filter((r) => r.frames > 1);
  const moves = (r) => (r.frames > 1 ? ` (moves: ${r.frames} frames, ${r.fps} per second)` : '');
  const what = (r) => { const l = r.label ?? ''; const i = l.indexOf(': '); return (i >= 0 ? l.slice(i + 2) : l) || r.name; };
  const wW = Math.min(34, Math.max(...rows.map((r) => what(r).length)) + 2);
  const line = (name, tail) => `    ${rowAt(row[name], wR, wN)}${what(row[name]).padEnd(wW)}${tail}${moves(row[name])}`.trimEnd();

  const parts = [];
  for (const g of T.groups) {
    const lines = [wrap(groupHeading(g, view))];
    for (const name of g.tiles) {
      const rules = g.rules.filter((r) => r.tile === name);
      const version = g.versions.includes(name) && name !== g.versions[0];
      const tail = version ? `another version of ${g.versions[0]}: use either`
        : rules.length ? rules.map((r) => needsWords(g.name, r.needs)).join('; or ')
          : g.kind === 'slope' ? (T.tiles[name]?.piece === 'up' ? 'rises to the right' : 'falls to the right') : '';
      lines.push(line(name, tail));
    }
    for (const d of g.decorations) if (row[d.tile]) lines.push(line(d.tile, `decoration: ${PLACE_WORDS[d.place] ?? PLACE_WORDS.on}`));
    parts.push(lines.join('\n'));
  }
  const grouped = new Set(T.groups.flatMap((g) => [...g.tiles, ...g.decorations.map((d) => d.tile)]));
  const loose = rows.filter((r) => !grouped.has(r.name) && !T.other.includes(r.name));
  if (loose.length) parts.push(['  Decorations with no group of their own: put them where they look right.', ...loose.map((r) => line(r.name, ''))].join('\n'));
  if (T.other.length) parts.push(['  Tiles to place by hand (no rule picks them):', ...T.other.filter((n) => row[n]).map((n) => line(n, ''))].join('\n'));

  const families = new Set(Object.values(T.tiles).map((t) => t.family).filter(Boolean));
  const meanings = [...TILE_FAMILIES, LIQUID_FAMILY].filter((f) => families.has(f.id));
  const wF = Math.max(...meanings.map((f) => f.names.length), 4) + 2;
  // a group's name in a list: with what it is, where two groups share a name (ground and a platform both called "grass")
  const KIND_WORDS = { floor: view === 'top-down' ? 'base ground' : 'wall behind', liquid: 'liquid', platform: 'platform', slope: 'slopes', stack: 'stack' };
  const shared = (g) => T.groups.filter((x) => x.name === g.name).length > 1;
  const gname = (g) => `"${g.name}"${shared(g) ? ` (${KIND_WORDS[g.kind] ?? g.use ?? 'ground'})` : ''}`;
  const blocking = T.groups.filter((g) => g.solid).map(gname), ruled = T.groups.filter((g) => g.rules.length > 1);
  const platforms = T.groups.filter((g) => g.oneWay).map(gname);      // stood on from above only: neither a wall nor nothing

  // one complete arrangement for each tile, for a tool that matches cell by cell (the JSON's "patterns")
  const SECTION = 'The eight cells round each tile';
  const cellLine = (name, tail) => `    ${rowAt(row[name], wR, wN)}${tail}`.trimEnd();
  // a group whose tile depends on some of the cells only (a platform: left and right; a stack or a liquid: above and below) says so
  const lookedAt = (g) => { const used = Object.keys(SIDE_WORDS).filter((k) => g.rules.some((r) => k in r.needs) || (g.patterns ?? []).some((x) => x.around[k])); return !used.length || used.length === 8 ? '' : used.length === 1 ? ` (only the cell ${SIDE_WORDS[used[0]]} is looked at)` : ` (only the cells ${list(used.map((k) => SIDE_WORDS[k]))} are looked at)`; };
  const everyWay = meetable(AROUND.map(([k]) => k)).length;
  const partial = ruled.some((g) => g.kind === 'block' && (g.patterns ?? []).length < everyWay);
  const anyVersions = ruled.some((g) => g.versions.length > 1);
  const cells = ruled.length ? `
${SECTION}
${wrap(`Some tools do not go down a list of rules. They are given, for each tile, which of the eight cells round it hold the same group, and for every cell of the map they use the tile that fits best (a terrain in Godot works this way). This is that list. The cells named hold the group; the other cells do not, or are not looked at where a group says so. A corner cell is named only when the two sides next to it are named too. ${id}.json has the same as "patterns" under each group.`)}
${ruled.map((g) => [`  Group ${gname(g)}${lookedAt(g)}`, ...(g.patterns ?? []).filter((x) => row[x.tile]).map((x) => cellLine(x.tile, cellsWords(x.around)))].join('\n')).join('\n')}
${anyVersions ? `${wrap('Another version of a middle tile takes the same cells as the middle tile.')}\n` : ''}${partial ? `${wrap('These tiles cover the usual shapes, not every arrangement a map can make (a cell with two inside corners, say). Where no tile fits a cell exactly, such a tool takes the closest one, which is not always the tile the rule list gives: look such spots over and put the tile you want by hand.')}\n` : ''}` : '';
  const layers = tileLayers(T, view, gname);
  const numbered = layers.map((l, i) => `${i + 1}) ${l}`).join('; ');
  const byHand = T.other.length ? ' A tile you place by hand goes on the layer that puts it over the right things, most often the top one.' : '';
  const eg = ruled[0] ?? T.groups[0] ?? null;
  const names = meanings.length ? `
What the names mean
${wrap(`A tile's name is its group, a dash, and its place in the group${eg ? `: "${eg.tiles[0]}" belongs to the group "${eg.name}"` : ''}. Tiles of one group are drawn to join each other with no seam.`)}
${meanings.map((f) => wrap(f.words, `  ${''.padEnd(wF)}`, `  ${f.names.padEnd(wF)}`)).join('\n')}
` : '';

  const unity = [
    unityImport(json, 'Multiple', `Pixels Per Unit: ${tw} (one tile is then one cell of the grid), `),
    `Open the Sprite Editor and choose Slice > Type: Grid By Cell Size, Pixel Size ${tw} x ${th}. Press Slice, then Apply.`,
    unityNames(json),
    'Open Window > 2D > Tile Palette, create a new palette and drag the cut-out tiles into it. Unity makes a Tile for each. Add a Tilemap to the scene (GameObject > 2D Object > Tilemap > Rectangular) and paint on it.',
    ...(layers.length ? [`Use more than one Tilemap: a Tilemap holds one tile in a cell, and here some tiles lie over others. Make one Tilemap for each of these layers, from the bottom up: ${numbered}. To add a Tilemap, right-click the Grid in the Hierarchy and choose 2D Object > Tilemap > Rectangular, so that they all sit under the same Grid. On each one's Tilemap Renderer set Order in Layer to 0 for the bottom layer, 1 for the next and so on: a higher number is drawn over a lower one. Pick the Tilemap to paint on at the top of the Tile Palette (Active Target; Active Tilemap in older versions).${byHand}`] : []),
    ...(ruled.length ? [`To have Unity choose the right tile by itself, install the package "2D Tilemap Extras" and create a Rule Tile for each of these groups: ${list(ruled.map(gname))}. Give it one rule for each entry of the group's "rules" in ${id}.json, in the same order (Unity also uses the first rule that fits). In a rule's 3 x 3 grid mark a neighbour "This" (the green arrow) where the JSON says true and "Not This" (the red cross) where it says false, and leave the others empty. Use the group's middle tile as the Default Sprite. (The lines under "The tiles" above say the same rules in words, but not their order: take the order from the JSON.)`] : []),
    ...(T.groups.some((g) => g.versions.length > 1) ? ['Where a group has several versions of its middle tile, set that rule\'s Output to Random and add them all.'] : []),
    ...(moving.length ? ['A tile that moves: in a Rule Tile set that rule\'s Output to Animation and add the tile\'s frames in order; for a tile used on its own create an Animated Tile (also in "2D Tilemap Extras"). Set the speed to the tile\'s "per second" number.'] : []),
    ...(blocking.length ? [`Blocking the way: paint ${list(blocking)} on a Tilemap of ${blocking.length > 1 ? 'their' : 'its'} own, apart from anything that does not block, and add a Tilemap Collider 2D to it.`] : []),
    ...(platforms.length ? [`Platforms to stand on: paint ${list(platforms)} on a Tilemap of ${platforms.length > 1 ? 'their' : 'its'} own. Add a Tilemap Collider 2D to it and tick Used By Effector on that collider, then add a Platform Effector 2D and leave its Use One Way ticked: a body then lands on a platform from above and passes up through it from below. The collider should cover only the strip drawn in the top part of each tile, not the whole square: a tile made by dragging a picture into the palette takes its shape from the picture (Collider Type: Sprite on the Tile).`] : []),
  ];
  const godot = [
    `Add a TileMapLayer (a TileMap before Godot 4.3) and give it a new TileSet with Tile Size ${tw} x ${th}.`,
    `Open the TileSet panel at the bottom, drag ${json.image} into it and let Godot create the tiles. A tile's place in the atlas is (frame, row), counted from 0 as here: the tile of row 3 is at (0, 3).`,
    ...(layers.length ? [`Use more than one TileMapLayer: a layer holds one tile in a cell, and here some tiles lie over others. Make one TileMapLayer for each of these layers, from the bottom up: ${numbered}. They can all use the same TileSet. Put them in that order in the Scene panel, the bottom layer first: a node further down the list is drawn over the ones before it. (Before Godot 4.3: one TileMap, with a layer added for each under Layers in the Inspector.)${byHand}`] : []),
    ...(ruled.length ? [`To have Godot choose the right tile by itself, add a Terrain Set to the TileSet (in the Inspector, under Terrain Sets) with Mode: Match Corners and Sides, and in it one terrain for each of these groups: ${list(ruled.map(gname))}. In the TileSet panel choose Paint and, as the property to paint, Terrains; pick the terrain and paint on each tile of the group. Each tile is shown in nine parts: the middle one gives the tile its terrain, and the eight squares round it stand for the eight cells round the tile. Paint the middle square of every tile of the group, and of the outer squares exactly the ones listed for that tile under "${SECTION}" above, no others. (Do not go by the rule list for this: a rule names only part of what a tile needs.)${anyVersions ? ' Give another version of a middle tile the same squares as the middle tile: Godot then mixes them.' : ''} Then open the Terrains tab of the TileMap panel and paint with the terrain.`] : []),
    ...(moving.length ? ['A tile that moves: its frames lie side by side in its row. Remove the tiles Godot made for the frames after the first, select the first and, under Animation, add the other frames and set each frame\'s duration to 1 divided by its "per second" number.'] : []),
    ...(blocking.length ? [`Blocking the way: add a Physics Layer to the TileSet and paint a collision shape on the tiles of ${list(blocking)}: the whole square${T.groups.some((g) => g.kind === 'slope') ? ', or for a slope the part under its line' : ''}.`] : []),
    ...(platforms.length ? [`Platforms to stand on: ${blocking.length ? 'on the same Physics Layer' : 'add a Physics Layer to the TileSet and'} paint a collision shape on the tiles of ${list(platforms)} that covers only the strip drawn in the top part of the tile, not the whole square. Then choose Select, pick those tiles and, under Physics in the tile's properties, tick One Way on that polygon: a body then lands on the platform from above and passes up through it from below.`] : []),
    GODOT_SHARP,
  ];

  return `The tiles
${wrap(`Each tile is ${tw} x ${th} pixels. Each row of the picture is one tile, not an animation.${moving.length ? ' A tile whose row has more than one frame moves (water, a glow): show its frames from left to right, over and over, at the speed listed.' : ''}`)}

${parts.join('\n\n')}
${names}
Which tile goes where
${wrap(`The lines above say what each tile needs in the cells next to it.${eg ? ` "needs ${eg.name}: left" means the cell to the left must hold the same group; "no ${eg.name}: above" means the cell above must not. A cell that is not named may hold anything.` : ''} ${id}.json has the same under "tiles": for every group a list of "rules" to go down, using the first tile whose "needs" all hold. The order of that list matters: where two tiles could fit a cell, the one that comes first in it is used.`)}
${layers.length ? `${wrap(`Layers: some of these tiles lie over others, so build the map in layers, from the bottom up: ${numbered}.${byHand}`)}\n` : ''}${wrap(`${blocking.length ? `Groups that block the way: ${list(blocking)}.` : platforms.length ? 'No group here blocks the way on every side.' : 'None of these groups blocks the way.'}${platforms.length ? ` Platforms, stood on from above only: ${list(platforms)}.` : ''}`)}
${cells}${soundSection(json)}
Unity
${steps(unity)}

Godot 4
${steps(godot)}

Phaser and other web engines
${wrap(`Load it as a sprite sheet with frameWidth ${tw} and frameHeight ${th}, or as a tileset image with tiles of ${tw} x ${th}. ${frameNumber(json)}`)}
`;
}

// ---- backgrounds ---------------------------------------------------------------------------------------------

function backgroundGuide(json) {
  const rows = rowsOf(json), wN = padName(rows), wR = padRow(rows);
  const fw = json.frameWidth, fh = json.frameHeight, id = json.sprite;
  const layers = json.layers ?? rows.map((r) => ({ name: r.name, row: r.row, scroll: 0 }));
  const still = rows.every((r) => r.frames === 1);
  const { cols, rows: nRows } = grid(json);
  const row = Object.fromEntries(rows.map((r) => [r.name, r]));
  const example = layers.map((l) => `"${l.name}" ${num(l.scroll * 100)} pixels`);
  return `The layers
${wrap(`Each layer is ${fw} x ${fh} pixels. Each row of the picture is one layer of the scene, not an animation.${still ? '' : ' A layer whose row has more than one frame moves (clouds, stars): show its frames from left to right, over and over, at the speed listed.'}`)}
  They are listed from the back to the front. Draw them in this order, the first one behind the others.
${layers.map((l) => `  ${rowAt(row[l.name], wR, wN)}scrolls at ${l.scroll} of the camera's speed${row[l.name].frames > 1 ? `, moves: ${row[l.name].frames} frames, ${row[l.name].fps} per second` : ''}`).join('\n')}
${wrap(`Every layer repeats sideways with no seam: put copies of it side by side to cover any width. The first layer is solid; the others are see-through above their shapes.`)}
${wrap(`Scrolling: each layer slides by its own share of the camera's movement, the back one least, which is what makes the scene look deep. When the camera moves 100 pixels to the right, slide ${list(example)} to the left. ${id}.json has the same numbers under "layers".`)}
${soundSection(json)}
Unity
${steps([
    unityImport(json) + ' Also set Mesh Type: Full Rect, so that a layer can repeat.',
    `Open the Sprite Editor and choose Slice > Type: Grid By Cell Size, Pixel Size ${fw} x ${fh}. Press Slice, then Apply.`,
    unityNames(json),
    'Make one Sprite Renderer for each layer. Set Draw Mode: Tiled and make it at least two layer widths wider than the screen. Give the layers a rising Order in Layer, the back one lowest.',
    `Each frame, set a layer's x to: camera x - ((camera x * its share) modulo the layer's width). In Unity's units the layer's width is ${fw} divided by the picture's Pixels Per Unit.`,
    ...(still ? [] : ['A layer that moves: select its frames and drag them into the scene to make an Animation Clip, and set its Samples to the "per second" number.']),
  ])}

Godot 4
${steps([
    `Add one Parallax2D for each layer (Godot 4.3 and later; before that, a ParallaxBackground with one ParallaxLayer for each). Put them in the order above, the back one first.`,
    `Under each, add a Sprite2D with Texture ${json.image}, Offset > Centered off and, under Animation, Hframes ${cols} and Vframes ${nRows}. Set Frame Coords to (0, row) for the layer's row.`,
    `On the Parallax2D set Scroll Scale x to the layer's share above and Repeat Size x to ${fw}. (On a ParallaxLayer these are Motion > Scale and Motion > Mirroring.)`,
    ...(still ? [] : ['A layer that moves: change the Sprite2D\'s Frame Coords x through its frames at the "per second" number, with an AnimationPlayer or in code.']),
    GODOT_SHARP,
  ])}
`;
}

// ---- interface pieces and sets of pictures -------------------------------------------------------------------

// When each well-known state of an interface piece is shown: a button's four (docs/style-guide.md, section 8) and a cursor's or crosshair's.
// A state with another name says it through its own label.
const STATE_WORDS = {
  normal: 'how it looks at rest', hover: 'while the pointer is over it, or it is the one selected', pressed: 'while it is being pressed', disabled: 'when it cannot be used', selected: 'while it is the one chosen',
  idle: 'while nothing else is happening', shoot: 'each time the player fires', fire: 'each time the player fires', reload: 'while the weapon is being reloaded', hit: 'when a shot hits something',
};

function piecesGuide(json) {
  const rows = rowsOf(json), wN = padName(rows), wR = padRow(rows);
  const fw = json.frameWidth, fh = json.frameHeight, id = json.sprite;
  const ui = json.kind === 'interface';
  const still = rows.every((r) => r.frames === 1);
  const one = rows.length === 1 && still;
  const { cols, rows: nRows } = grid(json);
  const H = nRows * fh;
  // rows that are states of one piece and not pieces of their own, as the JSON marks them (engine/sheet-info.js, stateRows)
  const states = rows.filter((r) => r.state);
  const stretch = rows.filter((r) => r.border), tiled = rows.filter((r) => r.tile), bars = rows.filter((r) => r.opening), texts = rows.filter((r) => r.textArea);
  const region = (r) => (r.rect ? { x: r.rect.x, y: r.row * fh + r.rect.y, w: r.rect.w, h: r.rect.h } : { x: 0, y: r.row * fh, w: fw, h: fh });
  const describe = (r) => {
    const label = labelOf(r.name, r), state = r.state ? STATE_WORDS[r.name] : '';
    const words = [label, state].filter(Boolean).join(': ');
    const made = [r.border ? 'can be stretched' : '', r.tile ? 'has a middle that repeats' : '', r.opening ? 'part of a bar' : '', r.textArea ? 'takes text' : ''].filter(Boolean).join(', ');
    return [words, made, r.frames > 1 ? `moves: ${speed(r)}` : ''].filter(Boolean).join(' — ');
  };

  const intro = one ? `One picture, ${fw} x ${fh} pixels. There is no animation.`
    : ui ? `Each frame is ${fw} x ${fh} pixels. Each row is one piece of the interface, or one state of a piece, not an animation.${still ? ' None of them moves: there is no animation.' : ' A row with more than one frame is a small movement (a blinking arrow, a flash): show its frames from left to right at the speed listed.'}`
      : `Each picture is ${fw} x ${fh} pixels. Each row is one separate picture, not an animation.${still ? ' None of them moves: there is no animation.' : ' A row with more than one frame is a small movement (a talking face): show its frames from left to right at the speed listed.'}`;

  const sections = [];
  if (states.length) sections.push(wrap(`States: ${list(states.map((r) => `"${r.name}"`))} are the same piece in different states. Show the row that fits what the player is doing.${states.some((r) => r.frames > 1 && !r.loop) ? ' A state that plays once is a short reaction: play it through once from its first frame, then go back to the state shown before.' : ''}`));
  if (stretch.length) {
    sections.push(`
Stretching (9-slice)
${wrap(`These rows are made to be stretched to any size. Their corners must keep their size, so each has a border: how many pixels to keep unstretched at each side. Use these numbers; they are also in ${id}.json, as "border" on the row's entry under "animations". Only the middle and the edges between the corners stretch.`)}
${stretch.map((r) => `  ${rowAt(r, wR, wN)}keep left ${r.border.left}, right ${r.border.right}, top ${r.border.top}, bottom ${r.border.bottom}${r.rect ? `; the piece is only the rectangle at ${r.rect.x}, ${r.rect.y}, ${r.rect.w} wide and ${r.rect.h} high inside its frame ("rect"): cut that out first` : ''}`).join('\n')}`);
  }
  if (tiled.length) {
    sections.push(`
Repeating middle
${wrap('These rows have a pattern in the middle, so they must not be stretched. Make one longer by putting in whole copies of the columns listed ("tile" in the JSON).')}
${tiled.map((r) => `  ${rowAt(r, wR, wN)}one repeat is the ${r.tile.w} columns starting at column ${r.tile.x}`).join('\n')}`);
  }
  if (bars.length) {
    sections.push(`
Bars
${wrap('Rows that list an "opening" belong to a bar. The opening is the hollow of the bar, and the place where every full-length fill row lies. Draw the empty bar first, then a fill row over it, cut off on the right: at half, show the left half of the opening.')}
${bars.map((r) => `  ${rowAt(r, wR, wN)}opening at ${r.opening.x}, ${r.opening.y}, ${r.opening.w} wide and ${r.opening.h} high`).join('\n')}`);
  }
  if (texts.length) {
    // a piece that is cut out of its frame first is measured from the cut-out afterwards: say the place from there too
    const area = (t, rect) => `at ${t.x}, ${t.y}, ${t.w} wide and ${t.h} high, for ${t.colour === 'light' ? 'light (white) text' : `dark text (${t.colour})`}${rect ? ` (in the cut-out piece: at ${t.x - rect.x}, ${t.y - rect.y})` : ''}`;
    sections.push(`
Text
${wrap(`Where text goes on a piece, inside its frame ("textArea" in the JSON). When you stretch the piece, keep the text the same distance from each edge. Rows not listed here are not meant to carry text.${texts.some((r) => r.rect) ? ' A piece that is cut out of its frame first (it has a "rect") is measured from its own top left corner once it is cut out, so its place is given that way too.' : ''}`)}
${texts.map((r) => `  ${rowAt(r, wR, wN)}text goes ${[].concat(r.textArea).map((t) => area(t, r.rect)).join('; and ')}`).join('\n')}`);
  }
  const points = socketLines(json);
  if (points.length) sections.push(`\n${points.join('\n')}`);
  // a bar: the numbers each engine's way of cutting the fill off needs, from the first row that has an opening
  const o = bars[0]?.opening, sameOpening = bars.every((r) => ['x', 'y', 'w', 'h'].every((k) => r.opening[k] === o[k]));
  const fillRow = bars[1] ?? bars[0];
  const barUnity = bars.length ? `Bars: put the empty bar's row on one UI Image and a fill row on a second Image of the same size, exactly on top of it. To show a value, cut the fill off on the right. The way that works at any size: give the fill Image an empty parent with a Rect Mask 2D that covers the opening, anchor the fill to the parent's left edge so that it stays where it is, and set the parent's width to share x the opening's width (share runs from 0 for empty to 1 for full). For a bar kept at its own size there is a shorter way: on the fill Image set Image Type: Filled, Fill Method: Horizontal, Fill Origin: Left, and set Fill Amount to (opening x + share x opening width) / frame width, ${sameOpening ? 'here' : `for "${bars[0].name}"`} (${o.x} + share x ${o.w}) / ${fw}, which allows for the empty ends of the row. An Image cannot be Filled and Sliced at once.` : '';
  const barGodot = bars.length ? `Bars: for a bar kept at its own size use a TextureProgressBar. Make two AtlasTextures as in step 1: the empty bar's row for Textures > Under, and for Textures > Progress only the opening of a fill row (Region x = opening x, y = row x ${fh} + opening y, w and h the opening's size; for "${fillRow.name}" that is ${fillRow.opening.x}, ${fillRow.row * fh + fillRow.opening.y}, ${fillRow.opening.w}, ${fillRow.opening.h}). Set Progress Offset to the opening's x and y, Fill Mode to Left to Right, and Value from Min Value (empty) to Max Value (full). For a bar at another size: the empty bar at that size and, over its opening, a plain Control with Clip Contents ticked that holds the fill row at the same size, placed so that it lines up with the empty bar; set that Control's width to share x the opening's width (share runs from 0 for empty to 1 for full).` : '';

  const unity = one
    ? [`Drag ${json.image} into your project's Assets folder. Select it and set in the Inspector: Texture Type: Sprite (2D and UI), Sprite Mode: Single, Filter Mode: Point (no filter), Compression: None. Press Apply.`,
      'Use it as the Source Image of a UI Image, or as the Sprite of a Sprite Renderer.']
    : [unityImport(json),
      `Open the Sprite Editor and choose Slice > Type: Grid By Cell Size, Pixel Size ${fw} x ${fh}. Press Slice, then Apply.`,
      unityNames(json),
      'Each cut-out picture is a sprite of its own: use it as the Source Image of a UI Image, or as the Sprite of a Sprite Renderer.',
      ...(stretch.length ? [`Stretchable rows: select the row's sprite in the Sprite Editor and type its border into Border, which Unity writes as L, B, R, T (left, bottom, right, top).${stretch.some((r) => r.rect) ? ` For a row with a "rect", first set the sprite's Position to that rectangle; Unity measures Y from the bottom of the picture, so it is ${stretch.filter((r) => r.rect).map((r) => { const g = region(r); return `X ${g.x}, Y ${H - g.y - g.h}, W ${g.w}, H ${g.h} for "${r.name}"`; }).join(' and ')}.` : ''} Press Apply. On the UI Image set Image Type: Sliced (on a Sprite Renderer: Draw Mode: Sliced).`] : []),
      ...(states.length > 1 ? ['States: on a Button set Transition: Sprite Swap and give it the sprites of the other states (Unity calls "hover" Highlighted).'] : []),
      ...(barUnity ? [barUnity] : []),
      ...(texts.length ? ['Text: put a Text object on top of the piece and keep it inside the text area listed above.'] : []),
      ...(still ? [] : ['A row that moves: select its frames and drag them into the scene to make an Animation Clip, and set its Samples to the "per second" number.'])];
  const godot = one
    ? [`Add a TextureRect (in an interface) or a Sprite2D (in the game world) and set its Texture to ${json.image}.`, GODOT_SHARP]
    : [`One picture: make a new AtlasTexture, set its Atlas to ${json.image} and its Region to x = frame x ${fw}, y = row x ${fh}, w = ${fw}, h = ${fh}. Use it as the Texture of a TextureRect (in an interface) or a Sprite2D (in the game world).`,
      ...(stretch.length ? [`Stretchable rows: add a NinePatchRect, set its Texture to ${json.image}, its Region Rect to the row's rectangle and its Patch Margin Left, Top, Right and Bottom to the row's border. The rectangles (x, y, w, h): ${stretch.map((r) => { const g = region(r); return `"${r.name}" ${g.x}, ${g.y}, ${g.w}, ${g.h}`; }).join('; ')}.`] : []),
      ...(states.length > 1 ? ['States: a TextureButton takes one texture for each state (Textures > Normal, Hover, Pressed, Disabled). For a stretchable button, change the NinePatchRect\'s Region Rect when the state changes.'] : []),
      ...(barGodot ? [barGodot] : []),
      ...(texts.length ? ['Text: put a Label inside the piece and keep it inside the text area listed above.'] : []),
      ...(still ? [] : ['A row that moves: use an AnimatedSprite2D with a SpriteFrames, add the row\'s frames with "Add frames from sprite sheet" (Horizontal ' + cols + ', Vertical ' + nRows + ') and set its speed to the "per second" number.']),
      GODOT_SHARP];

  return `${ui ? 'The pieces' : 'The pictures'}
${wrap(intro)}
${one ? '' : `${rows.map((r) => `  ${rowAt(r, wR, wN)}${describe(r)}`.trimEnd()).join('\n')}\n`}${sections.join('\n')}
${soundSection(json)}
Unity
${steps(unity)}

Godot 4
${steps(godot)}
${one ? '' : `
Phaser and other web engines
${wrap(`Load it as a sprite sheet with frameWidth ${fw} and frameHeight ${fh}. ${frameNumber(json)}`)}
`}`;
}

// ---- a style that makes other files than one sheet ------------------------------------------------------------

function filesGuide(json) {
  const rows = rowsOf(json), wN = padName(rows);
  const notes = [];
  if (json.facing === 'right') notes.push('It is drawn facing right. Flip it in your game to face left.');
  if (json.pivot) notes.push(json.grounded ? `The point where it stands on the ground is ${json.pivot.x}, ${json.pivot.y} inside each frame. Put that point where it stands in your game.` : `Its anchor point is ${json.pivot.x}, ${json.pivot.y} inside each frame. Put that point where the thing is in your game.`);
  const still = rows.every((r) => r.frames === 1);
  return `${still ? 'Pictures' : 'Animations'}
${wrap(still ? 'Each name below is one still picture. There is no animation.' : `Each animation is a run of picture files. ${json.sprite}.json lists every frame under "frames" with its file, in the order to show them.`)}
${rows.map((r) => `  ${r.name.padEnd(wN)}${speed(r)}`).join('\n')}
${notes.map((n) => wrap(n)).join('\n')}
${soundSection(json)}
Unity
${steps(['Drag the picture files into your project\'s Assets folder.', still ? 'Each file is one picture: use it as the Sprite of a Sprite Renderer or the Source Image of a UI Image.' : 'For each animation, select its files in order and drag them into the scene: Unity makes an Animation Clip. Set its Samples to the "per second" number and switch Loop Time off for one that plays once.'])}

Godot 4
${steps(['Copy the picture files into your project folder.', still ? 'Each file is one picture: set it as the Texture of a Sprite2D or a TextureRect.' : 'Add an AnimatedSprite2D with a new SpriteFrames, add one animation for each name above and drag its files in, in order. Set its speed (FPS) to the "per second" number and its loop button off for one that plays once.'])}
`;
}

// ---- how-to-use.txt -------------------------------------------------------------------------------------------

/**
 * how-to-use.txt for one sprite: what it is, what is in its folder, how rows and frames are counted, what its rows mean for the kind of thing it is, the steps for Unity and Godot for that kind, and what it records about its licence.
 * Arguments: json (the sheet's JSON from describeSheet(), with "sounds" when it has any); description (the asset's own one-sentence description, optional); licence (the licence value it records, or nothing);
 * pictures (only for a style that makes other files than one sheet: their names); style ({ label, about } of that style).
 */
export function spriteGuide({ json, description = '', licence, pictures = null, style = null }) {
  const id = json.sprite, sheet = typeof json.image === 'string';
  const hasSounds = Object.values(json.sounds ?? {}).some((l) => l.length);
  const what = whatItIs(json);
  const tiles = json.kind === 'tileset';
  const folder = sheet
    ? [`${id}.png`, tiles ? 'all the tiles in one picture' : json.kind === 'background' ? 'all the layers in one picture' : Object.keys(json.animations).length === 1 && Object.values(json.animations)[0].frames === 1 ? 'the picture' : 'the sprite sheet: every picture of it in one image']
    : null;
  const shown = (pictures ?? []).slice(0, 6);
  const files = [
    ...(folder ? [folder] : shown.map((n) => [n, ''])),
    ...(!folder && (pictures ?? []).length > 6 ? [['...', `${pictures.length} picture files in all`]] : []),
    [`${id}.json`, 'the same facts as this file, for tools and scripts'],
    ...(hasSounds ? [['sounds/', 'one WAV file for each sound']] : []),
    ['how-to-use.txt', 'this file'],
  ];
  const wF = Math.max(...files.map(([n]) => n.length)) + 3;
  const body = !sheet ? filesGuide(json)
    : tiles && json.tiles ? tilesetGuide(json)
      : json.kind === 'background' ? backgroundGuide(json)
        : json.kind === 'interface' || json.kind === 'pictures' ? piecesGuide(json)
          : animatedGuide(json);
  return `${json.name} — made with Loadout
What it is: ${what}
${description ? `${description}\n` : ''}${style ? `Drawn in the "${style.label}" style.${style.about ? ` ${style.about}` : ''}\n` : ''}
What is in this folder
${files.map(([n, w]) => `  ${n.padEnd(wF)}${w}`.trimEnd()).join('\n')}

${counting(json, sheet)}

${body.replace(/\n{3,}/g, '\n\n').trimEnd()}

${licenceSection(licence)}

${SHARP}
`;
}

// ---- read-me.txt ----------------------------------------------------------------------------------------------

/**
 * read-me.txt of a package. It opens with the contents list: every asset by its name, what kind of thing it is and where it is in the package (folders are named after the asset's short id, so the list is how a name is found).
 * Arguments: manifest (the package's manifest: assets with { kind, id, name, whatItIs, folder or files, madeOnThisVisit }, and missing / refused / needsRemaking / unsupported when there are any); themed (true when the bag's look was applied to everything).
 */
export function packageGuide(manifest, themed) {
  const assets = manifest.assets;
  const has = (k) => assets.some((a) => a.kind === k);
  const where = (a) => a.folder ?? a.files[0];
  const what = (a) => a.whatItIs ?? KIND_WORD[a.kind];
  const w1 = Math.max(4, ...assets.map((a) => a.name.length)) + 2, w2 = Math.max(10, ...assets.map((a) => what(a).length)) + 2;
  const section = (title, kind) => {
    const rows = assets.filter((a) => a.kind === kind).sort(byName);
    return rows.length ? `\n  ${title}\n${rows.map((a) => `    ${a.name.padEnd(w1)}${what(a).padEnd(w2)}${where(a)}`).join('\n')}\n` : '';
  };
  const made = assets.filter((a) => a.madeOnThisVisit);
  return `Your Loadout package

Contents
${wrap(`${plural(assets.length, 'asset')}, each exactly as you set it up in your bag${themed ? ', with the bag\'s look applied to all of them so they match' : ''}. A folder or a file is named after the asset's short name on the site, which is not always the name you know it by: this list says which is which.`)}

    ${'Name'.padEnd(w1)}${'What it is'.padEnd(w2)}Where
${section('Sprites', 'sprite')}${section('Sounds', 'sound')}${section('Music', 'music')}
  Also at the top of the package
    read-me.txt     this file
    licence.txt     what every asset records about its licence
    manifest.json   the same list for tools and scripts: every asset's name, what it is for, its files and
                    the settings it was made with
${manifest.missing ? `\nNot included (no longer on the site): ${manifest.missing.join(', ')}\n` : ''}${manifest.refused ? `\nNot included (made on a visit, and not passing the quality bar as set up in the bag): ${manifest.refused.map((r) => r.id).join(', ')}\n` : ''}${manifest.needsRemaking ? `\nNot included (made on a visit, and in need of re-making): ${manifest.needsRemaking.join(', ')}\n` : ''}${manifest.unsupported ? `\nNot included (asked for in a style it cannot be drawn in): ${manifest.unsupported.map((u) => `${u.id} (${u.artStyle})`).join(', ')}\n` : ''}
Folders
${has('sprite') ? '  sprites/    one folder for each sprite: its sheet (PNG), the facts about it for tools (JSON), the sounds that\n              go with it, and how-to-use.txt. That text is written for the kind of thing the sprite\n              is (a character, a tileset, a background, an interface piece ...), with the steps for Unity and Godot\n' : ''}${has('sound') ? '  sounds/     one WAV file for each sound effect\n' : ''}${has('music') ? '  music/      one WAV file for each music track. Each is one loop: set it to repeat in your game\n' : ''}
How things are counted
${wrap('Rows and frames are counted from 0 in every text and every JSON file of this package: row 0 is the top row of a sheet and frame 0 is the leftmost picture in a row.')}

Using it in Unity
  Drag the whole folder into your project's Assets folder.
${has('sprite') ? '  Sprites: follow the how-to-use.txt in each sprite\'s folder. A tileset, a background and an interface piece\n  are each set up differently from an animated character.\n' : ''}${has('sound') || has('music') ? '  Sounds and music: they come in as Audio Clips. Tick Loop on an Audio Source that plays music or a sound\n  listed above as one that repeats.\n' : ''}
Using it in Godot
  Copy the whole folder into your project folder.
${has('sprite') ? '  Sprites: follow the how-to-use.txt in each sprite\'s folder.\n' : ''}${has('sound') || has('music') ? '  Sounds and music: play a WAV file with an AudioStreamPlayer. For music or a sound that repeats, select the\n  file, open the Import tab, set Loop Mode to Forward and press Reimport.\n' : ''}
Keep pixel art sharp: turn smoothing or filtering off, and scale by whole numbers (2x, 3x, 4x).
${made.length ? `\nMade on your visit: ${made.map((a) => a.name).join(', ')}.\n  These are not in Loadout's catalogue. Each comes with its source (the .source file next to it), which is what\n  Loadout needs to make it again: keep it if you want to change the asset later.\n` : ''}Made with Loadout.
`;
}
