// Undo and redo for the studio page (docs/studio.md section 5, "Undo and redo"; item S9). Every finished change (a drag
// that ends, a field that is committed) pushes a snapshot of the whole definition. Snapshots are JSON text, so what comes
// back is always a fresh copy. In memory only: a reload starts a fresh stack. Pure: runs in the browser and in Node.

/** The most steps the stack keeps; older ones fall off the bottom. */
export const HISTORY_LIMIT = 200;

/** The largest snapshot kept, in characters of JSON (a definition is at most 64 KB: Contract 14 rule 6). */
export const SNAPSHOT_BYTES = 64 * 1024;

/**
 * A new undo stack that starts at a definition. Returns { now, push, undo, redo, canUndo, canRedo, size }: push(def) is
 * true when it became a step (false for the same definition again or one over SNAPSHOT_BYTES); undo() and redo() return
 * the definition to show, or null when there is nothing that way.
 * Arguments: first (the definition as it is when the page opens).
 */
export function createHistory(first) {
  const steps = [JSON.stringify(first)];
  let at = 0;
  const back = (i) => JSON.parse(steps[i]);
  return {
    now: () => back(at),
    push(def) {
      let text;
      try { text = JSON.stringify(def); } catch { return false; }
      if (typeof text !== 'string' || text.length > SNAPSHOT_BYTES || text === steps[at]) return false;
      steps.splice(at + 1);
      steps.push(text);
      if (steps.length > HISTORY_LIMIT) steps.splice(0, steps.length - HISTORY_LIMIT);
      at = steps.length - 1;
      return true;
    },
    undo() { if (at <= 0) return null; at--; return back(at); },
    redo() { if (at >= steps.length - 1) return null; at++; return back(at); },
    canUndo: () => at > 0,
    canRedo: () => at < steps.length - 1,
    size: () => steps.length,
  };
}
