// The `panel` layout and the interface skins (docs/data-sprites.md 2.5b and 4.3; build item B13). Registered as the
// layout generator "panel" (family "layout"), so engine/data-sprite.js lays every panel body out with it (its LAYOUTS
// rule). The interface piece generators it runs are in engine/gen/ui-pieces.js.
//
// A PANEL BODY: { skin: { use: "skin:<name>", v, paint }, piece: { gen: "ui.<piece>", v, ...args }, states, draw }.
// Its clips are its states (engine/resolve.js clipNames). One frame of a state is laid out as:
//   1. the piece, then every item of `draw` (in that order: a later item paints over an earlier one), each interface
//      piece call (family "ui") with the skin's arguments put in place (prepareCall), from the lowest to the highest:
//        the skin's `paint`         generator paint arguments named by the skin's slots ({ "face": "face", ... })
//        the skin's `args`          default arguments per generator ({ "ui.button": { "bevel": "wood" } })
//        the skin's `styles`        arguments per style word, for the call's `style` ({ "carved": { "ui.button": {...} } })
//        the call's own arguments
//        the state                  `state` (the clip when it is normal, hover, pressed or disabled, else normal),
//                                   `lip` and `lift` from the state's look, unless the call names its own `state`
//      An argument is put in place only where the generator declares it, so one skin serves every piece;
//   2. the list expanded (engine/resolve.js expandFrame: the calls run, colour rules worked out);
//   3. a state's `desaturate` (0..1) turns every colour the frame paints toward its grey (ink stays ink): the disabled
//      look of engine/ui.js, worked out here because no colour rule takes the colour out of a colour;
//   4. the slice and text area (Contract 8): those of the first interface piece in effect for the state (the piece,
//      else the first `draw` item that is one; ui-pieces.js UI_MEASURES), the text area coloured with the skin's
//      `text` paint when it has one. A slice or text area the definition writes wins (engine/data-sprite.js).
// A state's LOOK is { lift, lip, desaturate }: the skin's `states[state]`, then the body's own when `states` is an
// object ({ "pressed": { "lip": 2 } }); a state neither names keeps the generators' defaults.
//
// A SKIN PIECE (pieces/skin-<name>.v<v>.json; kind "skin", engine/pieces.js) holds in its body only SKIN_FIELDS:
//   paint   { <argument>: <paint> }            paints named by the skin's own slots (a use maps them to the sprite's)
//   args    { "<ui generator id>": { <argument>: <value> } }; "*" (ANY_PIECE) for every piece that declares the
//           argument with a fitting type (migration batch M8: one skin's look shared by a family's every piece)
//   styles  { "<style word>": { "<ui generator id>": { <argument>: <value> } } }   (UI_STYLES)
//   states  { "<state>": { lift (-4..4 whole), lip (0..4 whole), desaturate (0..1) } }
//   text    a paint: the colour text is made for (dark text on paper); left out, white. A bare slot name of the skin
//           is mapped to the sprite's slot by the layout (textPaint), since engine/resolve.js does not rename `text`
// checkSkin / checkSkinPiece check it (every argument against its generator's type); the layout reads it defensively
// too, since the site's piece store does not run the hook.
//
// Called as a plain generator (the registry's own checks) the layout draws nothing. Pure: runs in the browser and Node.
import { defineGenerator, generators as siteGenerators } from './registry.js';
import { checkArg, isPaintRef, primitives } from './args.js';
import { sceneItems, paintHex } from '../resolve.js';
import { brightness, rgbToHex, mix } from '../color.js';
import { UI_STATES, UI_STYLES } from './ui-shapes.js';
import { measurePiece } from './ui-pieces.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const own = (o, k) => (isObj(o) && Object.hasOwn(o, k) ? o[k] : undefined);
const STATE_NAME = /^[a-z][a-z0-9-]{0,39}$/;

