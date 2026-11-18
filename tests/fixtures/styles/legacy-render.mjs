// The renderer as it was before the style seam (task W6-A, 2026-11-18): renderFrame and renderSheet copied
// word for word from engine/sprite.js of that day, drawing straight onto `new Surface`. Nothing ships from here.
// tests/unit/styles-identical.test.mjs draws every sprite in sprites/ through this and through today's engine
// and requires the same bytes, so the seam can never change what the pixel style makes.
import { Surface } from '../../../engine/surface.js';
import { partList, partRemoved, inEffect, clipFps, clipStretch, frameSockets } from '../../../engine/sprite.js';

const phase = (c, frame) => (c.loop ? frame / c.frames : c.frames > 1 ? frame / (c.frames - 1) : 0);

export function legacyRenderFrame(sprite, clip, frame, p) {
  const c = sprite.clips[clip];
  if (!c) throw new Error(`sprite ${sprite.id}: no clip "${clip}"`);
  const g = new Surface(sprite.size[0], sprite.size[1]);
  sprite.render(g, { clip, t: phase(c, frame), frame, frames: c.frames, loop: c.loop, p });
  return g;
}

export function legacyRenderSheet(sprite, p, { scale = 1, clips = Object.keys(sprite.clips) } = {}) {
  const [fw, fh] = sprite.size;
  const cols = Math.max(...clips.map((c) => sprite.clips[c].frames));
  const W = cols * fw * scale, H = clips.length * fh * scale;
  const data = new Uint32Array(W * H);
  const meta = {
    app: 'Loadout', version: 1, sprite: sprite.id, name: sprite.name,
    image: `${sprite.id}.png`,
    frameWidth: fw * scale, frameHeight: fh * scale, scale,
    pivot: { x: sprite.pivot[0] * scale, y: sprite.pivot[1] * scale },
    facing: 'right',
    params: p,
    parts: Object.fromEntries(partList(sprite).map((part) => {
      const present = !partRemoved(sprite, part.name, p) && inEffect(sprite, part.selector, p);
      const out = { label: part.label };
      if (part.socket !== undefined) out.socket = part.socket;
      out.present = present;
      out.settings = Object.fromEntries(part.params.filter((k) => k === part.selector || (present && inEffect(sprite, k, p))).map((k) => [k, p[k]]));
      return [part.name, out];
    })),
    animations: {},
    frames: [],
  };
  const hasSockets = typeof sprite.sockets === 'function';
  if (hasSockets) meta.socketAngle = 'radians: 0 points down the image, PI/2 to the right of the image (the way a side-view sprite faces), PI up; to mirror a frame use x = 2*pivotX - x and angle = -angle';
  const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
  if (sprite.slice && typeof sprite.slice === 'object') for (const k of Object.keys(sprite.slice)) if (!sprite.clips[k]) throw new Error(`sprite ${sprite.id}: slice names clip "${k}", which does not exist`);
  const scaled = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v * scale]));
  clips.forEach((name, row) => {
    const c = sprite.clips[name];
    const fps = clipFps(sprite, name, p);
    meta.animations[name] = { row, frames: c.frames, fps, loop: c.loop };
    const st = clipStretch(sprite, name, p);
    const stretch = st ? Object.fromEntries(Object.entries(st).map(([k, v]) => [k, scaled(v)])) : null;
    if (stretch) Object.assign(meta.animations[name], stretch);
    for (let f = 0; f < c.frames; f++) {
      const g = legacyRenderFrame(sprite, name, f, p);
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
        const v = g.data[y * fw + x];
        if (!v) continue;
        const ox = (f * fw + x) * scale, oy = (row * fh + y) * scale;
        for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) data[(oy + sy) * W + ox + sx] = v;
      }
      const entry = { name: `${name}_${f}`, animation: name, x: f * fw * scale, y: row * fh * scale, w: fw * scale, h: fh * scale, duration: Math.round(1000 / fps) };
      if (stretch) for (const [k, v] of Object.entries(stretch)) entry[k] = { ...v };
      if (hasSockets) {
        entry.sockets = Object.fromEntries(Object.entries(frameSockets(sprite, name, f, p) ?? {}).map(([k, s]) => [k, { x: r2(s.x * scale), y: r2(s.y * scale), angle: r3(s.angle ?? 0) }]));
      }
      meta.frames.push(entry);
    }
  });
  return { w: W, h: H, data, meta };
}
