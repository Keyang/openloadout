// Reading sprite source text, and the limits on what a source made on a visit may ask for.
// Plain functions with no page, worker or Node in them: the site (app/api-core.js), the build (tools/lib/api.mjs)
// and the unit tests all use this file. See docs/architecture.md, Contract 11, "Safety of run-time assets".

/**
 * The limits on a sprite made on a visit. A made source is a program someone else may have written, so each of
 * these is enforced before or while it runs, and going over one ends with { ok: false, errors }, never a hang.
 */
export const LIMITS = Object.freeze({
  sourceChars: 400_000,          // the source text; the largest file in sprites/ is a tenth of this
  frameWidth: 640,               // one frame, in pixels: twice each side of the largest real frame, a 320 by 180 backdrop
  frameHeight: 360,
  clips: 32,                     // animations in one sprite
  framesPerClip: 64,             // frames in one animation
  frames: 256,                   // frames in all its animations together
  controls: 48,
  descriptionChars: 200_000,     // everything a sprite says about itself (controls, clips, parts, metadata), as JSON
  textChars: 2000,               // its name, or its one-sentence description
  loadMs: 10_000,                // reading the source: its own top-level code and the framework files it imports
  checkMs: 60_000,               // the whole quality bar, with every frame it asks to be drawn
  adviceMs: 10_000,              // looking at how the source's own code draws (advice for its maker; never part of the verdict)
  checkRounds: 12,               // times the bar is run again after asking for more settings
  checkSettings: 600,            // settings the bar may ask to be drawn for one sprite
  checkBytes: 512 * 1024 * 1024, // pixels handed to the bar for one sprite
  frameMs: 300,                  // drawing one frame...
  drawFloorMs: 3_000,            // ...but never less than this for one request, so a slow start is not a false alarm
  soundCheckMs: 60_000,          // the quality bar on a sound effect
  musicCheckMs: 600_000,         // ...and on a music track, which is rendered many times over
  workers: 8,                    // made sprites kept running at once; the least recently used is stopped and started again when needed
  cacheBytes: 96 * 1024 * 1024,  // pixels kept on the page for one made sprite, over all the settings it has been drawn at
  surfaceItems: 200_000,         // numbers, texts and lists in one frame drawn in an art style that is not a pixel grid
});

/**
 * What the worker a made sprite runs in takes away before the source is read (app/sandbox-worker.js): every name
 * by which a worker reaches the network, the site's storage, other workers, the page, files or devices. A browser
 * that adds a new such name needs it added here; the content policy is what stops a call to another site even then.
 */
export const TAKEN = Object.freeze([
  // the network
  'fetch', 'XMLHttpRequest', 'WebSocket', 'WebSocketStream', 'EventSource', 'WebTransport', 'RTCPeerConnection', 'RTCDataChannel', 'importScripts', 'fetchLater',
  // the site's storage, and other pages and workers of it
  'indexedDB', 'caches', 'cookieStore', 'BroadcastChannel', 'MessageChannel', 'MessagePort', 'Worker', 'SharedWorker', 'ServiceWorkerRegistration', 'Notification', 'navigator', 'location', 'origin',
  // the page: only this file answers it
  'postMessage', 'onmessage', 'onmessageerror', 'close',
  // files and devices
  'FileReader', 'FileReaderSync', 'FileSystemHandle', 'FileSystemFileHandle', 'FileSystemDirectoryHandle', 'showOpenFilePicker', 'FontFace', 'fonts', 'OffscreenCanvas', 'createImageBitmap', 'ImageDecoder', 'VideoDecoder', 'AudioDecoder', 'WebAssembly',
]);

/** The refusal every action uses: { ok: false, ...extra, errors: [...] }. errors: one message or a list. */
export const fail = (errors, extra = {}) => ({ ok: false, ...extra, errors: [].concat(errors) });

