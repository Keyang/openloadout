// Playground: stepping a clip through its frames, and finding the sounds that belong to the
// frames just reached. A frame is reported once each time the clip arrives at it, so a sound
// on that frame fires exactly once per pass.
// Pure JavaScript: no DOM.

/**
 * A clip that is playing. flip: mirrored. hold: standing on one frame (no time passes, no sounds).
 * start: the frame to begin on. rate: speed multiplier.
 */
export function createAnim(clip, { flip = false, hold = false, start = 0, rate = 1 } = {}) {
  return { clip, flip, hold, rate, start, time: 0, index: start - 1, frame: start, done: false };
}

/**
 * Move the clip on by dt seconds. info: { frames, fps, loop }.
 * Returns the frames reached during this step, in order (the first call reports the start frame).
 * A one-shot clip stops on its last frame and sets anim.done.
 */
export function advance(anim, info, dt) {
  if (anim.hold || anim.done) return [];
  anim.time += dt * anim.rate;
  const target = anim.start + Math.floor(anim.time * info.fps + 1e-9);
  const out = [];
  for (let i = anim.index + 1; i <= target && out.length < info.frames; i++) {
    if (!info.loop && i >= info.frames) break;
    out.push(info.loop ? i % info.frames : i);
  }
  anim.index = target;
  if (info.loop) anim.frame = ((target % info.frames) + info.frames) % info.frames;
  else {
    anim.frame = Math.min(info.frames - 1, target);
    if (target >= info.frames) anim.done = true;      // the last frame has been shown for its full time
  }
  return out;
}

/** Put a one-shot clip on a frame by hand (never backwards). Returns the frames reached on the way. */
export function seek(anim, info, frame) {
  const to = Math.max(0, Math.min(info.frames - 1, Math.round(frame)));
  const out = [];
  for (let i = Math.max(anim.index + 1, anim.start); i <= to; i++) out.push(i);
  if (to > anim.index) { anim.index = to; anim.frame = to; }
  return out;
}

/** The frames a one-shot clip has not reached yet (played out at once when it is cut short). */
export function restOf(anim, info) {
  const out = [];
  for (let i = Math.max(anim.index + 1, anim.start); i < info.frames; i++) out.push(i);
  anim.index = info.frames - 1; anim.frame = info.frames - 1;
  return out;
}

/** The sounds to fire for the frames just reached. Looping sounds are not fired from a frame: they run while the clip plays. */
export function cuesAt(cues, frames) {
  if (!cues || !cues.length || !frames.length) return [];
  const out = [];
  for (const f of frames) for (const c of cues) if (!c.loop && c.frame === f) out.push(c);
  return out;
}
