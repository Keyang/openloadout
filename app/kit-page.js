// One kit: the sprites, sounds and music in it, and a single download for all of them.
import { byId as spriteById } from '../sprites/index.js';
import { el, header, saveBlob } from './ui.js';
import { soundById } from './audio.js';
import { spriteCard, soundCard, musicCard, runCards } from './cards.js';
import { kitFiles } from './bundle.js';
import { zip } from './zip.js';

export function kitPage(app, kit) {
  document.title = `${kit.name} · Loadout`;
  const spriteCards = kit.sprites.map((id) => spriteById[id]).filter(Boolean).map(spriteCard);
  const soundCards = kit.sounds.map((id) => soundById[id]).filter(Boolean).map(soundCard);
  const musicCards = (kit.music ?? []).map((id) => soundById[id]).filter(Boolean).map(musicCard);
  const status = el('p', { class: 'status', role: 'status' });
  const btn = el('button', { type: 'button', class: 'btn big', onclick: async () => {
    btn.disabled = true; status.textContent = musicCards.length ? 'Putting the kit together. The music takes a few seconds…' : 'Putting the kit together…';
    try {
      const files = await kitFiles(kit, spriteById);
      saveBlob(zip(files), `${kit.id}-kit.zip`);
      status.textContent = `Downloaded ${kit.id}-kit.zip with ${files.filter((f) => f.name.endsWith('.png')).length} sprite sheets and ${files.filter((f) => f.name.endsWith('.wav')).length} sound files.`;
    } catch (e) {
      status.textContent = `The download did not start: ${e.message}. Try again, or use a different browser.`;
    }
    btn.disabled = false;
  } }, 'Download the whole kit');

  app.replaceChildren(
    header('kits'),
    el('main', { class: 'home' },
      el('h1', { class: 'small' }, kit.name),
      el('p', { class: 'lede' }, kit.blurb),
      el('div', { class: 'get flat' }, btn, el('span', { class: 'hint' }, 'To change a sprite or sound first, open it below and download it from its own page.'), status),
      el('h2', { class: 'shelf' }, 'Sprites'),
      el('ul', { class: 'gallery' }, spriteCards.map((c) => el('li', {}, c.node))),
      el('h2', { class: 'shelf' }, 'Sounds'),
      el('ul', { class: 'gallery' }, soundCards.map((c) => el('li', {}, c.node))),
      musicCards.length ? [el('h2', { class: 'shelf' }, 'Music'), el('ul', { class: 'gallery' }, musicCards.map((c) => el('li', {}, c.node)))] : null));
  return runCards([...spriteCards, ...soundCards, ...musicCards]);
}
