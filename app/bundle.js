// Builds what people download: a sprite sheet with its sounds, or the bag (or a bundle) as one game
// resource package (architecture.md, Contract 8). Which assets exist comes from the catalogue
// (app/catalog.js); a sprite's own program is loaded when it is first needed.
// Which files a sprite becomes is decided by the style it is exported in (engine/styles.js, Contract 12): this
// file asks that style's exporter, and adds the sounds, the JSON and the guide around what it returns.
import { cleanParams, cueInEffect } from '../engine/sprite.js';
import { exportSheet, styleById, stylesOf, supports } from '../engine/styles.js';
import { defaultTheme, normalizeTheme, applyColour, themedParams } from '../engine/theme.js';
import { applySound, themedSoundParams, soundSettingsFor } from '../sound/theme.js';
import { soundById, soundParams, rendered, renderAsync, wavBytes, isMusic } from './audio.js';
import { loadCatalog, assetById, loadSprite } from './catalog.js';

const enc = new TextEncoder();

/** The browser's PNG writer, as the PNG sheet exporter asks for it: (width, height, RGBA bytes) -> PNG bytes. */
async function pngBytes(w, h, rgba) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * A sprite's sounds with every default filled in: { clip: [{ sound, frame, preset, params, volume, when? }] }.
 * `when` (Contract 3) is kept: the settings at which the sound plays.
 */
export function defaultCues(sprite) {
  const out = {};
  for (const clip of Object.keys(sprite.clips)) {
    out[clip] = (sprite.sounds[clip] ?? []).filter((c) => soundById[c.sound]).map((c) => {
      const cue = { sound: c.sound, frame: c.frame, preset: c.preset ?? null, params: null, volume: c.volume ?? 1 };
      if (c.when) cue.when = c.when;
      return cue;
    });
  }
  return out;
}

/**
 * True when a bag item's kind matches its asset: a crafted link must not export a sound as music.
 * Sprites are looked up in the catalogue (their programs may not be loaded yet); sounds in the sound library.
 */
export function kindMatches(kind, id) {
  if (kind === 'sprite') return assetById(id)?.kind === 'sprite';
  const patch = soundById[id];
  return !!patch && (kind === 'music') === isMusic(patch);
}

/** A complete theme, or null when it changes nothing (so neutral exports stay byte for byte as before). */
export function activeTheme(theme) {
  if (!theme) return null;
  const t = normalizeTheme(theme);
  return JSON.stringify(t) === JSON.stringify(defaultTheme()) ? null : t;
}

/** One sound effect, rendered with its settings and the theme. */
function themedSound(patch, params, seed, t) {
  if (!t) return rendered(patch, params, seed);
  return applySound(rendered(patch, themedSoundParams(patch, params, t), seed), soundSettingsFor(patch, t));
}

/**
 * Files for one sprite. In the pixel style: <id>.png, <id>.json, sounds/*.wav, how-to-use.txt. Another style's
 * exporter may make other picture files (one SVG per frame, say); the JSON, the sounds and the guide are always there.
 * cues: { clip: [{ sound, frame, preset, params, volume }] }
 * theme (optional, Contract 7): recolours the pictures and the sounds, and with `shapes` varies the sprite's own controls.
 * style (optional, Contract 12): the style to export in, one the sprite lists (its first when left out). It rejects,
 * naming the sprite's styles, for one it does not list. The JSON says `style` only when it is not pixel.
 */
