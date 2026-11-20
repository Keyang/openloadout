// The words of a download (app/guide.js) and the facts behind them (engine/sheet-info.js): the text next to a
// sheet must be right for the kind of asset it is. Every sprite file in sprites/ is put through it (found by
// scanning the folder, so a new asset is covered with no edit here), with the same checker the browser test uses
// on a real download (tests/helpers/download-check.mjs). Nothing here names an asset: examples are picked by
// what an asset is (its type, its view, what its JSON carries).
import test from 'node:test';
import assert from 'node:assert/strict';
import { librarySprites, libraryCoverage } from '../helpers/library.mjs';
import { defineSprite, renderSheet, defaultParams, range } from '../../engine/sprite.js';
import { describeSheet, sheetKind, sheetFacing, clipDirection, layerScroll, stateRows, SHEET_KINDS, COUNTING } from '../../engine/sheet-info.js';
import { SCROLL } from '../../engine/backdrop.js';
import { spriteGuide, packageGuide, licenceText, licenceWords, whatItIs, soundWhatItIs } from '../../app/guide.js';
import { rowFromSprite } from '../../app/play/roles.js';
import { guideFaults, packageFaults, rowLine, sectionOf, needsSaid, cellsSaid } from '../helpers/download-check.mjs';

// every sprite in sprites/, a code file or a data file (tests/helpers/library.mjs); one another builder has half-written is not counted
const sprites = (await librarySprites()).sprites.map((s) => s.def).filter((def) => def && typeof def.render === 'function');

/** A catalogue-shaped row of a sprite, with the licence value it records. */
const rowOf = (def) => ({ ...rowFromSprite(def), license: def.meta?.license });
/** What a download holds for a sprite: the JSON (with the sounds of its animations, as the site lists them) and the text. */
function downloadOf(def, { scale = 1 } = {}) {
  const p = defaultParams(def);
  const json = describeSheet(def, renderSheet(def, p, { scale }).meta, p);
  json.sounds = {};
  for (const [clip, cues] of Object.entries(def.sounds ?? {})) {
    if (!cues.length) continue;
    json.sounds[clip] = cues.map((c) => ({ sound: c.sound, file: `sounds/${c.sound}.wav`, loop: false, frame: c.frame, timeMs: Math.round((c.frame * 1000) / json.animations[clip].fps), volume: c.volume ?? 1, settings: {} }));
  }
  const text = spriteGuide({ json, description: def.blurb ?? '', licence: def.meta?.license });
  return { row: rowOf(def), json, text };
}
const made = sprites.map((def) => ({ def, ...downloadOf(def) }));
const firstOf = (test_) => made.find(test_);
const ofType = (type) => made.filter((m) => m.def.meta?.type === type);

test('every sprite in sprites/: the text and the JSON are right for the kind of asset it is', (t) => {
  assert.ok(made.length >= 6, `sprites to check (found ${made.length})`);
  const faults = made.flatMap((m) => guideFaults(m));
  t.diagnostic(`${made.length} sprites of ${new Set(made.map((m) => m.json.kind)).size} kinds checked`);
  assert.deepEqual(faults, []);
});

test('every kind of sheet has words, and every type of sprite in sprites/ maps to one', () => {
  for (const m of made) {
    assert.ok(SHEET_KINDS[m.json.kind], `${m.def.id}: "${m.json.kind}" is a known kind`);
    assert.ok(whatItIs(m.json).length > 3, `${m.def.id}: it can be said what it is`);
    if (m.def.meta?.type) assert.notEqual(m.json.kind, 'animation', `${m.def.id}: a sprite with a type is not left as "an animated picture"`);
  }
  // decided by metadata, then by what moves
  assert.equal(sheetKind({ type: 'tileset' }, {}), 'tileset');
  assert.equal(sheetKind({ role: 'world/tile' }, {}), 'tileset');
  assert.equal(sheetKind({ role: 'environment/background' }, {}), 'background');
  assert.equal(sheetKind({ type: 'icon', role: 'interface/icon' }, {}), 'pictures');
  assert.equal(sheetKind({ role: 'interface/button' }, {}), 'interface');
  assert.equal(sheetKind(undefined, { a: { frames: 1 }, b: { frames: 1 } }), 'pictures');
  assert.equal(sheetKind(undefined, { a: { frames: 1 }, b: { frames: 4 } }), 'animation');
});

