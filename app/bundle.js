// Builds what people download: a sprite sheet with its sounds, one sound, or a whole kit.
import { renderSheet, defaultParams } from '../engine/sprite.js';
import { soundById, soundParams, rendered, renderAsync, wavBytes } from './audio.js';

const enc = new TextEncoder();

async function sheetPng(sheet) {
  const cv = document.createElement('canvas');
  cv.width = sheet.w; cv.height = sheet.h;
  cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(sheet.data.buffer), sheet.w, sheet.h), 0, 0);
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

/** A sprite's sounds with every default filled in: { clip: [{ sound, frame, preset, params, volume }] }. */
export function defaultCues(sprite) {
  const out = {};
  for (const clip of Object.keys(sprite.clips)) out[clip] = (sprite.sounds[clip] ?? []).filter((c) => soundById[c.sound]).map((c) => ({ sound: c.sound, frame: c.frame, preset: c.preset ?? null, params: null, volume: c.volume ?? 1 }));
  return out;
}

/**
 * Files for one sprite: <id>.png, <id>.json, sounds/*.wav, how-to-use.txt.
 * cues: { clip: [{ sound, frame, preset, params, volume }] }
 */
export async function spriteFiles(sprite, p, cues, scale = 1) {
  const sheet = renderSheet(sprite, p, { scale });
  const files = [], wavs = new Map();
  sheet.meta.sounds = {};
  for (const [clip, list] of Object.entries(cues)) {
    const anim = sheet.meta.animations[clip];
    if (!anim || !list.length) continue;
    sheet.meta.sounds[clip] = list.filter((c) => soundById[c.sound]).map((c) => {
      const patch = soundById[c.sound];
      const params = soundParams(patch, c.preset, c.params);
      const key = c.sound + JSON.stringify(params);
      if (!wavs.has(key)) {
        const taken = new Set([...wavs.values()].map((w) => w.name));
        let name = `${c.sound}.wav`;
        for (let i = 2; taken.has(name); i++) name = `${c.sound}-${i}.wav`;
        wavs.set(key, { name, data: wavBytes(rendered(patch, params, 1)) });
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
  files.push({ name: `${sprite.id}.png`, data: await sheetPng(sheet) });
  files.push({ name: `${sprite.id}.json`, data: enc.encode(JSON.stringify(sheet.meta, null, 2)) });
  for (const w of wavs.values()) files.push({ name: `sounds/${w.name}`, data: w.data });
  files.push({ name: 'how-to-use.txt', data: enc.encode(howTo(sprite, sheet.meta)) });
  return files;
}

/** Files for a kit: one folder per sprite, plus the kit's extra sounds. */
export async function kitFiles(kit, spriteById) {
  const files = [];
  for (const id of kit.sprites) {
    const sprite = spriteById[id];
    if (!sprite) continue;
    for (const f of await spriteFiles(sprite, defaultParams(sprite), defaultCues(sprite))) files.push({ name: `${id}/${f.name}`, data: f.data });
  }
  for (const id of kit.sounds) {
    const patch = soundById[id];
    if (!patch) continue;
    files.push({ name: `sounds/${id}.wav`, data: wavBytes(rendered(patch, soundParams(patch), 1)) });
    for (const preset of Object.keys(patch.presets ?? {})) {
      files.push({ name: `sounds/${id} (${preset.toLowerCase()}).wav`, data: wavBytes(rendered(patch, soundParams(patch, preset), 1)) });
    }
  }
  for (const id of kit.music ?? []) {
    const patch = soundById[id];
    if (patch) files.push({ name: `music/${id}.wav`, data: wavBytes(await renderAsync(patch, soundParams(patch), 1)) });
  }
  files.push({ name: 'read-me.txt', data: enc.encode(`${kit.name} — made with Loadout\n\n${kit.blurb}\n\nEach sprite has its own folder with a sprite sheet (PNG), an animation list (JSON), the sounds that go with its\nanimations, and a short guide. The sounds folder holds every sound in the kit, including each sound's other styles.${(kit.music ?? []).length ? ' The music folder holds one loop per track: set it to repeat in your game.' : ''}\n`) });
  return files;
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
