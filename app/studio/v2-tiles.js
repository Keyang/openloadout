// The studio's tile editor (build item B19d; docs/data-sprites.md section 6, "Tileset: tile grid painter"): the Body tab
// of a version 2 tileset (app/studio/v2-editor.js hands it here; All fields keeps the whole tree).
//   - THE TEST MAP: a small map painted with the tileset's brushes (its groups as the join rules see them, its decals,
//     its tiles placed by hand). Each cell's tile is picked by the join rules of engine/tile-rules.js
//     (app/studio/v2-tiles-model.js layMap) and drawn by the framework renderer, so a maker sees the joins work; Look
//     shows a cell's tile on the stage, and the line under the map says which rule picked it.
//   - THE GROUPS: each group's name, kind, use, piece sets, fills, frames and the rest by their documented types
//     (v2-tiles-model.js GROUP_FIELDS); its tiles in a strip (pick one to see it on the stage); its material
//     (app/studio/v2-tiles-material.js: the middle and its versions, each edge and its band rules as rows with colour
//     swatches); its pictures drawn by hand; its decals, each placed on its tile by a click and painted with the stamp
//     painter (app/studio/v2-fields.js stampPainter).
//   - THE PROFILES: each named number list as a bar curve at a scale picked (click or drag to set a column), and as numbers.
//   - THE WHOLE TILESET: where its decals go in the sheet, a material every group shares, its extra tiles.
// Every change goes back to the editor as (path, value) or a whole definition; nothing here keeps the definition.
import { el } from '../ui.js';
import { menuButton } from './bits.js';
import * as M from './v2-model.js';
import * as T from './v2-tiles-model.js';
import { tileClips, TILE_DECAL_ORDERS } from '../../engine/gen/tiles-clips.js';
import { fieldTree, stampPainter } from './v2-fields.js';
import { materialEditor } from './v2-tiles-material.js';
import { mini, numberIn, textIn, selectIn, flagIn, fieldRow, tilePicture, tileThumb } from './v2-tiles-inputs.js';
import { drawPicture, shownStyle, sizeScene } from '../art.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const GP = (gi) => ['body', 'tiles', 'groups', gi];
const BG = { side: '#8fd0f0', 'top-down': '#2b2b3a' };
const pathKey = (p) => (p ? p.join('.') : '');
const DECAL_NAME = /^[a-z0-9]{1,8}$/;

/**
 * The tile editor's nodes for the Body tab: one `.v2-tiles` element. Arguments: ctx { def, sprite (the last sprite
 * that drew, or null), params (the settings tried), errors, clip (on the stage), ui (an object the editor keeps between
 * redraws), change (path, value, note), commit (def, note), say (text), redraw (), setClip (name), stampPath (the stamp
 * being painted, or null), stampState, onStampState (state), onStamp (path), closeStamp () }.
 */
export function tilesPane(ctx) {
  const { def, ui } = ctx;
  const body = T.tilesBody(def);
  if (!body) return el('div', { class: 'v2-tiles' }, el('p', { class: 'pane-note' }, 'This tileset has no body.tiles the studio can read. Change it under All fields.'));
  const groups = T.groupsOf(def);
  // a stamp being painted in a group's decal opens that group and that decal
  const sp = Array.isArray(ctx.stampPath) ? ctx.stampPath : null;
  let decalStamp = null;
  if (sp && sp[0] === 'body' && sp[1] === 'tiles' && sp[2] === 'groups' && Number.isInteger(sp[3]) && groups[sp[3]]) {
    ui.group = sp[3];
    if (sp[4] === 'decals' && Number.isInteger(sp[5]) && isObj(groups[sp[3]].decals?.[sp[5]])) { ui.decal = `${sp[3]}:${groups[sp[3]].decals[sp[5]].name}`; decalStamp = sp; }
  }
  ui.group = Math.max(0, Math.min(groups.length - 1, Number.isInteger(ui.group) ? ui.group : 0));
  const out = [el('p', { class: 'pane-note' }, `${M.BODY_LABELS.tiles}. Paint the test map to see the tiles join: the join rules pick each one. Pick a group to change its pieces, fills, material and decals.`)];
  if (sp && !decalStamp && M.getAt(def, sp)?.kind === 'stamp') out.push(painting(ctx, sp));
  out.push(mapSection(ctx));
  out.push(groupsSection(ctx, groups, decalStamp));
  out.push(profilesSection(ctx));
  out.push(tilesetSection(ctx));
  return el('div', { class: 'v2-tiles' }, out);
}

/** The stamp painter for the stamp at a path, with Done. */
function painting(ctx, path) {
  const stamp = M.getAt(ctx.def, path);
  return el('section', { class: 'v2-list v2-painting' },
    el('div', { class: 'st-head' }, el('h3', {}, `Painting ${M.itemLabel(stamp)}`), mini('Done', () => ctx.closeStamp())),
    stampPainter({ def: ctx.def, stamp, path, state: ctx.stampState, onChange: (p, v) => ctx.change(p, v), onState: ctx.onStampState }));
}

