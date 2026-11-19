// The plain-data wall of Contract 14 rule 6, alone and small: a plain-data copy of a studio definition, taken once, with
// nothing in it ever run. It is the walk of catalog/studio-schema.js plainCopy (same rules, same words), kept in a module
// with no imports so that code which must read a definition before the large checker has loaded (app/bag.js: the bag,
// its storage and its links) uses the very same wall. tests/unit/plain-data.test.mjs holds the two to the same answers.
// Pure JavaScript with no page, worker or Node in it.

/** The caps the wall applies (catalog/studio-schema.js STUDIO_LIMITS jsonBytes, nesting and nodes). */
export const PLAIN_LIMITS = Object.freeze({ jsonBytes: 64 * 1024, nesting: 20, nodes: 40_000 });
/** Keys that are dropped wherever they appear: they could change how objects behave. */
export const PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * A plain-data copy of v, reading every field through its descriptor so no getter runs (and a Proxy's get trap never
 * runs). Refuses functions, getters, class instances, loops of objects, holes and undefined in lists, numbers that are
 * not finite, nesting over `nesting`, more than `nodes` values and more than `jsonBytes` characters of text; drops
 * prototype keys and object fields that are undefined (as JSON would); a list's own fields other than its entries are
 * not copied. Stops early once a cap is passed. Returns { value, errors, removed }: value is the copy (only meaningful
 * when errors is empty), errors are plain sentences ("<path>: <what is wrong>"), removed counts the prototype keys dropped.
 * Arguments: v (anything), limits (PLAIN_LIMITS when left out).
 */
export function plainData(v, limits = PLAIN_LIMITS) {
  const L = { ...PLAIN_LIMITS, ...(limits && typeof limits === 'object' ? limits : {}) };
  const errors = [];
  let nodes = 0, chars = 0, removed = 0, stopped = false;
  const stack = new Set();
  const fail = (path, m) => { if (!stopped) errors.push(`${path || 'The definition'}: ${m}`); };
  const walk = (x, path, depth) => {
    if (stopped) return undefined;
    if (++nodes > L.nodes) { fail('', `holds more than ${L.nodes.toLocaleString('en')} values; it cannot fit in 64 KB`); stopped = true; return undefined; }
    if (typeof x === 'string') {
      chars += x.length;
      if (chars > L.jsonBytes) { fail('', 'is more than 64 KB of text; the most is 64 KB'); stopped = true; return undefined; }
      return x;
    }
    if (x === null || typeof x === 'boolean') return x;
    if (typeof x === 'number') { if (!Number.isFinite(x)) fail(path, `numbers must be finite; got ${String(x)}`); return x; }
    if (typeof x === 'function') { fail(path, 'is code (a function); a definition holds data only'); return undefined; }
    if (typeof x !== 'object') { fail(path, `is ${typeof x === 'undefined' ? 'missing (undefined)' : `a ${typeof x}`}, not plain data`); return undefined; }
    if (depth > L.nesting) { fail(path, `is nested more than ${L.nesting} levels deep; a definition never needs that`); stopped = true; return undefined; }
    if (stack.has(x)) { fail(path, 'contains itself (a loop of objects); a definition is a tree'); return undefined; }
    stack.add(x);
    try {
      if (Array.isArray(x)) {
        const d0 = Object.getOwnPropertyDescriptor(x, 'length');
        const n = d0 && 'value' in d0 ? d0.value : 0;
        if (n > L.nodes) { fail(path, `is a list of ${n} entries; it cannot fit in 64 KB`); stopped = true; return undefined; }
        const out = new Array(n);
        for (let i = 0; i < n && !stopped; i++) {
          const d = Object.getOwnPropertyDescriptor(x, i);
          if (!d || !('value' in d)) { fail(`${path}[${i}]`, d ? 'is worked out by code (a getter); a definition holds data only' : 'is missing (an empty place in a list)'); continue; }
          if (d.value === undefined) { fail(`${path}[${i}]`, 'is missing (undefined); a list holds data only'); continue; }
          out[i] = walk(d.value, `${path}[${i}]`, depth + 1);
        }
        return out;
      }
      const proto = Object.getPrototypeOf(x);
      if (proto !== Object.prototype && proto !== null) {
        let name = 'special object';
        try { const d = proto && Object.getOwnPropertyDescriptor(proto, 'constructor'); const f = d && 'value' in d ? d.value : null; const nd = typeof f === 'function' ? Object.getOwnPropertyDescriptor(f, 'name') : null; if (nd && typeof nd.value === 'string') name = nd.value.slice(0, 40); } catch { /* keep the plain words */ }
        fail(path, `is a ${name}, not plain data (an object of fields)`);
        return undefined;
      }
      const out = {};
      for (const k of Object.keys(x)) {
        if (stopped) break;
        if (PROTO_KEYS.has(k)) { removed++; continue; }
        const d = Object.getOwnPropertyDescriptor(x, k);
        if (!d) continue;
        if (!('value' in d)) { fail(path ? `${path}.${k}` : k, 'is worked out by code (a getter); a definition holds data only'); continue; }
        if (d.value === undefined) continue;                     // as JSON would: an undefined field is absent
        chars += k.length;
        out[k] = walk(d.value, path ? `${path}.${k}` : k, depth + 1);
      }
      return out;
    } finally { stack.delete(x); }
  };
  let value;
  try { value = walk(v, '', 0); } catch (e) { errors.push(`The definition could not be read: ${String(e?.message ?? e).slice(0, 120)}`); value = undefined; }
  return { value, errors, removed };
}