export async function spriteFiles(sprite, p, cues, scale = 1, theme = null, style = undefined) {
  const t = activeTheme(theme);
  const drawn = t ? themedParams(sprite, cleanParams(sprite, p), t) : p;
  const made = await exportSheet(sprite, drawn, { style: style ?? undefined, scale, recolour: t ? (pixels) => applyColour(pixels, t.colour) : null, encodePng: pngBytes });
  const sheet = { meta: made.data };
  const files = [], wavs = new Map();
  sheet.meta.sounds = {};
  for (const [clip, all] of Object.entries(cues)) {
    const anim = sheet.meta.animations[clip];
    // only the sounds that play at the settings drawn (a blade sound needs a blade)
    const list = (all ?? []).filter((c) => soundById[c.sound] && cueInEffect(sprite, c, drawn));
    if (!anim || !list.length) continue;
    sheet.meta.sounds[clip] = list.map((c) => {
      const patch = soundById[c.sound];
      const params = soundParams(patch, c.preset, c.params);
      const key = c.sound + JSON.stringify(params);
      if (!wavs.has(key)) {
        const taken = new Set([...wavs.values()].map((w) => w.name));
        let name = `${c.sound}.wav`;
        for (let i = 2; taken.has(name); i++) name = `${c.sound}-${i}.wav`;
        wavs.set(key, { name, data: wavBytes(themedSound(patch, params, 1, t)) });
      }
      return {
        sound: c.sound, file: `sounds/${wavs.get(key).name}`,
        loop: !!patch.loop,
        frame: patch.loop ? 0 : c.frame,
        timeMs: patch.loop ? 0 : Math.round((c.frame * 1000) / anim.fps),
        volume: c.volume ?? 1,
        settings: params,
      };
    });
  }
  for (const f of made.files) files.push({ name: f.name, data: f.bytes });
  files.push({ name: `${sprite.id}.json`, data: enc.encode(JSON.stringify(sheet.meta, null, 2)) });
  for (const w of wavs.values()) files.push({ name: `sounds/${w.name}`, data: w.data });
  // the guide below is about a PNG sheet; a style that makes other files gets a short one that lists them
  files.push({ name: 'how-to-use.txt', data: enc.encode(sheet.meta.image ? howTo(sprite, sheet.meta) : howToOther(sprite, sheet.meta, made)) });
  return files;
}

/** The guide for a style that does not make a PNG sheet: what the files are, and where the animation list is. */
function howToOther(sprite, meta, made) {
  const style = styleById(made.style);
  const rows = Object.entries(meta.animations).map(([name, a]) => `  ${name}: ${a.frames} frames, ${a.fps} frames per second, ${a.loop ? 'loops' : 'plays once'}`).join('\n');
  const shown = made.files.slice(0, 6).map((f) => `  ${f.name}`).join('\n');
  return `${sprite.name} — made with Loadout, in the "${style.label}" style

${style.about}

What is in this folder
${shown}${made.files.length > 6 ? `\n  ... ${made.files.length} picture files in all` : ''}
  ${sprite.id}.json  the animation list: every frame, its file, how long it shows, and the settings used${Object.keys(meta.sounds).length ? '\n  sounds/        one WAV file per sound; the JSON lists them under "sounds" with the frame each starts on' : ''}

Animations
${rows}
  The sprite faces right. Flip it in your game to face left.
  The point that touches the ground is ${meta.pivot.x}, ${meta.pivot.y} inside each frame.
`;
}

function howTo(sprite, meta) {
  const rows = Object.entries(meta.animations).map(([name, a]) => `  row ${a.row + 1}: ${name} — ${a.frames} frames, ${a.fps} frames per second, ${a.loop ? 'loops' : 'plays once'}`).join('\n');
  const soundRows = Object.entries(meta.sounds).flatMap(([clip, list]) => list.map((c) => `  ${clip}: ${c.file} — ${c.loop ? 'loops for as long as the animation plays' : `starts on frame ${c.frame + 1} (${c.timeMs} ms in)`}${c.volume !== 1 ? `, volume ${Math.round(c.volume * 100)}%` : ''}`));
  const soundPart = soundRows.length ? `
Sounds
  Play each sound when its animation reaches the frame listed here. The same list is in ${sprite.id}.json under "sounds".
${soundRows.join('\n')}
  Unity: add an Animation Event on that frame that calls AudioSource.PlayOneShot with the clip.
  Godot: add a sound track to the AnimationPlayer, or call play() on an AudioStreamPlayer when the frame changes.
  Web: play the file when your animation code switches to that frame.
` : '';
  return `${sprite.name} — made with Loadout

What is in this folder
  ${sprite.id}.png   the sprite sheet: every animation frame in one picture
  ${sprite.id}.json  the same information as below, for tools that read it${soundRows.length ? '\n  sounds/        one WAV file per sound' : ''}

The sheet
  Each frame is ${meta.frameWidth} x ${meta.frameHeight} pixels. Each row is one animation, read left to right.
${rows}
  The sprite faces right. Flip it in your game to face left.
  The point that touches the ground is ${meta.pivot.x}, ${meta.pivot.y} inside each frame.
${soundPart}
Unity
  Drag the PNG into your project. In the Inspector set Sprite Mode: Multiple, Filter Mode: Point (no filter),
  Compression: None. Open the Sprite Editor, choose Slice > Grid By Cell Size > ${meta.frameWidth} x ${meta.frameHeight}.
  Select the frames of one row and drag them into the scene to create an animation.

Godot
  Add an AnimatedSprite2D, create SpriteFrames, choose "Add frames from sprite sheet", set the grid to
  ${Math.max(...Object.values(meta.animations).map((a) => a.frames))} columns and ${Object.keys(meta.animations).length} rows. Set the texture filter to Nearest.

Phaser and other web engines
  Load it as a sprite sheet with frameWidth ${meta.frameWidth} and frameHeight ${meta.frameHeight}.

Keep pixel art sharp: always turn smoothing or filtering off, and scale by whole numbers (2x, 3x, 4x).
`;
}