const viewOf = (def) => (def?.meta?.view === 'top-down' ? 'top-down' : 'side');
const tileSize = (sprite) => (Array.isArray(sprite?.size) ? sprite.size[0] : 32);

// ---- the test map ------------------------------------------------------------------------------------------------

/** The test map: brushes, tools, the map itself, what the last cell holds and why, and what could not be placed. */
function mapSection(ctx) {
  const { def, sprite, ui } = ctx;
  const view = viewOf(def);
  const sec = el('section', { class: 'v2-list v2-tilemap', 'aria-label': 'Test map' },
    el('div', { class: 'st-head' }, el('h3', {}, 'Test map')));
  if (!sprite) { sec.append(el('p', { class: 'quiet small' }, 'The map is drawn once the tileset draws.')); return sec; }
  const brushes = T.mapBrushes(sprite.clips, view);
  if (!ui.map || ui.mapView !== view) { ui.map = T.starterMap(brushes, view); ui.mapView = view; }
  // a group renamed or given another kind: its cells (and the brush) move to what it is now, once the tileset draws so
  if (ui.follow && Object.keys(ui.follow).length) {
    ui.map = T.followMap(ui.map, brushes, ui.follow);
    if (ui.brush) ui.brush = T.followMap({ cols: 1, rows: 1, cells: [ui.brush], decals: [''] }, brushes, ui.follow).cells[0];
  }
  if (typeof ui.brush !== 'string' || (ui.brush && !brushes.some((b) => b.id === ui.brush))) ui.brush = brushes.find((b) => b.type === 'terrain')?.id ?? '';
  ui.tool = ui.tool === 'look' ? 'look' : 'paint';
  ui.cursor ??= [0, 0];
  const TS = tileSize(sprite);
  const canvas = el('canvas', { class: 'v2-tilemap-canvas', tabindex: '0', role: 'img', width: ui.map.cols * TS, height: ui.map.rows * TS, 'data-cols': String(ui.map.cols), 'data-rows': String(ui.map.rows),
    style: `max-width:${ui.map.cols * TS * 2}px`, 'aria-label': `Test map, ${ui.map.cols} by ${ui.map.rows} tiles (${view === 'side' ? 'side view' : 'top-down'}): click or drag to paint with the brush; arrows and Enter paint from the keyboard` });
  // drawn in frame pixels: for a flat tileset the canvas is bigger than the map and its tiles smooth (app/art.js)
  const MW = ui.map.cols * TS, MH = ui.map.rows * TS;
  sizeScene(canvas, MW, MH, 2, shownStyle(sprite));
  const g = canvas.getContext('2d');
  const sayLine = el('p', { class: 'v2-tilemap-say', role: 'status', 'aria-live': 'polite' }, ui.said ?? 'Pick a brush, then paint cells. The map carries on past its edges as its edge cells.');
  const notesBox = el('ul', { class: 'v2-tilemap-notes v2-notes' });
  let laid = null;

  function draw() {
    laid = T.layMap(ui.map, brushes, view);
    g.fillStyle = BG[view];
    g.fillRect(0, 0, MW, MH);
    for (const t of laid.tiles) { const pic = tilePicture(sprite, ctx.params, t.clip); if (pic) drawPicture(g, pic, t.col * TS, t.row * TS, pic.canvas.width / pic.k, pic.canvas.height / pic.k); }
    if (ui.grid) {
      g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 1;
      for (let c = 1; c < ui.map.cols; c++) { g.beginPath(); g.moveTo(c * TS + 0.5, 0); g.lineTo(c * TS + 0.5, MH); g.stroke(); }
      for (let r = 1; r < ui.map.rows; r++) { g.beginPath(); g.moveTo(0, r * TS + 0.5); g.lineTo(MW, r * TS + 0.5); g.stroke(); }
    }
    if (document.activeElement === canvas) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(ui.cursor[0] * TS + 1, ui.cursor[1] * TS + 1, TS - 2, TS - 2); g.strokeStyle = '#000'; g.lineWidth = 1; g.strokeRect(ui.cursor[0] * TS + 2.5, ui.cursor[1] * TS + 2.5, TS - 5, TS - 5); }
    canvas.dataset.map = T.mapText(ui.map, brushes);
    canvas.dataset.tiles = laid.tiles.map((t) => `${t.col},${t.row}=${t.clip}`).join(';');
    notesBox.replaceChildren(...laid.notes.map((n) => el('li', {}, n)));
    notesBox.hidden = !laid.notes.length;
  }
  /** What a cell holds, in words, and the rule that picked it. */
  function tell(c, r) {
    const here = laid.tiles.filter((t) => t.col === c && t.row === r);
    const top = here.filter((t) => t.layer !== 0 || here.length === 1).sort((a, b) => a.layer - b.layer);
    const main = top.find((t) => t.layer !== 6) ?? top[0];
    let text;
    if (!main) text = `Cell ${c},${r}: empty.`;
    else {
      const label = sprite.clips[main.clip]?.label;
      text = `Cell ${c},${r}: ${main.clip}${label ? ` (${label})` : ''}${main.rule ? `, picked by its rule: ${T.ruleWords(main.rule.needs)}` : main.brush?.startsWith('slope:') ? ', a slope rises towards the ground beside it' : ''}.`;
      const deco = top.find((t) => t !== main && t.layer === 6);
      if (deco) text += ` Over it: ${deco.clip}.`;
    }
    ui.said = text;
    sayLine.textContent = text;
  }
  const cellAt = (e) => {
    const b = canvas.getBoundingClientRect();
    return [Math.max(0, Math.min(ui.map.cols - 1, Math.floor(((e.clientX - b.left) / b.width) * ui.map.cols))), Math.max(0, Math.min(ui.map.rows - 1, Math.floor(((e.clientY - b.top) / b.height) * ui.map.rows)))];
  };
  function act(c, r) {
    ui.cursor = [c, r];
    if (ui.tool === 'look') {
      const here = laid.tiles.filter((t) => t.col === c && t.row === r).sort((a, b) => b.layer - a.layer);
      const main = here.find((t) => t.layer !== 6 && t.layer !== 0) ?? here[0];
      draw(); tell(c, r);
      if (main) ctx.setClip(main.clip);
      return;
    }
    ui.map = T.paintMap(ui.map, c, r, ui.brush);
    draw(); tell(c, r);
  }
  let down = null;
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    const [c, r] = cellAt(e);
    down = `${c},${r}`;
    act(c, r);
  });
  canvas.addEventListener('pointermove', (e) => {
    const [c, r] = cellAt(e);
    if (down === null) return;
    if (down === `${c},${r}` || ui.tool === 'look') return;
    down = `${c},${r}`;
    act(c, r);
  });
  const up = () => { down = null; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('focus', () => draw());
  canvas.addEventListener('blur', () => draw());
  canvas.addEventListener('keydown', (e) => {
    const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (mv) { e.preventDefault(); e.stopPropagation(); ui.cursor = [(ui.cursor[0] + mv[0] + ui.map.cols) % ui.map.cols, (ui.cursor[1] + mv[1] + ui.map.rows) % ui.map.rows]; draw(); tell(...ui.cursor); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); act(...ui.cursor); }
  });

  // the brushes: each group of the join rules, each decal, each tile placed by hand, and rubbing out
  const brushBtn = (b) => el('button', { type: 'button', class: 'v2-brush', role: 'radio', 'data-brush': b ? b.id : '', 'aria-checked': String((b ? b.id : '') === ui.brush), title: b ? b.id : 'Rub out',
    onclick: (e) => { ui.brush = b ? b.id : ''; if (ui.tool === 'look') { ui.tool = 'paint'; syncTools(); } for (const x of brushBox.children) x.setAttribute('aria-checked', String(x === e.currentTarget)); } },
  b ? tileThumb(sprite, ctx.params, b.type === 'terrain' ? brushTile(b) : b.tile, 24) : el('span', { class: 'v2-chip is-clear', 'aria-hidden': 'true' }),
  el('span', { class: 'v2-brushlabel' }, b ? b.label : 'Rub out'));
  const brushBox = el('div', { class: 'v2-brushes', role: 'radiogroup', 'aria-label': 'Paint with' }, brushes.map(brushBtn), brushBtn(null));
  const paintBtn = el('button', { type: 'button', onclick: () => { ui.tool = 'paint'; syncTools(); } }, 'Paint');
  const lookBtn = el('button', { type: 'button', title: 'Click a cell to see its tile on the stage', onclick: () => { ui.tool = 'look'; syncTools(); } }, 'Look');
  const syncTools = () => { paintBtn.setAttribute('aria-pressed', String(ui.tool === 'paint')); lookBtn.setAttribute('aria-pressed', String(ui.tool === 'look')); canvas.classList.toggle('is-look', ui.tool === 'look'); };
  syncTools();
  const gridBtn = mini('Grid', () => { ui.grid = !ui.grid; gridBtn.setAttribute('aria-pressed', String(!!ui.grid)); draw(); }, { 'data-act': 'map-grid', 'aria-pressed': String(!!ui.grid), title: 'Show the cells' });
  const tools = el('div', { class: 'v2-tilemap-tools' },
    el('span', { class: 'seg', role: 'group', 'aria-label': 'Tool' }, paintBtn, lookBtn),
    gridBtn,
    mini('Start again', () => { ui.map = T.starterMap(brushes, view); draw(); ctx.say('The map is back to its first picture.'); }, { 'data-act': 'map-start' }),
    mini('Clear', () => { ui.map = T.blankMap(ui.map.cols, ui.map.rows); draw(); }, { 'data-act': 'map-clear' }));
  sec.append(el('p', { class: 'quiet small' }, view === 'side' ? 'Side view. ' : brushes.some((b) => b.kind === 'floor') ? 'Top-down: the first floor lies under every cell. ' : 'Top-down. ', 'The tiles follow your changes; nothing on the map is saved.'),
    brushBox, tools, el('div', { class: 'v2-tilemap-box' }, canvas), sayLine, notesBox);
  draw();
  return sec;
}

