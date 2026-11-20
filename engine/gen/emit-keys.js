// The on/off and key rules of emitters (docs/data-sprites.md 2.5c "On or off", decided in B6), in one place so every
// layout that draws emitters reads them alike: the emitters layout (engine/gen/emitters.js, B12) uses these. The
// pictures layout (engine/gen/pictures.js, B8) and engine/data-sprite.js picturesLayout (B6) still hold their own
// copies of the same rules (without the amount held to 0..1); they should import these (a follow-up for their owners,
// recorded in section 9, B12c).
//   - an emitter that some clip's keys give an `amount` is off wherever no key gives it an amount above 0; one that no
//     key gives an amount always draws (its `when` and `clip` still decide, as for any item);
//   - a key's other fields set the emitter's call: `at` and the arguments its generator lists as keyable (the validator
//     refuses the rest, and a key that sets a size argument above what the emitter sets: engine/gen/index.js
//     SIZE_KEYS); the amount reaches the generator only as an `amount` argument it declares, held to 0..1 here whether
//     a key or the emitter (a binding) gives it, since the emitter is priced at amount 1 (build item B12b).
// Pure: no DOM, no clock; runs the same in the browser and Node.

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

/** The ids of emitters that some clip's keys give an `amount`: each is off wherever no key gives it an amount above 0. */
export function amountKeyed(resolved) {
  const ids = new Set();
  for (const c of Object.values(isObj(resolved?.clips) ? resolved.clips : {})) {
    for (const k of Array.isArray(c?.keys) ? c.keys : []) {
      if (!isObj(k?.emit)) continue;
      for (const [id, e] of Object.entries(k.emit)) if (isObj(e) && e.amount !== undefined) ids.add(id);
    }
  }
  return ids;
}

/**
 * One emitter's call for a frame, or null when it is off: e (the emitter as resolved), key (the pose's blended key for
 * its id, pose.emit[id], or null), keyed (amountKeyed of the sprite), generators (the registry, for the generator's
 * declared arguments). The call is a new object; arrays a key gives are copied.
 */
export function emitterCall(e, key, keyed, generators) {
  if (!isObj(e)) return null;
  const k = isObj(key) ? key : null;
  if (keyed.has(e.id) && !(k && fin(k.amount) && k.amount > 0)) return null;
  const call = { ...e };
  const entry = typeof generators?.generator === 'function' ? generators.generator(e.gen, e.v) : null;
  for (const [f, v] of Object.entries(k ?? {})) {
    if (f === 'amount') { if (entry?.args && Object.hasOwn(entry.args, 'amount')) call.amount = v; continue; }
    call[f] = Array.isArray(v) ? [...v] : v;
  }
  if (fin(call.amount)) call.amount = Math.min(1, Math.max(0, call.amount));
  return call;
}
