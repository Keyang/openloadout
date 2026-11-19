// Playroom landing page: the live Hero, the wall of versions, the three kit bands, sounds.
import { loadCatalog, looks, thumb, url, icon, esc, controlHTML, bindControls, syncControls, buildScene, SCENES, KITS, barsOf, bindPlay, seconds } from './app.js';

const { assets, bundles } = await loadCatalog();
const byId = Object.fromEntries(assets.map((a) => [a.id, a]));

// ---- the hero with three big controls
const hero = document.getElementById('hero');
await hero.ready;
const tryBox = document.getElementById('try-ctls');
const keep = document.getElementById('keep');
const CROP = { hairStyle: { k: 3, cx: 28, cy: 29, extra: { headgear: 'none' } }, weapon: { k: 2, cx: 30, cy: 38 } };
function drawTry() {
  const items = Object.fromEntries(hero.controls().flatMap((g) => g.items).map((it) => [it.key, it]));
  tryBox.innerHTML = ['hairStyle', 'weapon', 'outfit'].map((key) => controlHTML(items[key], {
    label: key === 'outfit' ? 'Outfit colour' : items[key].label,
    pics: CROP[key] && { sprite: 'knight', clip: 'idle', params: hero.params, w: 64, h: 64, ...CROP[key] },
  })).join('');
}
drawTry();
bindControls(tryBox, (key, value) => hero.set(key, value));
hero.addEventListener('change', () => {
  syncControls(tryBox, hero.params);
  const changed = Object.fromEntries(hero.changed().map((k) => [k, hero.params[k]]));
  keep.href = `remix.html#p=${encodeURIComponent(JSON.stringify(changed))}`;
});
document.getElementById('surprise').addEventListener('click', () => hero.surprise());

// ---- one hero, a dozen versions
const VERSIONS = [
  { tone: 'sky', clip: 'walk', p: {}, say: 'as it comes' },
  { tone: 'sun', clip: 'idle', p: { hairStyle: 'long', hair: '#c9423a', headgear: 'crown', weapon: 'spear', outfit: '#7a4fc4', trim: '#e6c545' }, say: 'with a crown and a spear' },
  { tone: 'leaf', clip: 'attack', p: { hairStyle: 'spiky', hair: '#2b2233', headgear: 'none', weapon: 'axe', outfit: '#c9423a', trim: '#3a3350', build: 0.95, height: 0.25 }, say: 'short and stocky with an axe' },
  { tone: 'dusk', clip: 'run', p: { hairStyle: 'ponytail', hair: '#e0b040', headgear: 'none', outfit: '#4f9d57', trim: '#f0ead8', cape: 'tattered', capeLength: 1.5 }, say: 'with a ponytail and a tattered cape' },
  { tone: 'teal', clip: 'victory', p: { hairStyle: 'bald', headgear: 'none', weapon: 'none', cape: 'none', outfit: '#e08a2c', skin: '#9a6240', build: 0.7 }, say: 'with no gear at all' },
  { tone: 'mist', clip: 'walk', look: 'night', p: { hairStyle: 'long', headgear: 'none', capeLength: 1.6 }, say: 'in the Night look' },
  { tone: 'sun', clip: 'idle', p: { skin: '#9bd18a', hairStyle: 'spiky', hair: '#2b2233', headgear: 'none', weapon: 'axe', outfit: '#3a3350', cape: 'none', head: 0.9 }, say: 'as a green-skinned raider' },
  { tone: 'sky', clip: 'victory', p: { headgear: 'crown', headgearSize: 1.4, hair: '#d8d8e0', hairStyle: 'long', outfit: '#f0ead8', trim: '#7a4fc4', metal: '#e6c545' }, say: 'as an old king in white and gold' },
  { tone: 'leaf', clip: 'run', look: 'handheld', p: {}, say: 'in the Handheld look' },
  { tone: 'dusk', clip: 'walk', p: { height: 1, build: 0.05, head: 0.3, weapon: 'spear', weaponLength: 1.35, outfit: '#2f8f9d', trim: '#e08a2c', hairStyle: 'ponytail', headgear: 'none' }, say: 'tall and thin with a long spear' },
  { tone: 'teal', clip: 'block', p: { height: 0, build: 1, head: 1, headgearSize: 1.5, weaponLength: 0.7, outfit: '#d65a9c', trim: '#e6c545' }, say: 'small with a big helmet' },
  { tone: 'mist', clip: 'idle', look: 'candy', p: { hairStyle: 'ponytail', headgear: 'none', cape: 'tattered' }, say: 'in the Candy look' },
];
document.getElementById('wall').innerHTML = VERSIONS.map((v) =>
  `<a class="tile" data-tone="${v.tone}" href="remix.html#p=${encodeURIComponent(JSON.stringify(v.p))}${v.look ? `&look=${v.look}` : ''}" aria-label="The Hero ${esc(v.say)}. Open it to change it.">
     <lo-sprite sprite="knight" clip="${v.clip}" ${v.look ? `look="${v.look}"` : ''} params='${esc(JSON.stringify(v.p))}'></lo-sprite></a>`).join('');