/** The tile that stands for a terrain brush: its middle, else its first tile. */
function brushTile(b) {
  return b.tiles.find((t) => /-(fill|thin-m|mid|top)$/.test(t)) ?? b.tiles[0];
}

// ---- the groups --------------------------------------------------------------------------------------------------

function groupsSection(ctx, groups, decalStamp) {
  const { def, ui } = ctx;
  const add = menuButton('Add a group', Object.keys(T.KIND_WORDS).map((k) => ({
    label: `A ${T.KIND_WORDS[k]} (${k})`, disabled: groups.length >= T.TILE_LIMITS.groups,
    onclick: () => { const g = T.newGroup(def, k); ui.group = groups.length; ui.decal = null; ctx.change(['body', 'tiles', 'groups'], [...groups, g], `Group ${g.name} added: paint it on the map.`); },
  })), { act: 'add-group', k: 'add-group' });
  const chips = el('div', { class: 'chips v2-groups', role: 'group', 'aria-label': 'Groups' }, groups.map((g, i) => el('button', { type: 'button', class: 'chip', 'data-group': isObj(g) ? g.name ?? '' : '', 'aria-pressed': String(i === ui.group),
    onclick: () => { ui.group = i; ui.decal = null; ctx.redraw(); } }, isObj(g) ? `${g.name ?? i + 1} · ${g.kind ?? '?'}` : `${i + 1}`)));
  return el('section', { class: 'v2-list v2-groupsec' },
    el('div', { class: 'st-head' }, el('h3', {}, 'The tileset: its groups'), add),
    chips,
    groups[ui.group] !== undefined ? groupEditor(ctx, ui.group, groups, decalStamp) : el('p', { class: 'quiet small' }, 'No groups yet: add one.'));
}

