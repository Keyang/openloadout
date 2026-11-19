// Catalogue (design 5): the landing page. Mock-up only.
import { warm, loadCatalog, looks, thumb, KITS, SCENES, HERO_VERSIONS, TYPE_LABEL, ICON, cardHTML, wireCards, kitRowHTML, mountScenes, lookScenes, picture, playMock, seconds } from './common.js';

const { assets, bundles } = await loadCatalog();
const byId = new Map(assets.map((a) => [a.id, a]));
const $ = (s) => document.querySelector(s);

/* ---------- the line-up: sprites from all three kits standing on one line ---------- */
// [id, footprint width in art pixels, hide-at class, a second sprite floating above: [id, lift]]
const LINEUP = [
  ['knight', 30, ''], ['slime', 26, '', ['bat', 40]], ['moss-golem', 64, 'opt-b'], ['wizard', 34, ''], ['rogue-battler', 34, 'opt-a'],
  ['ember-wyrm', 104, 'opt-b'], ['void-ranger', 26, ''], ['crawler-bug', 36, 'opt-a', ['scout-drone', 34]], ['security-bot', 34, 'opt-a'], ['warden-mech', 66, 'opt-b'],
];
await warm(['knight', ...LINEUP.flatMap(([id, , , above]) => (above ? [id, above[0]] : [id]))]);
$('#lineup').innerHTML = LINEUP.map(([id, fw, cls, above]) => {
  const a = byId.get(id), [, h] = a.tech.frame, [px, py] = a.tech.pivot;
  let more = '';
  if (above) { const b = byId.get(above[0]); more = `<lo-sprite sprite="${b.id}" scale="2" style="--px:${b.tech.pivot[0]};--pb:${-above[1]}"></lo-sprite>`; }
  return `<span class="stand ${cls}" style="--fw:${fw}"><lo-sprite sprite="${id}" scale="2" style="--px:${px};--pb:${h - py}"></lo-sprite>${more}</span>`;
}).join('');
const lineupSprites = () => [...document.querySelectorAll('#lineup lo-sprite')];
$('#lineup-surprise').addEventListener('click', () => { lineupSprites().forEach((s) => s.def && s.surprise()); $('#lineup-reset').hidden = false; });
$('#lineup-reset').addEventListener('click', (e) => { lineupSprites().forEach((s) => s.def && s.reset()); e.currentTarget.hidden = true; $('#lineup-surprise').focus(); });

/* ---------- step 1: pick ---------- */
const OFF = { knight: [4, -14], campfire: [0, -8], slime: [4, -8] };
$('#pick').innerHTML = ['knight', 'slime', 'campfire', 'treasure-chest', 'bat', 'coin'].map((id, i) => {
  const a = byId.get(id), [w, h] = a.tech.frame;
  return `<span class="${i === 0 ? 'on' : ''}"><i><img class="px" src="${thumb(id)}" width="${w * 2}" height="${h * 2}" alt="${a.name}" style="--dx:${OFF[id]?.[0] ?? 0}px;--dy:${OFF[id]?.[1] ?? 0}px"></i></span>`;
}).join('');

