// The tile editor's material (build item B19d; docs/data-sprites.md 2.3): a tile material edited by its documented
// types (app/studio/v2-tiles-model.js MATERIAL_FIELDS, EDGE_FIELDS, BAND_FIELDS): the middle's colour and its versions
// (draw lists: generators by their documented arguments, stamps painted), the outline, the corners, and each edge
// (depth, wrap, tuck, inset and ragged by a profile, and its band rules as rows with colour swatches: which rows, where,
// what paint, first match wins). A material piece ({ use: "material:<id>", v }) shows which piece and its colours. What
// has no editor here (a top-down wall's face, a liquid's surface, the pixels outside the outline) is a field tree.
import { el } from '../ui.js';
import { fieldTree } from './v2-fields.js';
import * as T from './v2-tiles-model.js';
import { mini, numberIn, textIn, selectIn, flagIn, paintIn, bindableIn, fieldRow } from './v2-tiles-inputs.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const EDGE_WORDS = { top: 'Top edge', left: 'Left edge', right: 'Right edge', bottom: 'Bottom edge' };
const ROWS_WORDS = { rows: 'Rows', last: 'Shadow row', 'last-1': 'Row above the shadow', profile: 'Rows by a profile' };
const fieldOf = (list, key) => list.find((f) => f.key === key);

/**
 * A material's editor: { node }. Arguments: { def, material, path (where it is in def), name (a word for data-k: the
 * group's name, or "tileset"), profiles (the tileset's profile names), onChange (path, value), onStamp (path) }.
 */
export function materialEditor({ def, material, path, name, profiles, onChange, onStamp }) {
  const m = isObj(material) ? material : {};
  const k = (what) => `tm-${name}-${what}`;
  const out = [];
  if (Object.hasOwn(m, 'use')) {
    out.push(el('p', { class: 'quiet small' }, 'A shared material (a piece): it draws the same in every tileset that uses it. Its colours are given here.'));
    out.push(fieldRow({ name: 'Piece', k: 'use', input: textIn({ k: k('use'), value: m.use, label: 'Material piece', onchange: (v) => onChange([...path, 'use'], v) }), about: 'material:<name>' }));
    out.push(fieldRow({ name: 'Version', k: 'v', input: numberIn({ k: k('v'), value: m.v, min: 1, max: 999, label: 'Material piece version', onchange: (n) => onChange([...path, 'v'], n) }) }));
    const rest = Object.fromEntries(Object.entries(m).filter(([x]) => x !== 'use' && x !== 'v'));
    if (Object.keys(rest).length) out.push(fieldTree({ def, value: rest, path, open: 2, onChange, onStamp }));
    return el('div', { class: 'v2-material', 'data-material': name }, out);
  }
  // the fields of the material as a whole
  for (const f of T.MATERIAL_FIELDS) {
    const p = [...path, ...f.path];
    const value = f.path.reduce((v, x) => (isObj(v) ? v[x] : undefined), m);
    let input;
    if (f.key === 'base') {
      input = isObj(m.fill) ? paintIn({ k: k('base'), value, def, label: 'Colour of the middle', onchange: (v) => onChange(p, v) })
        : mini('Give it a middle colour', () => onChange([...path, 'fill'], { base: def.palette?.[0]?.id ?? 'ink' }), { 'data-act': `add-fill-${name}` });
    } else if (f.type === 'paint') input = paintIn({ k: k(f.key), value, def, label: f.about, optional: true, extra: f.key === 'ink' ? [['none', 'No outline (none)']] : [], onchange: (v) => onChange(p, v) });
    else if (f.type === 'flag') input = flagIn({ k: k(f.key), value, label: f.key, onchange: (v) => onChange(p, v) });
    else input = bindableIn({ k: k(f.key), value, type: f, def, label: f.key, path: p, optional: true, onChange });
    out.push(fieldRow({ name: f.key === 'base' ? 'Middle colour' : f.key[0].toUpperCase() + f.key.slice(1), k: f.key, input, about: f.about }));
  }
  // the middle's versions: draw lists over the base colour
  if (isObj(m.fill)) {
    const vs = Array.isArray(m.fill.versions) ? m.fill.versions : [];
    const vp = [...path, 'fill', 'versions'];
    out.push(el('div', { class: 'st-head v2-thead' }, el('h4', {}, 'Versions of the middle'),
      vs.length < T.TILE_LIMITS.fills ? mini('Add a version', () => onChange(vp, [...vs, []]), { 'data-act': `add-version-${name}` }) : null));
    if (!vs.length) out.push(el('p', { class: 'quiet small' }, 'None: the middle is its colour alone. A version is the colour with shapes, stamps or a scatter drawn over it.'));
    vs.forEach((list, i) => {
      const letter = String.fromCharCode(65 + i);
      out.push(el('details', { class: 'v2-sub v2-fillv', open: true, 'data-version': String(i) },
        el('summary', {}, el('span', { class: 'v2-key' }, `Version ${letter}`), el('span', { class: 'v2-sum quiet' }, `${Array.isArray(list) ? list.length : 0} drawn over it`),
          el('span', { class: 'v2-acts' }, mini('×', () => onChange([...vp, i], undefined), { 'aria-label': `Remove version ${letter} of the middle` }))),
        Array.isArray(list) ? fieldTree({ def, value: list, path: [...vp, i], open: 1, onChange, onStamp }) : null,
        Array.isArray(list) ? el('span', { class: 'v2-acts' }, mini('+ Pixels', () => onChange([...vp, i], [...list, { kind: 'stamp', at: [14, 14], rows: ['a.', '.a'], key: { a: `${def.palette?.[0]?.id ?? 'ink'}` } }]), { 'aria-label': `Add a stamp to version ${letter}` })) : null));
    });
  }
  // the edges
  const edges = isObj(m.edges) ? m.edges : {};
  out.push(el('div', { class: 'st-head v2-thead' }, el('h4', {}, 'Edges')));
  for (const side of T.EDGES) {
    if (isObj(edges[side])) out.push(edgeEditor({ def, edge: edges[side], side, path: [...path, 'edges', side], name, profiles, onChange }));
    else out.push(el('div', { class: 'v2-edge is-missing', 'data-edge': side }, el('span', { class: 'quiet small' }, `${EDGE_WORDS[side]}: none (the plain outline). `),
      mini(`Add a ${side} edge`, () => onChange([...path, 'edges'], { ...edges, [side]: T.newEdge(def) }), { 'data-act': `add-edge-${side}` })));
  }
  // what has no editor of its own
  const known = new Set(['fill', 'edges', ...T.MATERIAL_FIELDS.map((f) => f.path[0])]);
  const rest = Object.fromEntries(Object.entries(m).filter(([x]) => !known.has(x)));
  if (Object.keys(rest).length) out.push(el('details', { class: 'v2-sub' }, el('summary', {}, `Its other fields (${Object.keys(rest).join(', ')})`), fieldTree({ def, value: rest, path, open: 1, onChange, onStamp })));
  return el('div', { class: 'v2-material', 'data-material': name }, out);
}