/** The pieces a group names when it names none (a block's "block", a stack's three). */
const piecesNow = (g) => (Array.isArray(g.pieces) && g.pieces.length ? g.pieces : g.kind === 'block' ? ['block'] : g.kind === 'stack' ? ['cap', 'mid', 'foot'] : []);

function groupEditor(ctx, gi, groups, decalStamp) {
  const { def, sprite } = ctx;
  const g = groups[gi];
  const gp = GP(gi);
  if (!isObj(g)) return el('p', { class: 'v2-err' }, 'This group is not an object: change it under All fields.');
  const name = typeof g.name === 'string' ? g.name : `group${gi + 1}`;
  const k = (what) => `tg-${name}-${what}`;
  const errs = M.errorsFor(ctx.errors, { word: 'Group', id: name });
  const body = T.tilesBody(def);
  const profiles = isObj(body.profiles) ? Object.keys(body.profiles) : [];
  const out = [];
  const swap = (j) => { const n = [...groups]; [n[gi], n[j]] = [n[j], n[gi]]; ctx.ui.group = j; ctx.change(['body', 'tiles', 'groups'], n); };
  out.push(el('div', { class: 'st-head' }, el('h3', {}, `Group "${name}"`),
    el('span', { class: 'v2-acts' },
      mini('↑', () => swap(gi - 1), { 'aria-label': `Group ${name} earlier`, disabled: gi === 0 }),
      mini('↓', () => swap(gi + 1), { 'aria-label': `Group ${name} later`, disabled: gi === groups.length - 1 }),
      mini('Remove', () => { ctx.ui.group = Math.max(0, gi - 1); ctx.change(gp, undefined, `Group ${name} removed. Undo brings it back.`); }, { 'aria-label': `Remove the group ${name}`, disabled: groups.length <= 1 }))));
  if (errs.length) out.push(el('ul', { class: 'v2-errs' }, errs.map((m) => el('li', {}, m))));
  // its fields, each by its documented type
  for (const f of T.fieldsForGroup(g)) {
    let input;
    if (f.key === 'name') input = textIn({ k: k('name'), value: name, label: 'Group name', max: 40, onchange: (v) => { const next = T.renameGroup(def, gi, v); if (!next) ctx.say('A group name is one lowercase word (letters, digits and dashes, starting with a letter) that no other group has.'); else { ctx.ui.follow = T.followName(ctx.ui.follow, name, v); ctx.commit(next, `Group renamed: its tiles are ${v}-…`); } } });
    else if (f.key === 'kind') input = selectIn({ k: k('kind'), value: g.kind, label: 'Kind of group', options: f.values.map((x) => [x, `${T.KIND_WORDS[x]} (${x})`]), onchange: (v) => { ctx.ui.follow = T.followName(ctx.ui.follow, name, name); ctx.change(gp, T.withKind(g, v)); } });
    else if (f.key === 'use') input = selectIn({ k: k('use'), value: g.use ?? '', label: 'What it is for in a game', options: [['', 'not said'], ...f.values.map((x) => [x, x])], onchange: (v) => ctx.change([...gp, 'use'], v || undefined) });
    else if (f.key === 'pieces') {
      const now = piecesNow(g);
      input = el('span', { class: 'v2-pieces', role: 'group', 'aria-label': 'Piece sets' }, T.piecesOffered(g.kind, g.pieces).map((p) => {
        const box = el('input', { type: 'checkbox', 'data-piece': p, 'data-k': k(`piece-${p}`), onchange: () => ctx.change(gp, T.withPiece(g, p, box.checked)) });
        box.checked = now.includes(p);
        return el('label', { class: 'st-check v2-piece', title: T.PIECE_WORDS[p] }, box, el('span', {}, p), el('span', { class: 'quiet small' }, ` – ${T.PIECE_WORDS[p]}`));
      }));
    } else if (f.key === 'fills') input = numberIn({ k: k('fills'), value: g.fills ?? 1, min: f.lo, max: f.hi, label: 'Versions of the middle', onchange: (n) => ctx.change(gp, T.withFills(g, n)) });
    else if (f.type === 'text') input = textIn({ k: k(f.key), value: g[f.key], label: f.key, optional: true, onchange: (v) => ctx.change([...gp, f.key], v) });
    else if (f.type === 'flag') input = flagIn({ k: k(f.key), value: g[f.key], label: f.key, onchange: (v) => ctx.change([...gp, f.key], v) });
    else input = numberIn({ k: k(f.key), value: g[f.key], min: f.lo, max: f.hi, step: f.type === 'number' ? 'any' : 1, label: f.key, optional: true, onchange: (n) => ctx.change([...gp, f.key], n) });
    out.push(fieldRow({ name: f.key === 'pieces' ? 'Pieces' : f.key[0].toUpperCase() + f.key.slice(1), k: f.key, input, about: f.about }));
  }
  // its tiles, small: pick one to see it on the stage
  const names = Object.keys(tileClips({ tile: body.tile, groups: [g] })).filter((c) => sprite?.clips?.[c]);
  if (names.length) {
    out.push(el('div', { class: 'v2-group-tiles', role: 'group', 'aria-label': `The tiles of ${name}` }, names.map((c) => el('button', { type: 'button', class: 'v2-tilebtn', 'data-clip': c, 'aria-pressed': String(c === ctx.clip), title: `${c}: ${sprite.clips[c].label ?? ''}`, 'aria-label': `Show ${c} on the stage`,
      onclick: () => ctx.setClip(c) }, tileThumb(sprite, ctx.params, c, 32)))));
  }
  // its material
  out.push(el('div', { class: 'st-head v2-thead' }, el('h4', {}, 'Material')));
  if (isObj(g.material)) out.push(materialEditor({ def, material: g.material, path: [...gp, 'material'], name, profiles, onChange: ctx.change, onStamp: ctx.onStamp }));
  else {
    out.push(el('p', { class: 'quiet small' }, body.material !== undefined ? 'It uses the tileset\'s material (under The whole tileset).' : isObj(g.pictures) ? 'None: its tiles are pictures drawn by hand (below).' : 'None.'),
      mini('Give it a material of its own', () => ctx.change([...gp, 'material'], T.newGroup(def, g.kind === 'stack' ? 'block' : g.kind).material ?? T.newGroup(def, 'block').material), { 'data-act': `add-material-${name}` }));
  }
  // pictures drawn by hand, the underside of a thin platform
  if (isObj(g.pictures)) {
    out.push(el('details', { class: 'v2-sub v2-pictures', open: !isObj(g.material) }, el('summary', {}, el('span', { class: 'v2-key' }, 'Pictures drawn by hand'), el('span', { class: 'v2-sum quiet' }, Object.keys(g.pictures).join(', '))),
      fieldTree({ def, value: g.pictures, path: [...gp, 'pictures'], open: 1, onChange: (p, v) => ctx.change(p, v), onStamp: ctx.onStamp })));
  }
  if (isObj(g.under)) out.push(el('details', { class: 'v2-sub' }, el('summary', {}, el('span', { class: 'v2-key' }, 'Underside of the thin platform')), fieldTree({ def, value: g.under, path: [...gp, 'under'], open: 1, onChange: (p, v) => ctx.change(p, v) })));
  out.push(decalsSection(ctx, g, gi, decalStamp));
  return el('div', { class: 'v2-group', 'data-group': name }, out);
}