// ---- the bag as one package (Contract 8) -------------------------------------------

/** Name, role and type of every catalogue asset, by id. Empty when the catalogue file is not there. */
const catalogue = () => loadCatalog().then((c) => Object.fromEntries((c.assets ?? []).map((a) => [a.id, a]))).catch(() => ({}));

const KIND_WORD = { sprite: 'sprite', sound: 'sound effect', music: 'music track' };

/** A name not yet in `taken`: base, base-2, base-3 ... */
function unique(taken, base, ext = '') {
  let name = base + ext;
  for (let i = 2; taken.has(name); i++) name = `${base}-${i}${ext}`;
  taken.add(name);
  return name;
}

/**
 * Every file of the bag's package:
 *   sprites/<id>/   sheet (PNG), animation list (JSON), the sprite's sounds, how-to-use.txt
 *   sounds/<id>.wav    music/<id>.wav    manifest.json    read-me.txt
 * items: bag items { key, kind, id, settings }; theme: the bag's theme, applied to everything;
 * scale: pixel size for sprites whose settings do not choose one.
 * Optional: catalog ({ id: { name, role, type } }), onProgress(text).
 * An item whose asset is not on the site, or whose own file cannot be loaded, is left out and named under "missing".
 * An item made on a visit (it carries `definition`, Contract 11) is packaged like any other; its source goes in next to it
 * (<id>.source.js for a sprite, <id>.source.json for a sound or a track) and the manifest marks it madeOnThisVisit.
 * A sprite item whose settings name a style (Contract 12) is exported in that style, and its manifest entry says
 * `style`; an entry without it is pixel. One that asks for a style its sprite does not list is left out and named
 * under "unsupported" (never quietly exported in another style).
 * Returns [{ name, data: Uint8Array }] for zip().
 */
export async function packageFiles({ items, theme = null, scale = 1, catalog = null, onProgress = () => {} }) {
  const t = activeTheme(theme);
  const info = catalog ?? await catalogue();
  const files = [], assets = [], missing = [], unsupported = [];
  const folders = new Set(), soundNames = new Set(), musicNames = new Set();
  let done = 0;
  for (const item of items) {
    onProgress(`Building ${++done} of ${items.length}…`);
    const s = item.settings ?? {};
    const about = info[item.id] ?? {};
    const entry = (name, meta) => ({ key: item.key, id: item.id, kind: item.kind, name: about.name ?? name, role: about.role ?? meta?.role ?? null, type: about.type ?? meta?.type ?? null, files: [], settings: s });
    // a sprite's own program is loaded here, when the package needs it
    const sprite = item.kind === 'sprite' && kindMatches(item.kind, item.id) ? await loadSprite(item.id).catch(() => null) : null;
    if (item.kind === 'sprite' ? !sprite : !kindMatches(item.kind, item.id)) { missing.push(item.id); continue; }
    if (item.kind === 'sprite') {
      const style = typeof s.style === 'string' && s.style ? s.style : stylesOf(sprite)[0];
      if (!supports(sprite, style) || !styleById(style)) { unsupported.push({ id: item.id, style }); continue; }
      const folder = unique(folders, item.id);
      const a = entry(sprite.name, sprite.meta);
      a.folder = `sprites/${folder}/`;
      const p = cleanParams(sprite, s.params ?? {});
      const cues = s.cues ?? defaultCues(sprite);
      for (const f of await spriteFiles(sprite, p, cues, s.scale ?? scale, t, style)) {
        const name = `sprites/${folder}/${f.name}`;
        files.push({ name, data: f.data });
        a.files.push(name);
      }
      // `sheet` is the PNG sheet, for the styles that make one; every style has the animation list
      if (a.files.includes(`sprites/${folder}/${sprite.id}.png`)) a.sheet = `sprites/${folder}/${sprite.id}.png`;
      a.animations = `sprites/${folder}/${sprite.id}.json`;
      if (style !== 'pixel') a.style = style;
      if (typeof item.definition?.source === 'string') {
        a.madeOnThisVisit = true;
        a.source = `sprites/${folder}/${sprite.id}.source.js`;
        files.push({ name: a.source, data: enc.encode(item.definition.source) });
        a.files.push(a.source);
      }
      assets.push(a);
    } else {
      const patch = soundById[item.id];
      const music = item.kind === 'music';
      const a = entry(patch.name, patch.meta);
      const base = soundParams(patch, s.style, s.params);
      let r;
      if (music) {
        onProgress(`Building ${done} of ${items.length}: the music takes a few seconds…`);
        r = await renderAsync(patch, t ? themedSoundParams(patch, base, t) : base);
        if (t) r = applySound(r, soundSettingsFor(patch, t));
      } else r = themedSound(patch, base, s.seed ?? 1, t);
      const name = `${music ? 'music' : 'sounds'}/${unique(music ? musicNames : soundNames, item.id, '.wav')}`;
      files.push({ name, data: wavBytes(r) });
      a.files.push(name);
      a.seconds = Math.round(r.duration * 100) / 100;
      a.loop = !!(r.loop ?? patch.loop);
      if (item.definition?.patch) {
        a.madeOnThisVisit = true;
        a.source = name.replace(/\.wav$/, '.source.json');
        files.push({ name: a.source, data: enc.encode(JSON.stringify(item.definition.patch, null, 1)) });
        a.files.push(a.source);
      }
      assets.push(a);
    }
  }
  const manifest = { app: 'Loadout', format: 'loadout-package', version: 1, theme: normalizeTheme(t ?? {}), assets };
  if (missing.length) manifest.missing = missing;
  if (unsupported.length) manifest.unsupported = unsupported;
  files.push({ name: 'manifest.json', data: enc.encode(JSON.stringify(manifest, null, 2)) });
  files.push({ name: 'read-me.txt', data: enc.encode(packageGuide(manifest, !!t)) });
  return files;
}