/** One edge: its fields by their types, then its band rules. */
function edgeEditor({ def, edge, side, path, name, profiles, onChange }) {
  const k = (what) => `te-${name}-${side}-${what}`;
  const rows = [];
  for (const f of T.EDGE_FIELDS) {
    const p = [...path, f.key];
    const v = edge[f.key];
    let input;
    if (f.type === 'profile') input = profileAmount({ def, value: v, path: p, label: `${side} ${f.key}`, k: k(f.key), profiles, onChange });
    else if (f.key === 'tuck' && typeof v === 'number') input = numberIn({ k: k(f.key), value: v, min: 0, max: 32, label: 'tuck', onchange: (n) => onChange(p, n) });
    else if (f.type === 'flag') input = flagIn({ k: k(f.key), value: v, label: f.key, onchange: (x) => onChange(p, x) });
    else input = bindableIn({ k: k(f.key), value: v, type: f, def, label: `${side} ${f.key}`, path: p, optional: !!f.optional, onChange });
    rows.push(fieldRow({ name: f.key[0].toUpperCase() + f.key.slice(1), k: f.key, input, about: f.about }));
  }
  const bands = Array.isArray(edge.bands) ? edge.bands : [];
  const bp = [...path, 'bands'];
  const list = el('div', { class: 'v2-bands', role: 'list', 'aria-label': `Band rules of the ${side} edge` }, bands.map((r, i) => bandRow({ def, rule: r, i, bands, path: bp, k: k(`band-${i}`), profiles, onChange })));
  return el('div', { class: 'v2-edge', 'data-edge': side },
    el('div', { class: 'st-head v2-thead' }, el('h5', {}, EDGE_WORDS[side]), mini('Remove', () => onChange(path, undefined), { 'aria-label': `Remove the ${side} edge` })),
    rows,
    el('div', { class: 'v2-bandhead' }, el('span', { class: 'v2-tfname' }, 'Bands'), el('span', { class: 'quiet small' }, 'Rows counted from the outline; the first rule that fits a pixel paints it.')),
    list,
    bands.length < T.TILE_LIMITS.bands ? mini('Add a band', () => onChange(bp, [...bands, T.newBand(def)]), { 'data-act': 'add-band', 'aria-label': `Add a band rule to the ${side} edge` }) : null);
}

/** An inset or ragged: which profile, times how much (a control may set it); Add or Remove. */
function profileAmount({ def, value, path, label, k, profiles, onChange }) {
  if (value === undefined) return profiles.length ? mini('Add', () => onChange(path, { profile: profiles[0], amount: 1 }), { 'aria-label': `Add ${label}` }) : el('span', { class: 'quiet small' }, 'no profiles yet');
  if (!isObj(value)) return el('span', { class: 'quiet small' }, 'set another way (All fields)');
  const prof = typeof value.profile === 'string'
    ? selectIn({ k: `${k}-profile`, value: value.profile, label: `${label}: profile`, options: profiles.map((p) => [p, p]), onchange: (v) => onChange([...path, 'profile'], v) })
    : el('span', { class: 'quiet small' }, 'its own numbers');
  const amount = bindableIn({ k: `${k}-amount`, value: value.amount ?? 1, type: { type: 'px', lo: 0, hi: 32 }, def, label: `${label}: amount`, path: [...path, 'amount'], onChange });
  return el('span', { class: 'v2-argbody' }, prof, el('span', { class: 'quiet' }, ' × '), amount, mini('×', () => onChange(path, undefined), { 'aria-label': `Remove ${label}` }));
}