test('a sheet is only said to face right when the whole of it does', () => {
  assert.equal(sheetFacing('character', 'side', ['idle', 'walk']), 'right');
  assert.equal(sheetFacing('character', 'top-down', ['idle_down', 'walk_side', 'hurt']), null, 'one row per direction: no single facing');
  assert.equal(sheetFacing('projectile', 'top-down', ['fly']), 'right');
  for (const kind of ['tileset', 'background', 'interface', 'pictures', 'object', 'pickup']) assert.equal(sheetFacing(kind, 'side', ['a']), null, kind);
  // an effect may show a direction (a slash) or none (a ring of light), and nothing records which: it is never said to face one way
  for (const view of ['side', 'top-down', 'front', null]) assert.equal(sheetFacing('effect', view, ['burst', 'loop']), null, `an effect, ${view}`);
  for (const m of ofType('effect')) {
    assert.equal(m.json.facing, undefined, `${m.def.id}: no facing in the JSON`);
    assert.ok(!/It is drawn for an action that points right/.test(m.text), `${m.def.id}: not told flatly that it points right`);
    if (['side', 'top-down'].includes(m.def.meta.view)) assert.match(m.text.replace(/\s+/g, ' '), /If it shows a direction/, `${m.def.id}: told what to do if it shows one`);
    else assert.ok(!/\bflip|\bmirror/i.test(m.text), `${m.def.id}: seen from no side, nothing about flipping`);
  }
  assert.equal(clipDirection('walk_side'), 'right');
  assert.equal(clipDirection('idle_down'), 'down');
  assert.equal(clipDirection('attack_up'), 'up');
  assert.equal(clipDirection('heart-full'), null);
  for (const m of made) {
    const directional = Object.keys(m.json.animations).some((n) => clipDirection(n));
    if (directional) {
      assert.equal(m.json.facing, undefined, `${m.def.id}: no single facing`);
      for (const [n, a] of Object.entries(m.json.animations)) assert.equal(a.direction, clipDirection(n) ?? 'any', `${m.def.id}/${n}`);
    }
  }
});

test('describeSheet adds facts and takes nothing a game reads away', () => {
  for (const { def } of made.slice(0, 40)) {
    const p = defaultParams(def);
    const before = renderSheet(def, p).meta;
    const snapshot = JSON.stringify(before);
    const after = describeSheet(def, before, p);
    assert.equal(JSON.stringify(before), snapshot, `${def.id}: the sheet passed in is not changed`);
    for (const k of Object.keys(before)) if (k !== 'facing') assert.ok(k in after, `${def.id}: "${k}" is kept`);
    assert.deepEqual(after.frames, before.frames, `${def.id}: frames as they were`);
    assert.deepEqual(after.params, before.params, `${def.id}: the settings as they were`);
    assert.deepEqual(Object.keys(after.animations), Object.keys(before.animations), `${def.id}: rows in the same order`);
    for (const [n, a] of Object.entries(before.animations)) for (const [k, v] of Object.entries(a)) assert.deepEqual(after.animations[n][k], v, `${def.id}/${n}.${k}`);
    assert.equal(after.counting, COUNTING);
    assert.equal(typeof after.grounded, 'boolean');
  }
});

test('a tileset: tile size, every tile by row with what it needs round it, the names explained, palette and rule steps', () => {
  const sets = ofType('tileset');
  assert.ok(sets.length, 'a tileset to look at');
  for (const { def, json, text } of sets) {
    assert.deepEqual(json.tiles.tileSize, { w: json.frameWidth, h: json.frameHeight }, def.id);
    assert.ok(/first tile whose "needs" all hold/.test(json.tiles.how), `${def.id}: the JSON says how to read its rules`);
    for (const g of json.tiles.groups) {
      for (const r of g.rules.filter((x) => Object.keys(x.needs).length)) {
        const line = rowLine(text, json.animations[r.tile].row, r.tile);
        assert.ok(line.includes(g.name), `${def.id}: the line of ${r.tile} says what it needs of "${g.name}" round it (${line})`);
      }
      for (const v of g.versions.slice(1)) assert.match(rowLine(text, json.animations[v].row, v), /another version of/, `${def.id}: ${v}`);
      for (const d of g.decorations) assert.match(rowLine(text, json.animations[d.tile].row, d.tile), /decoration: put it/, `${def.id}: ${d.tile}`);
    }
    for (const n of json.tiles.other) assert.ok(text.indexOf('place by hand') < text.indexOf(`  ${n}`), `${def.id}: ${n} is listed as placed by hand`);
    const blocking = json.tiles.groups.filter((g) => g.solid).map((g) => g.name);
    if (blocking.length) assert.match(text, /Groups that block the way: /, def.id);
    assert.ok(!/\bfacing\b/.test(JSON.stringify(Object.keys(json))), `${def.id}: no facing in the JSON`);
  }
  // a tileset at twice the size says twice the tile size
  const big = downloadOf(sets[0].def, { scale: 2 });
  assert.match(big.text, new RegExp(`Each tile is ${sets[0].json.frameWidth * 2} x ${sets[0].json.frameHeight * 2} pixels`));
  assert.match(big.text, new RegExp(`Pixels Per Unit: ${sets[0].json.frameWidth * 2}\\b`));
});

