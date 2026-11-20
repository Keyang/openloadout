// The studio's stamp painter as pure data changes (build item B17; docs/data-sprites.md 2.7 "stamp" and section 6, "paint
// a stamp pixel by pixel at 12x with the palette's slots"). A stamp is { kind: 'stamp', at, rows: ['..a..', ...], key:
// { a: <paint ref> }, variants?: { name: rows } }: every row as long as the first, '.' or ' ' see-through, every other
// character a key to a paint. Every change here gives a new stamp (the one given is never changed), keeps the schema's
// caps (32 by 32, 32 key characters; the whole definition's 8,192 stamp pixels are checked by stampRoom), keeps the
// variants the same size as the rows, and drops key characters no row uses any more. Pure: browser and Node.

/** The most rows, and the most characters a row, a stamp has (engine/gen/args.js MAX_STAMP). */
export const STAMP_SIDE = 32;

/** The most characters a stamp's key holds (engine/gen/args.js stampErrors). */
export const STAMP_KEYS = 32;

/** The most stamp pixels one definition holds, variants included (catalog/sprite-schema.js SPRITE_LIMITS.stampPixels). */
export const STAMP_PIXEL_CAP = 8192;

const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CLEAR = new Set(['.', ' ']);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => isObj(o) && Object.hasOwn(o, k);
const clampSide = (n) => Math.max(1, Math.min(STAMP_SIDE, Math.round(Number(n) || 1)));
const rowsOk = (rows) => Array.isArray(rows) && rows.length > 0 && rows.every((r) => typeof r === 'string');

/** A plain copy of a stamp: rows, key and variants copied, every other field as it is. */
function copy(s) {
  const out = { ...s, rows: [...(rowsOk(s.rows) ? s.rows : ['.'])], key: { ...(isObj(s.key) ? s.key : {}) } };
  if (isObj(s.variants)) out.variants = Object.fromEntries(Object.entries(s.variants).map(([k, r]) => [k, [...r]]));
  return out;
}

/** The rows a variant name stands for (undefined or unknown: the stamp's own rows). */
const rowsOf = (s, variant) => (variant && own(s.variants, variant) && rowsOk(s.variants[variant]) ? s.variants[variant] : (rowsOk(s.rows) ? s.rows : ['.']));

/** A stamp's [width, height] in pixels (the first row's length, the number of rows). Arguments: stamp. */
export function stampSize(stamp) {
  const rows = rowsOf(stamp);
  return [rows[0].length, rows.length];
}

/** The stamp's pixels as rows of paint refs (null: see-through, or a character the key has not got). Arguments: stamp, variant (a variant's name, or none for the rows). */
export function cellsOf(stamp, variant) {
  const key = isObj(stamp.key) ? stamp.key : {};
  return rowsOf(stamp, variant).map((r) => [...r].map((ch) => (CLEAR.has(ch) || !Object.hasOwn(key, ch) ? null : key[ch])));
}

/** The stamp with its key cut to the characters its rows and variants use (key order kept). Arguments: stamp. */
export function pruneKeys(stamp) {
  const s = copy(stamp);
  const used = new Set([...s.rows, ...Object.values(s.variants ?? {}).flat()].join(''));
  s.key = Object.fromEntries(Object.entries(s.key).filter(([ch]) => used.has(ch)));
  return s;
}

/** The key character that paints `paint`: the one the key already has, else the first free character; null when the key is full. Arguments: stamp, paint (a paint ref, text or a colour rule). */
export function keyFor(stamp, paint) {
  const key = isObj(stamp.key) ? stamp.key : {};
  const want = JSON.stringify(paint);
  for (const [ch, p] of Object.entries(key)) if (JSON.stringify(p) === want) return ch;
  const used = new Set([...Object.keys(key), ...rowsOf(stamp).join(''), ...Object.values(stamp.variants ?? {}).flat().join('')]);
  const free = [...CHARS].find((c) => !used.has(c));
  // the key may be full only of characters about to be dropped: count what is in use
  const inUse = Object.keys(pruneKeys(stamp).key).length;
  return free && inUse < STAMP_KEYS ? free : null;
}

/** Writes one character into rows (a new list). */
function setChar(rows, x, y, ch) {
  const out = [...rows];
  out[y] = out[y].slice(0, x) + ch + out[y].slice(x + 1);
  return out;
}

/**
 * The stamp with one pixel painted (paint: a paint ref) or made see-through (paint null); a pixel outside it, or a paint
 * with no room left in the key, leaves it as it was. Arguments: stamp, x, y (pixels from its top left), paint, variant (a variant's name: paint its rows instead).
 */
