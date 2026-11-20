// What a game developer who has never seen Loadout must be able to rely on in a download: the text next to a
// sprite sheet says nothing that is false for that kind of asset, and says what that kind needs.
// One checker, used by the unit tests (every sprite in sprites/) and the browser tests (a real download of every
// bundle), so both hold the text to the same rules. It judges from the asset's own facts (its type, its role, its
// view, its rows, what its JSON carries) and never from an id, a name or a count.
// Among the rules: a sound of a row that is one still picture is played when that row is shown, never on a frame of
// an animation; a thin platform is stood on from above only, in the JSON and in both engines' steps; the states of
// an interface piece each say when they are shown; a bar says how to cut its fill off; a piece cut out of its frame
// gives its text area from the cut-out.
//
//   guideFaults({ row, json, text }) -> [fault, ...]      row: a catalogue row ({ id, name, type, view, license, tech: { grounded } })
//   packageFaults({ manifest, readMe, licence, names })   the top-level files of a whole package

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SCENERY = ['tileset', 'background', 'ui', 'icon'];              // things that neither face a way nor stand on the ground
const DIRECTION = /_(down|up|side)$/;

/** The line of the text that lists one row of the sheet by its number and name, or null. */
export function rowLine(text, row, name) {
  const m = new RegExp(`^.*\\brow ${row}\\s+${esc(name)}(?=\\s|$).*$`, 'm').exec(text);
  return m ? m[0] : null;
}

/** One section of the text: from the line that is exactly `heading` (or matches it) to the next line that starts at the left edge. '' when it is not there. */
export function sectionOf(text, heading) {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => (heading instanceof RegExp ? heading.test(l) : l === heading));
  if (at < 0) return '';
  let end = at + 1;
  while (end < lines.length && (lines[end] === '' || /^\s/.test(lines[end]))) end++;
  return lines.slice(at, end).join('\n');
}

// The eight cells round a tile as the JSON names them, and the words the text uses for them. Kept here on its own,
// apart from the table in app/guide.js, so that a wrong word there is caught and not copied.
const CELL_WORDS = { above: 'up', 'above right': 'upRight', right: 'right', 'below right': 'downRight', below: 'down', 'below left': 'downLeft', left: 'left', 'above left': 'upLeft' };
const CELLS = Object.values(CELL_WORDS), SIDES = ['up', 'right', 'down', 'left'];
const cellsOf = (words) => { const out = words.split(', ').map((w) => CELL_WORDS[w.trim()]); return out.every(Boolean) ? out : null; };
const sameNeeds = (a, b) => CELLS.every((k) => a[k] === b[k]);

/**
 * What a tile's line in the text says the tile needs round it: a list of { cell: true | false }, one for each
 * way the line gives ("...; or ..."), or null when the line cannot be read. group: the group's name as the line uses it.
 */
export function needsSaid(group, line) {
  const g = esc(group);
  const at = line.search(new RegExp(`\\banywhere\\b|\\bneeds ${g}(?=[: ])|\\bno ${g}(?=[: ])`));
  if (at < 0) return null;
  const out = [];
  for (const way of line.slice(at).replace(/\s*\(moves:[^)]*\)\s*$/, '').trim().split('; or ')) {
    const needs = {};
    if (way !== 'anywhere') for (const part of way.split('; ')) {
      let m, cells, value;
      if (new RegExp(`^needs ${g} on every side$`).test(part)) { cells = CELLS; value = true; }
      else if ((m = new RegExp(`^needs ${g} on all four sides(?: and (.+))?$`).exec(part))) { cells = m[1] ? cellsOf(m[1])?.concat(SIDES) : SIDES; value = true; }
      else if (new RegExp(`^no ${g} on any of its four sides$`).test(part)) { cells = SIDES; value = false; }
      else if ((m = new RegExp(`^needs ${g}: (.+)$`).exec(part))) { cells = cellsOf(m[1]); value = true; }
      else if ((m = new RegExp(`^no ${g}: (.+)$`).exec(part))) { cells = cellsOf(m[1]); value = false; }
      if (!cells) return null;
      for (const c of cells) { if (c in needs) return null; needs[c] = value; }      // a cell named twice: the line contradicts or repeats itself
    }
    out.push(needs);
  }
  return out;
}

