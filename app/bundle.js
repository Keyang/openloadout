// Builds what people download: a sprite sheet with its sounds, or the bag (or a bundle) as one game
// resource package (architecture.md, Contract 8). Which assets exist comes from the catalogue
// (app/catalog.js); a sprite's own program is loaded when it is first needed.
// Which files a sprite becomes is decided by the style it is exported in (engine/styles.js, Contract 12): this
// file asks that style's exporter, and adds the sounds, the JSON and the guide around what it returns.
import { cleanParams, cueInEffect } from '../engine/sprite.js';
import { exportSheet, styleById, stylesOf, supports } from '../engine/styles.js';
import { defaultTheme, normalizeTheme, applyColour, spriteMaterials, spriteLook } from '../engine/theme.js';
import { applySound, themedSoundParams, soundSettingsFor } from '../sound/theme.js';
import { soundById, soundParams, rendered, renderAsync, wavBytes, isMusic } from './audio.js';
import { loadCatalog, assetById, loadSprite } from './catalog.js';
import { restoreRuntime, madeItemState } from './api.js';      // W5-B: an item made on a visit is exported only once it has been checked again, and only as the bag stored it
import { describeSheet } from '../engine/sheet-info.js';       // what kind of sheet it is, and what that kind needs (tile rules, layers, text areas), written into the JSON
import { spriteGuide, packageGuide, licenceText, whatItIs, soundWhatItIs } from './guide.js';      // the words of a download, by kind of asset

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
 * naming the sprite's styles, for one it does not list. The JSON says `artStyle` only when it is not pixel.
 * The JSON also says what kind of sheet it is and what that kind needs (engine/sheet-info.js: `kind`, how rows are
 * counted, a tileset's `tiles`, a background's `layers`, an interface piece's `textArea`), and how-to-use.txt is
 * written for that kind (app/guide.js), with the licence value the sprite records.
 */
export async function spriteFiles(sprite, p, cues, scale = 1, theme = null, style = undefined) {
  return (await spriteParts(sprite, p, cues, scale, theme, style)).files;
}

/** spriteFiles, and the sheet's JSON as an object beside the files: { files, json }. For the package, which lists what each sprite is. */
// record (optional): what a bag recorded its look made of the sprite's shapes (Contract 7, "The record"); drawn from it when given
async function spriteParts(sprite, p, cues, scale = 1, theme = null, style = undefined, record = undefined) {
  const t = activeTheme(theme);
  const drawn = t ? spriteLook(sprite, p, t, { record }).params : p;
  // W5-B: a sprite made on a visit is drawn in a worker of its own; its frames at these settings are brought first (a catalogue sprite has no prepare)
  if (typeof sprite.prepare === 'function') await sprite.prepare(drawn, { style: style ?? undefined });
  // W5-B: and what is about to be written of it is looked at first: the quality bar is run on exactly these frames
  // (every frame of every clip at these settings), and the sheet below is made from those same frames. A setting
  // that fails is not written (the error carries `refused` and the bar's own words in `reason`).
  if (typeof sprite.judgeLook === 'function') {
    const look = await sprite.judgeLook(drawn, { style: style ?? undefined });
    if (!look.ok) throw Object.assign(new Error(`${sprite.name} does not pass the quality bar as it is set up here, so it was not made into files: ${look.errors[0]}`), { refused: true, reason: look.errors[0] });
  }
  const made = await exportSheet(sprite, drawn, { style: style ?? undefined, scale, recolour: t ? (pixels) => applyColour(pixels, t.colour, () => spriteMaterials(sprite, drawn, { style: style ?? undefined })) : null, encodePng: pngBytes });
  const sheet = { meta: describeSheet(sprite, made.data, drawn) };
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
  // the guide is written for the kind of asset this is; a style that makes other files than one sheet gets them listed
  const drawnIn = made.style === 'pixel' ? null : styleById(made.style);
  files.push({ name: 'how-to-use.txt', data: enc.encode(spriteGuide({
    json: sheet.meta, description: typeof sprite.blurb === 'string' ? sprite.blurb : '', licence: sprite.meta?.license,
    pictures: sheet.meta.image ? null : made.files.map((f) => f.name), style: drawnIn ? { label: drawnIn.label, about: drawnIn.about } : null,
  })) });
  return { files, json: sheet.meta };
}

// ---- the bag as one package (Contract 8) -------------------------------------------

/**
 * What a package under a look says about the settings it records (manifest.settingsUsed). The colours are not the
 * look's colour settings applied alike to every pixel: each colour is held to what it is of (engine/theme.js,
 * spriteLook), so the note says how to get the very same picture again.
 */
export const SETTINGS_USED = 'Each sprite\'s settings.params are the values it was drawn with, this look\'s changes to its shapes included (changedByLook names the ones the look moved). To make the same picture again: draw the sprite with these values, then recolour it the way Loadout does, which keeps each colour what it is (a sky stays a sky, skin stays skin). With Loadout\'s engine that is renderThemedFrame(sprite, clip, frame, settings.params, theme) in engine/theme.js, with theme.shapes set to false (the shapes are already in these values). Applying theme.colour to every pixel alike gives a different picture.';

/** Name, role and type of every catalogue asset, by id. Empty when the catalogue file is not there. */
const catalogue = () => loadCatalog().then((c) => Object.fromEntries((c.assets ?? []).map((a) => [a.id, a]))).catch(() => ({}));

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
 *   sounds/<id>.wav    music/<id>.wav    manifest.json    read-me.txt    licence.txt
 * read-me.txt opens with the contents list (each asset's name, what kind of thing it is, where it is: folders are
 * named after ids); licence.txt lists the licence value every asset records; each manifest entry carries both
 * (`whatItIs`, `license`). The words are in app/guide.js.
 * items: bag items { key, kind, id, settings }; theme: the bag's theme, applied to everything;
 * scale: pixel size for sprites whose settings do not choose one.
 * Optional: catalog ({ id: { name, role, type } }), onProgress(text).
 * An item whose asset is not on the site, or whose own file cannot be loaded, is left out and named under "missing".
 * An item made on a visit (it carries `definition`, Contract 11) is packaged like any other; its source goes in next to it
 * (<id>.source.js for a sprite, <id>.source.json for a sound or a track) and the manifest marks it madeOnThisVisit.
 * It is packaged from its own definition: only when that definition has been checked again and is the one the site
 * draws under its id. Otherwise nothing of it goes in, and it is named under "needsRemaking". A made sprite's frames
 * at the item's settings are then put through the quality bar before they are written; one that fails there is left
 * out and named under "refused" ([{ key, id, reason }]).
 * A sprite item whose settings name an art style (`artStyle`, Contract 12) is exported in that style, and its manifest
 * entry says `artStyle`; an entry without it is pixel. One that asks for a style its sprite does not list is left out
 * and named under "unsupported" (never quietly exported in another style).
 * Returns [{ name, data: Uint8Array }] for zip().
 */
export async function packageFiles({ items, theme = null, scale = 1, catalog = null, onProgress = () => {} }) {
  const t = activeTheme(theme);
  const info = catalog ?? await catalogue();
  const files = [], assets = [], missing = [], unsupported = [], needsRemaking = [], refused = [];
  const folders = new Set(), soundNames = new Set(), musicNames = new Set();
  let done = 0;
  if (items.some((i) => i.definition)) { onProgress('Checking what was made on a visit…'); await restoreRuntime(true); }
  for (const item of items) {
    onProgress(`Building ${++done} of ${items.length}…`);
    const made = madeItemState(item);
    if (made && made.state !== 'ready') { needsRemaking.push(item.id); continue; }
    const s = item.settings ?? {};
    const about = info[item.id] ?? {};
    const entry = (name, meta) => ({ key: item.key, id: item.id, kind: item.kind, name: about.name ?? name, role: about.role ?? meta?.role ?? null, type: about.type ?? meta?.type ?? null, files: [], settings: s });
    // a sprite's own program is loaded here, when the package needs it
    const sprite = item.kind === 'sprite' && kindMatches(item.kind, item.id) ? await loadSprite(item.id).catch(() => null) : null;
    if (item.kind === 'sprite' ? !sprite : !kindMatches(item.kind, item.id)) { missing.push(item.id); continue; }
    if (item.kind === 'sprite') {
      const style = typeof s.artStyle === 'string' && s.artStyle ? s.artStyle : stylesOf(sprite)[0];
      if (!supports(sprite, style) || !styleById(style)) { unsupported.push({ id: item.id, artStyle: style }); continue; }
      const folder = unique(folders, item.id);
      const a = entry(sprite.name, sprite.meta);
      a.license = about.license ?? sprite.meta?.license ?? null;      // what the asset records, as recorded (licence.txt lists it)
      a.folder = `sprites/${folder}/`;
      const p = cleanParams(sprite, s.params ?? {});
      const cues = s.cues ?? defaultCues(sprite);
      let made;
      // W5-B: a sprite made on a visit whose frames at these settings fail the quality bar is left out, and named with why
      try { const parts = await spriteParts(sprite, p, cues, s.scale ?? scale, t, style, s.lookParams); made = parts.files; a.whatItIs = whatItIs(parts.json); } catch (e) {
        // (looks: below, once it is known to be in the package, the entry records the settings it was really drawn with)
        if (!e || !e.refused) throw e;
        folders.delete(folder);
        refused.push({ key: item.key, id: item.id, reason: e.reason });
        continue;
      }
      for (const f of made) {
        const name = `sprites/${folder}/${f.name}`;
        files.push({ name, data: f.data });
        a.files.push(name);
      }
      // `sheet` is the PNG sheet, for the styles that make one; every style has the animation list
      if (a.files.includes(`sprites/${folder}/${sprite.id}.png`)) a.sheet = `sprites/${folder}/${sprite.id}.png`;
      a.animations = `sprites/${folder}/${sprite.id}.json`;
      if (style !== 'pixel') a.artStyle = style;
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
      a.license = about.license ?? patch.meta?.license ?? null;
      a.whatItIs = soundWhatItIs(a);
      if (item.definition?.patch) {
        a.madeOnThisVisit = true;
        a.source = name.replace(/\.wav$/, '.source.json');
        files.push({ name: a.source, data: enc.encode(JSON.stringify(item.definition.patch, null, 1)) });
        a.files.push(a.source);
      }
      assets.push(a);
    }
  }
  // looks (Contract 7): under a look, each sprite's entry records every setting it was really drawn with, the look's
  // shape changes included, so the same picture can be made again from this list alone. A package with no look is unchanged.
  if (t) for (const a of assets) {
    const sprite = a.kind === 'sprite' ? await loadSprite(a.id).catch(() => null) : null;
    if (!sprite) continue;
    // from the bag's record of what its look made of the sprite, when it has one (the same values the sheet was drawn with)
    const used = spriteLook(sprite, a.settings?.params ?? {}, t, { record: a.settings?.lookParams });
    a.settings = { ...a.settings, params: used.params };
    delete a.settings.lookParams;
    a.changedByLook = used.changed;
  }
  const manifest = { app: 'Loadout', format: 'loadout-package', version: 1, theme: normalizeTheme(t ?? {}), assets };
  if (t && assets.some((a) => a.kind === 'sprite')) manifest.settingsUsed = SETTINGS_USED;
  if (missing.length) manifest.missing = missing;
  if (unsupported.length) manifest.unsupported = unsupported;
  if (needsRemaking.length) manifest.needsRemaking = needsRemaking;
  if (refused.length) manifest.refused = refused;
  files.push({ name: 'manifest.json', data: enc.encode(JSON.stringify(manifest, null, 2)) });
  files.push({ name: 'read-me.txt', data: enc.encode(packageGuide(manifest, !!t)) });      // opens with the contents list: name, what it is, where
  files.push({ name: 'licence.txt', data: enc.encode(licenceText(assets)) });               // what every asset records about its licence, and nothing more
  return files;
}
