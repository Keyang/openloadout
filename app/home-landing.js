// The landing page, #/ (docs/site-design.md, section 5; the picture to match is mocks/5-catalogue/landing.html).
// Everything on it comes from the catalogue: the numbers, the kits' facts, the Hero's versions. The sprites are drawn
// live by the engine (app/home-live.js), so the controls in step 2, "Surprise me" and the kits' looks really change them.
import { labelFor } from '../catalog/schema.js';
import { THEME_PRESETS } from '../engine/theme.js';
import { makeMagic } from './magic.js';
import { el, header, footer, reduceMotion, sourceLink } from './ui.js';
import { currentCatalog, loadSprite, loadSound } from './catalog.js';
import { soundById, soundParams, renderAsync, playRendered, playLive } from './audio.js';
import { cardFor } from './cards.js';
import { versionsFor } from './versions.js';
import { colourWord } from './panel.js';
import { Q_MAX, stateFromQuery, hashFromState } from './browse.js';
import { liveGroup } from './home-live.js';

const HERO = 'knight';

// The line-up: [id, footprint width in art pixels, when it steps out ('a' under 1180px, 'b' under 720px), a second sprite floating above: [id, lift]]
const LINEUP = [
  ['knight', 30, ''], ['slime', 26, '', ['bat', 40]], ['moss-golem', 64, 'b'], ['wizard', 34, ''], ['rogue-battler', 34, 'a'],
  ['ember-wyrm', 104, 'b'], ['void-ranger', 26, ''], ['crawler-bug', 36, 'a', ['scout-drone', 34]], ['security-bot', 34, 'a'], ['warden-mech', 66, 'b'],
];
// Step 1: a few things to pick from, the first one picked. [id, nudge right, nudge down] so each sits in the middle of its square.
const PICK = [['knight', 4, -14], ['slime', 4, -8], ['campfire', 0, -8], ['treasure-chest', 0, 0], ['bat', 0, 0], ['coin', 0, 0]];
// Step 2: the Hero's controls offered here (the Hero's own page has them all).
// It starts as the Hero looks everywhere else (his own settings, helmet on), so the picture here and on his page agree.
// The hair styles offered are the three that show under the helmet (spiky and bald hide under it).
const TRY = { hair: 'hairStyle', hairs: ['short', 'long', 'ponytail'], outfit: 'outfit', height: 'height', start: {} };
const TRY_OUTFITS = ['#3f6fd1', '#c9423a', '#4f9d57', '#e6c545', '#7a4fc4'];
const KIT_LOOKS = ['original', 'sunset', 'frost', 'night', 'candy', 'handheld'];
const FEATURED = ['ember-wyrm', 'wizard', 'moss-golem', 'void-ranger', 'hive-mother', 'campfire', 'cottage', 'treasure-chest', 'fx-fire-spell', 'warp-pad', 'bg-castle', 'tiles-castle'];
const SOUNDS = ['sword-slash', 'coin-pickup', 'wyrm-roar', 'thornwood-overworld', 'hearthvale-village', 'derelict-boss'];

// A small scene for each complete kit, laid out in art pixels (320 x 180) and made only from that kit's sprites.
// actors: [id, x, y, { clip, flip }] where x, y is where the sprite's feet (its pivot) stand.
const SCENES = {
  'kit-platformer-fantasy': {
    bg: 'bg-forest', ground: [{ sprite: 'tiles-forest', clip: 'grass-top', top: 150, height: 32 }],
    actors: [['knight', 58, 152, { clip: 'run' }], ['coin', 108, 124], ['coin', 128, 114], ['slime', 160, 152, { flip: true }], ['treasure-chest', 204, 152], ['bat', 226, 70, { flip: true }], ['moss-golem', 268, 153, { flip: true }]],
  },
  'kit-rpg-fantasy': {
    bg: 'bg-battle-field',
    actors: [['wizard', 62, 150, { clip: 'cast' }], ['rogue-battler', 34, 164, { clip: 'idle' }], ['knight', 104, 162, { clip: 'idle' }], ['road-bandit', 180, 158, { flip: true, clip: 'idle' }], ['ember-wyrm', 262, 166, { flip: true }]],
  },
  'kit-roguelite-scifi': {
    ground: [{ sprite: 'tiles-station-floor', clip: 'floor-fill', top: 0, height: 180 }, { sprite: 'tiles-station-walls', clip: 'wall-fill', top: 0, height: 20 }, { sprite: 'tiles-station-walls', clip: 'wall-bottom', top: 20, height: 32 }],
    actors: [['blast-door', 160, 50], ['wall-terminal', 64, 50], ['fuel-barrel', 284, 78], ['supply-crate', 256, 84], ['void-ranger', 84, 118, { clip: 'shoot_side' }], ['shield-trooper', 48, 150, { clip: 'idle_side' }], ['credit-chip', 132, 150], ['crawler-bug', 186, 112, { clip: 'walk_side', flip: true }], ['spitter-bug', 232, 156, { flip: true }], ['scout-drone', 228, 92], ['security-bot', 286, 134, { flip: true }]],
  },
};