// ---- the three kits, each alive in its own band
const bands = document.getElementById('kit-bands');
const SAY = {
  'kit-platformer-fantasy': 'A hero, enemies and a boss, forest, cave and castle ground, traps, pickups and a wooden menu set.',
  'kit-rpg-fantasy': 'A party seen on the map and in battle, villagers, a dragon, a village, spell effects and battle menus.',
  'kit-roguelite-scifi': 'A ranger, troopers, bugs, robots and two bosses, station floors, doors, pickups and a tech menu set.',
};
bands.innerHTML = Object.entries(KITS).map(([id, k]) => {
  const b = bundles.find((x) => x.id === id);
  return `<article class="kit field" data-tone="${k.tone}">
    <div class="kit-copy">
      <h3 class="h-sec">${esc(k.name)}</h3>
      <p class="kit-kind">${esc(k.kind)}</p>
      <p class="lead">${esc(SAY[id])}</p>
      <ul class="kit-stats"><li>${b.sprites.length} sprites</li><li>${b.sounds.length} sounds</li><li>${b.music.length} music tracks</li></ul>
      <a class="btn btn-white" href="library.html#kits">Open ${esc(k.name)}</a>
    </div>
    <div class="scene" data-scene="${id}" role="img" aria-label="A live scene made only from the ${esc(k.name)} kit"></div>
  </article>`;
}).join('');
const scenes = await Promise.all([...bands.querySelectorAll('.scene')].map((el) => buildScene(el, SCENES[el.dataset.scene], assets)));

const lookBox = document.getElementById('looks');
const SHOWN = ['original', 'sunset', 'frost', 'night', 'candy', 'handheld'];
lookBox.innerHTML = '<span>Look</span>' + SHOWN.map((id) => `<button type="button" class="chip" data-look="${id}" aria-pressed="${id === 'original'}">${esc(looks.find((l) => l.id === id).name)}</button>`).join('')
  + `<span class="quiet small" style="font-weight:500;margin-left:8px">and ${looks.length - SHOWN.length} more</span>`;
lookBox.addEventListener('click', (e) => {
  const b = e.target.closest('[data-look]');
  if (!b) return;
  for (const x of lookBox.querySelectorAll('[data-look]')) x.setAttribute('aria-pressed', String(x === b));
  for (const s of scenes) s.setLook(b.dataset.look);
});

// ---- how it works: the small "try" scene
buildScene(document.getElementById('step-scene'), { bg: 'bg-forest', ground: ['tiles-forest', 'grass-top'], groundY: 148, actors: [{ id: 'knight', clip: 'run', x: 96 }, { id: 'slime', clip: 'hop', x: 150, flip: true }] }, assets);

// ---- sounds and music
const K = byId.knight;
const cues = [0, 4];
document.getElementById('cue-frames').innerHTML = Array.from({ length: K.stripFrames }, (_, i) =>
  `<li class="${cues.includes(i) ? 'hit' : ''}"><span class="frame-win"><span class="px" style="width:64px;height:64px;background:url(${url(K.strip)}) ${-i * 64}px 0 / ${K.stripFrames * 64}px 64px no-repeat"></span></span><i></i></li>`).join('');

const LIST = ['sword-slash', 'coin-pickup', 'wyrm-roar', 'thornwood-overworld', 'hearthvale-village', 'derelict-boss'];
document.getElementById('tracks').innerHTML = LIST.map((id) => {
  const a = byId[id], music = a.kind === 'music';
  return `<li class="track">
    <button type="button" class="play" data-seconds="${a.tech.seconds}" aria-pressed="false" aria-label="Play ${esc(a.name)}">${icon('play')}</button>
    ${music ? `<span class="bars" aria-hidden="true">${barsOf(id, 12)}</span>` : `<img class="px" src="${thumb(id)}" width="64" height="40" alt="">`}
    <span class="track-name">${esc(a.name)}</span>
    <span class="quiet">${music ? `Music, ${seconds(a.tech.seconds)} loop` : seconds(a.tech.seconds)}</span>
  </li>`;
}).join('');
bindPlay(document.getElementById('tracks'));

// ---- what you download: the real walk sheet
const sheet = document.getElementById('sheet-px');
sheet.style.backgroundImage = `url(${url(K.strip)})`;
sheet.style.backgroundSize = `${K.stripFrames * 64}px 64px`;