test('the checker reads the tile words back: a wrong side, a wrong list of cells, a terrain step that points at the rule list, and missing layers are all faults', () => {
  const sets = ofType('tileset');
  const swap = (text, line, changed) => { assert.ok(text.includes(line) && line !== changed, 'a line to change'); return text.replace(line, changed); };
  let sides = 0, cells = 0, terrains = 0, layers = 0;
  for (const m of sets) {
    assert.deepEqual(guideFaults(m), [], `${m.def.id}: right as it is`);
    for (const g of m.json.tiles.groups) {
      // a wrong side in the words of one tile ("left" where the rule says another cell)
      const rule = g.rules.find((r) => Object.keys(r.needs).length && /\bleft\b/.test(rowLine(m.text, m.json.animations[r.tile].row, r.tile).split(r.tile)[1]));
      if (rule) {
        const line = rowLine(m.text, m.json.animations[rule.tile].row, rule.tile);
        assert.ok(needsSaid(g.name, line), `${m.def.id}: the line of ${rule.tile} can be read`);
        const [head, tail] = [line.slice(0, line.indexOf(rule.tile) + rule.tile.length), line.slice(line.indexOf(rule.tile) + rule.tile.length)];
        const wrong = guideFaults({ ...m, text: swap(m.text, line, head + tail.replace(/\bleft\b/g, 'right')) });
        assert.ok(wrong.some((f) => f.includes(`the line of "${rule.tile}" does not say what its rules say`)), `${m.def.id}: "right" for "left" on the line of ${rule.tile} is caught (${wrong.join(' | ')})`);
        sides++;
      }
      // a wrong list of cells for one tile in "The eight cells round each tile"
      const section = sectionOf(m.text, /^The eight cells round each tile/);
      const x = (g.patterns ?? []).find((q) => g.rules.length > 1 && rowLine(section, m.json.animations[q.tile].row, q.tile));
      if (x) {
        const line = rowLine(section, m.json.animations[x.tile].row, x.tile);
        assert.deepEqual(cellsSaid(line, x.tile), x.around, `${m.def.id}: the cells of ${x.tile} read back as the JSON has them`);
        const all = Object.values(x.around).every(Boolean);
        const changed = `${line.slice(0, line.indexOf(x.tile) + x.tile.length)}  ${all ? 'none' : 'all eight'}`;
        const wrong = guideFaults({ ...m, text: m.text.replace(section, swap(section, line, changed)) });
        assert.ok(wrong.some((f) => f.includes(`does not list "${x.tile}" as the JSON's pattern has it`)), `${m.def.id}: wrong cells for ${x.tile} are caught`);
        cells++;
      }
    }
    // the step this text used to have: switch squares on where the first-match rules say true
    const godot = sectionOf(m.text, /^Godot\b/);
    if (/Match Corners and Sides/.test(godot)) {
      const old = godot.replace(/"?[Tt]he\s+eight\s+cells\s+round\s+each\s+tile"?/g, 'the group\'s "rules"');      // (the phrase may be wrapped over two lines)
      assert.notEqual(old, godot, `${m.def.id}: the terrain step points at the list of cells`);
      const wrong = guideFaults({ ...m, text: m.text.replace(godot, old) });
      assert.ok(wrong.some((f) => /Godot: the terrain step/.test(f)), `${m.def.id}: a terrain step that points at the rule list is caught`);
      terrains++;
    }
    const unity = sectionOf(m.text, 'Unity');
    if (/more than one Tilemap/.test(unity.replace(/\s+/g, ' '))) {
      const wrong = guideFaults({ ...m, text: m.text.replace(unity, unity.replace(/more than one/, 'a')) });
      assert.ok(wrong.some((f) => /Unity: some tiles lie over others/.test(f)), `${m.def.id}: steps for a single Tilemap are caught`);
      layers++;
    }
  }
  assert.ok(sides && cells && terrains && layers, `something of each to check (${sides} sides, ${cells} cell lists, ${terrains} terrain steps, ${layers} layered sets)`);
  // the words for the cells, read on their own
  assert.deepEqual(needsSaid('g', 'row 1  g-x  thing  needs g: right, below; no g: above, left'), [{ right: true, down: true, up: false, left: false }]);
  assert.deepEqual(needsSaid('g', 'row 1  g-x  thing  needs g on all four sides and above left; no g: above right'), [{ up: true, right: true, down: true, left: true, upLeft: true, upRight: false }]);
  assert.deepEqual(needsSaid('g', 'row 1  g-x  thing  needs g: left; or no g on any of its four sides (moves: 4 frames, 6 per second)'), [{ left: true }, { up: false, right: false, down: false, left: false }]);
  assert.equal(needsSaid('g', 'row 1  g-x  thing  needs g: right, right'), null, 'a cell named twice cannot be read');
  assert.equal(needsSaid('g', 'row 1  g-x  thing  needs g: sideways'), null);
  assert.deepEqual(cellsSaid('row 1  g-x  all but above left', 'g-x'), { up: true, upRight: true, right: true, downRight: true, down: true, downLeft: true, left: true, upLeft: false });
});