/** The fields a skin piece's body may hold. */
export const SKIN_FIELDS = Object.freeze(['paint', 'args', 'styles', 'states', 'text']);

/** The newest registered entry of an interface generator id, among a registry's entries; null when it has none. */
function uiEntry(list, id) {
  let best = null;
  for (const e of list) if (isObj(e) && e.id === id && e.family === 'ui' && (!best || e.v > best.v)) best = e;
  return best;
}

/** Errors for one generator's arguments in a skin: each declared by the generator and of its type (no bindings). */
function argErrors(list, where, id, args) {
  if (id === ANY_PIECE) return anyArgErrors(list, where, args);
  const e = uiEntry(list, id);
  if (!e) return [`${where}: "${String(id).slice(0, 40)}" is not an interface piece generator (family "ui")`];
  if (!isObj(args)) return [`${where} ${id}: an object of arguments`];
  const out = [];
  for (const [k, v] of Object.entries(args)) {
    if (!Object.hasOwn(e.args, k)) { out.push(`${where} ${id}: ${k} is not an argument of ${id}`); continue; }
    if (k === 'style' || k === 'state') { out.push(`${where} ${id}: ${k} is set by the panel, not by a skin`); continue; }
    const errs = checkArg(e.args[k], v, { bindings: false, path: `${where} ${id}.${k}` });
    out.push(...errs.map((x) => `${x} (the argument ${k} of ${id}: ${String(JSON.stringify(v)).slice(0, 30)})`));
  }
  return out;
}

/** The key of a skin's `args` (and of a style's) whose arguments go to every interface piece that declares them (migration batch M8): one skin's look shared by its panel, button, bar and controls. */
export const ANY_PIECE = '*';

/** Errors for the "*" arguments of a skin: each declared by at least one interface piece generator, and of the type of every one that declares it. */
function anyArgErrors(list, where, args) {
  if (!isObj(args)) return [`${where} ${ANY_PIECE}: an object of arguments`];
  const out = [];
  const ui = new Map();
  for (const e of list) if (isObj(e) && e.family === 'ui' && (!ui.has(e.id) || ui.get(e.id).v < e.v)) ui.set(e.id, e);
  for (const [k, v] of Object.entries(args)) {
    if (k === 'style' || k === 'state') { out.push(`${where} ${ANY_PIECE}: ${k} is set by the panel, not by a skin`); continue; }
    const takers = [...ui.values()].filter((e) => Object.hasOwn(e.args, k));
    if (!takers.length) { out.push(`${where} ${ANY_PIECE}: ${k} is not an argument of any interface piece generator`); continue; }
    // a piece whose argument of that name is of another type is passed over (prepareCall gives it only where it fits)
    const errs = takers.map((e) => checkArg(e.args[k], v, { bindings: false, path: `${where} ${ANY_PIECE}.${k}` }));
    if (errs.every((x) => x.length)) out.push(`${where} ${ANY_PIECE}.${k}: fits no interface piece that takes ${k} (${takers.map((e) => e.id).slice(0, 4).join(', ')}): ${errs[0][0]}`);
  }
  return out;
}

const paintOk = (v) => isPaintRef(v) || (isObj(v) && typeof v.rule === 'string');

/**
 * Checks the body of a skin piece: { errors, warnings }. Every argument it gives is checked against the newest version
 * of its generator in the registry. Arguments: body, opts { generators (a registry with generators(); default the site's) }.
 */
