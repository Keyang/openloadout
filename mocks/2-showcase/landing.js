// Landing page of the "Showcase" mock-up: the living scene, the six Heroes, the kit shelves, the sound demo.
import { loadCatalog, looks, thumb } from '../shared/kit.js';
import { icon, bars, seconds, KITS, lazyPictures } from './site.js';

const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, html = '') => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('aria-')) e.setAttribute(k, String(v));
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  e.innerHTML = html;
  return e;
};

/* =====================================================================
   The living scene. Positions are in art pixels: x from the middle of the screen, y from the top of a 180-tall picture.
   One whole number (--s) scales everything, so the pixels stay square and sharp.
   ===================================================================== */
const WORLDS = {
  'kit-platformer-fantasy': {
    bg: 'bg-forest',
    tiles: { sprite: 'tiles-forest', rows: [{ y: 148, clips: ['grass-top'] }] },
    actors: [
      { id: 'campfire', x: -204, y: 152, clip: 'burn' },
      { id: 'wizard', x: -142, y: 152, seq: [['cast', 1.5], ['idle', 1.7]] },
      { id: 'knight', x: -82, y: 152, seq: [['attack', 0.9], ['idle', 1.1]] },
      { id: 'slime', x: -36, y: 152, face: 'l', seq: [['idle', 0.4], ['hurt', 0.5], ['hop', 1.1]] },
      { id: 'coin', x: 2, y: 112, clip: 'spin' },
      { id: 'coin', x: 20, y: 104, clip: 'spin' },
      { id: 'coin', x: 38, y: 112, clip: 'spin' },
      { id: 'bat', x: -20, y: 78, clip: 'fly', patrol: [-60, 60, 20] },
      { id: 'spear-goblin', x: 60, y: 152, clip: 'walk', patrol: [6, 66, 14], face: 'l' },
      { id: 'wolf', x: 100, y: 152, clip: 'run', patrol: [84, 150, 36] },
      { id: 'moss-golem', x: 206, y: 152, face: 'l', seq: [['idle', 2.4], ['roar', 1.6]] },
    ],
  },
  'kit-rpg-fantasy': {
    bg: 'bg-battle-field',
    actors: [
      { id: 'wizard', x: -182, y: 158, seq: [['idle', 2.2], ['cast', 1.5]] },
      { id: 'rogue-battler', x: -126, y: 167, seq: [['idle', 1.6], ['shoot', 1.0]] },
      { id: 'knight', x: -70, y: 160, seq: [['idle', 1.3], ['attack', 0.9], ['block', 0.8]] },
      { id: 'road-bandit', x: 4, y: 167, face: 'l', seq: [['idle', 1.7], ['attack', 1.0]] },
      { id: 'bone-soldier', x: 58, y: 158, face: 'l', seq: [['block', 0.8], ['idle', 1.2], ['attack', 1.0]] },
      { id: 'thicket-imp', x: 96, y: 96, face: 'l', clip: 'fly' },
      { id: 'ember-wyrm', x: 176, y: 166, face: 'l', seq: [['idle', 2.2], ['breath', 1.8], ['buffet', 1.4]] },
    ],
  },
  'kit-roguelite-scifi': {
    bg: 'bg-starfield',
    tiles: { sprite: 'tiles-station-floor', rows: [100, 132, 164].map((y) => ({ y, clips: ['floor-fill', 'floor-fill', 'floor-fill-b', 'floor-fill', 'floor-fill-c'] })) },
    actors: [
      { id: 'vendor-bot', x: -206, y: 138, clip: 'talk' },
      { id: 'shield-trooper', x: -140, y: 170, clip: 'walk_side', patrol: [-170, -110, 12] },
      { id: 'void-ranger', x: -64, y: 150, seq: [['shoot_side', 1.6], ['idle_side', 0.8]] },
      { id: 'swarm-mite', x: -10, y: 174, clip: 'walk', patrol: [-24, 30, 18], face: 'l' },
      { id: 'crawler-bug', x: 30, y: 152, clip: 'walk_side', patrol: [-6, 44, 10], face: 'l' },
      { id: 'scout-drone', x: 34, y: 96, face: 'l', seq: [['alert', 1.5], ['idle', 1.5]] },
      { id: 'spitter-bug', x: 92, y: 132, face: 'l', seq: [['shoot', 1.2], ['idle', 1.0]] },
      { id: 'security-bot', x: 130, y: 172, clip: 'walk_side', patrol: [110, 156, 10], face: 'l' },
      { id: 'warden-mech', x: 196, y: 162, face: 'l', seq: [['idle', 2.0], ['shoot', 1.5]] },
    ],
  },
};
const SHOWN_LOOKS = ['original', 'sunset', 'frost', 'night', 'candy', 'handheld', 'golden', 'spooky'];
const LOOK_DOT = { // two colours that stand for each look on its button
  original: ['#7fb2dd', '#4f9d57'], sunset: ['#f39a73', '#f6cf7f'], frost: ['#a9d8f2', '#eef7fc'], night: ['#27356b', '#8b9be0'],
  candy: ['#f6a9cf', '#a9e3d2'], handheld: ['#9bbc0f', '#306230'], golden: ['#f3c453', '#c47a34'], spooky: ['#7a52b3', '#2c1f47'],
};