test('a side-view tileset with a wall behind the action is not told to lay it in every cell', () => {
  const backed = ofType('tileset').filter((m) => m.json.view !== 'top-down' && m.json.tiles.groups.some((g) => g.kind === 'floor'));
  for (const m of backed) {
    const g = m.json.tiles.groups.find((x) => x.kind === 'floor');
    const at = m.text.indexOf(`Group "${g.name}":`);
    const heading = m.text.slice(at, m.text.indexOf('\n    row', at)).replace(/\s+/g, ' ');
    assert.match(heading, /behind/, `${m.def.id}: ${heading}`);
    assert.ok(!/base ground|every cell/.test(heading), `${m.def.id}: ${heading}`);
  }
  for (const m of ofType('tileset').filter((x) => x.json.view === 'top-down' && x.json.tiles.groups.some((g) => g.kind === 'floor'))) assert.match(m.text.replace(/\s+/g, ' '), /the base ground\. Lay it in every cell/, m.def.id);
});

test('an interface piece: states said, the stretch border as the JSON has it, where text goes, in sheet pixels', () => {
  const stretchy = firstOf((m) => Object.values(m.json.animations).some((a) => a.border));
  assert.ok(stretchy, 'a sprite with a stretch border');
  const withText = firstOf((m) => Object.values(m.json.animations).some((a) => a.textArea));
  assert.ok(withText, 'a sprite that says where text goes');
  const p = defaultParams(withText.def);
  for (const [name, a] of Object.entries(withText.json.animations)) {
    if (!a.textArea) continue;
    const declared = [].concat(withText.def.textArea(name, p))[0];
    const first = [].concat(a.textArea)[0];
    assert.deepEqual([first.x, first.y, first.w, first.h], [declared.x, declared.y, declared.w, declared.h], `${withText.def.id}/${name}: the text area the sprite declares`);
    assert.match(rowLine(withText.text.slice(withText.text.indexOf('\nText\n')), a.row, name), new RegExp(`text goes at ${first.x}, ${first.y}, ${first.w} wide and ${first.h} high`), `${withText.def.id}/${name}`);
  }
  // twice the size: twice the numbers, in the JSON and in the text
  const twice = downloadOf(withText.def, { scale: 2 });
  for (const [name, a] of Object.entries(withText.json.animations)) {
    if (!a.textArea) continue;
    const one = [].concat(a.textArea), two = [].concat(twice.json.animations[name].textArea);
    one.forEach((t, i) => assert.deepEqual([two[i].x, two[i].y, two[i].w, two[i].h], [t.x * 2, t.y * 2, t.w * 2, t.h * 2], `${withText.def.id}/${name}`));
  }
  assert.deepEqual(guideFaults(twice), []);
  assert.deepEqual(guideFaults(downloadOf(stretchy.def, { scale: 2 })), []);
  // a row marked as never carrying text gets no text area
  for (const m of made) for (const [name, a] of Object.entries(m.json.animations)) if (m.def.clips[name].noText) assert.equal(a.textArea, undefined, `${m.def.id}/${name}`);
});