// ---- decals ------------------------------------------------------------------------------------------------------

function decalsSection(ctx, g, gi, decalStamp) {
  const { def, sprite, ui } = ctx;
  const gp = GP(gi);
  const decals = Array.isArray(g.decals) ? g.decals : [];
  const name = g.name;
  const rows = decals.map((d, di) => {
    if (!isObj(d)) return el('div', { class: 'v2-decal' }, el('span', { class: 'quiet small' }, 'not a decal'), mini('×', () => ctx.change([...gp, 'decals', di], undefined)));
    const key = `${gi}:${d.name}`;
    const on = ui.decal === key;
    const dp = [...gp, 'decals', di];
    const clip = `${name}-deco-${d.name}`;
    const draw = Array.isArray(d.draw) ? d.draw : [];
    const paintBtns = on ? [] : draw.map((it, i) => (isObj(it) && it.kind === 'stamp' && Array.isArray(it.rows)
      ? mini('Paint', () => { ui.decal = key; ctx.onStamp([...dp, 'draw', i]); }, { 'aria-label': `Paint the pixels of ${M.itemLabel(it)} in decal ${d.name}` }) : null));
    const head = el('div', { class: 'v2-decalrow' },
      sprite?.clips?.[clip] ? tileThumb(sprite, ctx.params, clip, 32) : el('span', { class: 'v2-chip is-gen', 'aria-hidden': 'true' }),
      el('span', { class: 'v2-decalname' }, el('strong', {}, d.label ?? clip), el('span', { class: 'quiet small' }, ` ${clip} · ${d.place ?? 'on'}`)),
      el('span', { class: 'v2-acts' }, paintBtns,
        mini(on ? 'Close' : 'Place and change', () => { ui.decal = on ? null : key; if (on && decalStamp) ctx.closeStamp(); else ctx.redraw(); }, { 'data-act': 'pick-decal', 'aria-pressed': String(on), 'aria-label': `${on ? 'Close' : 'Place and change'} decal ${d.name}` }),
        mini('×', () => { ui.decal = null; ctx.change(dp, undefined, `Decal ${d.name} removed.`); }, { 'aria-label': `Remove decal ${d.name}` })));
    return el('div', { class: `v2-decal${on ? ' on' : ''}`, 'data-decal': d.name ?? '' }, head, on ? decalCard(ctx, g, gi, d, di, decalStamp) : null);
  });
  return el('div', { class: 'v2-decals' },
    el('div', { class: 'st-head v2-thead' }, el('h4', {}, 'Decals'), decals.length < T.TILE_LIMITS.decals ? mini('Add a decal', () => { const n = T.newDecal(g, def); ui.decal = `${gi}:${n.name}`; ctx.change([...gp, 'decals'], [...decals, n], `Decal ${n.name} added: place it and paint it.`); }, { 'data-act': 'add-decal' }) : null),
    rows.length ? rows : el('p', { class: 'quiet small' }, 'None: small details a game scatters over or beside the group.'));
}