export function paintCell(stamp, x, y, paint, variant) {
  const rows = rowsOf(stamp, variant);
  if (!Number.isInteger(x) || !Number.isInteger(y) || y < 0 || y >= rows.length || x < 0 || x >= rows[y].length) return stamp;
  let ch = '.';
  if (paint !== null && paint !== undefined) {
    ch = keyFor(stamp, paint);
    if (ch === null) return stamp;
  }
  if (rows[y][x] === ch) return stamp;
  const s = copy(stamp);
  if (ch !== '.') s.key[ch] = paint;
  if (variant && own(s.variants, variant)) s.variants[variant] = setChar(s.variants[variant], x, y, ch);
  else s.rows = setChar(s.rows, x, y, ch);
  return pruneKeys(s);
}

/** The stamp with every pixel of the same character joined (side by side) to (x, y) painted, as a paint bucket. Arguments: as paintCell. */
export function fillCells(stamp, x, y, paint, variant) {
  const rows = rowsOf(stamp, variant);
  if (!Number.isInteger(x) || !Number.isInteger(y) || y < 0 || y >= rows.length || x < 0 || x >= rows[y].length) return stamp;
  let ch = '.';
  if (paint !== null && paint !== undefined) { ch = keyFor(stamp, paint); if (ch === null) return stamp; }
  const was = rows[y][x];
  if (was === ch) return stamp;
  const grid = rows.map((r) => [...r]);
  const todo = [[x, y]];
  while (todo.length) {
    const [cx, cy] = todo.pop();
    if (cy < 0 || cy >= grid.length || cx < 0 || cx >= grid[cy].length || grid[cy][cx] !== was) continue;
    grid[cy][cx] = ch;
    todo.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  const s = copy(stamp);
  if (ch !== '.') s.key[ch] = paint;
  const out = grid.map((r) => r.join(''));
  if (variant && own(s.variants, variant)) s.variants[variant] = out; else s.rows = out;
  return pruneKeys(s);
}

/** Rows cut or padded with see-through pixels to w by h (from the top left). */
const fit = (rows, w, h) => Array.from({ length: h }, (_, y) => (rows[y] ?? '').slice(0, w).padEnd(w, '.'));

/** The stamp at a new size, 1 to 32 each way, its variants too: cut at the right and bottom, padded with see-through pixels. Arguments: stamp, w, h. */
export function resizeStamp(stamp, w, h) {
  const W = clampSide(w), H = clampSide(h);
  const s = copy(stamp);
  s.rows = fit(s.rows, W, H);
  if (s.variants) for (const k of Object.keys(s.variants)) s.variants[k] = fit(s.variants[k], W, H);
  return pruneKeys(s);
}

/** A new stamp, w by h pixels of one paint, on a node (`on`) or a bone (`bone`), at [0, 0] unless `at` says. Arguments: { w, h, paint, on, bone, at, id }. */
export function newStamp({ w = 4, h = 4, paint = 'ink', on, bone, at = [0, 0], id } = {}) {
  const W = clampSide(w), H = clampSide(h);
  return { ...(id ? { id } : {}), kind: 'stamp', ...(on ? { on } : {}), ...(bone ? { bone } : {}), at: [...at], rows: Array.from({ length: H }, () => 'a'.repeat(W)), key: { a: paint } };
}

/** Stamp pixels of one stamp: rows and every variant, width times height. */
function pixelsOf(s) {
  if (!rowsOk(s.rows)) return 0;
  let n = s.rows.length * s.rows[0].length;
  if (isObj(s.variants)) for (const r of Object.values(s.variants)) if (rowsOk(r)) n += r.length * r[0].length;
  return n;
}

/** Every stamp pixel in a definition (each stamp's rows and variants, wherever it is: draw lists, generator places, decals): what the schema caps at STAMP_PIXEL_CAP. Arguments: def. */
export function stampPixelsIn(def) {
  let n = 0;
  const seen = new Set();
  const walk = (v, depth) => {
    if (depth > 40 || v === null || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    if (v.kind === 'stamp') n += pixelsOf(v);
    for (const [k, x] of Object.entries(v)) if (k !== 'rows' && k !== 'variants') walk(x, depth + 1);
  };
  walk(def, 0);
  return n;
}

/** How many stamp pixels the stamp at `path` may have, its own included, before the definition passes the cap (0 when it is already past). Arguments: def, path (the stamp's path in def). */
export function stampRoom(def, path) {
  let s = def;
  for (const k of path) s = s?.[k];
  const mine = isObj(s) && s.kind === 'stamp' ? pixelsOf(s) : 0;
  return Math.max(0, STAMP_PIXEL_CAP - (stampPixelsIn(def) - mine));
}