export function checkSkin(body, opts = {}) {
  const errors = [], warnings = [];
  if (!isObj(body)) return { errors: ['a skin\'s body is an object { paint, args, styles, states, text }'], warnings };
  let list = [];
  try { list = typeof opts.generators?.generators === 'function' ? opts.generators.generators() : siteGenerators(); } catch { list = []; }
  for (const k of Object.keys(body)) if (!SKIN_FIELDS.includes(k)) errors.push(`${k}: not a field of a skin (${SKIN_FIELDS.join(', ')})`);
  if (body.paint !== undefined) {
    if (!isObj(body.paint)) errors.push('paint: an object { <argument>: <paint> }');
    else for (const [k, v] of Object.entries(body.paint)) if (!paintOk(v)) errors.push(`paint.${k}: ${String(JSON.stringify(v)).slice(0, 30)} is not a paint`);
  }
  if (body.args !== undefined) {
    if (!isObj(body.args)) errors.push('args: an object { "<ui generator>": { <argument>: <value> } }');
    else for (const [id, a] of Object.entries(body.args)) errors.push(...argErrors(list, 'args', id, a));
  }
  if (body.styles !== undefined) {
    if (!isObj(body.styles)) errors.push('styles: an object { "<style word>": { "<ui generator>": { ... } } }');
    else for (const [s, per] of Object.entries(body.styles)) {
      if (!UI_STYLES.includes(s)) { errors.push(`styles.${s}: not a style word (${UI_STYLES.join(', ')})`); continue; }
      if (!isObj(per)) { errors.push(`styles.${s}: an object { "<ui generator>": { ... } }`); continue; }
      for (const [id, a] of Object.entries(per)) errors.push(...argErrors(list, `styles.${s}`, id, a));
    }
  }
  if (body.states !== undefined) {
    if (!isObj(body.states)) errors.push('states: an object { "<state>": { lift, lip, desaturate } }');
    else for (const [s, look] of Object.entries(body.states)) {
      if (!STATE_NAME.test(s)) { errors.push(`states.${s.slice(0, 40)}: not a state name`); continue; }
      if (!isObj(look)) { errors.push(`states.${s}: an object { lift, lip, desaturate }`); continue; }
      for (const [k, v] of Object.entries(look)) {
        if (k === 'lift' && !(Number.isInteger(v) && v >= -4 && v <= 4)) errors.push(`states.${s}.lift: a whole number -4 to 4`);
        else if (k === 'lip' && !(Number.isInteger(v) && v >= 0 && v <= 4)) errors.push(`states.${s}.lip: a whole number 0 to 4`);
        else if (k === 'desaturate' && !(fin(v) && v >= 0 && v <= 1)) errors.push(`states.${s}.desaturate: 0 to 1`);
        else if (!['lift', 'lip', 'desaturate'].includes(k)) errors.push(`states.${s}.${k}: not part of a state's look (lift, lip, desaturate)`);
      }
    }
  }
  if (body.text !== undefined && !paintOk(body.text)) errors.push('text: a paint');
  return { errors, warnings };
}

/** The body hook of engine/pieces.js validatePiece for skins: the errors of checkSkin for a piece of kind skin, [] for any other piece. Arguments: piece. */
export function checkSkinPiece(piece) {
  if (!isObj(piece) || typeof piece.id !== 'string' || !piece.id.startsWith('skin:')) return [];
  return checkSkin(piece.body).errors;
}

/**
 * The look of a state: { lift, lip (null: the generator's default), desaturate }, from the skin's states, then the
 * body's own when its `states` is an object. Arguments: skin (the skin's body), states (the panel body's), state (the clip).
 */
export function stateLook(skin, states, state) {
  const out = { lift: 0, lip: null, desaturate: 0 };
  for (const src of [own(own(skin, 'states'), state), isObj(states) ? own(states, state) : undefined]) {
    if (!isObj(src)) continue;
    if (Number.isInteger(src.lift)) out.lift = Math.max(-4, Math.min(4, src.lift));
    if (Number.isInteger(src.lip)) out.lip = Math.max(0, Math.min(4, src.lip));
    if (fin(src.desaturate)) out.desaturate = Math.max(0, Math.min(1, src.desaturate));
  }
  return out;
}

/**
 * One call of a panel with the skin's arguments put in place (see the header): the skin's paint, its args for the
 * generator, its args for the call's style, the call's own, then the state. A call that is not an interface piece
 * (family "ui") comes back as it was. Arguments: gen (the registry), call, skin (the skin's body), { state, look }.
 */