const ID_RE = /^[a-z][a-z0-9-]*$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const say = (v) => (v === null ? 'null' : v === undefined ? 'nothing' : Array.isArray(v) ? 'a list' : typeof v === 'string' ? JSON.stringify(v.length > 40 ? `${v.slice(0, 40)}…` : v) : typeof v === 'function' ? 'a function' : typeof v === 'object' ? 'an object' : `the ${typeof v} ${String(v)}`);

/**
 * What a made sprite said about itself, checked on the page before anything is drawn or kept. `d` came out of the
 * worker the source ran in, so nothing in it is trusted: every field is read, typed and capped here.
 * Returns { ok: true, description } (a copy holding only what was checked) or { ok: false, errors }.
 */
export function cleanDescription(d, limits = LIMITS) {
  const errors = [];
  const bad = (m) => { errors.push(m); };
  if (!isObj(d)) return fail('The source did not describe a sprite.');
  let json = '';
  try { json = JSON.stringify(d); } catch { return fail('What the sprite says about itself is not plain data.'); }
  if (json.length > limits.descriptionChars) return fail(`The sprite describes itself in ${json.length.toLocaleString('en')} characters (controls, clips, parts, metadata); the most is ${limits.descriptionChars.toLocaleString('en')}.`);
  const copy = JSON.parse(json);
  const text = (v, what, need) => { if (v === undefined || v === null) { if (need) bad(`The sprite needs ${what}.`); return need ? '' : undefined; } if (typeof v !== 'string' || v.length > limits.textChars) { bad(`The sprite's ${what} must be text of at most ${limits.textChars.toLocaleString('en')} characters.`); return ''; } return v; };
  const whole = (v) => Number.isInteger(v);
  if (typeof copy.id !== 'string' || !ID_RE.test(copy.id) || copy.id.length > 64) bad(`The sprite's id must be lowercase letters, digits and dashes, starting with a letter, at most 64 characters. Got ${say(copy.id)}.`);
  const out = { id: copy.id, name: text(copy.name, 'a name', true), kind: text(copy.kind, 'kind', false), blurb: text(copy.blurb, 'one-sentence description (blurb)', false) ?? '', preview: text(copy.preview, 'preview clip', false) };
  const [w, h] = Array.isArray(copy.size) ? copy.size : [];
  if (!whole(w) || !whole(h) || w < 1 || h < 1) bad(`size must be [width, height] in whole pixels. Got ${JSON.stringify(copy.size)}.`);
  else if (w > limits.frameWidth || h > limits.frameHeight) bad(`A frame of ${w} by ${h} pixels is too big: the most a sprite made on a visit may be is ${limits.frameWidth} by ${limits.frameHeight} (the largest frame in the catalogue, a backdrop, is 320 by 180).`);
  out.size = [w, h];
  if (!Array.isArray(copy.pivot) || copy.pivot.length !== 2 || !copy.pivot.every(Number.isFinite)) bad(`pivot must be [x, y] in frame pixels. Got ${JSON.stringify(copy.pivot)}.`);
  out.pivot = copy.pivot;
  if (copy.grounded !== undefined) out.grounded = copy.grounded !== false;
  // clips
  const clips = isObj(copy.clips) ? Object.entries(copy.clips) : [];
  if (!clips.length) bad('The sprite needs at least one clip.');
  if (clips.length > limits.clips) bad(`The sprite has ${clips.length} clips; the most is ${limits.clips}.`);
  out.clips = {};
  let total = 0;
  for (const [name, c] of clips.slice(0, limits.clips)) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(name)) { bad(`A clip's name must be letters, digits, dashes and underscores, at most 40 characters. Got ${say(name)}.`); continue; }
    if (!isObj(c) || !whole(c.frames) || c.frames < 1) { bad(`The clip "${name}" needs frames: a whole number, 1 or more.`); continue; }
    if (c.frames > limits.framesPerClip) { bad(`The clip "${name}" has ${c.frames} frames; the most in one clip is ${limits.framesPerClip}.`); continue; }
    total += c.frames;
    out.clips[name] = { frames: c.frames, loop: c.loop !== false, ...(typeof c.label === 'string' && c.label.length <= 80 ? { label: c.label } : {}) };
  }
  if (total > limits.frames) bad(`The sprite has ${total} frames in all; the most is ${limits.frames}.`);
  // controls, parts, sounds, metadata: plain data, read again by defineSprite on the page
  if (!isObj(copy.params)) bad('params must be an object of controls.');
  else if (Object.keys(copy.params).length > limits.controls) bad(`The sprite has ${Object.keys(copy.params).length} controls; the most is ${limits.controls}.`);
  out.params = isObj(copy.params) ? copy.params : {};
  for (const [k, c] of Object.entries(out.params)) if (!isObj(c) || !['range', 'choice', 'color', 'toggle'].includes(c.kind)) bad(`The control "${k}" must be made with range(), choice(), color() or toggle().`);
  out.parts = isObj(copy.parts) ? copy.parts : {};
  out.sounds = isObj(copy.sounds) ? copy.sounds : {};
  if (copy.meta !== undefined && copy.meta !== null) { if (isObj(copy.meta)) out.meta = copy.meta; else bad('meta must be an object.'); }
  // attach points and stretch rules are worked out where the source runs and arrive as data with each frame
  out.socketNames = Array.isArray(copy.socketNames) ? copy.socketNames.filter((n) => typeof n === 'string' && n.length <= 40).slice(0, 32) : null;
  out.hasSlice = copy.hasSlice === true;
  out.styles = Array.isArray(copy.styles) ? copy.styles.filter((x) => typeof x === 'string').slice(0, 8) : ['pixel'];
  return errors.length ? fail(errors) : { ok: true, description: out };
}