test('a sound on a row of one still picture plays when that row is shown, never on a frame of an animation', () => {
  // a button made here, so the case is always there: three still states, a sound on two of them
  const draw = (g) => { g.rect(2, 2, 28, 12, '#ffffff'); };
  const button = defineSprite({ id: 'guide-button', name: 'Test button', size: [32, 16], pivot: [16, 8], grounded: false, meta: { type: 'ui', role: 'interface/button', view: 'none' }, params: { size: range('Size', 0.5) },
    clips: { normal: { frames: 1, fps: 8 }, hover: { frames: 1, fps: 8 }, pressed: { frames: 1, fps: 8 } }, sounds: { hover: [{ sound: 'guide-tick', frame: 0 }], pressed: [{ sound: 'guide-click', frame: 0, volume: 0.6 }] }, render: draw });
  const b = downloadOf(button);
  assert.deepEqual(guideFaults(b), []);
  const section = sectionOf(b.text, 'Sounds');
  assert.ok(section, 'a Sounds section');
  assert.ok(!/Animation Event|AnimationPlayer|\bframe\b/.test(section), `nothing about frames or animation events:\n${section}`);
  assert.match(section, /pressed: sounds\/guide-click\.wav .*\bwhen\b/);
  const said = section.replace(/\s+/g, ' ');
  assert.match(said, /Unity: .*Event Trigger/);
  assert.match(said, /Pointer Down for "pressed"/);
  assert.match(said, /Pointer Enter[^;.]* for "hover"/);
  assert.match(said, /Godot: .*\bsignals\b/);
  assert.match(said, /button_down for "pressed"/);
  assert.match(said, /mouse_entered[^;.]* for "hover"/);
  // the sentences the text used to have are faults for it
  const old = b.text.replace(section, `Sounds\n  Play each sound when its animation reaches the frame listed here.\n  hover: sounds/guide-tick.wav starts on frame 0 (0 ms in)\n  pressed: sounds/guide-click.wav starts on frame 0 (0 ms in), volume 60%\n  Unity: add an Animation Event on that frame that calls AudioSource.PlayOneShot with that sound.\n  Godot: add an audio track to an AnimationPlayer.`);
  const faults = guideFaults({ ...b, text: old });
  assert.ok(faults.some((f) => /is one still picture, and its sound .* is tied to a frame/.test(f)), faults.join(' | '));
  assert.ok(faults.some((f) => /no sound here waits for a frame of an animation/.test(f)), faults.join(' | '));

  // a thing with a sound on a row that moves and one on a still row: each is told its own way, and the steps for a frame are still there
  const chest = defineSprite({ id: 'guide-chest', name: 'Test chest', size: [16, 16], pivot: [8, 15], meta: { type: 'prop', role: 'world/container', view: 'side' }, params: { size: range('Size', 0.5) },
    clips: { closed: { frames: 1, fps: 8 }, open: { frames: 4, fps: 8, loop: false } }, sounds: { closed: [{ sound: 'guide-thud', frame: 0 }], open: [{ sound: 'guide-creak', frame: 2 }] }, render: (g) => { g.rect(3, 6, 10, 10, '#ffffff'); } });
  const c = downloadOf(chest);
  assert.deepEqual(guideFaults(c), []);
  const both = sectionOf(c.text, 'Sounds');
  assert.match(both, /open: sounds\/guide-creak\.wav starts on frame 2 \(250 ms in\)/);
  assert.match(both, /closed: sounds\/guide-thud\.wav .*\bwhen\b/);
  assert.ok(!/closed: .*\bframe\b/.test(both), both);
  assert.match(both, /Animation Event/);

  // an interface piece that is not a button, with a sound on a still row of its own: played from the game's script, and no button event is asked for
  const badge = defineSprite({ id: 'guide-badge', name: 'Test badge', size: [16, 16], pivot: [8, 8], grounded: false, meta: { type: 'ui', role: 'interface/icon', view: 'none' }, params: { size: range('Size', 0.5) },
    clips: { empty: { frames: 1, fps: 8 }, full: { frames: 1, fps: 8 } }, sounds: { full: [{ sound: 'guide-ding', frame: 0 }] }, render: draw });
  const d = downloadOf(badge);
  assert.deepEqual(guideFaults(d), []);
  assert.match(sectionOf(d.text, 'Sounds').replace(/\s+/g, ' '), /full: sounds\/guide-ding\.wav plays once, when .*"full".*Unity: .*from the script that switches to that row/);
  assert.ok(!/Event Trigger|Animation Event/.test(d.text));

  // every sprite in sprites/ that ties a sound to a still row (whichever they are)
  for (const m of made) for (const [clip, list] of Object.entries(m.json.sounds)) {
    if (m.json.animations[clip].frames !== 1) continue;
    const lines = sectionOf(m.text, 'Sounds').split('\n').filter((l) => l.trim().startsWith(`${clip}:`));
    assert.equal(lines.length, list.length, `${m.def.id}/${clip}: one line for each sound`);
    for (const l of lines) assert.ok(/\bwhen\b/.test(l) && !/\bframe\b/.test(l), `${m.def.id}/${clip}: ${l}`);
  }
});