/** A picked decal: its fields, the picture it is placed on, its painter, and its draw list. */
function decalCard(ctx, g, gi, d, di, decalStamp) {
  const { def, sprite, ui } = ctx;
  const dp = [...GP(gi), 'decals', di];
  const k = (what) => `td-${g.name}-${d.name}-${what}`;
  const out = [];
  for (const f of T.DECAL_FIELDS) {
    let input;
    if (f.key === 'name') input = textIn({ k: k('name'), value: d.name, label: 'Decal letter', max: 8, onchange: (v) => {
      if (!DECAL_NAME.test(v) || (g.decals ?? []).some((x, i) => i !== di && x?.name === v)) { ctx.say('A decal\'s name is up to 8 lowercase letters or digits that no other decal of the group has.'); return; }
      ui.decal = `${gi}:${v}`; ctx.change([...dp, 'name'], v);
    } });
    else if (f.type === 'word') input = selectIn({ k: k(f.key), value: d[f.key] ?? 'on', label: f.key, options: f.values.map((x) => [x, x]), onchange: (v) => ctx.change([...dp, f.key], v) });
    else if (f.type === 'text') input = textIn({ k: k(f.key), value: d[f.key], label: f.key, optional: true, onchange: (v) => ctx.change([...dp, f.key], v) });
    else if (f.type === 'flag') input = flagIn({ k: k(f.key), value: d[f.key], label: f.key, onchange: (v) => ctx.change([...dp, f.key], v) });
    else input = numberIn({ k: k(f.key), value: d[f.key], min: f.lo, max: f.hi, label: f.key, optional: true, onchange: (n) => ctx.change([...dp, f.key], n) });
    out.push(fieldRow({ name: f.key[0].toUpperCase() + f.key.slice(1), k: f.key, input, about: f.about }));
  }
  // placing it: the decal over the tile it goes with; a click puts the picked item's corner at that pixel
  const draw = Array.isArray(d.draw) ? d.draw : [];
  const placeable = draw.map((it, i) => (isObj(it) && Array.isArray(it.at) && it.at.length === 2 && it.at.every(Number.isFinite) ? i : -1)).filter((i) => i >= 0);
  if (sprite) {
    const TS = tileSize(sprite);
    const h = T.decalHost(g.name, d.place ?? 'on');
    const host = sprite.clips[h.host] ? h.host : Object.keys(sprite.clips).find((c) => c.startsWith(`${g.name}-`) && !c.includes('-deco-'));
    const cells = Math.max(h.at[1], h.decal[1]) + 1;
    const cv = el('canvas', { class: 'v2-decal-place', width: TS, height: TS * cells, 'data-cells': String(cells), role: 'img', 'aria-label': `Decal ${d.name} on ${host ?? 'its tile'}: click to put it there` });
    const cg = cv.getContext('2d');
    cg.fillStyle = BG[viewOf(def)];
    cg.fillRect(0, 0, cv.width, cv.height);
    // a click places a pixel: the pixel grid, whatever the site's art style
    const hp = host && tilePicture(sprite, ctx.params, host, { style: 'pixel' });
    if (hp) cg.drawImage(hp.canvas, h.at[0] * TS, h.at[1] * TS);
    const dpPic = tilePicture(sprite, ctx.params, `${g.name}-deco-${d.name}`, { style: 'pixel' });
    if (dpPic) cg.drawImage(dpPic.canvas, h.decal[0] * TS, h.decal[1] * TS);
    let which = placeable.includes(ui.decalItem) ? ui.decalItem : placeable[0];
    cv.addEventListener('click', (e) => {
      if (which === undefined) { ctx.say('Nothing in this decal has a place to move (an outline, or a place set by a control).'); return; }
      const b = cv.getBoundingClientRect();
      const x = Math.floor(((e.clientX - b.left) / b.width) * TS);
      const y = Math.floor(((e.clientY - b.top) / b.height) * TS * cells) - h.decal[1] * TS;
      const next = T.placeDecal(d, which, x, Math.max(0, Math.min(TS - 1, y)), TS);
      if (next) ctx.change(dp, next, `Moved to ${next.draw[which].at.join(', ')}.`);
    });
    const pick = placeable.length > 1 ? selectIn({ k: k('item'), value: String(which), label: 'What a click moves', options: placeable.map((i) => [String(i), M.itemLabel(draw[i])]), onchange: (v) => { ui.decalItem = Number(v); which = Number(v); } }) : null;
    out.push(el('div', { class: 'v2-decalplace' }, cv, el('p', { class: 'quiet small' }, `Click where it goes${pick ? ': ' : '.'}`, pick, ` It is drawn ${d.place === 'above' ? 'in the empty cell above the top' : d.place === 'below' ? 'in the empty cell under the bottom' : 'on the tile'} (${host ?? 'no tile yet'}).`)));
  }
  // painting one of its stamps
  if (decalStamp && pathKey(decalStamp.slice(0, 6)) === pathKey(dp) && M.getAt(def, decalStamp)?.kind === 'stamp') out.push(painting(ctx, decalStamp));
  // what it draws: shapes, stamps (Paint), generators (their documented arguments)
  out.push(el('div', { class: 'st-head v2-thead' }, el('h5', {}, 'What it draws'),
    mini('+ Pixels', () => ctx.change([...dp, 'draw'], [...draw, { kind: 'stamp', at: [14, 14], rows: ['a.', '.a'], key: { a: def.palette?.[0]?.id ?? 'ink' } }]), { 'aria-label': `Add a stamp to decal ${d.name}` })));
  out.push(fieldTree({ def, value: draw, path: [...dp, 'draw'], open: 1, onChange: (p, v) => ctx.change(p, v), onStamp: (p) => { ui.decal = `${gi}:${d.name}`; ctx.onStamp(p); } }));
  return el('div', { class: 'v2-decalcard' }, out);
}