// ---- reading source text ------------------------------------------------------------------------------------

const REGEX_AFTER = /^(?:return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/;

/**
 * Source text with every comment, and the inside of every string, template and regular expression, blanked out
 * (same length, same line breaks), so a pattern run over it only ever matches code.
 * Returns { code, strings }: strings lists the quoted strings as { start, end, value } (positions of the quotes).
 */
export function maskSource(text) {
  const src = String(text), n = src.length, out = src.split(''), strings = [];
  const blank = (a, b) => { for (let k = a; k < b && k < n; k++) if (out[k] !== '\n') out[k] = ' '; };
  const templates = [];           // brace depth at each ${ we are inside
  let depth = 0, prev = '', word = '', i = 0;
  // from just after a ` or the } that ends a ${...}: blank up to the closing ` or the next ${
  const template = (from) => {
    let j = from;
    for (; j < n; j++) {
      if (src[j] === '\\') { j++; continue; }
      if (src[j] === '`') { blank(from, j); prev = 'a'; word = ''; return j + 1; }
      if (src[j] === '$' && src[j + 1] === '{') { blank(from, j); templates.push(depth); prev = '{'; word = ''; return j + 2; }
    }
    blank(from, n);
    return n;
  };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { let e = src.indexOf('\n', i); if (e < 0) e = n; blank(i, e); i = e; continue; }
    if (c === '/' && d === '*') { let e = src.indexOf('*/', i + 2); e = e < 0 ? n : e + 2; blank(i, e); i = e; continue; }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      j = Math.min(j, n);
      strings.push({ start: i, end: Math.min(j + 1, n), value: src.slice(i + 1, j) });
      blank(i + 1, j); i = j + 1; prev = 'a'; word = '';
      continue;
    }
    if (c === '`') { i = template(i + 1); continue; }
    if (c === '}' && templates.length && templates[templates.length - 1] === depth) { templates.pop(); i = template(i + 1); continue; }
    if (c === '/' && (prev === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prev) || REGEX_AFTER.test(word))) {
      let j = i + 1, inClass = false, closed = false;
      for (; j < n && src[j] !== '\n'; j++) {
        if (src[j] === '\\') { j++; continue; }
        if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        else if (src[j] === '/' && !inClass) { closed = true; break; }
      }
      if (closed) { blank(i + 1, j); i = j + 1; while (i < n && /[a-z]/i.test(src[i])) i++; prev = 'a'; word = ''; continue; }
    }
    if (/[\w$]/.test(c)) { let j = i; while (j < n && /[\w$]/.test(src[j])) j++; word = src.slice(i, j); prev = 'a'; i = j; continue; }
    if (c === '{') depth++; else if (c === '}') depth--;
    if (!/\s/.test(c)) { prev = c; word = ''; }
    i++;
  }
  return { code: out.join(''), strings };
}