const scene = $('scene'), world = $('world');
let live = [], kitId = KITS[0].id, lookId = 'original';

function fitScene() {
  const w = scene.clientWidth;
  scene.style.setProperty('--s', w >= 1900 ? 4 : w >= 860 ? 3 : 2);
  scene.style.setProperty('--cx', `${Math.round(w / 2)}px`);
}
addEventListener('resize', fitScene);
fitScene();

function buildWorld() {
  const def = WORLDS[kitId];
  world.replaceChildren();
  live = [];
  for (const k of [-1, 0, 1]) world.append(el('lo-sprite', { class: 'bg', sprite: def.bg, layers: true, look: lookId, style: `--k:${k}` }));
  if (def.tiles) {
    for (const row of def.tiles.rows) {
      for (let i = -11; i < 11; i++) {
        const clip = row.clips[((i * 7 + row.y) % row.clips.length + row.clips.length) % row.clips.length];
        world.append(el('lo-sprite', { class: 'tile', sprite: def.tiles.sprite, clip, paused: true, look: lookId, style: `--i:${i};--y:${row.y}` }));
      }
    }
  }
  for (const a of def.actors) {
    const node = el('lo-sprite', { class: 'actor', sprite: a.id, clip: a.clip ?? a.seq?.[0][0], look: lookId, flip: a.face === 'l', style: `--x:${a.x};--y:${a.y};z-index:${a.y}` });
    world.append(node);
    const actor = { ...a, node, i: 0, t: a.seq?.[0][1] ?? 0, dir: a.face === 'l' ? -1 : 1, px: 0, w: 0 };
    live.push(actor);
    node.ready.then(() => {
      const [w, h] = node.def.size, [px, py] = node.def.pivot ?? [w / 2, h];
      actor.w = w; actor.px = px;
      node.style.setProperty('--w', w);
      node.style.setProperty('--py', py);
      node.style.setProperty('--px', actor.dir < 0 ? w - px : px);
      node.classList.add('on');
    });
  }
  note();
}

let last = performance.now();
function step(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  for (const a of live) {
    if (a.patrol) {
      const [lo, hi, v] = a.patrol;
      a.x += a.dir * v * dt;
      if ((a.dir > 0 && a.x >= hi) || (a.dir < 0 && a.x <= lo)) {
        a.dir = -a.dir;
        a.node.toggleAttribute('flip', a.dir < 0);
        a.node.style.setProperty('--px', a.dir < 0 ? a.w - a.px : a.px);
      }
      a.node.style.setProperty('--x', Math.round(a.x));
    }
    if (a.seq) {
      a.t -= dt;
      if (a.t <= 0) { a.i = (a.i + 1) % a.seq.length; a.t = a.seq[a.i][1]; a.node.setAttribute('clip', a.seq[a.i][0]); }
    }
  }
  requestAnimationFrame(step);
}
if (!still) requestAnimationFrame(step);