// ---- profiles ----------------------------------------------------------------------------------------------------

function profilesSection(ctx) {
  const { def } = ctx;
  const body = T.tilesBody(def);
  const profs = isObj(body.profiles) ? body.profiles : {};
  const pp = ['body', 'tiles', 'profiles'];
  const names = Object.keys(profs);
  const add = () => {
    let n = 'profile';
    for (let i = 2; Object.hasOwn(profs, n); i++) n = `profile-${i}`;
    ctx.change(pp, { ...profs, [n]: Array(Math.min(T.TILE_LIMITS.profileLength, body.tile ?? 32)).fill(0) }, `Profile ${n} added: draw its curve, then name it in an edge.`);
  };
  return el('section', { class: 'v2-list v2-profiles' },
    el('div', { class: 'st-head' }, el('h3', {}, 'Profiles'), names.length < T.TILE_LIMITS.profiles ? mini('Add a profile', add, { 'data-act': 'add-profile' }) : null),
    el('p', { class: 'quiet small' }, 'Named lists of numbers along an edge (bumps, hanging grass, drips), named by an edge\'s inset or ragged and by band rules. Click or drag on a curve to set a column.'),
    names.length ? names.map((n) => profileRow(ctx, n, profs[n], [...pp, n])) : el('p', { class: 'quiet small' }, 'None yet.'));
}