function packageGuide(manifest, themed) {
  const list = manifest.assets.map((a) => `  ${a.name} (${KIND_WORD[a.kind]})${a.role ? `, for ${a.role.replace('/', ': ')}` : ''}\n    ${a.folder ?? a.files[0]}`).join('\n');
  const has = (k) => manifest.assets.some((a) => a.kind === k);
  return `Your Loadout package

This package holds ${manifest.assets.length} asset${manifest.assets.length === 1 ? '' : 's'}, each exactly as you set it up in your bag${themed ? ', with the bag\'s look applied to all of them so they match' : ''}.
${manifest.missing ? `\nNot included (no longer on the site): ${manifest.missing.join(', ')}\n` : ''}${manifest.unsupported ? `\nNot included (asked for in a style it cannot be drawn in): ${manifest.unsupported.map((u) => `${u.id} (${u.style})`).join(', ')}\n` : ''}
What is in it
${list}

Folders
${has('sprite') ? '  sprites/    one folder per sprite: the sprite sheet (PNG), its animation list (JSON), the sounds that go\n              with its animations, and how-to-use.txt with the steps for Unity, Godot and web engines\n' : ''}${has('sound') ? '  sounds/     one WAV file per sound effect\n' : ''}${has('music') ? '  music/      one WAV file per music track. Each is one loop: set it to repeat in your game\n' : ''}  manifest.json   a list of every asset: its name, what it is for, its files and the settings it was made with.
                  Tools and scripts can read it to set the assets up for you

Using it in Unity
  Drag the whole folder into your project's Assets folder.
  Sprites: select each PNG, set Sprite Mode: Multiple, Filter Mode: Point (no filter), Compression: None,
  then slice it in the Sprite Editor by the frame size in its how-to-use.txt.
  Sounds and music: they import as Audio Clips. Tick Loop on the music and on any sound listed as a loop.

Keep pixel art sharp: turn smoothing or filtering off, and scale by whole numbers (2x, 3x, 4x).
${manifest.assets.some((a) => a.madeOnThisVisit) ? `\nMade on your visit: ${manifest.assets.filter((a) => a.madeOnThisVisit).map((a) => a.name).join(', ')}.\n  These are not in Loadout's catalogue. Each comes with its source (the .source file next to it), which is what\n  Loadout needs to make it again: keep it if you want to change the asset later.\n` : ''}Made with Loadout.
`;
}