function note() {
  const kit = KITS.find((k) => k.id === kitId);
  const n = new Set([...world.querySelectorAll('lo-sprite')].map((s) => s.getAttribute('sprite'))).size;
  const look = looks.find((l) => l.id === lookId);
  $('scene-note').textContent = lookId === 'original'
    ? `${kit.name}, as it was made. Pick a look to restyle all ${n} sprites at once.`
    : `${kit.name} in the ${look.name} look. All ${n} sprites restyled at once.`;
  $('look-name').textContent = look.name;
}
function setLook(id) {
  lookId = id;
  for (const s of world.querySelectorAll('lo-sprite')) s.setAttribute('look', id);
  for (const b of $('look-pick').children) b.setAttribute('aria-pressed', b.dataset.look === id);
  note();
}
function setKit(id) {
  kitId = id;
  for (const b of $('kit-pick').children) b.setAttribute('aria-pressed', b.dataset.kit === id);
  buildWorld();
}
for (const k of KITS) {
  const b = el('button', { type: 'button', 'data-kit': k.id, 'aria-pressed': k.id === kitId, title: k.kind }, k.name);
  b.onclick = () => setKit(k.id);
  $('kit-pick').append(b);
}
for (const id of SHOWN_LOOKS) {
  const look = looks.find((l) => l.id === id), [a, b] = LOOK_DOT[id];
  const btn = el('button', { type: 'button', class: 'look-dot', 'data-look': id, 'aria-pressed': id === lookId, 'aria-label': `${look.name} look`, title: `${look.name}: ${look.blurb}` }, `<i style="--a:${a};--b:${b}"></i>`);
  btn.onclick = () => setLook(id);
  $('look-pick').append(btn);
}
$('look-surprise').onclick = () => {
  const others = looks.filter((l) => l.id !== lookId && l.id !== 'original');
  setLook(others[Math.floor(Math.random() * others.length)].id);
};
buildWorld();

/* =====================================================================
   One Hero, six ways
   ===================================================================== */
const SIX = [
  { note: 'As it comes', params: {} },
  { note: 'Long hair, an axe, a torn cape', params: { hairStyle: 'long', hair: '#c9423a', headgear: 'none', weapon: 'axe', cape: 'tattered', outfit: '#4f9d57', trim: '#e6c545' } },
  { note: 'Tall, with a crown and a spear', params: { height: 0.9, build: 0.25, headgear: 'crown', hairStyle: 'ponytail', hair: '#e0b040', weapon: 'spear', outfit: '#7a4fc4', trim: '#f0ead8', metal: '#e6c545' } },
  { note: 'Small, with bare hands', params: { height: 0.1, head: 0.95, build: 0.6, hairStyle: 'spiky', hair: '#2b2233', headgear: 'none', weapon: 'none', cape: 'none', outfit: '#e08a2c', skin: '#9a6240', bounce: 0.9 } },
  { note: 'Stocky, with green skin', params: { height: 0.8, build: 1, hairStyle: 'bald', headgear: 'none', weapon: 'axe', weaponLength: 1.35, cape: 'none', outfit: '#3a3350', trim: '#c9423a', skin: '#9bd18a' } },
  { note: 'Gold armour, a long cape', params: { headgearSize: 1.4, weaponLength: 1.3, capeLength: 1.6, outfit: '#f0ead8', trim: '#3f6fd1', metal: '#e6c545', skin: '#6e4428' } },
];
const lineup = $('lineup');
for (const h of SIX) {
  lineup.append(el('li', {}, `<a href="remix.html" aria-label="Make your own Hero. This one: ${h.note}"><lo-sprite sprite="knight" clip="walk" params='${JSON.stringify(h.params)}'></lo-sprite></a><p>${h.note}</p>`));
}
function fitLineup() {
  const s = lineup.clientWidth >= 1150 ? 4 : lineup.clientWidth >= 640 ? 3 : 2;
  for (const s2 of lineup.querySelectorAll('lo-sprite')) s2.setAttribute('scale', s);
}
addEventListener('resize', fitLineup);
fitLineup();
$('lineup-surprise').onclick = async () => {
  const sprites = [...lineup.querySelectorAll('lo-sprite')];
  for (const s of sprites) { await s.ready; s.surprise(); }
  for (const p of lineup.querySelectorAll('p')) p.textContent = 'Made by Surprise me';
};