/**
 * Sprite source text names the framework by relative paths ('../engine/sprite.js'), which only work for a file
 * in sprites/. This rewrites every import address to a full one, as if the text were sprites/<id>.js, so the text
 * can be loaded as a module from memory. base: the address of sprites/; origin: the site's own origin;
 * within (optional): the address of the site's own folder, which an import may not leave.
 * An import from anywhere but this site is refused. Returns { ok, source, imports } or { ok: false, errors }.
 * This keeps a sprite's imports to the site's own files; it is not a sandbox (the source still runs in the page).
 */
export function rewriteImports(source, { base, origin, within = null } = {}) {
  if (typeof source !== 'string' || !source.trim()) return fail(`The source must be text: one ES module that ends in "export default defineSprite({ ... })". Got ${say(source)}.`);
  const { code, strings } = maskSource(source);
  const at = new Map(strings.map((s) => [s.start, s]));
  const lineOf = (pos) => source.slice(0, pos).split('\n').length;
  const errors = [], found = [];
  const take = (pos) => { const s = at.get(pos); if (s) found.push(s); return s; };
  for (const m of code.matchAll(/(?<![.\w$])(?:import|export)\b[^;'"`()=]*?\bfrom\s*(?=['"])/g)) take(m.index + m[0].length);
  for (const m of code.matchAll(/(?<![.\w$])import\s*(?=['"])/g)) take(m.index + m[0].length);
  for (const m of code.matchAll(/(?<![.\w$])import\s*\(\s*/g)) {
    const s = at.get(m.index + m[0].length);
    if (s && /^\s*[),]/.test(code.slice(s.end))) found.push(s);
    else errors.push(`line ${lineOf(m.index)}: import() must name its file as plain text, for example import('../engine/fx.js'), so the address can be checked.`);
  }
  const usual = "a sprite imports this site's own files by path, for example '../engine/sprite.js'";
  const edits = [];
  for (const s of found) {
    const spec = s.value, where = `line ${lineOf(s.start)}: cannot import "${spec}"`;
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(spec)?.[1].toLowerCase();
    if (scheme && scheme !== 'http' && scheme !== 'https') { errors.push(`${where}: ${scheme}: addresses are not allowed; ${usual}.`); continue; }
    if (!scheme && !/^(\.{1,2}\/|\/)/.test(spec)) { errors.push(`${where}: it is not a path; ${usual}.`); continue; }
    let url;
    try { url = new URL(spec, base); } catch { errors.push(`${where}: it is not an address; ${usual}.`); continue; }
    if (url.origin !== origin) { errors.push(`${where}: it is on another site (${url.origin}); ${usual}.`); continue; }
    // on a host where several sites share one origin, the site is its own folder and nothing beside it
    if (within && !url.href.startsWith(within)) { errors.push(`${where}: it is outside this site (${within}); ${usual}.`); continue; }
    edits.push({ s, href: url.href });
  }
  if (errors.length) return fail(errors);
  edits.sort((a, b) => a.s.start - b.s.start);
  let out = '', last = 0;
  for (const { s, href } of edits) { out += source.slice(last, s.start + 1) + href; last = s.end - 1; }
  return { ok: true, source: out + source.slice(last), imports: edits.map((e) => e.href) };
}