export function prepareCall(gen, call, skin, { state, look } = {}) {
  if (!isObj(call) || typeof call.gen !== 'string') return call;
  let entry = null;
  try { entry = typeof gen?.generator === 'function' ? gen.generator(call.gen, call.v) : null; } catch { entry = null; }
  if (!isObj(entry) || entry.family !== 'ui' || !isObj(entry.args)) return call;
  const has = (k) => Object.hasOwn(entry.args, k) && k !== 'style' && k !== 'state';
  const out = { gen: call.gen, v: call.v };
  const offer = (src) => { if (isObj(src)) for (const [k, v] of Object.entries(src)) if (has(k)) out[k] = v; };
  // a skin's "*" arguments reach a piece only where they are of its argument's type
  const offerAny = (src) => { if (isObj(src)) for (const [k, v] of Object.entries(src)) if (has(k) && !checkArg(entry.args[k], v, { bindings: false }).length) out[k] = v; };
  offer(own(skin, 'paint'));
  offerAny(own(own(skin, 'args'), ANY_PIECE));
  offer(own(own(skin, 'args'), call.gen));
  const style = typeof call.style === 'string' ? call.style : entry.args.style?.default;
  offerAny(own(own(own(skin, 'styles'), style), ANY_PIECE));
  offer(own(own(own(skin, 'styles'), style), call.gen));
  for (const [k, v] of Object.entries(call)) if (k !== 'gen' && k !== 'v') out[k] = v;
  if (!Object.hasOwn(call, 'state') && Object.hasOwn(entry.args, 'state')) {
    out.state = UI_STATES.includes(state) ? state : 'normal';
    if (look && look.lip !== null && look.lip !== undefined && Object.hasOwn(entry.args, 'lip')) out.lip = look.lip;
    if (look && fin(look.lift) && look.lift !== 0 && Object.hasOwn(entry.args, 'lift')) out.lift = look.lift;
  }
  return out;
}

const greyOf = (hex) => { const v = Math.round(brightness(hex) * 255); return rgbToHex(v, v, v); };

/**
 * A frame's primitives with every colour turned toward its grey by `amount` (0..1), ink and clear kept: new palette
 * slots for the greys (a slot painted whole stays a ramp; a tone or a stamp's colour is flat). Returns { list, palette }.
 * Arguments: list, palette (the frame's), params (the settings), amount.
 */
export function desaturateList(list, palette, params, amount) {
  if (!(amount > 0)) return { list, palette };
  const pal = { ...palette };
  const made = new Map();
  const slotOf = (ref) => (typeof ref === 'string' ? ref.split('.')[0] : null);
  const greyRef = (ref, ramped) => {
    if (ref === undefined || ref === 'ink' || ref === 'clear') return ref;
    const hex = paintHex(ref, palette, params);
    if (!hex) return ref;
    const to = mix(hex, greyOf(hex), amount).toLowerCase();
    const src = pal[slotOf(ref)];
    const whole = ramped && typeof ref === 'string' && !ref.includes('.') && !(isObj(src) && src.detail);
    const material = isObj(src) ? src.material ?? null : null;
    const key = `${to}|${whole}|${material}`;
    if (!made.has(key)) {
      let id = null;
      for (let n = made.size + 1; !id; n++) if (!Object.hasOwn(pal, `grey-${n}`)) id = `grey-${n}`;
      pal[id] = { hex: to, detail: !whole, material, derived: true };
      made.set(key, id);
    }
    return made.get(key);
  };
  const one = (p, depth = 0) => {
    if (!isObj(p) || depth > 4) return p;
    const q = { ...p };
    if (Object.hasOwn(p, 'paint')) q.paint = greyRef(p.paint, !['stamp', 'text', 'dot', 'line', 'dither', 'bands'].includes(p.kind));
    if (isObj(p.key)) q.key = Object.fromEntries(Object.entries(p.key).map(([k, v]) => [k, greyRef(v, false)]));
    if (Array.isArray(p.stops)) q.stops = p.stops.map((v) => greyRef(v, false));
    if (p.kind === 'text' && Object.hasOwn(p, 'outline')) q.outline = greyRef(p.outline, false);
    for (const f of ['area', 'shape']) if (isObj(p[f])) q[f] = one(p[f], depth + 1);
    return q;
  };
  return { list: list.map((p) => one(p)), palette: pal };
}