const NS = 'http://www.w3.org/2000/svg';
function icon(d, { fill = false } = {}) {
  const n = document.createElementNS(NS, 'svg');
  n.setAttribute('viewBox', '0 0 16 16'); n.setAttribute('width', '16'); n.setAttribute('height', '16'); n.setAttribute('aria-hidden', 'true');
  if (fill) n.setAttribute('fill', 'currentColor');
  else { n.setAttribute('fill', 'none'); n.setAttribute('stroke', 'currentColor'); n.setAttribute('stroke-width', '1.5'); n.setAttribute('stroke-linecap', 'round'); n.setAttribute('stroke-linejoin', 'round'); }
  const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); n.append(p);
  return n;
}
const ICON = {
  search: () => icon('M11.5 7a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM10.5 10.5 14 14'),
  play: () => icon('M5 3.2v9.6L13 8z', { fill: true }),
  stop: () => icon('M4.5 4.5h7v7h-7z', { fill: true }),
  sound: () => icon('M2.5 6.2v3.6h2.3L8 12.5v-9L4.8 6.2H2.5ZM10.6 5.8a3 3 0 0 1 0 4.4M12.4 4a5.5 5.5 0 0 1 0 8'),
  note: () => icon('M6 12V3.5l6-1.5v8.5M6 12a1.8 1.8 0 1 1-3.6 0A1.8 1.8 0 0 1 6 12Zm6-1.5a1.8 1.8 0 1 1-3.6 0 1.8 1.8 0 0 1 3.6 0Z'),
  height: () => icon('M8 2v12M5.2 4.8 8 2l2.8 2.8M5.2 11.2 8 14l2.8-2.8'),
  colour: () => icon('M8 2a6 6 0 1 0 0 12c1 0 1.4-.7 1.1-1.4-.3-.9.3-1.6 1.2-1.6H12a2.3 2.3 0 0 0 2-2.4A6.3 6.3 0 0 0 8 2ZM5 7.2v.01M7.2 4.8v.01M10.4 5.4v.01'),
  weapon: () => icon('M13.5 2.5 6.8 9.2M13.5 2.5H11M13.5 2.5V5M4.6 8.4l3 3M5.8 10.2 2.5 13.5'),
};

