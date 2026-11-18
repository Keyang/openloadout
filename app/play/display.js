// Playground: how an interface piece or icon is shown in the "Score and health" strip, decided
// from its clip names (docs/style-guide.md section 8). Pure JavaScript: no DOM.
//   frame + fill              a bar: the housing, with the fill strip cropped to a value inside its opening
//   <name>-full, <name>-empty glyphs: one for each point of the player's health
//   normal (hover, pressed)   a button: the state under the pointer
//   anything else             a set: every clip, side by side (they wrap), moving clips moving

/**
 * clips: the sprite's clip table. Returns one of
 *   { kind: 'bar', frame, fill } · { kind: 'glyphs', full, empty } · { kind: 'button', rest, hover, pressed } · { kind: 'set', clips }
 */
export function displayPlan(clips) {
  const names = Object.keys(clips);
  if (names.includes('frame') && names.includes('fill')) return { kind: 'bar', frame: 'frame', fill: 'fill' };
  const full = names.find((n) => n.endsWith('-full') && names.includes(n.slice(0, -5) + '-empty'));
  if (full) return { kind: 'glyphs', full, empty: full.slice(0, -5) + '-empty' };
  if (names.includes('normal')) return { kind: 'button', rest: 'normal', hover: names.includes('hover') ? 'hover' : null, pressed: names.includes('pressed') ? 'pressed' : null };
  return { kind: 'set', clips: names };
}

/**
 * The part of a bar's fill strip to draw for a value 0..1: { x, w } in frame pixels.
 * opening: the housing's trough ({ x, w }, from the sprite's `slice`, Contract 8), or null to use the whole frame width.
 */
export function fillSpan(opening, width, value) {
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  const x = opening ? opening.x : 0, w = opening ? opening.w : width;
  return { x, w: Math.round(w * v) };
}