/** One band rule as a row: swatch, which rows, where, paint; move, remove. */
function bandRow({ def, rule, i, bands, path, k, profiles, onChange }) {
  const p = [...path, i];
  if (!isObj(rule)) return el('div', { class: 'v2-band', role: 'listitem' }, el('span', { class: 'quiet small' }, 'not a band rule'), mini('×', () => onChange(p, undefined), { 'aria-label': `Remove band rule ${i + 1}` }));
  const kind = T.bandRowsKind(rule);
  const rowsSel = selectIn({ k: `${k}-rows`, value: kind, label: `Band rule ${i + 1}: which rows`, options: T.BAND_ROWS.filter((r) => r.id !== 'profile' || profiles.length || kind === 'profile').map((r) => [r.id, ROWS_WORDS[r.id]]), onchange: (v) => { const n = T.withBandRows(rule, v, profiles); if (n) onChange(p, n); } });
  const parts = [rowsSel];
  if (kind === 'rows' && Array.isArray(rule.rows)) {
    const [a, b] = rule.rows;
    const from = fieldOf(T.BAND_FIELDS, 'from'), to = fieldOf(T.BAND_FIELDS, 'to');
    parts.push(numberIn({ k: `${k}-from`, value: a, min: from.lo, max: from.hi, label: `Band rule ${i + 1}: from row`, onchange: (n) => onChange([...p, 'rows'], [n, Math.max(n, b)]) }),
      el('span', { class: 'quiet' }, 'to'),
      numberIn({ k: `${k}-to`, value: b, min: to.lo, max: to.hi, label: `Band rule ${i + 1}: to row`, onchange: (n) => onChange([...p, 'rows'], [Math.min(a, n), n]) }));
  } else if (kind === 'profile') {
    parts.push(selectIn({ k: `${k}-rowsprofile`, value: rule.rows.profile, label: `Band rule ${i + 1}: profile`, options: profiles.map((x) => [x, x]), onchange: (v) => onChange([...p, 'rows'], { profile: v }) }));
  }
  // where: only at columns where a profile has one of some values
  const w = rule.where;
  const where = isObj(w)
    ? el('span', { class: 'v2-where' }, el('span', { class: 'quiet' }, 'where '),
      selectIn({ k: `${k}-wprofile`, value: w.profile, label: `Band rule ${i + 1}: where, profile`, options: profiles.map((x) => [x, x]), onchange: (v) => onChange([...p, 'where', 'profile'], v) }),
      el('span', { class: 'quiet' }, ' is '),
      textIn({ k: `${k}-win`, value: (Array.isArray(w.in) ? w.in : []).join(', '), label: `Band rule ${i + 1}: where, values`, max: 80, onchange: (t) => { const ns = String(t).split(/[\s,]+/).filter(Boolean).map(Number).filter(Number.isFinite).slice(0, 16); if (ns.length) onChange([...p, 'where', 'in'], ns); } }),
      mini('×', () => onChange([...p, 'where'], undefined), { 'aria-label': `Band rule ${i + 1}: everywhere` }))
    : profiles.length ? mini('Only where…', () => onChange([...p, 'where'], { profile: profiles[0], in: [0] }), { 'aria-label': `Band rule ${i + 1}: only where a profile has some values` }) : null;
  const paint = paintIn({ k: `${k}-paint`, value: rule.paint, def, label: `Band rule ${i + 1}: paint`, onchange: (v) => onChange([...p, 'paint'], v) });
  const when = isObj(rule.when) ? el('details', { class: 'v2-sub v2-when' }, el('summary', {}, el('span', { class: 'quiet small' }, 'only at some settings (when)')), fieldTree({ def, value: rule.when, path: [...p, 'when'], open: 1, onChange })) : null;
  const swap = (j) => { const n = [...bands]; [n[i], n[j]] = [n[j], n[i]]; onChange(path, n); };
  return el('div', { class: 'v2-band', role: 'listitem', 'data-band': String(i) },
    el('span', { class: 'v2-bandn quiet small' }, String(i + 1)),
    el('span', { class: 'v2-bandrows' }, parts),
    paint, where, when,
    el('span', { class: 'v2-acts' },
      mini('↑', () => swap(i - 1), { 'aria-label': `Band rule ${i + 1} earlier`, disabled: i === 0 }),
      mini('↓', () => swap(i + 1), { 'aria-label': `Band rule ${i + 1} later`, disabled: i === bands.length - 1 }),
      mini('×', () => onChange(p, undefined), { 'aria-label': `Remove band rule ${i + 1}` })));
}