/** One profile: its curve (click or drag to set a column) and its numbers. */
function profileRow(ctx, name, values, path) {
  if (!Array.isArray(values) || !values.every(Number.isFinite)) return el('div', { class: 'v2-profile', 'data-profile': name }, el('code', {}, name), el('span', { class: 'quiet small' }, ' not a list of numbers (All fields)'));
  const n = values.length;
  const ints = values.every(Number.isInteger);
  // the curve's scale: the smallest that holds its numbers, or a wider one picked so a click reaches past them
  const scales = T.profileScales(values);
  const picked = (ctx.ui.profScale ??= {})[name];
  const [lo, hi] = scales.find((x) => x.join() === picked) ?? scales[0] ?? [Math.min(0, ...values), Math.max(ints ? 3 : 1, ...values)];
  const scaleIn = scales.length > 1 ? selectIn({ k: `tp-${name}-scale`, value: `${lo},${hi}`, label: `The scale of the curve of ${name}`, options: scales.map((x) => [x.join(), `${x[0]} to ${x[1]}`]), onchange: (v) => { ctx.ui.profScale[name] = v; ctx.redraw(); } }) : null;
  const CW = 6, H = 48;
  const cv = el('canvas', { width: n * CW, height: H, style: `width:min(100%, ${n * 8}px)`, role: 'img', 'aria-label': `The profile ${name} as a curve: click or drag to set a column` });
  const g = cv.getContext('2d');
  let work = [...values];
  const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#222';
  function draw() {
    g.clearRect(0, 0, cv.width, cv.height);
    g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(0, 0, cv.width, cv.height);
    const y0 = H - ((0 - lo) / (hi - lo || 1)) * H;
    g.fillStyle = ink;
    work.forEach((v, i) => { const y = H - ((v - lo) / (hi - lo || 1)) * H; g.fillRect(i * CW + 1, Math.min(y, y0), CW - 2, Math.max(1, Math.abs(y0 - y))); });
  }
  const at = (e) => {
    const b = cv.getBoundingClientRect();
    const i = Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - b.left) / b.width) * n)));
    let v = hi - ((e.clientY - b.top) / b.height) * (hi - lo);
    v = ints ? Math.round(v) : Math.round(v * 10) / 10;
    return [i, Math.max(lo, Math.min(hi, v))];
  };
  let down = false;
  cv.addEventListener('pointerdown', (e) => { e.preventDefault(); down = true; cv.setPointerCapture?.(e.pointerId); const [i, v] = at(e); work[i] = v; draw(); });
  cv.addEventListener('pointermove', (e) => { if (!down) return; const [i, v] = at(e); if (work[i] !== v) { work[i] = v; draw(); } });
  const end = () => { if (!down) return; down = false; if (JSON.stringify(work) !== JSON.stringify(values)) ctx.change(path, work); work = [...values]; };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  draw();
  return el('div', { class: 'v2-profile', 'data-profile': name },
    el('div', { class: 'v2-profilehead' }, el('code', {}, name), el('span', { class: 'quiet small' }, `${n} columns, drawn from`), scaleIn ?? el('span', { class: 'quiet small' }, `${lo} to ${hi}`), mini('×', () => ctx.change(path, undefined, `Profile ${name} removed.`), { 'aria-label': `Remove the profile ${name}` })),
    cv,
    el('details', { class: 'v2-sub' }, el('summary', {}, el('span', { class: 'quiet small' }, 'As numbers')), fieldTree({ def: ctx.def, value: values, path, open: 1, onChange: (p, v) => ctx.change(p, v) })));
}

// ---- the whole tileset -------------------------------------------------------------------------------------------

function tilesetSection(ctx) {
  const { def } = ctx;
  const body = T.tilesBody(def);
  const bp = ['body', 'tiles'];
  const out = [el('div', { class: 'st-head' }, el('h3', {}, 'The whole tileset'))];
  out.push(fieldRow({ name: 'Tile', k: 'tile', input: el('span', {}, `${body.tile ?? 32} × ${body.tile ?? 32} pixels`), about: 'The size of every tile (the framework draws 32 pixel tiles)' }));
  out.push(fieldRow({ name: 'Decals in the sheet', k: 'decalOrder', input: selectIn({ k: 'tt-decalOrder', value: body.decalOrder ?? 'group', label: 'Where the decals go in the sheet', options: TILE_DECAL_ORDERS.map((x) => [x, x === 'group' ? 'after each group\'s tiles' : 'after every tile']), onchange: (v) => ctx.change([...bp, 'decalOrder'], v === 'group' ? undefined : v) }), about: 'Only the order of the frames in a downloaded sheet' }));
  if (body.material !== undefined) {
    const profiles = isObj(body.profiles) ? Object.keys(body.profiles) : [];
    out.push(el('div', { class: 'st-head v2-thead' }, el('h4', {}, 'The material every group without its own uses')), materialEditor({ def, material: body.material, path: [...bp, 'material'], name: 'tileset', profiles, onChange: ctx.change, onStamp: ctx.onStamp }));
  }
  const extra = Array.isArray(body.extra) ? body.extra : [];
  out.push(el('div', { class: 'st-head v2-thead' }, el('h4', {}, 'Tiles placed by hand'), extra.length < T.TILE_LIMITS.extra ? mini('Add one', () => {
    let n = 'extra';
    for (let i = 2; extra.some((x) => x?.name === n); i++) n = `extra-${i}`;
    ctx.change([...bp, 'extra'], [...extra, { name: n, label: 'A tile placed by hand', draw: [{ kind: 'rect', at: [8, 8], size: [16, 16], paint: def.palette?.[0]?.id ?? 'ink' }] }]);
  }, { 'data-act': 'add-extra' }) : null));
  out.push(extra.length ? fieldTree({ def, value: extra, path: [...bp, 'extra'], open: 1, onChange: (p, v) => ctx.change(p, v), onStamp: ctx.onStamp })
    : el('p', { class: 'quiet small' }, 'None: tiles the naming scheme does not cover (stairs, a window), each placed by hand in a map.'));
  return el('section', { class: 'v2-list v2-tileset' }, out);
}