test('a tileset with thin platforms: they are stood on from above only, in the JSON, in the words and in the steps of both engines', () => {
  const sets = ofType('tileset');
  const withPlatforms = sets.filter((m) => m.json.tiles.groups.some((g) => g.kind === 'platform'));
  assert.ok(withPlatforms.length, 'a tileset with a thin platform to look at');
  for (const m of sets) for (const g of m.json.tiles.groups) assert.equal(g.oneWay === true, g.kind === 'platform', `${m.def.id}/${g.name} (${g.kind}): oneWay only on a platform`);
  for (const m of withPlatforms) {
    assert.match(m.json.tiles.how, /"oneWay"/, `${m.def.id}: the JSON says how to read oneWay`);
    const flat = m.text.replace(/\s+/g, ' ');
    assert.ok(!/None of these groups blocks the way/.test(flat), `${m.def.id}: not told that nothing blocks the way`);
    const unity = sectionOf(m.text, 'Unity').replace(/\s+/g, ' '), godot = sectionOf(m.text, /^Godot\b/).replace(/\s+/g, ' ');
    for (const g of m.json.tiles.groups.filter((x) => x.kind === 'platform')) {
      assert.equal(g.solid, false, `${m.def.id}/${g.name}: not a wall`);
      assert.match(flat, new RegExp(`stood on from above only: [^.]*"${g.name}"`), `${m.def.id}/${g.name}`);
      assert.match(unity, new RegExp(`Platforms to stand on: [^.]*"${g.name}"`), `${m.def.id}/${g.name}: named in the Unity step`);
      assert.match(godot, new RegExp(`Platforms to stand on: [^.]*"${g.name}"`), `${m.def.id}/${g.name}: named in the Godot step`);
    }
    assert.match(unity, /Tilemap Collider 2D.*Used By Effector.*Platform Effector 2D/, m.def.id);
    assert.match(godot, /collision shape.*One Way/, m.def.id);
    // what the text said before is a fault
    const first = m.json.tiles.groups.find((x) => x.kind === 'platform');
    const wrong = guideFaults({ ...m, text: m.text.replace(/Platform Effector 2D/g, 'collider') });
    assert.ok(wrong.some((f) => /Unity: it has platforms to stand on/.test(f)), `${m.def.id}: a text with no one-way step for Unity is caught`);
    const unmarked = { ...m.json, tiles: { ...m.json.tiles, groups: m.json.tiles.groups.map((g) => { const { oneWay, ...rest } = g; return rest; }) } };
    assert.ok(guideFaults({ ...m, json: unmarked }).some((f) => f.includes(`does not mark the platform "${first.name}"`)), `${m.def.id}: a JSON that does not mark the platform is caught`);
  }
  // a tileset with no platform gets none of it
  for (const m of sets.filter((x) => !withPlatforms.includes(x))) assert.ok(!/Platform Effector|One Way\b|from above only/.test(m.text), `${m.def.id}: no one-way steps`);
});