/* ---------- step 2: change (real controls) and step 3: the sheet follows ---------- */
const hero = $('#try-hero');
await hero.ready;
const sheet = $('#sheet');
sheet.innerHTML = Array.from({ length: 8 }, (_, f) => `<span class="hv"><lo-sprite sprite="knight" clip="walk" paused frame="${f}"></lo-sprite></span>`).join('');
const hairDef = hero.def.params.hairStyle, outfitDef = hero.def.params.outfit;
$('#try-hair').innerHTML = hairDef.options.slice(0, 3).map((o) => `<button type="button" class="chip" role="radio" data-v="${o.value}">${o.label}</button>`).join('');
$('#try-outfit').innerHTML = ['#3f6fd1', '#c9423a', '#4f9d57', '#e6c545', '#7a4fc4'].map((c) => `<button type="button" class="swatch" role="radio" data-v="${c}" style="--c:${c}" aria-label="Outfit colour ${outfitDef.swatches.indexOf(c) + 1}"></button>`).join('');
const range = $('#try-height');
const paintTry = () => {
  for (const b of document.querySelectorAll('#try-hair [role=radio]')) b.setAttribute('aria-checked', b.dataset.v === hero.params.hairStyle);
  for (const b of document.querySelectorAll('#try-outfit [role=radio]')) b.setAttribute('aria-checked', b.dataset.v === hero.params.outfit);
  range.style.setProperty('--p', `${hero.params.height * 100}%`);
  const p = JSON.stringify(Object.fromEntries(hero.changed().map((k) => [k, hero.params[k]])));
  for (const s of sheet.querySelectorAll('lo-sprite')) s.setAttribute('params', p);
};
$('#try-hair').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) hero.set('hairStyle', b.dataset.v); });
$('#try-outfit').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) hero.set('outfit', b.dataset.v); });
range.addEventListener('input', () => hero.set('height', Number(range.value)));
hero.addEventListener('change', paintTry);
hero.set('headgear', 'none');

/* ---------- the three kits, each a small living scene ---------- */
$('#kit-list').innerHTML = KITS.map((k) => kitRowHTML(k, bundles.find((x) => x.id === k.id), `<a class="btn btn-secondary" href="library.html?kit=${k.id}">See the kit</a>`)).join('');
await mountScenes($('#kit-list'), byId);

const KIT_LOOKS = ['original', 'sunset', 'frost', 'night', 'candy', 'handheld'];
$('#kit-looks').innerHTML = KIT_LOOKS.map((id, i) => `<button type="button" class="chip" role="radio" aria-checked="${i === 0}" data-look="${id}">${looks.find((l) => l.id === id).name}</button>`).join('');
$('#kit-looks').addEventListener('click', (e) => {
  const b = e.target.closest('[data-look]');
  if (!b) return;
  for (const x of b.parentElement.children) x.setAttribute('aria-checked', x === b);
  lookScenes($('#kit-list'), b.dataset.look);
});

/* ---------- twelve Heroes ---------- */
$('#versions').innerHTML = HERO_VERSIONS.map((v) => `<a class="version" href="remix.html?v=${v.id}">
  <span class="hv tile"><lo-sprite sprite="knight" clip="idle" params='${JSON.stringify(v.params)}'></lo-sprite></span>
  <span class="name">${v.name}</span></a>`).join('');

/* ---------- favourites ---------- */
const FAV = ['ember-wyrm', 'wizard', 'moss-golem', 'void-ranger', 'hive-mother', 'campfire', 'cottage', 'treasure-chest', 'fx-fire-spell', 'warp-pad', 'bg-castle', 'tiles-castle'];
$('#favourites').innerHTML = FAV.map((id) => cardHTML(byId.get(id))).join('');
wireCards($('#favourites'), byId);

/* ---------- sounds and music ---------- */
const SOUNDS = ['sword-slash', 'coin-pickup', 'wyrm-roar', 'thornwood-overworld', 'hearthvale-village', 'derelict-boss'];
$('#sounds').innerHTML = SOUNDS.map((id) => {
  const a = byId.get(id), n = a.tech.styles?.length ?? 0;
  return `<li class="srow" data-id="${id}">
    <button type="button" class="play" aria-label="Play ${a.name}" aria-pressed="false">${ICON.play}</button>
    <span class="pic">${picture(a)}</span>
    <span><span class="name">${a.name}</span><br><span class="what">${TYPE_LABEL[a.type]}${n ? ` in ${n} styles` : ''}</span></span>
    <span class="num quiet">${seconds(a.tech.seconds)}</span>
    <span class="progress" aria-hidden="true"></span>
  </li>`;
}).join('');
$('#sounds').addEventListener('click', (e) => {
  const b = e.target.closest('.play');
  if (b) { const row = b.closest('.srow'); playMock(b, row.querySelector('.progress'), byId.get(row.dataset.id).tech.seconds); }
});
