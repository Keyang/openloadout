// Any frame number of a data sprite, drawn inside its clip (build item B9, review rounds 1 and 2). A code sprite draws
// whatever frame it is asked for; a data sprite's generators are handed the clip phase, which must lie in 0..1, and the
// sprite page's clock can ask for frame -1 (a requestAnimationFrame time before the start) or `frames` (a loop's end).
// framesInClip wraps a sprite's render and sockets so that a looping clip wraps round (frame -1 is its last frame,
// `frames` its first) and a clip that plays once holds its first and last frames; frames inside the clip are drawn
// exactly as before. Used by every loader of data sprites: app/catalog.js (library rows, studio sprites, anything
// handed to addRuntimeAsset as { data, sprite }) and tools/lib/assets.mjs (build, thumbnails, quality, check, render).
// It lives in engine/ so the picture key (tools/lib/thumbs.mjs: engine/ and rigs/) and the quality key
// (tools/lib/quality-run.mjs DATA_STARTS) both cover it. Until engine/data-sprite.js wraps frames itself (B6), this is
// the one place; once it does, the wrap finds every frame already inside the clip and changes nothing.
// Plain ES module, no imports: it runs unchanged in the browser and in Node.

const IN_CLIP = Symbol('framesInClip');

/** The frame a clip draws for any frame number: a looping clip wraps round, one that plays once holds its first and last frames (a frame that is not a finite number is left as it is). */
export const frameInClip = (c, frame) => (!Number.isFinite(frame) ? frame : c.loop === false ? Math.min(c.frames - 1, Math.max(0, frame)) : ((frame % c.frames) + c.frames) % c.frames);

/** The clip phase of a frame, as engine/sprite.js renderFrame works it out. */
const phaseOfFrame = (c, f) => (c.loop !== false ? f / c.frames : c.frames > 1 ? f / (c.frames - 1) : 0);

/**
 * Makes a data sprite draw any frame number, as a code sprite does: render brings the frame into its clip first
 * (frameInClip, with the phase to match) and sockets asks at a phase inside 0..1 (a looping clip wraps, one that plays
 * once is held at its ends). Changes the sprite in place, once (a second call does nothing), and returns it; anything
 * that is not a sprite is returned as it is.
 */
export function framesInClip(sprite) {
  if (!sprite || typeof sprite !== 'object' || typeof sprite.render !== 'function' || sprite[IN_CLIP]) return sprite;
  const render = sprite.render, sockets = sprite.sockets;
  sprite.render = function (g, ctx) {
    const c = ctx && sprite.clips?.[ctx.clip];
    const f = c ? frameInClip(c, ctx.frame) : undefined;
    if (!c || !Number.isFinite(f) || (f === ctx.frame && ctx.t >= 0 && ctx.t <= 1)) return render.call(this, g, ctx);
    return render.call(this, g, { ...ctx, frame: f, t: phaseOfFrame(c, f) });
  };
  if (typeof sockets === 'function') {
    sprite.sockets = function (clip, t, p) {
      const c = sprite.clips?.[clip];
      if (!c || !Number.isFinite(t) || (t >= 0 && t <= 1)) return sockets.call(this, clip, t, p);
      return sockets.call(this, clip, c.loop !== false ? t - Math.floor(t) : Math.min(1, Math.max(0, t)), p);
    };
  }
  Object.defineProperty(sprite, IN_CLIP, { value: true });
  return sprite;
}