/** Which of the eight cells a line of "The eight cells round each tile" says hold the group: { cell: true | false } for all eight, or null when it cannot be read. */
export function cellsSaid(line, name) {
  const tail = line.slice(line.indexOf(name) + name.length).trim();
  let on;
  if (tail === 'all eight') on = CELLS;
  else if (tail === 'none') on = [];
  else if (tail.startsWith('all but ')) { const off = cellsOf(tail.slice(8)); if (!off) return null; on = CELLS.filter((c) => !off.includes(c)); }
  else on = cellsOf(tail);
  if (!on || new Set(on).size !== on.length) return null;
  return Object.fromEntries(CELLS.map((c) => [c, on.includes(c)]));
}

/** Everything wrong with one sprite's how-to-use text and JSON, as sentences; empty when it is right for its kind. */
export function guideFaults({ row, json, text: whole }) {
  const out = [];
  // the asset's own description is quoted in the text as its author wrote it: it is not what is judged here
  const text = row.description ? whole.split(row.description).join('') : whole;
  // sentences are wrapped over lines: what is said is looked for in the text as one run, lines only where a line is meant
  const flat = text.replace(/\s+/g, ' ');
  const say = (ok, fault) => { if (!ok) out.push(`${row.id} (${row.type ?? 'no type'}, ${row.view ?? 'no view'}): ${fault}`); };
  const anims = Object.entries(json.animations ?? {});
  const type = row.type ?? null, view = row.view ?? null;
  const sheet = typeof json.image === 'string';
  const directional = anims.some(([n]) => DIRECTION.test(n));
  const fw = json.frameWidth, fh = json.frameHeight;

  // ---- one way of counting, said once, and the same in the text and the JSON
  say(/counted from 0/.test(flat), 'the text does not say that rows and frames are counted from 0');
  say(typeof json.counting === 'string' && /from 0/.test(json.counting), 'the JSON does not say how rows and frames are counted');
  const onePicture = anims.length === 1 && anims[0][1].frames === 1;            // nothing to list: the sheet is the picture
  if (sheet && !onePicture) for (const [name, a] of anims) say(rowLine(text, a.row, name), `no line "row ${a.row}  ${name}" (the JSON's own row number)`);
  // ---- sounds: each is listed with when it plays, and that is said for the kind of row it belongs to. A row of one
  // still picture (a button's state) has no animation and no frame to wait for; a row that moves has
  const sounds = sectionOf(text, 'Sounds'), soundsFlat = sounds.replace(/\s+/g, ' ');
  const cues = Object.entries(json.sounds ?? {}).flatMap(([clip, list]) => list.map((c) => ({ ...c, clip, still: json.animations?.[clip]?.frames === 1 })));
  for (const c of cues) {
    const lines = sounds.split('\n').filter((l) => l.trim().startsWith(`${c.clip}:`) && l.includes(c.file));      // (one sound may be listed on several frames of a row)
    say(lines.length, `the sound ${c.file} of "${c.clip}" is not listed under Sounds`);
    if (c.still) {
      say(!lines.some((l) => /\bframes?\b|\banimation\b/.test(l)), `"${c.clip}" is one still picture, and its sound ${c.file} is tied to a frame or an animation: "${(lines[0] ?? '').trim()}"`);
      say(c.loop || lines.some((l) => /\bwhen\b/.test(l)), `"${c.clip}" is one still picture, and the text does not say when its sound ${c.file} plays (when that row starts being shown)`);
    } else if (!c.loop) say(lines.some((l) => new RegExp(`\\bframe ${c.frame}\\b`).test(l)), `the sound ${c.file} of "${c.clip}" is not listed with its frame as the JSON counts it (${c.frame})`);
  }
  const FRAME_STEPS = /Animation Event|AnimationPlayer|reaches the frame|on that frame|to that frame|when the frame changes/;
  if (cues.length && !cues.some((c) => !c.still && !c.loop)) say(!FRAME_STEPS.test(soundsFlat), 'no sound here waits for a frame of an animation, yet the Sounds section gives the steps for one (an Animation Event, an animation track)');
  if (cues.some((c) => c.still)) {
    say(/^\s*Unity\b/m.test(sounds) && /^\s*Godot\b/m.test(sounds), 'a sound belongs to a row of one still picture, and the Sounds section does not say how to play it in Unity and in Godot');
    // a button's state: its sound is played from the event that puts the button in that state (another still row is switched to by the game's own script)
    if (type === 'ui' && cues.some((c) => c.still && !c.loop && ['pressed', 'hover'].includes(c.clip))) say(/Event Trigger|On Click/.test(soundsFlat) && /\bsignals?\b/.test(soundsFlat), 'an interface piece with a sound on a state: the Sounds section does not name the button event to play it from (Unity: an Event Trigger or On Click; Godot: a signal)');
  }

  // ---- nothing false about which way it faces
  const turns = /\bflip(s|ped)?\b|\bmirror(s|ed)?\b|fac(es|ing) (to the )?right|drawn facing/i.test(flat);      // (Godot's own "Mirroring" setting is not a word about facing)
  const mayFace = !SCENERY.includes(type) && type !== 'prop' && type !== 'pickup' && (view === 'side' || directional || type === 'projectile' || type === 'effect');
  if (!mayFace) say(!turns, 'the text talks about facing, flipping or mirroring, which means nothing for this kind of asset');
  if (!mayFace || directional) say(json.facing === undefined, `the JSON says facing: "${json.facing}", which is not true of every row`);
  if ((type === 'character' || type === 'creature') && view === 'side' && !directional) {
    say(/facing right/.test(flat) && /\bflip\b|\bmirrors?\b/i.test(flat), 'a side-view figure: the text must say it faces right and is flipped to face left');
    say(json.facing === 'right', 'a side-view figure: the JSON must say facing: "right"');
  }
  if (directional) {
    for (const d of ['_down', '_up', '_side']) say(text.includes(`"${d}"`), `it has one animation per direction, and the text does not explain "${d}"`);
    for (const [name, a] of anims) say(typeof a.direction === 'string', `the JSON does not say which way "${name}" faces`);
  }

  // an effect may or may not show a direction (a slash does, a ring of light does not), and nothing records which: the text may only say what to do IF it does
  if (type === 'effect' && !directional) {
    say(json.facing === undefined, `the JSON says facing: "${json.facing}" for an effect, and nothing records that it shows a direction`);
    for (const m of flat.matchAll(/\bflip|\bmirror|points? (to the )?(right|left)|pointing (to the )?(right|left)/gi)) {
      const sentence = flat.slice(flat.lastIndexOf('. ', m.index) + 2, m.index + m[0].length);      // from the end of the sentence before, up to the word
      say(/\bIf it shows a direction\b/.test(sentence), `an effect is told flatly that it points one way: "...${sentence.slice(-80)}"`);
    }
  }

  // ---- nothing false about standing on the ground
  const stands = /touch(es)? the ground|stands? on the ground/i.test(flat);
  if (SCENERY.includes(type) || row.tech?.grounded === false) say(!stands, 'the text talks about a point that touches the ground, and this does not stand on the ground');
  if (!SCENERY.includes(type) && row.tech?.grounded === true) say(stands, 'it stands on the ground, and the text does not say where its ground point is');

  // ---- what each kind needs
  const anim = /AnimatedSprite2D|Animation Clip|Animation Event|AnimationPlayer/.test(text);
  const still = anims.every(([, a]) => a.frames === 1);
  if (still) say(!/per second/.test(flat) && !anim, 'nothing in it moves, yet the text gives frames per second or steps for an animation');
  if (still) say(/no animation|not an animation/i.test(flat), 'nothing in it moves, and the text does not say so');
  say(/^Unity\b/m.test(text) && /^Godot\b/m.test(text), 'steps for Unity and for Godot');
  say(!/\b(tested|verified|checked|tried)( out)? in (Unity|Godot|the engines?)/i.test(flat) || /not been (tested|tried|checked)/i.test(flat), 'the text claims the steps were tested in an engine');

  if (type === 'tileset') {
    say(new RegExp(`Each tile is ${fw} x ${fh} pixels`).test(flat), `the text does not give the tile size (${fw} x ${fh})`);
    say(/not an animation/.test(flat), 'the text does not say that a row is one tile, not an animation');
    say(!/Each row is one animation/.test(flat), 'the text calls the rows animations');
    // a tileset with no group at all (the cells of a puzzle: every tile is "other") has no rule to give: the game puts each tile in its cell, and the text says so and how
    const placed = Array.isArray(json.tiles?.groups) && json.tiles.groups.length === 0 && Array.isArray(json.tiles.other) && json.tiles.other.length > 0;
    if (placed) {
      say(/Tile Palette/.test(flat) && /TileSet/.test(flat), 'Unity: a tile palette; Godot: a TileSet');
      say(!/Rule Tile for each|terrain/i.test(flat) && !/"needs"/.test(flat), 'no rule picks a tile of this tileset, and the text gives rule tiles, terrains or "needs"');
      say(/your game puts each one in its cell/.test(flat) && /SetTile\(/.test(flat) && /set_cell\(/.test(flat), 'the game places every tile of this tileset, and the text does not say so, or how in Unity (SetTile) and Godot (set_cell)');
    } else if (json.tiles?.groups?.length > 0 && json.tiles.groups.every((g) => g.rules.length <= 1)) {
      // groups, but each is one tile (the floor of a board with hand-placed walls and markers): no rule chooses between tiles, so a rule tile or a terrain has nothing to do, and the text must not send the reader to set one up
      say(/Tile Palette/.test(flat) && /TileSet/.test(flat), 'Unity: a tile palette; Godot: a TileSet');
      say(!/Rule Tile for each|terrain/i.test(flat) && !/"needs"|"rules"/.test(flat), 'no rule chooses between the tiles of this tileset, and the text gives rule tiles, terrains, "rules" or "needs"');
      say(/No rule chooses between these tiles/.test(flat) && /put it in every cell that holds the group/.test(flat), 'every group of this tileset is one tile, and the text does not say that no rule chooses between tiles and that a group\'s tile goes in every cell of the group');
      say(/SetTile\(/.test(flat) && /set_cell\(/.test(flat), 'the tiles of this tileset are painted or placed by the game, and the text does not say how to place one in Unity (SetTile) and Godot (set_cell)');
    } else {
      say(/Tile Palette/.test(flat) && /Rule Tile/.test(flat), 'Unity: a tile palette and a rule tile');
      say(/TileSet/.test(flat) && /terrain/i.test(flat), 'Godot: a TileSet and its terrains');
    }
    say(!/AnimatedSprite2D/.test(text), 'the text gives the steps for an animated sprite');
    say(json.tiles && Array.isArray(json.tiles.groups) && (json.tiles.groups.length > 0 || placed), 'the JSON has no "tiles" (what each tile is and what it needs round it)');
    for (const [name, a] of anims) {
      const line = rowLine(text, a.row, name) ?? '';
      if (a.frames === 1) say(!/per second/.test(line), `"${name}" is one still tile, and its line gives a speed`);
      else say(/per second/.test(line), `"${name}" moves, and its line gives no speed`);
      if (a.frames > 1) say((a.loop === false) === /plays once/.test(line), a.loop === false ? `"${name}" plays once, and its line does not say so` : `"${name}" repeats, and its line says it plays once`);
      say(json.tiles?.tiles?.[name] || json.tiles?.other?.includes(name), `the JSON does not say what the tile "${name}" is`);
    }
    for (const g of json.tiles?.groups ?? []) {
      say(text.includes(`"${g.name}"`), `the text does not introduce the group "${g.name}"`);
      for (const r of g.rules) say(json.animations[r.tile], `a rule of "${g.name}" names "${r.tile}", which is not a tile of the sheet`);
    }
    // each tile's line says in words what the rules say in the JSON: every way the rules give the tile, and no other
    for (const g of json.tiles?.groups ?? []) {
      const ways = new Map();
      for (const r of g.rules) ways.set(r.tile, [...(ways.get(r.tile) ?? []), r.needs]);
      for (const [tile, list] of ways) {
        if (!json.animations[tile]) continue;
        const line = rowLine(text, json.animations[tile].row, tile) ?? '';
        const said = needsSaid(g.name, line);
        const same = said && said.length === list.length && list.every((n) => said.some((x) => sameNeeds(x, n)));
        say(same, `the line of "${tile}" does not say what its rules say (${JSON.stringify(list)}): "${line.trim()}"`);
      }
    }
    // a tool that matches a tile to its neighbours cell by cell (Godot's terrains) needs ONE complete arrangement for each tile: the rule list, read first-match, does not give it
    const squares = sectionOf(text, /^The eight cells round each tile/);
    const ruled = (json.tiles?.groups ?? []).filter((g) => g.rules.length > 1);
    const godot = sectionOf(text, /^Godot\b/), unity = sectionOf(text, 'Unity');
    for (const g of ruled) {
      const tiles = [...new Set(g.rules.map((r) => r.tile))];
      say(Array.isArray(g.patterns), `the JSON gives the group "${g.name}" no "patterns" (each tile's complete arrangement of neighbours)`);
      const seen = new Set();
      for (const tile of tiles) {
        const found = (g.patterns ?? []).filter((x) => x.tile === tile);
        say(found.length === 1, `the group "${g.name}" has ${found.length} patterns for "${tile}", not one`);
        const around = found[0]?.around;
        if (!around) continue;
        say(CELLS.every((c) => typeof around[c] === 'boolean') && Object.keys(around).length === CELLS.length, `the pattern of "${tile}" does not say yes or no for each of the eight cells`);
        const first = g.rules.find((r) => Object.entries(r.needs).every(([k, v]) => !!around[k] === v));
        say(first?.tile === tile, `the pattern of "${tile}" is an arrangement the rules give to "${first?.tile}"`);
        for (const [corner, a, b] of [['upRight', 'up', 'right'], ['downRight', 'down', 'right'], ['downLeft', 'down', 'left'], ['upLeft', 'up', 'left']]) say(!around[corner] || (around[a] && around[b]), `the pattern of "${tile}" counts the corner ${corner} without the two sides next to it`);
        const key = CELLS.map((c) => (around[c] ? 1 : 0)).join('');
        say(!seen.has(key), `two tiles of "${g.name}" have the same pattern (${key})`);
        seen.add(key);
        const line = json.animations[tile] ? rowLine(squares, json.animations[tile].row, tile) : null;
        const said = line ? cellsSaid(line, tile) : null;
        say(said && sameNeeds(said, around), `"The eight cells round each tile" does not list "${tile}" as the JSON's pattern has it (${CELLS.filter((c) => around[c]).join(', ') || 'none'}): "${(line ?? 'no line').trim()}"`);
      }
    }
    if (ruled.length) {
      say(/Match Corners and Sides/.test(godot.replace(/\s+/g, ' ')), 'Godot: a terrain set that matches corners and sides');
      say(/eight cells round each tile/i.test(godot.replace(/\s+/g, ' ')), 'Godot: the terrain step does not point at each tile\'s complete arrangement ("The eight cells round each tile")');
      say(!/"rules"/.test(godot), 'Godot: the terrain step sends the reader to the first-match "rules", which leaves some tiles with part of their arrangement');
    }
    // tiles that lie over other tiles need a layer of their own in both engines: one grid holds one tile in a cell
    const floors = (json.tiles?.groups ?? []).filter((g) => g.kind === 'floor'), rest = (json.tiles?.groups ?? []).filter((g) => g.kind !== 'floor');
    const lieOver = (floors.length && rest.length) || (json.tiles?.groups ?? []).some((g) => g.decorations.some((d) => ['on', 'face', 'rim'].includes(d.place)));
    if (lieOver) {
      say(/more than one Tilemap\b/.test(unity.replace(/\s+/g, ' ')) && /Order in Layer/.test(unity.replace(/\s+/g, ' ')), 'Unity: some tiles lie over others, and the steps do not say to stack several Tilemaps (Order in Layer)');
      say(/more than one TileMapLayer\b/.test(godot.replace(/\s+/g, ' ')), 'Godot: some tiles lie over others, and the steps do not say to stack several TileMapLayers');
      for (const f of floors) for (const g of rest) {
        const u = unity.replace(/\s+/g, ' '), step = u.slice(u.indexOf('more than one Tilemap'));
        say(step.indexOf(`"${f.name}"`) >= 0 && step.indexOf(`"${f.name}"`) < step.indexOf(`"${g.name}"`, step.indexOf(`"${f.name}"`) + 1) || f.name === g.name, `Unity: the layers do not put "${f.name}" under "${g.name}"`);
      }
    }
    // a thin platform is stood on from above only: the JSON marks it, the text says so, and both engines get the step that makes it so
    const allGroups = json.tiles?.groups ?? [], platforms = allGroups.filter((g) => g.kind === 'platform');
    for (const g of allGroups) say((g.oneWay === true) === (g.kind === 'platform'), g.kind === 'platform' ? `the JSON does not mark the platform "${g.name}" as stood on from above only (oneWay)` : `the JSON marks "${g.name}" (${g.kind}) as a one-way platform`);
    const uFlat = unity.replace(/\s+/g, ' '), gFlat = godot.replace(/\s+/g, ' ');
    if (platforms.length) {
      say(!/None of these groups blocks the way/.test(flat), 'it has platforms to stand on, and the text says that none of its groups blocks the way');
      for (const g of platforms) {
        const at = text.indexOf(`Group "${g.name}": a thin platform`);
        const heading = at < 0 ? '' : text.slice(at, text.indexOf('\n    row', at)).replace(/\s+/g, ' ');
        say(/from above/.test(heading), `the platform "${g.name}" is not introduced as something stood on from above`);
        say(!/does not block the way/.test(heading), `the platform "${g.name}" is said not to block the way, with nothing about standing on it`);
        say(new RegExp(`stood on from above only: [^.]*"${esc(g.name)}"`).test(flat), `the platform "${g.name}" is not listed among the groups stood on from above only`);
      }
      say(/Platform Effector 2D/.test(uFlat) && /Used By Effector/.test(uFlat) && /Tilemap Collider 2D/.test(uFlat), 'Unity: it has platforms to stand on, and no step makes them solid from above only (Tilemap Collider 2D, Used By Effector, Platform Effector 2D)');
      say(/One Way/.test(gFlat) && /collision shape/.test(gFlat), 'Godot: it has platforms to stand on, and no step makes them solid from above only (a collision shape with One Way)');
    } else {
      say(!/Platform Effector|One Way\b/.test(uFlat + gFlat) && !/from above only/.test(flat), 'the text gives the steps for a one-way platform, and this tileset has none');
    }
    if (view !== 'top-down') say(!/Lay it in every cell/.test(flat), 'a side-view tileset is told to lay a group in every cell, which is for a top-down floor');
    const families = new Set(Object.values(json.tiles?.tiles ?? {}).map((t) => t.family).filter(Boolean));
    say(families.size === 0 || /What the names mean/.test(text), 'the text does not explain the tile names');
  } else {
    say(!/Rule Tile|Tile Palette/.test(flat), 'the text gives tile steps for something that is not a tileset');
    say(json.tiles === undefined, 'the JSON has "tiles" for something that is not a tileset');
  }

  const stretch = anims.filter(([, a]) => a.border);
  if (stretch.length) {
    say(/9-slice/i.test(flat), 'it has pieces made to be stretched, and the text does not say so (9-slice)');
    say(/Image Type: Sliced/.test(flat) && /Sprite Editor/.test(flat) && /Border/.test(flat), 'Unity: the border in the Sprite Editor, and a sliced image');
    say(/NinePatchRect/.test(flat) && /Patch Margin/.test(flat), 'Godot: NinePatchRect and its margins');
    for (const [name, a] of stretch) {
      const b = a.border;
      say(new RegExp(`${esc(name)}\\b.*left ${b.left}\\b.*right ${b.right}\\b.*top ${b.top}\\b.*bottom ${b.bottom}\\b`).test(text), `the stretch border of "${name}" (left ${b.left}, right ${b.right}, top ${b.top}, bottom ${b.bottom}) is not in the text`);
    }
  }
  const texts = anims.filter(([, a]) => a.textArea);
  if (texts.length) say(/text goes/i.test(flat), 'it says in its JSON where text goes, and the text does not');
  // a piece that is cut out of its frame first (a "rect"): the reader then measures from the cut-out, so the text area must be given from its corner too
  const textSection = sectionOf(text, 'Text');
  for (const [name, a] of texts) {
    if (!a.rect) continue;
    const line = rowLine(textSection, a.row, name) ?? '';
    for (const t of [].concat(a.textArea)) say(new RegExp(`cut-out[^;]*\\b${t.x - a.rect.x}, ${t.y - a.rect.y}\\b`).test(line), `"${name}" is cut out of its frame at ${a.rect.x}, ${a.rect.y}, and the text does not give its text area measured from the cut-out (${t.x - a.rect.x}, ${t.y - a.rect.y}): "${line.trim()}"`);
  }
  if (type === 'ui') {
    say(!/Each row is one animation/.test(flat), 'the text calls the rows of an interface piece animations');
    // what a state's line says about the state itself: its words without how it is built (stretch, text) and how it moves
    const saidOf = (name) => { const line = rowLine(text, json.animations[name].row, name) ?? ''; return line.slice(line.indexOf(name) + name.length).split(' \u2014 ').filter((part) => !/^\s*(moves: |can be stretched|has a middle that repeats|part of a bar|takes text)/.test(part)).join(' ').trim(); };
    // the rows of a button and of a cursor are all states of the one piece (docs/style-guide.md, section 8), and so are the four standard state names anywhere
    const allStates = row.role === 'interface/button' || row.role === 'interface/cursor';
    const states = anims.filter(([n]) => (allStates && anims.length > 1) || ['normal', 'hover', 'pressed', 'disabled'].includes(n));
    if (states.length > 1) for (const [name, a] of states) say(a.state === true, `the JSON does not mark "${name}" as a state of the piece (state: true)`);
    for (const [name] of states) say(saidOf(name).length >= 12, `the state "${name}" is listed without saying what it is or when it is shown: "${(rowLine(text, json.animations[name].row, name) ?? '').trim()}"`);
    if (states.length > 1) say(/^\s*States: /m.test(text), 'its rows are states of one piece, and the text does not say so');
    // a bar: the fill is cut off to show a value, and each engine has its own way to do that
    if (anims.some(([, a]) => a.opening)) {
      const u = sectionOf(text, 'Unity').replace(/\s+/g, ' '), g = sectionOf(text, /^Godot\b/).replace(/\s+/g, ' ');
      say(/Rect Mask 2D|Image Type: Filled/.test(u), 'Unity: it is a bar, and no step says how to cut the fill off to show a value (a Rect Mask 2D, or Image Type: Filled)');
      say(/TextureProgressBar|Clip Contents/.test(g), 'Godot: it is a bar, and no step says how to cut the fill off to show a value (a TextureProgressBar, or Clip Contents)');
    }
  }

  if (type === 'background') {
    say(/back to (the )?front/i.test(flat), 'the text does not say the layers are listed from the back to the front');
    say(Array.isArray(json.layers) && json.layers.length === anims.length, 'the JSON has no "layers" (the order and how fast each scrolls)');
    let last = -1;
    for (const l of json.layers ?? []) {
      const at = text.search(new RegExp(`\\brow \\d+\\s+${esc(l.name)}\\b`));
      say(at > last, `the layer "${l.name}" is not listed in back-to-front order`);
      last = Math.max(last, at);
      say(new RegExp(`${esc(l.name)}\\b.*\\b${esc(String(l.scroll))}\\b`).test(text), `the text does not give the scroll speed of "${l.name}" (${l.scroll})`);
    }
    say(/Parallax/.test(flat), 'Godot: a parallax node');
    say(/repeats sideways/.test(flat), 'the text does not say a layer repeats sideways');
    say(!/Each row is one animation/.test(flat), 'the text calls the layers animations');
  }

  // ---- everyday words, nothing left unfilled, the licence as recorded
  const plain = flat.replace(/Animation Clips?|Audio Clips?|Clip Contents/g, '');            // Unity's and Godot's own names for their things
  say(!/\bparams?\b|\bclips?\b/i.test(plain), 'jargon in the text (params or clip)');
  say(!/undefined|NaN|\[object|null\b/.test(text), 'something in the text was left unfilled (undefined, NaN, null)');
  say(/^Licence\b/m.test(text), 'the text has no licence section');
  if (row.license) say(text.includes(`"${row.license}"`), `the licence value this asset records ("${row.license}") is not in the text`);
  if (row.license === 'draft') say(/not been decided/.test(flat), 'the licence is "draft" and the text does not say the terms have not been decided');
  return out;
}

/** Everything wrong with the top of a whole package: the contents list, the licence file and the list for tools. */
export function packageFaults({ manifest, readMe, licence, names }) {
  const out = [];
  const say = (ok, fault) => { if (!ok) out.push(fault); };
  say(typeof readMe === 'string' && typeof licence === 'string', 'the package has read-me.txt and licence.txt at its top');
  if (typeof readMe !== 'string' || typeof licence !== 'string') return out;
  const head = readMe.indexOf('Contents');
  say(head >= 0 && head < 400, 'read-me.txt opens with the contents list');
  say(/counted from 0/.test(readMe.replace(/\s+/g, ' ')), 'read-me.txt does not say how rows and frames are counted');
  for (const a of manifest.assets) {
    const where = a.folder ?? a.files[0];
    const line = readMe.split('\n').find((l) => l.includes(a.name) && l.includes(where));
    say(line, `the contents list has no line with "${a.name}" and where it is (${where})`);
    say(typeof a.whatItIs === 'string' && a.whatItIs.length > 3 && line?.includes(a.whatItIs), `the contents list does not say what kind of thing "${a.name}" is`);
    say(names.includes(where) || names.some((n) => n.startsWith(where)), `"${where}" of "${a.name}" is in the package`);
    const lic = licence.split('\n').find((l) => l.includes(a.name) && l.includes(where));
    say(lic, `licence.txt has no line for "${a.name}" (${where})`);
    say('license' in a, `the list for tools does not carry the licence value of "${a.name}"`);
    if (a.license) say(lic?.includes(a.license), `licence.txt does not give the value "${a.name}" records ("${a.license}")`);
    else say(/no licence value/.test(lic ?? ''), `licence.txt does not say that "${a.name}" records no licence value`);
  }
  const values = new Set(manifest.assets.map((a) => a.license).filter(Boolean));
  const said = licence.replace(/\s+/g, ' ');
  if (values.has('draft')) say(/not been decided/.test(said), 'some assets record "draft" and licence.txt does not say the terms have not been decided');
  say(!/\b(you may|you can|free to|permission is|royalty|commercial use is)\b/i.test(said), 'licence.txt states terms nobody has decided');
  say(!/\bparams?\b|\bclips?\b|undefined|NaN|\[object/.test(readMe.replace(/Audio Clips?|Animation Clips?/g, '')), 'jargon or something unfilled in read-me.txt');
  return out;
}