/**
 * A skin's `text` paint in the sprite's slots, or undefined when it has none: a bare name of one of the skin's own slots
 * ("shine") is mapped through the use's slots, as engine/resolve.js maps a skin's paints (it renames tones and paint
 * fields, and `text` is neither); a tone or a colour rule comes renamed already. Arguments: skin (the resolved skin
 * object of a panel body: { slots, body }).
 */
export function textPaint(skin) {
  const t = own(own(skin, 'body'), 'text');
  if (!paintOk(t)) return undefined;
  const slots = own(skin, 'slots');
  if (typeof t === 'string' && !t.includes('.') && !t.startsWith('#') && isObj(slots) && Object.hasOwn(slots, t) && typeof slots[t] === 'string') return slots[t];
  return t;
}

/** The panel layout's run (LAYOUTS in engine/data-sprite.js): one frame of a panel body, its slice and text area. */
function layout(input, ctx) {
  const P = isObj(input.body) ? input.body : {};
  const R = input.resolved, gen = input.generators;
  const skin = isObj(P.skin) && isObj(P.skin.body) ? P.skin.body : {};
  const look = stateLook(skin, P.states, ctx.clip);
  const items = [P.piece, ...(Array.isArray(P.draw) ? P.draw : [])].filter((x) => x !== undefined)
    .map((c) => prepareCall(gen, c, skin, { state: ctx.clip, look }));
  // the slice and text area: the first interface piece in effect for this state
  let measured = null;
  for (const c of sceneItems(items, { clip: ctx.clip, direction: null })) {
    if (!isObj(c) || typeof c.gen !== 'string') continue;
    const entry = typeof gen?.generator === 'function' ? gen.generator(c.gen, c.v) : null;
    if (!isObj(entry) || entry.family !== 'ui') continue;
    measured = measurePiece(entry, c, ctx);
    break;
  }
  const x = input.expand(items);
  const grey = desaturateList(x.primitives, x.palette, R.params, look.desaturate);
  const out = { list: input.place(grey.list), palette: grey.palette };
  if (measured?.slice) out.slice = measured.slice;
  if (measured?.points) out.points = measured.points;   // migration batch M9: a port's attach points (engine/gen/port-sprite.js)
  const text = textPaint(P.skin);
  // a piece may give two areas (a titled panel's body and heading): each takes the skin's text colour unless it names its own
  const coloured = (ta) => (text !== undefined && ta.colour === undefined ? { ...ta, colour: text } : ta);
  if (measured?.textArea) out.textArea = Array.isArray(measured.textArea) ? measured.textArea.map(coloured) : coloured(measured.textArea);
  return out;
}

/** The layout of a `panel` body (interface pieces): a skin's piece in each of its states, with its slice and text area. */
export const panel = defineGenerator({
  id: 'panel', v: 1, family: 'layout',
  about: 'Lays out a panel body: the skin\'s interface piece in each state, its extra draw list, slice and text area.',
  args: { draw: primitives({ default: [], about: 'The body\'s extra draw list; the layout reads the whole body from engine/data-sprite.js' }) },
  cost: () => 0,
  run(input, ctx) {
    if (!isObj(input) || !isObj(input.resolved) || typeof input.expand !== 'function') return [];
    return layout(input, ctx);
  },
});
