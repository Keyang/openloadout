// A tile map written as text: the form tools/tilemap.mjs --map and tools/scene.mjs read, and what a level
// editor or a game can keep in a file. Pure: no file access, runs in Node and in the browser.
//
//   ; a pool between two banks                 a line starting with ';' is a note
//   @ view = side                              settings: view (side | top-down), frame, tilesets, anything else
//   @ g = back:water, block:grass              a legend entry: one letter = what stands in the cell (a list with
//   @ A = open:stone:arch-l                    commas puts several things in one cell, drawn in layer order)
//   .......
//   g~~~g..                                    then the rows, one letter per cell ('.' is empty)
//   g~~~g#A
//   #######
//
// The letters and what a legend entry may say are layoutTiles' (engine/tiles.js): give it readMap's rows, legend
// and view as they are.

/**
 * Reads a map written as text. Returns { rows, legend, view, settings }: rows are strings of equal length (short ones filled with '.'), legend is { letter: what | [what, ...] }, view is 'side', 'top-down' or undefined, settings holds every '@ word = value' line whose name is longer than one letter (as text).
 * Arguments: text: the file's contents. A line '@ x = ...' with a one-letter name is a legend entry, with a longer
 * name a setting; a line starting with ';' is a note; blank lines are skipped. A line starting with '@' that has no
 * '=' throws, naming the line.
 */
export function readMap(text) {
  const rows = [], legend = {}, settings = {};
  String(text).split('\n').forEach((raw, i) => {
    const line = raw.replace(/\r$/, '');
    if (!line.trim() || line.startsWith(';')) return;
    if (line.startsWith('@')) {
      const m = /^@\s*(\S+)\s*=\s*(.*)$/.exec(line);
      if (!m) throw new Error(`map: line ${i + 1}: "${line}" should read "@ letter = what" or "@ setting = value"`);
      const value = m[2].trim();
      if ([...m[1]].length === 1) { const list = value.split(',').map((s) => s.trim()).filter(Boolean); legend[m[1]] = list.length === 1 ? list[0] : list; }
      else settings[m[1]] = value;
      return;
    }
    rows.push(line.replace(/\s+$/, ''));
  });
  const width = Math.max(0, ...rows.map((r) => [...r].length));
  const view = settings.view === 'side' || settings.view === 'top-down' ? settings.view : undefined;
  return { rows: rows.map((r) => r + '.'.repeat(width - [...r].length)), legend, view, settings };
}

/**
 * Writes a map as text, the form readMap reads. Returns the text, ending in a line break.
 * Arguments: map: { rows, legend, view, settings } (all but rows optional), as readMap returns it.
 */
export function writeMap(map) {
  const lines = [];
  const settings = { ...(map.settings ?? {}) };
  if (map.view && settings.view === undefined) settings.view = map.view;
  if (settings.view !== undefined) lines.push(`@ view = ${settings.view}`);
  for (const [k, v] of Object.entries(map.legend ?? {})) lines.push(`@ ${k} = ${[].concat(v).join(', ')}`);
  for (const [k, v] of Object.entries(settings)) if (k !== 'view') lines.push(`@ ${k} = ${v}`);
  if (lines.length) lines.push('');
  return [...lines, ...map.rows].join('\n') + '\n';
}
