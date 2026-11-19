// The kits (#/bundles; a kit is a "bundle" in addresses and in the code): every kit as a living scene made only of its
// own things, with its facts and the way in (docs/site-design.md, section 5; the picture to match is the kit section of
// mocks/5-catalogue/landing.html). One row of looks over the list gives every scene that look in one click, and a kit
// opened from here opens with it.
import { BUNDLE_LEVELS, labelFor } from '../catalog/schema.js';
import { THEME_PRESETS, normalizeTheme } from '../engine/theme.js';
import { el, header } from './ui.js';
import { currentCatalog, assetById } from './catalog.js';
import { kitScene } from './kit-scene.js';

const GAME_WORDS = { any: 'For any game', platformer: 'Platformer', 'turn-based-rpg': 'Turn-based role-playing game', 'roguelike-action': 'Roguelike action game' };
const LOOKS = ['original', 'sunset', 'frost', 'night', 'candy', 'handheld'];

/** A few of a kit's pictures side by side: what stands in for a scene when the kit has nothing to put in one. */
function lineUp(bundle) {
  const pics = [];
  let width = 0;
  for (const id of bundle.sprites ?? []) {
    const row = assetById(id);
    if (!row || !row.thumb) continue;
    const [fw, fh] = row.tech?.frame ?? [64, 64];
    if (fh > 96) continue;
    width += fw * 2 + 8;
    if (width > 300) break;
    pics.push(el('img', { class: 'px', src: row.thumb, alt: '', width: fw * 2, height: fh * 2, loading: 'lazy', decoding: 'async', draggable: 'false' }));
  }
  return el('div', { class: 'kit-lineup' }, pics.length ? pics : el('span', { class: 'quiet' }, 'Sounds only'));
}

export function bundlesPage(app) {
  document.title = 'Kits · Loadout';
  const { bundles } = currentCatalog();
  const looks = LOOKS.map((id) => THEME_PRESETS.find((p) => p.id === id)).filter(Boolean);
  let look = looks[0] ?? null;
  const scenes = [], links = [];
  const hrefOf = (b) => `#/bundle/${b.id}${look && look.id !== 'original' ? `?look=${look.id}` : ''}`;

  function kitRow(b) {
    const scene = kitScene(b, { fallback: () => lineUp(b), fill: true });
    scenes.push(scene);
    const n = { sprites: (b.sprites ?? []).length, sounds: (b.sounds ?? []).length, music: (b.music ?? []).length };
    const fact = (c, one, many = one + 's') => (c ? el('span', {}, el('b', { class: 'num' }, String(c)), c === 1 ? one : many) : null);
    const name = el('a', { class: 'card kit', href: hrefOf(b) }, b.name);
    const see = el('a', { class: 'btn btn-secondary', href: hrefOf(b), 'aria-label': `See the kit: ${b.name}` }, 'See the kit');
    links.push([b, name], [b, see]);
    return el('li', {}, el('article', { class: 'kit', 'data-id': b.id },
      scene.node,
      el('div', { class: 'kit-body' },
        b.gameType ? el('p', { class: 'kit-kind' }, GAME_WORDS[b.gameType] ?? labelFor('gameType', b.gameType)) : null,
        el('h3', { class: 'h3' }, name),
        b.blurb ? el('p', { class: 'kit-blurb' }, b.blurb) : null,
        el('div', { class: 'facts' }, fact(n.sprites, 'sprite'), fact(n.sounds, 'sound'), fact(n.music, 'music track')),
        el('div', { class: 'kit-actions' }, see))));
  }

  const levels = [...BUNDLE_LEVELS].reverse();               // kit, character, object
  const groups = [...levels.map((level) => [`${labelFor('level', level)}s`, bundles.filter((b) => b.level === level)]),
    ['Other kits', bundles.filter((b) => !levels.includes(b.level))]].filter(([, list]) => list.length);

  const chips = looks.length > 1 ? el('div', { class: 'chips kit-looks', role: 'group', 'aria-label': 'Look for every kit' },
    looks.map((p) => el('button', { type: 'button', class: 'chip', 'data-look': p.id, 'aria-pressed': String(p === look), title: p.blurb, onclick: () => {
      look = p;
      for (const b of chips.children) b.setAttribute('aria-pressed', String(b.dataset.look === p.id));
      const t = normalizeTheme(p.theme);
      for (const s of scenes) s.setLook(t);
      for (const [b, a] of links) a.setAttribute('href', hrefOf(b));
    } }, p.name))) : null;

  app.replaceChildren(header('bundles'), el('main', { class: 'v2 kits-page' },
    el('div', { class: 'kits-head' },
      el('div', {},
        el('h1', { class: 'h2' }, 'Kits'),
        el('p', { class: 'lede' }, 'Sprites, sounds and music made to belong together. Give a whole kit a new look in one go, try it in the playground, and download it or add it to your bag.')),
      chips),
    groups.length ? groups.map(([title, list]) => [
      groups.length > 1 ? el('h2', { class: 'h4 kits-group' }, title) : null,
      el('ul', { class: 'kits' }, list.map(kitRow))])
      : el('p', { class: 'quiet' }, 'There are no kits yet.')));
  return () => { for (const s of scenes) s.stop(); };
}