test('an interface piece whose rows are states of one piece says when each is shown; a bar says how to cut its fill off; a cut-out piece gives its text area from the cut-out', () => {
  // a cursor or a button: every row is a state (found by role, whichever sprites those are)
  const stateful = made.filter((m) => ['interface/cursor', 'interface/button'].includes(m.def.meta?.role) && Object.keys(m.def.clips).length > 1);
  assert.ok(stateful.some((m) => m.def.meta.role === 'interface/cursor'), 'a cursor to look at');
  for (const m of stateful) {
    assert.match(m.text, /^\s*States: /m, `${m.def.id}: its rows are introduced as states`);
    for (const [name, a] of Object.entries(m.json.animations)) {
      const line = rowLine(m.text, a.row, name);
      const said = line.slice(line.indexOf(name) + name.length).split(' — ').filter((part) => !/^\s*(moves: |can be stretched|takes text)/.test(part)).join(' ').trim();
      assert.ok(said.length >= 12, `${m.def.id}/${name}: says when it is shown ("${line.trim()}")`);
    }
  }
  // which rows are states: all of a button's or a cursor's, the standard names anywhere else, and never a lone row
  assert.deepEqual(stateRows({ role: 'interface/cursor' }, ['idle', 'drag']), ['idle', 'drag']);
  assert.deepEqual(stateRows({ role: 'interface/button' }, ['normal', 'pressed']), ['normal', 'pressed']);
  assert.deepEqual(stateRows({ role: 'interface/panel' }, ['normal', 'hover', 'badge']), ['normal', 'hover']);
  assert.deepEqual(stateRows({ role: 'interface/panel' }, ['panel', 'hover']), [], 'one standard name alone is not a set of states');
  assert.deepEqual(stateRows({ role: 'interface/cursor' }, ['idle']), [], 'one row has no states');
  assert.deepEqual(stateRows(undefined, ['a', 'b']), []);
  for (const m of made) {
    const marked = Object.entries(m.json.animations).filter(([, a]) => a.state).map(([n]) => n);
    assert.deepEqual(marked, m.json.kind === 'interface' ? stateRows(m.def.meta, Object.keys(m.def.clips)) : [], `${m.def.id}: states are marked in the JSON, and only on an interface piece`);
  }
  // a cursor with a state nobody has words for, and no label that says more than its name: caught, and cured by a label
  const cursor = (label) => defineSprite({ id: 'guide-cursor', name: 'Test cursor', size: [16, 16], pivot: [8, 8], grounded: false, meta: { type: 'ui', role: 'interface/cursor', view: 'none' }, params: { size: range('Size', 0.5) },
    clips: { idle: { frames: 2, fps: 4 }, wobble: { frames: 2, fps: 4, ...(label ? { label } : {}) } }, render: (g) => { g.rect(6, 6, 4, 4, '#ffffff'); } });
  assert.ok(guideFaults(downloadOf(cursor())).some((f) => /the state "wobble" is listed without saying/.test(f)), 'a state with no words is a fault');
  assert.deepEqual(guideFaults(downloadOf(cursor('While the player drags something'))), []);

  // a bar (a row with an opening): each engine is told how to show part of the fill
  const bars = made.filter((m) => Object.values(m.json.animations).some((a) => a.opening));
  assert.ok(bars.length, 'a bar to look at');
  for (const m of bars) {
    const unity = sectionOf(m.text, 'Unity').replace(/\s+/g, ' '), godot = sectionOf(m.text, /^Godot\b/).replace(/\s+/g, ' ');
    const o = Object.values(m.json.animations).find((a) => a.opening).opening;
    assert.match(unity, /Bars: .*Rect Mask 2D/, m.def.id);
    assert.match(unity, new RegExp(`Image Type: Filled.*\\(${o.x} \\+ share x ${o.w}\\) / ${m.json.frameWidth}\\b`), `${m.def.id}: the fill amount allows for the ends of the row`);
    assert.match(godot, /Bars: .*TextureProgressBar.*Clip Contents/, m.def.id);
    assert.ok(guideFaults({ ...m, text: m.text.replace(/Rect Mask 2D|Image Type: Filled/g, 'thing') }).some((f) => /Unity: it is a bar/.test(f)), `${m.def.id}: a text with no cut-off step is caught`);
  }

  // a piece cut out of its frame that takes text: the text area is also given from the cut-out's corner
  const cut = made.filter((m) => Object.values(m.json.animations).some((a) => a.rect && a.textArea));
  assert.ok(cut.length, 'a cut-out piece that takes text to look at');
  for (const m of cut) for (const [name, a] of Object.entries(m.json.animations)) {
    if (!a.rect || !a.textArea) continue;
    const line = rowLine(sectionOf(m.text, 'Text'), a.row, name);
    for (const t of [].concat(a.textArea)) assert.match(line, new RegExp(`text goes at ${t.x}, ${t.y}, .*cut-out[^;]*\\b${t.x - a.rect.x}, ${t.y - a.rect.y}\\b`), `${m.def.id}/${name}: ${line}`);
    assert.ok(guideFaults({ ...m, text: m.text.replace(line, line.replace(/\s*\(.*cut-out.*$/, '')) }).some((f) => /measured from the cut-out/.test(f)), `${m.def.id}/${name}: a line without it is caught`);
  }
});

test('a background: layers from the back to the front with the share of the camera\'s movement each slides by', () => {
  const bgs = ofType('background');
  assert.ok(bgs.length, 'a background to look at');
  for (const { def, json } of bgs) {
    assert.deepEqual(json.layers.map((l) => l.name), Object.keys(def.clips), `${def.id}: in sheet order, the farthest first`);
    for (const l of json.layers) if (SCROLL[l.name] !== undefined) assert.equal(l.scroll, SCROLL[l.name], `${def.id}/${l.name}: the backdrop helper's speed`);
    const shares = json.layers.map((l) => l.scroll);
    assert.deepEqual(shares, [...shares].sort((a, b) => a - b), `${def.id}: the back layer slides least`);
  }
  assert.deepEqual(layerScroll(['sky', 'hills', 'trees', 'grass']), { sky: SCROLL.far, hills: 0.3, trees: 0.5, grass: SCROLL.near }, 'other names are spread from the slowest to the fastest');
  assert.deepEqual(layerScroll(['only']), { only: SCROLL.far });
});

test('a sprite nobody gave a type: said as it is, with no claim about facing', () => {
  const plain = defineSprite({ id: 'guide-plain', name: 'Plain thing', size: [16, 16], pivot: [8, 8], grounded: false, params: { size: range('Size', 0.5) }, clips: { idle: { frames: 2, fps: 4 }, pop: { frames: 3, fps: 9, loop: false } }, render(g) { g.rect(4, 4, 8, 8, '#ffffff'); } });
  const d = downloadOf(plain);
  assert.equal(d.json.kind, 'animation');
  assert.equal(d.json.facing, undefined);
  assert.deepEqual(guideFaults(d), []);
  assert.match(d.text, /No licence value is recorded/);
  const still = defineSprite({ id: 'guide-still', name: 'Still thing', size: [16, 16], pivot: [8, 8], grounded: false, params: { size: range('Size', 0.5) }, clips: { only: { frames: 1, fps: 1 } }, render(g) { g.rect(4, 4, 8, 8, '#ffffff'); } });
  const s = downloadOf(still);
  assert.match(s.text, /One picture, 16 x 16 pixels\. There is no animation\./);
  assert.match(s.text, /Sprite Mode: Single/);
  assert.deepEqual(guideFaults(s), []);
});

test('a style that makes other files than one sheet: its files are listed, the kind is still told truthfully', () => {
  const m = firstOf((x) => x.json.kind === 'character' && x.json.facing === 'right');
  assert.ok(m, 'a side-view character');
  const json = { ...m.json, artStyle: 'outline-svg' };
  delete json.image;
  const pictures = json.frames.map((f) => `frames/${f.name}.svg`);
  const text = spriteGuide({ json, licence: 'draft', pictures, style: { label: 'Outlined shapes', about: 'Every shape as a line drawing.' } });
  assert.match(text, /"Outlined shapes" style/);
  assert.ok(text.includes(pictures[0]) && text.includes(`${pictures.length} picture files in all`));
  assert.match(text, /drawn facing right/);
  assert.ok(!/\brow \d/.test(text), 'no rows: there is no sheet');
  assert.deepEqual(guideFaults({ row: m.row, json, text }), []);
});

test('licence words: "draft" is said to be undecided, another value is named and not explained, and no terms are made up', () => {
  assert.match(licenceWords('draft'), /not been decided/);
  assert.match(licenceWords('some-licence'), /does not spell out what "some-licence" allows/);
  assert.match(licenceWords(undefined), /No licence value is recorded/);
  for (const v of ['draft', 'some-licence', undefined]) assert.ok(!/\b(you may|you can|free to|permission|royalty|commercial)\b/i.test(licenceWords(v)), String(v));
});

test('a package: read-me.txt opens with the contents list, licence.txt lists what every asset records', () => {
  // a package of every sprite, two sounds and a track, as the site's manifest lists them
  const assets = made.map((m) => ({ key: `k-${m.def.id}`, id: m.def.id, kind: 'sprite', name: m.def.name, role: m.def.meta?.role ?? null, type: m.def.meta?.type ?? null, files: [`sprites/${m.def.id}/${m.def.id}.png`], settings: {}, license: m.def.meta?.license ?? null, whatItIs: whatItIs(m.json), folder: `sprites/${m.def.id}/` }));
  const sound = (id, name, kind, type, license, loop = false) => ({ key: `k-${id}`, id, kind, name, role: null, type, files: [`${kind === 'music' ? 'music' : 'sounds'}/${id}.wav`], settings: {}, license, loop, whatItIs: soundWhatItIs({ kind, type, loop }) });
  assets.push(sound('test-blip', 'Blip', 'sound', 'sfx', 'draft'), sound('test-wind', 'Wind', 'sound', 'ambience', 'some-licence', true), sound('test-tune', 'Tune', 'music', 'music', null, true));
  const manifest = { assets };
  const readMe = packageGuide(manifest, false), licence = licenceText(assets);
  const names = assets.flatMap((a) => a.files);
  assert.deepEqual(packageFaults({ manifest, readMe, licence, names }), []);
  // the contents list comes before anything else, and is sorted by the name people know
  assert.ok(readMe.indexOf('Contents') < readMe.indexOf('Folders') && readMe.indexOf('Contents') < readMe.indexOf('Unity'));
  const listed = readMe.split('\n').filter((l) => l.includes('sprites/') && l.trim().endsWith('/')).map((l) => l.trim());
  assert.deepEqual(listed, [...listed].sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1)), 'sprites in the order of their names');
  assert.match(readMe, /Blip\s+sound effect\s+sounds\/test-blip\.wav/);
  assert.match(readMe, /Wind\s+background sound that repeats\s+sounds\/test-wind\.wav/);
  assert.match(readMe, /Tune\s+music track that repeats\s+music\/test-tune\.wav/);
  assert.match(licence, /"draft":\s+The terms for using it have not been decided yet/);
  assert.match(licence, /"some-licence":\s+This download does not spell out/);
  assert.match(licence, /Tune\s+music\/test-tune\.wav\s+no licence value recorded/);
  // what was said before about things left out is still said
  const partial = packageGuide({ assets: assets.slice(0, 2).map((a, i) => ({ ...a, madeOnThisVisit: i === 0 })), missing: ['gone'], unsupported: [{ id: 'x', artStyle: 'y' }] }, true);
  assert.match(partial, /Not included \(no longer on the site\): gone/);
  assert.match(partial, /Not included \(asked for in a style it cannot be drawn in\): x \(y\)/);
  assert.match(partial, new RegExp(`Made on your visit: ${assets[0].name}\\.`));
  assert.match(partial, /with the bag's look applied to all of them/);
});

test('the scan covers every sprite file, code and data alike, and names any that did not load', async (t) => t.diagnostic(await libraryCoverage()));