// The first screen's Hero: big, with three of his real controls beside him. Until the visitor touches them, a pointer
// turns them by itself (taller, shorter; another outfit; another weapon), so the first thing seen is a sprite changing.
// With "reduce motion" nothing moves by itself. demo: [control key, its icon, the tool's name, the values the pointer tries]
const DEMO = [
  ['height', 'height', 'How tall', [0.92, 0.12, 0.5]],
  ['outfit', 'colour', 'Clothes colour', ['#c9423a', '#4f9d57', '#7a4fc4', '#3f6fd1']],
  ['weapon', 'weapon', 'Weapon', ['axe', 'spear', 'sword']],
];
function heroDemo(live, hero) {
  const mine = live.sprite(hero, { clip: 'idle', scale: 0 });
  mine.node.classList.add('demo-hero');
  // drawn big, with its feet (its pivot) standing near the bottom of the stage, whatever the frame around it
  for (const [k, v] of [['--fw', hero.tech.frame[0]], ['--fh', hero.tech.frame[1]], ['--px', hero.tech.pivot[0]], ['--py', hero.tech.pivot[1]]]) mine.node.style.setProperty(k, v);
  let tool = DEMO[0][0], auto = !reduceMotion.matches, alive = true, inView = false;
  const box = el('div', { class: 'demo-box' });
  const tools = el('div', { class: 'demo-tools', role: 'toolbar', 'aria-label': `Change the ${hero.name}` });
  const cursor = el('span', { class: 'demo-cursor', 'aria-hidden': 'true', hidden: true });
  cursor.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M5 3l13 8.2-6 1.2-3.2 5.6z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const carry = el('a', { class: 'demo-carry', href: spriteHref(HERO) }, 'Open it with these changes', el('span', { 'aria-hidden': 'true' }, ' →'));
  const node = el('div', { class: 'hero-demo' },
    el('div', { class: 'demo-glow', 'aria-hidden': 'true' }),
    el('div', { class: 'demo-stage' }, mine.node),
    el('div', { class: 'demo-panel' }, tools, box),
    carry, cursor);
  const sync = () => { carry.href = spriteHref(HERO, mine.changed()); for (const b of box.querySelectorAll('[data-v]')) b.setAttribute('aria-checked', String(String(mine.params[tool]) === b.dataset.v)); const r = box.querySelector('input'); if (r) { r.value = String(mine.params[tool]); r.style.setProperty('--p', `${((mine.params[tool] - r.min) / (r.max - r.min)) * 100}%`); } };
  const set = (k, v) => { mine.set({ [k]: v }); sync(); };
  function control(key) {
    const d = mine.def.params[key];
    const label = DEMO.find((x) => x[0] === key)[2];
    if (d.kind === 'range' || d.min != null) {
      const r = el('input', { type: 'range', min: String(d.min), max: String(d.max), step: String(d.step ?? 0.01), 'aria-label': label });
      r.addEventListener('input', () => set(key, Number(r.value)));
      return el('div', { class: 'demo-ctl is-range' }, el('span', { 'aria-hidden': 'true' }, d.lo || 'Low'), r, el('span', { 'aria-hidden': 'true' }, d.hi || 'High'));
    }
    if (d.swatches) return el('div', { class: 'demo-ctl swatches', role: 'radiogroup', 'aria-label': label },
      DEMO.find((x) => x[0] === key)[3].filter((c) => d.swatches.includes(c)).map((c) => el('button', { type: 'button', class: 'swatch', role: 'radio', 'data-v': c, style: `--c:${c}`, 'aria-label': colourWord(c), title: colourWord(c), onclick: () => set(key, c) })));
    return el('div', { class: 'demo-ctl chips', role: 'radiogroup', 'aria-label': label },
      (d.options ?? []).filter((o) => o.value !== 'none').map((o) => el('button', { type: 'button', class: 'chip', role: 'radio', 'data-v': o.value, onclick: () => set(key, o.value) }, o.label)));
  }
  function choose(key) {
    tool = key;
    for (const b of tools.children) b.setAttribute('aria-pressed', String(b.dataset.tool === key));
    box.replaceChildren(control(key));
    sync();
  }
  // the visitor takes over: the pointer goes away for good
  const takeOver = () => { if (!auto) return; auto = false; cursor.hidden = true; };
  node.addEventListener('pointerdown', takeOver, true);
  node.addEventListener('keydown', takeOver, true);
  const still = () => { if (reduceMotion.matches) takeOver(); };
  reduceMotion.addEventListener('change', still);
  const seen = new IntersectionObserver(([e]) => { inView = e.isIntersecting; });
  seen.observe(node);

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const going = () => alive && auto;
  const until = async () => { while (alive && auto && (!inView || document.hidden)) await wait(400); return going(); };
  /** Move the pointer over an element (or a point across it, 0..1), then wait for it to get there. */
  async function point(target, fx = 0.5, ms = 650) {
    const a = node.getBoundingClientRect(), b = target.getBoundingClientRect();
    cursor.style.transitionDuration = `${ms}ms`;
    cursor.style.transform = `translate(${b.left - a.left + b.width * fx - 4}px, ${b.top - a.top + b.height / 2 - 4}px)`;
    await wait(ms + 60);
  }
  const press = async () => { cursor.classList.add('is-down'); await wait(140); cursor.classList.remove('is-down'); };
  async function run() {
    await mine.ready;
    if (!alive || !mine.def) return;
    tools.replaceChildren(...DEMO.filter(([k]) => mine.def.params[k]).map(([k, ic, label]) => el('button', { type: 'button', class: 'demo-tool', 'data-tool': k, 'aria-label': label, title: label, onclick: () => choose(k) }, ICON[ic]())));
    choose(DEMO[0][0]);
    if (!auto) return;
    await wait(900);
    cursor.hidden = false;
    cursor.style.transitionDuration = '0ms';
    cursor.style.transform = `translate(${Math.round(node.clientWidth * 0.8)}px, ${Math.round(node.clientHeight * 0.5)}px)`;
    while (await until()) {
      for (const [key, , , tries] of DEMO) {
        if (!(await until()) || !mine.def.params[key]) continue;
        await point(tools.querySelector(`[data-tool="${key}"]`));
        if (!going()) return; await press(); choose(key); await wait(250);
        const d = mine.def.params[key];
        if (box.querySelector('input')) {
          const r = box.querySelector('input'), span = d.max - d.min;
          await point(r, (mine.params[key] - d.min) / span, 450); await press();
          for (const to of tries) {
            const from = mine.params[key], steps = 22;
            for (let i = 1; i <= steps && going(); i++) {
              const v = from + (to - from) * (i / steps);
              set(key, Number(v.toFixed(3)));
              await point(r, (v - d.min) / span, 45);
            }
            if (!going()) return;
            await wait(500);
          }
        } else for (const v of tries) {
          const b = box.querySelector(`[data-v="${CSS.escape(v)}"]`);
          if (!b) continue;
          await point(b, 0.5, 500); if (!going()) return;
          await press(); set(key, v); await wait(900);
        }
        await wait(400);
      }
    }
  }
  run().catch((e) => console.warn('Loadout: the Hero demo stopped.', e));
  return { node, stop() { alive = false; seen.disconnect(); reduceMotion.removeEventListener('change', still); } };
}

