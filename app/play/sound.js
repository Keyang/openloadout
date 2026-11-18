// Playground: sound. Sprite sounds fire on their frames, looping sounds run while their clip
// plays, loose sound effects sit on a sound board, and music plays live so its sliders are heard
// at once. The bag's look applies to all of it: sound effects are re-pitched and brightened,
// music takes its tempo, key and intensity from the look.
import { defaultTheme, normalizeTheme } from '../../engine/theme.js';
import { applySound, themedSoundParams, soundSettingsFor } from '../../sound/theme.js';
import { soundParams, rendered, renderAsync, playRendered, playLive } from '../audio.js';

/**
 * theme: the bag's look. patchOf(id): a sound's patch, or undefined when it is not known.
 * Returns the functions the page uses; nothing plays before the visitor's first click or key press.
 */
export function createSounds({ theme, patchOf }) {
  const t = normalizeTheme(theme);
  const neutral = JSON.stringify(t) === JSON.stringify(defaultTheme());
  const made = new Map();
  let gone = false;

  /** A sound effect rendered with its settings and the bag's look. Made once and kept. */
  function themed(patch, params, seed) {
    const key = patch.id + '|' + seed + '|' + patch.params.map((d) => params[d.id]).join(',');
    let r = made.get(key);
    if (!r) {
      r = neutral ? rendered(patch, params, seed) : applySound(rendered(patch, themedSoundParams(patch, params, t), seed), soundSettingsFor(patch, t));
      made.set(key, r);
    }
    return r;
  }

  const turn = new Map();
  /** Play a sprite's sound (one entry of its sound list). Each play is a slightly different take, as on the sprite's page. */
  function cue(c) {
    const patch = patchOf(c.sound);
    if (!patch || patch.loop) return null;
    const n = ((turn.get(c) ?? 0) + 1) % 3;
    turn.set(c, n);
    return playRendered(themed(patch, soundParams(patch, c.preset, c.params), 1 + n), { volume: c.volume ?? 1 });
  }

  /** Make sounds ahead of time, one at a time, so the first play does not make the scene stutter. */
  function warm(cues) {
    const jobs = [];
    for (const c of cues) {
      const patch = patchOf(c.sound);
      if (!patch) continue;
      for (const seed of patch.loop ? [1] : [2, 3, 1]) jobs.push([patch, soundParams(patch, c.preset, c.params), seed]);
    }
    const next = () => {
      const job = jobs.shift();
      if (!job || gone) return;
      try { themed(...job); } catch (e) { console.error(`sound ${job[0].id}:`, e); }
      setTimeout(next, 0);
    };
    setTimeout(next, 0);
  }

  // ---- looping sounds that belong to a clip (a fire's crackle)

  const loops = new Map();
  /** list: world.activeLoops(). Starts the loops that should run and stops the rest. */
  function syncLoops(list) {
    const want = new Map(list.map((l) => [l.id, l]));
    for (const [id, h] of loops) if (!want.has(id)) { h.stop(); loops.delete(id); }
    for (const [id, l] of want) {
      if (loops.has(id)) continue;
      const patch = patchOf(l.sound);
      if (!patch) continue;
      const h = playRendered(themed(patch, soundParams(patch, l.cue.preset, l.cue.params), 1), { loop: true, volume: (l.cue.volume ?? 1) * 0.7 });
      if (h) loops.set(id, h);        // null before the first click or while muted: tried again next time
    }
  }
  function stopLoops() { for (const h of loops.values()) h.stop(); loops.clear(); }

  // ---- the sound board: one button for each loose sound

  /** A sound from the bag with its own settings. Returns { play() -> true while it is sounding, stop(), playing() }. */
  function boardSound(patch, settings, onChange = () => {}) {
    const params = soundParams(patch, settings?.style, settings?.params);
    let handle = null;
    const api = {
      playing: () => !!handle,
      stop() { if (handle) { handle.stop(); handle = null; onChange(); } },
      play() {
        if (handle && patch.loop) { api.stop(); return false; }
        const h = playRendered(themed(patch, params, settings?.seed ?? 1), { force: true, loop: !!patch.loop, onended: () => { if (handle === h) { handle = null; onChange(); } } });
        handle = h;
        onChange();
        return !!h;
      },
    };
    return api;
  }

  // ---- music: live, so its sliders are heard while it plays

  /** A music track from the bag. Returns { params, start() (a promise), stop(), set(id, value), playing(), starting() }. */
  function track(patch, settings, onChange = () => {}) {
    const params = themedSoundParams(patch, soundParams(patch, settings?.style, settings?.params), t);
    let voice = null, starting = false, note = '';
    const api = {
      params,
      playing: () => !!voice,
      starting: () => starting,
      note: () => note,
      set(id, value) { params[id] = value; if (voice) voice.set(id, value); },
      stop() { starting = false; if (voice) voice.stop(); voice = null; onChange(); },
      async start() {
        if (voice || starting) return;
        starting = true; note = ''; onChange();
        try {
          const v = await playLive(patch, { ...params });
          if (gone || !starting) { v.stop(); return; }
          voice = v;
        } catch {
          // no live audio in this browser: play the finished loop instead
          try {
            const r = await renderAsync(patch, { ...params });
            if (gone || !starting) return;
            const h = playRendered(r, { force: true, loop: true });
            voice = { set() {}, stop: () => h && h.stop() };
            note = 'This browser cannot change the music while it plays. Stop it and play it again to hear a change.';
          } catch (e) { note = `The music could not start: ${e.message}.`; }
        }
        starting = false; onChange();
      },
    };
    return api;
  }

  return { cue, warm, syncLoops, stopLoops, boardSound, track, destroy() { gone = true; stopLoops(); } };
}