/* =====================================================================
   Kits as shelves, and the sound rows (real names, counts and lengths from the catalogue)
   ===================================================================== */
const KIND_WORD = { sfx: 'Sound effect', ambience: 'Background sound', jingle: 'Jingle', music: 'Music' };
const { assets, bundles } = await loadCatalog();
const byId = new Map(assets.map((a) => [a.id, a]));

for (const k of KITS) {
  const b = bundles.find((x) => x.id === k.id);
  const row = k.faces.filter((id) => byId.has(id)).map((id) => `<lo-sprite sprite="${id}" scale="2" hover title="${byId.get(id).name}"></lo-sprite>`).join('');
  $('kit-shelves').append(el('article', { class: 'kit-shelf' }, `
    <lo-sprite class="kit-cover" sprite="${k.bg}" layers scale="1"></lo-sprite>
    <div class="kit-body">
      <div class="kit-top">
        <div>
          <h3 class="h-kit">${k.name}</h3>
          <p>${k.kind}. ${b.sprites.length} sprites, ${b.sounds.length} sounds, ${b.music.length} music tracks.</p>
        </div>
        <a class="btn" href="library.html?kit=${k.id}">See the kit</a>
      </div>
      <div class="kit-row">${row}</div>
    </div>`));
}

for (const id of ['sword-slash', 'coin-pickup', 'wyrm-roar', 'wind', 'thornwood-overworld']) {
  const a = byId.get(id);
  const pic = a.type === 'music' ? bars(id, 9, 40) : `<span class="wave" data-pic="${thumb(id)}"></span>`;
  $('sound-list').append(el('li', { 'data-plays': true }, `
    <button class="playbtn" type="button" data-seconds="${a.tech.seconds}" aria-pressed="false" aria-label="Play ${a.name} (no sound in this mock-up)">${icon.play}${icon.stop}</button>
    ${pic}
    <p class="nm">${a.name}<span>${KIND_WORD[a.type]}${a.tech.styles?.length ? `, ${a.tech.styles.length} styles` : ''}</span></p>
    <span class="len">${seconds(a.tech.seconds)}${a.tech.loop ? ', loops' : ''}</span>`));
}

lazyPictures(document, true);

/* the swing: step the attack one frame at a time, so the ruler can show the frame where the sound plays */
const swing = $('swing-hero'), ruler = $('swing-ruler');
await swing.ready;
const frames = swing.def.clips.attack.frames;
const hit = swing.def.sounds.attack.find((s) => !s.when || s.when.weapon?.includes('sword')).frame;
for (let i = 0; i < frames; i++) ruler.append(el('i', { class: i === hit ? 'hit' : '' }));
if (still) {
  swing.setAttribute('frame', hit);
} else {
  let f = 0;
  setInterval(() => {
    const show = Math.min(f, frames - 1);
    swing.setAttribute('frame', show);
    [...ruler.children].forEach((t, i) => t.classList.toggle('now', i === show && f < frames));
    f = (f + 1) % (frames + 8);
  }, 1000 / 11);
}