/** Where a cropped tile (.hv) centres a sprite: over its feet, a little under a third of the frame up. In art pixels. */
function centred(node, row) {
  const [, h] = row.tech.frame, [px, py] = row.tech.pivot;
  node.style.setProperty('--cx', px);
  node.style.setProperty('--cy', Math.round(py - h * 0.3));
  return node;
}
const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);
const seconds = (s) => (s < 10 ? `${Number(s.toFixed(2))} s` : `${Math.round(s)} s`);
const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
const word = (n) => WORDS[n] ?? String(n);
/** The address of a sprite's page with these settings applied (the same fields "Copy link" writes). */
const spriteHref = (id, params = {}) => { const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString(); return `#/sprite/${id}${q ? `?${q}` : ''}`; };

export function landingPage(app) {
  document.title = 'Loadout: game art, sound and music you can change';
  const catalog = currentCatalog();
  const byId = new Map(catalog.assets.map((a) => [a.id, a]));
  const spriteRow = (id) => { const a = byId.get(id); return a && a.kind === 'sprite' ? a : null; };
  const count = (kind) => catalog.assets.filter((a) => a.kind === kind).length;
  const n = { sprite: count('sprite'), sound: count('sound'), music: count('music') };
  const kits = Object.keys(SCENES).map((id) => catalog.bundles.find((x) => x.id === id)).filter(Boolean);
  const looks = THEME_PRESETS.filter((p) => p.id !== 'original').length;
  const hero = spriteRow(HERO);
  const live = liveGroup();
  const stops = [() => live.stop()];
  let alive = true;

  // ---------------------------------------------------------------- the first screen
  const input = el('input', { type: 'search', name: 'q', 'aria-label': 'Search the library', maxlength: String(Q_MAX), autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search',
    placeholder: `Search ${catalog.assets.length} things, like slime, door or coin sound` });
  const search = el('form', { class: 'search', role: 'search', onsubmit: (e) => { e.preventDefault(); location.hash = hashFromState(stateFromQuery({ q: input.value.trim() })); } }, ICON.search(), input);
  const actions = () => el('div', { class: 'hero-actions' },
    el('a', { class: 'btn btn-lg btn-primary', href: '#/browse' }, 'Browse everything'),
    hero ? el('a', { class: 'btn btn-lg btn-secondary', href: `#/sprite/${HERO}` }, `Change the ${hero.name}`) : null);
  const demo = hero ? heroDemo(live, hero) : null;
  if (demo) stops.push(() => demo.stop());
  const engine = (name) => el('b', {}, name);
  const first = el('section', { class: `hero${demo ? ' has-demo' : ''}` },
    el('div', { class: 'hero-text' },
      el('h1', {}, 'Game art, sound and music you can ', el('span', { class: 'hero-word' }, 'change'), '.'),
      el('p', { class: 'lede' }, 'Every sprite, sound and tune here is ', el('b', {}, 'made by code'), ', not a frozen picture. Turn its knobs, keep it in your bag, try it in the playground, then download it ready for your game. ',
        el('b', {}, 'Free to try and to download.')),
      actions(),
      el('p', { class: 'hero-works' }, el('span', {}, 'Ready for'), engine('Unity'), engine('Godot'), engine('GameMaker'), engine('Phaser'), el('span', {}, 'and any engine that reads PNG and WAV')),
      search,
      // the code and the assets are MIT licensed (LICENSE); the source is on GitHub
      el('p', { class: 'terms' }, el('b', {}, 'Open source'), ' under the MIT licence: use it in any game, free or paid. ', sourceLink('See the code on GitHub'))),
    demo?.node);

  // ---------------------------------------------------------------- the line-up
  const standing = [];
  const stand = (row, lift = null) => {
    const s = live.sprite(row, { scale: 2 });
    const [, h] = row.tech.frame, [px, py] = row.tech.pivot;
    s.node.style.setProperty('--px', px);
    s.node.style.setProperty('--pb', lift == null ? h - py : -lift);
    standing.push(s);
    return s.node;
  };
  const row = el('div', { class: 'lineup-row' }, LINEUP.map(([id, fw, out, above]) => {
    const a = spriteRow(id), b = above ? spriteRow(above[0]) : null;
    return a ? el('span', { class: `stand${out ? ` out-${out}` : ''}`, style: `--fw:${fw}` }, stand(a), b ? stand(b, above[1]) : null) : null;
  }));
  const back = el('button', { type: 'button', class: 'btn btn-sm btn-secondary', hidden: true, onclick: () => { for (const s of standing) s.reset(); back.hidden = true; surprise.focus(); } }, 'Back to the originals');
  const surprise = makeMagic(el('button', { type: 'button', class: 'btn btn-sm btn-secondary', onclick: () => { for (const s of standing) s.surprise(); back.hidden = false; } }, 'Surprise me'));
  const lineup = el('section', { class: 'lineup tile', 'aria-label': 'Sprites from the three kits, drawn live' }, row,
    el('div', { class: 'lineup-cap' },
      el('span', {}, 'These are not fixed pictures. Each one is being drawn right now, so each one can change.'),
      el('span', { class: 'btns' }, back, surprise)));

  // ---------------------------------------------------------------- three steps
  const pick = el('div', { class: 'pick' }, PICK.map(([id, dx, dy], i) => {
    const a = spriteRow(id);
    if (!a || !a.thumb) return null;
    const [w, h] = a.tech.frame;
    return el('a', { class: i === 0 ? 'on' : null, href: `#/sprite/${a.id}`, title: a.name }, el('i', {}, el('img', { class: 'px', src: a.thumb, width: w * 2, height: h * 2, alt: a.name, decoding: 'async', draggable: 'false', style: `--dx:${dx}px;--dy:${dy}px` })));
  }));

  let tryNode = null, sheetNode = null, carryOn = null;
  if (hero) {
    const mine = live.sprite(hero, { clip: 'walk', scale: 3, params: TRY.start });
    const cells = Array.from({ length: 8 }, (_, f) => live.sprite(hero, { clip: 'walk', scale: 1, paused: true, frame: f, params: TRY.start }));
    const hair = el('div', { class: 'chips', id: 'try-hair', role: 'radiogroup', 'aria-labelledby': 'l-hair' });
    const outfit = el('div', { class: 'swatches', id: 'try-outfit', role: 'radiogroup', 'aria-labelledby': 'l-outfit' });
    const height = el('input', { id: 'try-height', type: 'range', min: '0', max: '1', step: '0.01', value: '0.5' });
    carryOn = el('a', { class: 'link', href: spriteHref(HERO, TRY.start) }, `Carry on with this ${hero.name}`);
    // a group of choices is one Tab stop: the chosen one (or the first) takes focus, the arrow keys move the choice
    const mark = (group, value) => {
      const on = [...group.children].find((b) => b.dataset.v === value) ?? null;
      for (const b of group.children) { b.setAttribute('aria-checked', String(b === on)); b.tabIndex = b === (on ?? group.firstElementChild) ? 0 : -1; }
    };
    const arrows = (group, key) => group.addEventListener('keydown', (e) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      const all = [...group.children], at = all.indexOf(e.target);
      if (!step || at < 0) return;
      e.preventDefault();
      const next = all[(at + step + all.length) % all.length];
      set({ [key]: next.dataset.v });
      next.focus();
    });
    arrows(hair, TRY.hair); arrows(outfit, TRY.outfit);
    const paint = () => {
      mark(hair, mine.params[TRY.hair]);
      mark(outfit, mine.params[TRY.outfit]);
      const d = mine.def.params[TRY.height], v = mine.params[TRY.height];
      height.value = String(v);
      height.style.setProperty('--p', `${((v - d.min) / (d.max - d.min)) * 100}%`);
      height.setAttribute('aria-valuetext', v < 0.34 ? d.lo || 'Low' : v > 0.66 ? d.hi || 'High' : 'In between');
      for (const c of cells) c.setParams(mine.params);          // the sheet in step 3 follows
      carryOn.href = spriteHref(HERO, mine.changed());
    };
    const set = (part) => { mine.set(part); paint(); };
    mine.ready.then((def) => {
      if (!def || !alive) return;
      const h = def.params[TRY.hair], o = def.params[TRY.outfit], t = def.params[TRY.height];
      hair.replaceChildren(...(h?.options ?? []).filter((x) => TRY.hairs.includes(x.value)).map((x) => el('button', { type: 'button', class: 'chip', role: 'radio', 'data-v': x.value, onclick: () => set({ [TRY.hair]: x.value }) }, x.label)));
      outfit.replaceChildren(...TRY_OUTFITS.filter((c) => (o?.swatches ?? []).includes(c)).map((c) => el('button', { type: 'button', class: 'swatch', role: 'radio', 'data-v': c, style: `--c:${c}`, 'aria-label': colourWord(c), title: colourWord(c), onclick: () => set({ [TRY.outfit]: c }) })));
      if (t) { height.min = String(t.min); height.max = String(t.max); height.step = String(t.step); }
      Promise.all(cells.map((c) => c.ready)).then(() => { if (alive) paint(); });
    });
    height.addEventListener('input', () => set({ [TRY.height]: Number(height.value) }));
    tryNode = el('div', { class: 'try' },
      el('span', { class: 'hv' }, centred(mine.node, hero)),
      el('div', { class: 'try-controls' },
        el('div', {}, el('span', { class: 'field-label', id: 'l-hair' }, 'Hair'), hair),
        el('div', {}, el('span', { class: 'field-label', id: 'l-outfit' }, 'Outfit'), outfit),
        el('div', {}, el('label', { class: 'field-label', for: 'try-height' }, 'Height'), height)));
    sheetNode = el('div', { class: 'sheet' },
      el('div', { class: 'sheet-frames', role: 'img', 'aria-label': `The ${hero.name}'s walk as a sprite sheet` }, cells.map((c) => el('span', { class: 'hv' }, centred(c.node, hero)))),
      el('div', { class: 'files' }, [`${HERO}.png`, `${HERO}.json`, 'how-to-use.txt'].map((f) => el('span', {}, f))));
  }
  const step = (i, title, tile, ...text) => el('li', { class: 'step' },
    el('div', { class: 'step-tile tile' }, tile),
    el('h3', {}, el('span', { class: 'n', 'aria-hidden': 'true' }, String(i)), title),
    el('p', {}, text));
  const steps = el('section', { class: 'section', id: 'how' },
    el('div', { class: 'section-head' }, el('div', {}, el('h2', {}, 'From the library to your game in three steps'))),
    el('ol', { class: 'steps' },
      step(1, 'Pick one', pick, `${n.sprite} sprites, ${n.sound} sounds and ${n.music} music ${plural(n.music, 'track')}. Search in everyday words, or take a whole kit at once.`),
      step(2, 'Change it', tryNode, 'These controls are real: try them. ', hero ? [`The ${hero.name}'s own page has ${hero.tech.controls} controls, and every change there is kept in your bag by itself. `, carryOn] : null),
      step(3, 'Download it', sheetNode, 'One zip: sprite sheets as PNG with a small data file, and sounds as WAV. Choose the pixel size: 1x, 2x or 4x.')));

  // ---------------------------------------------------------------- the kits, each a small living scene
  let look = 'original';
  const themeOf = (id) => (id === 'original' ? null : THEME_PRESETS.find((p) => p.id === id)?.theme ?? null);
  const scenes = [];           // { node, spec, parts: live sprites, grounds: [{ node, def, clip }], built }
  async function buildScene(sc) {
    sc.built = true;
    const { spec, node } = sc, theme = themeOf(look);
    const bg = spec.bg ? spriteRow(spec.bg) : null;
    if (bg) { const s = live.sprite(bg, { layers: true, scale: 0, theme }); s.node.classList.add('scene-bg'); sc.parts.push(s); node.append(s.node); }
    for (const g of spec.ground ?? []) {
      if (!spriteRow(g.sprite)) continue;
      const d = el('div', { class: 'scene-ground', style: `--top:${g.top};--h:${g.height};--tw:${spriteRow(g.sprite).tech.frame[0]}` });
      node.append(d);
      const ground = { node: d, def: null, clip: g.clip };
      sc.grounds.push(ground);
      loadSprite(g.sprite).then((def) => { if (!alive) return; ground.def = def; d.style.backgroundImage = `url(${live.still(def, g.clip, themeOf(look))})`; }).catch((e) => console.warn(`Loadout: the ground "${g.sprite}" could not be drawn.`, e));
    }
    for (const [id, x, y, o = {}] of spec.actors) {
      const a = spriteRow(id);
      if (!a) continue;
      const [w] = a.tech.frame, [px, py] = a.tech.pivot;
      const s = live.sprite(a, { clip: o.clip, flip: o.flip, scale: 0, theme });
      s.node.classList.add('actor');
      for (const [k, v] of [['--x', x - (o.flip ? w - px : px)], ['--y', y - py], ['--w', w]]) s.node.style.setProperty(k, v);
      sc.parts.push(s);
      node.append(s.node);
    }
  }
  const near = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { near.unobserve(e.target); const sc = scenes.find((x) => x.node === e.target); if (sc && !sc.built) buildScene(sc); }
  }, { rootMargin: '700px 0px' });
  stops.push(() => near.disconnect());
  const kitLinks = [];
  const kitHref = (id) => `#/bundle/${id}${look === 'original' ? '' : `?look=${look}`}`;
  const kitRows = kits.map((b) => {
    const node = el('div', { class: 'scene', role: 'img', 'aria-label': `A scene made only from ${b.name}`, 'data-kit': b.id });
    scenes.push({ node, spec: SCENES[b.id], parts: [], grounds: [], built: false });
    near.observe(node);
    const link = el('a', { class: 'btn btn-secondary', href: kitHref(b.id), 'data-kit': b.id }, 'See the kit');
    kitLinks.push(link);
    // a kit's line reads "Everything for a <kind of game>: <what is in it>": the kind goes above the name, the rest under it
    const said = /^Everything for an? ([^:]+): (.+)$/s.exec(b.blurb ?? '');
    const up = (t) => t[0].toUpperCase() + t.slice(1);
    const kind = said ? up(said[1]) : b.gameType ? (b.gameType === 'any' ? 'For any game' : labelFor('gameType', b.gameType)) : null;
    const blurb = said ? up(said[2]) : b.blurb;
    const fact = (num, one, many) => el('span', {}, el('b', {}, String(num)), plural(num, one, many));
    return el('article', { class: 'kit' },
      el('div', { class: 'kit-scene' }, node),
      el('div', { class: 'kit-body' },
        kind ? el('p', { class: 'kit-kind' }, kind) : null,
        el('h3', {}, b.name.replace(/ kit$/, '')),
        blurb ? el('p', { class: 'kit-blurb' }, blurb) : null,
        el('div', { class: 'facts' }, fact(b.sprites.length, 'sprite'), fact(b.sounds.length, 'sound'), fact(b.music.length, 'music track')),
        el('div', { class: 'kit-actions' }, link)));
  });
  const lookChips = el('div', { class: 'chips', id: 'kit-looks', role: 'radiogroup', 'aria-label': `Look for ${kits.length === 1 ? 'the kit' : `all ${word(kits.length).toLowerCase()} kits`}` },
    KIT_LOOKS.map((id) => THEME_PRESETS.find((p) => p.id === id)).filter(Boolean).map((p) => el('button', { type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(p.id === look), 'data-look': p.id, title: p.blurb, onclick: () => setLook(p.id) }, p.name)));
  function setLook(id) {
    look = id;
    for (const b of lookChips.children) b.setAttribute('aria-checked', String(b.dataset.look === id));
    const theme = themeOf(id);
    for (const sc of scenes) {
      sc.node.dataset.look = id;
      for (const s of sc.parts) s.setTheme(theme);
      for (const g of sc.grounds) if (g.def) g.node.style.backgroundImage = `url(${live.still(g.def, g.clip, theme)})`;
    }
    for (const a of kitLinks) a.href = kitHref(a.dataset.kit);
  }
  const kitSection = kits.length ? el('section', { class: 'section', id: 'kits' },
    el('div', { class: 'section-head' },
      el('div', {},
        el('h2', {}, `${word(kits.length)} complete ${plural(kits.length, 'kit')}`),
        el('p', {}, 'Characters, enemies, ground, objects, menus, sounds and music for one kind of game, made to belong together. Give a whole kit a new look in one go.')),
      lookChips),
    el('div', { class: 'kits' }, kitRows)) : null;

  // ---------------------------------------------------------------- the Hero's ready-made versions
  let versionSection = null;
  if (hero) {
    const grid = el('div', { class: 'versions-grid', id: 'versions' });
    const title = el('h2', { class: 'h2' }, `One ${hero.name}, ready-made versions`);
    versionSection = el('section', { class: 'section' }, el('div', { class: 'split' },
      el('div', { class: 'split-text' }, title,
        el('p', {}, `Start from one that is close, then fine-tune it: the ${hero.name} has ${hero.tech.controls} controls and ${hero.tech.clips.length} animations.`),
        el('a', { class: 'btn btn-secondary', href: `#/sprite/${HERO}` }, `Change the ${hero.name}`)),
      grid));
    loadSprite(HERO).then((def) => versionsFor('sprite', def, 12)).then((list) => {
      if (!alive) return;
      title.textContent = `One ${hero.name}, ${word(list.length).toLowerCase()} ready‑made versions`;
      grid.replaceChildren(...list.map((v) => el('a', { class: 'version', href: spriteHref(HERO, v.params ?? {}) },
        el('span', { class: 'hv tile' }, centred(live.sprite(hero, { clip: 'idle', scale: 2, params: v.params ?? {} }).node, hero)),
        el('span', { class: 'name' }, v.name))));
    }).catch((e) => console.warn('Loadout: the versions could not be shown.', e));
  }

  // ---------------------------------------------------------------- featured
  const cards = FEATURED.map((id) => byId.get(id)).filter(Boolean).map((a) => cardFor(a));
  stops.push(() => { for (const c of cards) c.stop(); });
  const featured = cards.length ? el('section', { class: 'section' },
    el('div', { class: 'section-head' },
      el('div', {}, el('h2', {}, 'A few favourites')),
      el('a', { class: 'link', href: '#/browse?kind=sprite' }, `See all ${n.sprite} sprites`)),
    el('div', { class: 'grid-6', id: 'favourites' }, cards.map((c) => c.node))) : null;

  // ---------------------------------------------------------------- sounds and music, with play
  let sounding = null;          // the row that is playing: { quiet() }
  const soundRow = (a) => {
    const isMusic = a.kind === 'music', styles = a.tech?.styles?.length ?? 0;
    const btn = el('button', { type: 'button', class: 'row-play', 'aria-label': `Play ${a.name}` }, ICON.play());
    const line = el('span', { class: 'tile-progress', 'aria-hidden': 'true' });
    let voice = null, busy = false, turn = 0;
    const show = () => {
      btn.replaceChildren(voice ? ICON.stop() : ICON.play());
      btn.setAttribute('aria-label', `${voice ? 'Stop' : 'Play'} ${a.name}`);
      li.classList.toggle('playing', !!voice);
      if (!voice) { line.classList.remove('run'); }
    };
    const me = { quiet() { turn++; if (voice) voice.stop(); voice = null; if (sounding === me) sounding = null; show(); } };
    btn.addEventListener('click', async () => {
      if (voice) { me.quiet(); return; }
      if (busy) return;
      const mine = ++turn;
      busy = true;
      try {
        const patch = soundById[a.id] ?? await loadSound(a.id);              // just this one sound
        if (sounding && sounding !== me) sounding.quiet();
        sounding = me;
        const v = isMusic ? await playLive(patch, soundParams(patch))
          : playRendered(await renderAsync(patch, soundParams(patch)), { force: true, onended: () => { voice = null; show(); } });
        if (mine === turn && alive) {
          voice = v;
          if (!isMusic && v) { line.style.setProperty('--ms', `${Math.round(v.duration * 1000)}ms`); line.classList.remove('run'); void line.offsetWidth; line.classList.add('run'); }
        } else if (v) v.stop();                                              // stopped, or the page moved on, while it loaded
        btn.removeAttribute('title');
      } catch (e) {
        console.error(`${a.kind} ${a.id}:`, e);
        btn.setAttribute('title', 'This could not be played. Reload the page and try again.');
      }
      busy = false; show();
    });
    stops.push(() => me.quiet());
    const li = el('li', { class: 'srow', 'data-id': a.id },
      btn,
      el('span', { class: 'pic tile' }, isMusic ? ICON.note() : ICON.sound()),
      el('span', { class: 'srow-text' },
        el('a', { class: 'name', href: `#/${isMusic ? 'music' : 'sound'}/${a.id}` }, a.name),
        el('span', { class: 'what' }, `${labelFor('type', a.type)}${styles ? ` in ${styles} ${plural(styles, 'style')}` : ''}`)),
      el('span', { class: 'num quiet' }, a.tech?.seconds ? seconds(a.tech.seconds) : ''),
      line);
    return li;
  };
  const soundRows = SOUNDS.map((id) => byId.get(id)).filter((a) => a && a.kind !== 'sprite').map(soundRow);
  const soundSection = soundRows.length ? el('section', { class: 'section' }, el('div', { class: 'split' },
    el('div', { class: 'split-text' },
      el('h2', { class: 'h2' }, 'Sounds and music are part of it'),
      el('p', {}, `${n.sound} sound effects and ${n.music} music ${plural(n.music, 'track')}, made the same way as the art. Pick a style, change the pitch or the speed, choose the instrument that plays the tune.`),
      el('a', { class: 'btn btn-secondary', href: '#/browse?kind=sound' }, 'Hear the sounds')),
    el('ul', { class: 'srows', id: 'sounds' }, soundRows))) : null;

  // ---------------------------------------------------------------- where it works, numbers, the way on
  const works = el('section', { class: 'section' }, el('div', { class: 'works' },
    el('h2', { class: 'h2' }, 'Where it works'),
    el('dl', {},
      el('div', {}, el('dt', {}, 'Unity'), el('dd', {}, 'Drop the sprite sheets and sounds into your project. A Unity package is coming later.')),
      el('div', {}, el('dt', {}, 'Any other engine'), el('dd', {}, 'If it reads PNG and WAV, it works.')),
      el('div', {}, el('dt', {}, 'What you download'), el('dd', {}, 'One zip: sprite sheets as PNG with a small data file, sounds and music as WAV, and a short note on how to use them.')))));
  const number = (v, label) => el('div', {}, el('b', {}, String(v)), el('span', {}, label));
  const numbers = el('section', { class: 'section', 'aria-label': 'Loadout in numbers' }, el('div', { class: 'numbers' },
    number(n.sprite, plural(n.sprite, 'sprite')), number(n.sound, plural(n.sound, 'sound')), number(n.music, `music ${plural(n.music, 'track')}`),
    kits.length ? number(kits.length, `complete ${plural(kits.length, 'kit')}`) : null, number(looks, 'looks for a whole kit')));
  const closing = el('section', { class: 'closing' }, el('h2', { class: 'h2' }, 'Find the first thing for your game.'), actions());

  app.replaceChildren(header('home'),
    el('main', { class: 'v2 landing' }, first, lineup, steps, kitSection, versionSection, featured, soundSection, works, numbers, closing),
    footer());
  return () => { alive = false; for (const stop of stops) stop(); };
}
