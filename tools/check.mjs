#!/usr/bin/env node
// Automatic checks for sprites. Run after every change:
//
//   node tools/check.mjs            all sprites
//   node tools/check.mjs <id>       one sprite
//
// Errors fail the run (exit 1); warnings are things to look at by eye.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sprites } from '../sprites/index.js';
import { renderFrame, defaultParams, cleanParams, randomParams } from '../engine/sprite.js';
import { brightness } from '../engine/color.js';

const only = process.argv[2];
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'sprites');
let list = only ? sprites.filter((s) => s.id === only) : sprites;
// a sprite does not have to be in the gallery list yet: sprites/<id>.js is loaded directly
if (only && !list.length && fs.existsSync(path.join(dir, `${only}.js`))) {
  list = [(await import(`../sprites/${only}.js`)).default];
  console.log(`note: "${only}" is not in sprites/index.js yet, so it will not show in the gallery`);
}
if (!only) for (const f of fs.readdirSync(dir)) {
  const fid = f.replace(/\.js$/, '');
  if (f.endsWith('.js') && f !== 'index.js' && !f.startsWith('_') && !sprites.some((s) => s.id === fid)) console.log(`note: sprites/${f} is not listed in sprites/index.js`);
}
if (!list.length) { console.error(`Unknown sprite "${only}". Known: ${sprites.map((s) => s.id).join(', ')}`); process.exit(1); }

const soundsDir = path.resolve(dir, '..', 'sounds');
const soundIndex = new Map();
if (fs.existsSync(soundsDir)) for (const f of fs.readdirSync(soundsDir)) {
  if (!f.endsWith('.json') || f === 'index.json') continue;
  const patch = JSON.parse(fs.readFileSync(path.join(soundsDir, f), 'utf8'));
  soundIndex.set(patch.id, patch);
}

const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };
let failed = false;

for (const sprite of list) {
  const errors = new Set(), warns = new Set();
  const [w, h] = sprite.size;
  const lo = {}, hi = {};
  for (const [k, d] of Object.entries(sprite.params)) {
    if (!d || !d.kind) { errors.add(`param "${k}" is not built with range/choice/color/toggle`); continue; }
    if (!d.label) errors.add(`param "${k}" has no label`);
    if (d.kind === 'range') { lo[k] = d.min; hi[k] = d.max; }
    if (d.kind === 'color' && !(d.swatches?.length >= 3)) errors.add(`color param "${k}" needs at least 3 swatches`);
    if (d.kind === 'color') for (const c of d.swatches ?? []) if (brightness(c) < 0.14) warns.add(`color param "${k}": swatch ${c} is almost as dark as the outline, so shapes in it merge into a black blob`);
  }
  if (new Set(sprites.map((s) => s.id)).size !== sprites.length) errors.add('duplicate sprite ids in sprites/index.js');
  for (const [cname, list] of Object.entries(sprite.sounds ?? {})) for (const c of list) {
    const patch = soundIndex.get(c.sound);
    if (!patch) { errors.add(`sound "${c.sound}" on clip ${cname} is not in sounds/ (known: ${[...soundIndex.keys()].join(', ')})`); continue; }
    if (patch.category === 'music') errors.add(`"${c.sound}" on clip ${cname} is a music track; sprite animations take sound effects`);
    if (c.preset && !(patch.presets && patch.presets[c.preset])) errors.add(`sound "${c.sound}" on clip ${cname}: no preset "${c.preset}" (it has: ${Object.keys(patch.presets ?? {}).join(', ') || 'none'})`);
    if (patch.loop && !sprite.clips[cname].loop) warns.add(`looping sound "${c.sound}" on one-shot clip ${cname}: it only plays while that clip is on screen`);
  }
  const nParams = Object.keys(sprite.params).length;
  if (nParams < 4) warns.add(`only ${nParams} parameters: give people more to play with`);
  if (nParams > 16) warns.add(`${nParams} parameters: too many for a simple panel (aim for 8-15)`);

  const looks = [['default', defaultParams(sprite)], ['all-low', cleanParams(sprite, lo)], ['all-high', cleanParams(sprite, hi)]];
  for (let i = 0; i < 40; i++) looks.push([`random#${i}`, randomParams(sprite, 1000 + i * 7919)]);
  // every choice option at least once with otherwise default values
  for (const [k, d] of Object.entries(sprite.params)) if (d.kind === 'choice') for (const o of d.options) looks.push([`${k}=${o.value}`, { ...defaultParams(sprite), [k]: o.value }]);

  for (const [lname, p] of looks) {
    for (const [cname, clip] of Object.entries(sprite.clips)) {
      let frames;
      try {
        frames = Array.from({ length: clip.frames }, (_, f) => renderFrame(sprite, cname, f, p));
      } catch (e) {
        errors.add(`${cname} / ${lname}: render threw ${e.message}`);
        continue;
      }
      const colours = new Set();
      let groundLow = -1;
      frames.forEach((g, f) => {
        const b = g.bounds();
        if (!b) { errors.add(`${cname} frame ${f} / ${lname}: nothing drawn`); return; }
        if (b.x0 === 0 || b.y0 === 0 || b.x1 === w - 1 || b.y1 === h - 1) errors.add(`${cname} / ${lname}: drawing touches the canvas edge (clipped) — frame ${f}, box ${b.x0},${b.y0}..${b.x1},${b.y1}`);
        for (const v of g.data) if (v) colours.add(v);
        groundLow = Math.max(groundLow, b.y1);
        if (lname === 'default') {
          const again = renderFrame(sprite, cname, f, p);
          if (diff(g, again)) errors.add(`${cname} frame ${f}: two renders differ — do not use Math.random() or Date; use hash()/rng()`);
        }
      });
      if (colours.size > 32) warns.add(`${cname} / ${lname}: ${colours.size} colours in one clip (pixel art reads best under ~24)`);
      if (lname === 'default' && clip.frames > 1) {
        const steps = [];
        for (let f = 1; f < clip.frames; f++) steps.push(diff(frames[f - 1], frames[f]));
        const avg = steps.reduce((a, b) => a + b, 0) / steps.length;
        if (avg === 0) errors.add(`${cname}: all frames are identical`);
        if (steps.filter((s) => s === 0).length > clip.frames / 2) warns.add(`${cname}: more than half the frames repeat the previous one`);
        if (clip.loop) {
          const wrap = diff(frames[clip.frames - 1], frames[0]);
          if (wrap > avg * 2.5 + 8) warns.add(`${cname}: loop seam — last→first frame changes ${wrap}px vs ${avg.toFixed(0)}px between other frames`);
          if (wrap === 0) warns.add(`${cname}: last frame equals first frame (a loop should not repeat its first pose)`);
        }
      }
      if (lname === 'default' && sprite.grounded !== false && cname === Object.keys(sprite.clips)[0]) {
        if (Math.abs(groundLow - sprite.pivot[1]) > 2) warns.add(`${cname}: lowest pixel is at y=${groundLow} but pivot y=${sprite.pivot[1]} — feet should rest on the pivot line (set grounded: false for flying things)`);
      }
    }
  }
  const status = errors.size ? 'FAIL' : warns.size ? 'ok (warnings)' : 'ok';
  console.log(`${sprite.id.padEnd(14)} ${status}   ${looks.length} looks x ${Object.keys(sprite.clips).length} clips`);
  for (const e of errors) console.log(`   ERROR  ${e}`);
  for (const m of warns) console.log(`   warn   ${m}`);
  if (errors.size) failed = true;
}
process.exit(failed ? 1 : 0);
