// Shared by the three pages of the "Showcase" mock-up: the bag count, small drawn icons, the pretend play button.
// Mock-up only. No sound is played and nothing leaves the browser.

export const icon = {
  play: '<svg class="i-play" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9.5-5.5z" fill="currentColor"/></svg>',
  stop: '<svg class="i-stop" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 2h3v10H3zM8 2h3v10H8z" fill="currentColor"/></svg>',
  check: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

/* ---- the bag: a list of asset ids kept in this browser, so the count survives going from page to page ---- */
const KEY = 'loadout-mock2-bag';
export const bag = {
  ids() { try { return JSON.parse(localStorage.getItem(KEY)) ?? ['knight']; } catch { return ['knight']; } },
  has(id) { return this.ids().includes(id); },
  toggle(id) {
    const ids = this.ids();
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private window: the count just will not persist */ }
    paintBag();
    return next.includes(id);
  },
  add(list) {
    const next = [...new Set([...this.ids(), ...list])];
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* as above */ }
    paintBag();
  },
};
export function paintBag() {
  const n = bag.ids().length;
  for (const el of document.querySelectorAll('.bag-n')) el.textContent = n;
  for (const el of document.querySelectorAll('.bag')) el.setAttribute('aria-label', `Bag, ${n} ${n === 1 ? 'thing' : 'things'} in it`);
}
paintBag();

/* ---- pretend play: the button flips to "stop" and a gold sweep crosses the picture for the sound's length ---- */
let playing = null;
export function mockPlay(host, seconds) {
  const stop = (el) => { el.classList.remove('playing'); clearTimeout(el._t); el.querySelector('.playbtn')?.setAttribute('aria-pressed', 'false'); };
  if (playing) { const was = playing; stop(was); playing = null; if (was === host) return; }
  const dur = Math.max(0.35, Math.min(seconds, 6));
  host.style.setProperty('--dur', `${dur}s`);
  host.classList.add('playing');
  host.querySelector('.playbtn')?.setAttribute('aria-pressed', 'true');
  playing = host;
  host._t = setTimeout(() => { stop(host); if (playing === host) playing = null; }, dur * 1000 + 150);
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('.playbtn[data-seconds]');
  if (!b) return;
  e.preventDefault();
  mockPlay(b.closest('[data-plays]') ?? b.parentElement, Number(b.dataset.seconds));
});

/* ---- a music track has no drawn picture, so draw a row of bars from its name (always the same for the same track) ---- */
export function bars(id, n = 40, h = 56) {
  let seed = [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const w = 4, gap = 3;
  let out = '';
  for (let i = 0; i < n; i++) {
    const swell = 0.45 + 0.55 * Math.abs(Math.sin((i / n) * Math.PI * (2 + (seed % 3))));
    const bh = Math.max(4, Math.round((0.25 + rnd() * 0.75) * swell * h / 2) * 2);
    out += `<rect x="${i * (w + gap)}" y="${(h - bh) / 2}" width="${w}" height="${bh}" rx="1"/>`;
  }
  return `<svg class="bars" viewBox="0 0 ${n * (w + gap) - gap} ${h}" preserveAspectRatio="none" fill="currentColor" aria-hidden="true">${out}</svg>`;
}

export const seconds = (s) => (s < 10 ? `${(Math.round(s * 10) / 10).toFixed(1)} s` : `${Math.round(s)} s`);

export const KITS = [
  { id: 'kit-platformer-fantasy', name: 'Thornwood Keep', kind: 'Side-view fantasy platformer', bg: 'bg-forest',
    faces: ['knight', 'wizard', 'spear-goblin', 'slime', 'bat', 'wolf', 'thorn-beetle', 'spore-hopper', 'crow-scout', 'campfire', 'treasure-chest'] },
  { id: 'kit-rpg-fantasy', name: 'Hearthvale', kind: 'Turn-based fantasy RPG', bg: 'bg-battle-field',
    faces: ['hero-walker', 'mage-walker', 'rogue-walker', 'village-elder', 'merchant', 'town-guard', 'farm-kid', 'road-bandit', 'bone-soldier', 'thicket-imp', 'save-crystal'] },
  { id: 'kit-roguelite-scifi', name: 'Derelict Station', kind: 'Top-down sci-fi action roguelike', bg: 'bg-starfield',
    faces: ['void-ranger', 'shield-trooper', 'vendor-bot', 'crawler-bug', 'spitter-bug', 'security-bot', 'scout-drone', 'swarm-mite', 'fuel-barrel', 'supply-crate', 'tech-chest'] },
];

/* ---- pictures load only when they come near the screen, and try again if the server drops one ---- */
const fetched = new Map(), waiting = [];
let busy = 0;
function nextPicture() {
  while (busy < 3 && waiting.length) {       // a few at a time, so a page of cards never floods the server
    const job = waiting.shift();
    busy++;
    const img = new Image();
    img.onload = () => { busy--; job.done(true); nextPicture(); };
    img.onerror = () => { busy--; if (--job.left > 0) setTimeout(() => { waiting.push(job); nextPicture(); }, 400); else job.done(false); nextPicture(); };
    img.src = job.src;
  }
}
function fetchPicture(src) {
  if (!fetched.has(src)) fetched.set(src, new Promise((done) => { waiting.push({ src, done, left: 4 }); nextPicture(); }));
  return fetched.get(src);
}
function showPicture(el) {
  const src = el.dataset.pic;
  fetchPicture(src).then(() => {
    if (el.classList.contains('wave')) el.style.setProperty('--img', `url("${src}")`);
    else el.style.backgroundImage = `url("${src}")`;
  });
}
const near = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { near.unobserve(e.target); showPicture(e.target); }
}, { rootMargin: '300px' });
/** Call after adding elements that carry data-pic="<url>" (an .art strip, or a .wave sound picture). `now` skips the waiting. */
export function lazyPictures(root = document, now = false) {
  for (const el of root.querySelectorAll('[data-pic]:not([data-pic-seen])')) { el.dataset.picSeen = ''; if (now) showPicture(el); else near.observe(el); }
}
