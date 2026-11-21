// The studio's first page, #/studio (docs/studio.md section 5; item S9): "Make a new one" opens the starting bodies (the
// templates, side view and top-down, and the Hero from the library); "Open a file" reads a studio file (<id>.js
// in the data form, or the JSON; the library no longer takes it, build item R4a); the drafts kept on this computer are listed newest first, each opened or removed.
// When the saved drafts cannot be read whole, the page says so, saves nothing over them, and offers to download what is
// there and then to start afresh (app/studio/drafts.js problem, savedText, startAfresh).
import { el, header, saveBlob } from '../ui.js';
import { validateDataSprite } from '../../engine/data-sprite.js';
import { assetById } from '../catalog.js';
import { draftIdFor, slugOf, LIBRARY_BODY_GONE } from './drafts.js';
import { startingBodies, startFrom, setName, hasClip } from './edit.js';
import { drawFrame } from './draw.js';
import { checkDraft } from './v2-check.js';
import { v2Picture, v2StartsSection } from './v2-starts.js';

const FILE_CHARS = 512 * 1024;

/** How long ago, in words. */
function ago(t, now = Date.now()) {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

/** A frame of a definition as a canvas shown at a whole-number size that fits `room` pixels. */
function picture(def, room) {
  if (def?.version === 2) return v2Picture(def, room);       // build item B17: every body, drawn once its pieces are loaded
  const clip = hasClip(def, def.preview) ? def.preview : Object.keys(def.clips)[0];
  const g = drawFrame(def, clip, 0);
  const c = el('canvas', { width: g.w, height: g.h, 'aria-hidden': 'true' });
  c.getContext('2d').putImageData(new ImageData(g.bytes(), g.w, g.h), 0, 0);
  const k = Math.max(1, Math.floor(room / Math.max(g.w, g.h)));
  c.style.width = `${g.w * k}px`; c.style.height = `${g.h * k}px`;
  return c;
}

const VIEW_WORD = { side: 'Side view', 'top-down': 'Top-down, three ways', front: 'Front view', none: 'Any view' };

/** The note a saved draft of the removed library-body path carries, in everyday words (LIBRARY_BODY_GONE). */
const GONE_NOTE = LIBRARY_BODY_GONE.replace(/^This sprite used a library body/, 'This draft used a library body');

/** What a saved draft that used a library body offers: its library sprite (when it began as one), its JSON, Remove. Arguments: g (drafts.gone's row), drafts, { say, after (called once it is removed) }. */
function goneActions(g, drafts, { say, after }) {
  return el('div', { class: 'st-draft-acts' },
    g.from ? el('a', { class: 'btn btn-sm btn-primary', href: `#/sprite/${g.from}`, 'data-act': 'open-library-sprite' }, `Open ${g.from} in the library`) : el('a', { class: 'btn btn-sm btn-primary', href: '#/browse', 'data-act': 'open-library-sprite' }, 'Browse the library'),
    el('button', { type: 'button', class: 'btn btn-sm', 'data-act': 'download-gone', onclick: () => {
      saveBlob(new Blob([JSON.stringify(g.definition, null, 2)], { type: 'application/json' }), `${g.id}.json`);
      say(`${g.id}.json is downloaded.`);
    } }, 'Download what is saved'),
    el('button', { type: 'button', class: 'btn btn-sm', 'data-act': 'remove-gone', 'aria-label': `Remove ${g.name}`, onclick: () => {
      const r = drafts.remove(g.id);
      if (!r.ok) { say(r.error); return; }
      after();
    } }, 'Remove'));
}

/**
 * The page for a saved draft that used a library body (a path that is removed, build item R1): not damaged, not
 * opened for editing, and said so in plain words with what to do instead. Returns the page's teardown.
 * Arguments: app, { id, gone (drafts.gone(id)), drafts }.
 */
export function gonePage(app, { id, gone, drafts }) {
  document.title = 'Needs a copy · Studio · Loadout';
  const status = el('p', { class: 'studio-say', role: 'status', 'aria-live': 'polite' });
  app.replaceChildren(header('studio'), el('main', { class: 'v2 home notice', 'data-gone-draft': id },
    el('h1', { class: 'h2' }, `${gone.name} needs a copy`),
    el('p', { class: 'lede', 'data-note': 'library-body-gone' }, GONE_NOTE),
    el('p', { class: 'quiet' }, 'The draft is still saved on this computer and nothing in it was changed. Library sprites are data now: open the library sprite, and the studio edits a copy of it.'),
    goneActions(gone, drafts, { say: (...t) => status.replaceChildren(...t), after: () => { location.hash = '#/studio'; } }),
    status,
    el('p', {}, el('a', { class: 'link', href: '#/studio' }, 'Go to the studio'))));
  return () => {};
}

/**
 * Draws the studio's first page and returns its teardown. Arguments: app, { drafts (app/studio/drafts.js), kept, query }.
 */
export function homePage(app, { drafts, kept, query }) {
  const taken = (name) => { const s = slugOf(name); return s && assetById(s) ? [s] : []; };
  const status = el('p', { class: 'studio-say', role: 'status', 'aria-live': 'polite' });
  const say = (...t) => status.replaceChildren(...t);

  function create(def, how) {
    const v = checkDraft(def);       // version 1 as validateDataSprite; a version 2 file kept with its mistakes shown (B17)
    if (!v.ok) { say(`That could not be opened: ${v.errors[0]}`); return; }
    const id = draftIdFor(v.value.name, drafts.ids());
    const r = drafts.put(id, v.value);
    if (!r.ok) { say(r.error); return; }
    location.hash = `#/studio/${id}?mode=${how === 'file' ? 'sprite' : 'rig'}`;
  }

  // ---- the starting bodies ----
  const pick = el('section', { class: 'st-pick', hidden: query.new === undefined, 'aria-labelledby': 'st-pick-h' },
    el('div', { class: 'st-row-head' }, el('h2', { class: 'h4', id: 'st-pick-h' }, 'Pick a body to start from'),
      el('p', { class: 'quiet small' }, 'Each one already stands, walks, attacks, flinches and falls. You change it from there.')));
  const grid = el('div', { class: 'st-starts' });
  pick.append(grid);
  let built = false;
  function buildStarts() {
    if (built) return;
    built = true;
    for (const s of startingBodies()) {
      const def = startFrom(s.id, s.label, taken(s.label));
      const v = validateDataSprite(def);
      grid.append(el('button', { type: 'button', class: 'st-start', 'data-start': s.id, onclick: () => create(setName(v.value, s.label, taken(s.label)), 'new') },
        el('span', { class: 'tile st-start-pic' }, v.ok ? picture(v.value, 150) : null),
        el('span', { class: 'st-start-name' }, s.label),
        el('span', { class: 'st-start-tag' }, VIEW_WORD[s.view] ?? 'Side view')));
    }
    pick.append(v2StartsSection({ drafts, say }));
  }

  // ---- opening a file ----
  const fileIn = el('input', { type: 'file', accept: '.js,.json,text/javascript,application/json', hidden: true, onchange: async () => {
    const f = fileIn.files?.[0];
    fileIn.value = '';
    if (!f) return;
    if (f.size > FILE_CHARS) { say('That file is too big to be a studio file.'); return; }
    const textIn = await f.text();
    let def = null;
    if (textIn.includes('Made in the Loadout studio')) {
      // the reader (tools/lib/data-file.mjs) is loaded only now: tools/ may not be served where the site is published
      let F;
      try { F = await import('../../catalog/data-file.js'); } catch { say('Studio files cannot be opened on this copy of the site. Open the JSON instead.'); return; }
      const r = F.readDataFile(textIn);
      if (!r.ok) { say(`That file could not be opened: ${r.errors[0]}`); return; }
      def = r.value;
    } else {
      try { def = JSON.parse(textIn); } catch { say('That is not a file the studio made. Open a sprites/<name>.js file downloaded from the studio.'); return; }
    }
    create(def, 'file');
  } });

  const newBtn = el('button', { type: 'button', class: 'btn btn-primary btn-lg', 'aria-expanded': String(!pick.hidden), 'aria-controls': 'st-pick', onclick: () => {
    pick.hidden = false; newBtn.setAttribute('aria-expanded', 'true'); buildStarts();
    grid.querySelector('button')?.focus();
  } }, 'Make a new one');
  pick.id = 'st-pick';
  if (!pick.hidden) buildStarts();

  // ---- saved drafts that cannot be read whole: nothing is saved over them ----
  const trouble = el('div', { class: 'not-kept st-trouble', role: 'alert', hidden: true });
  const openBtn = el('button', { type: 'button', class: 'btn btn-lg', onclick: () => fileIn.click() }, 'Open a file');
  let downloaded = false;
  function drawTrouble() {
    const p = drafts.problem();
    trouble.hidden = !p;
    listBox.hidden = !!p;
    newBtn.disabled = !!p;
    openBtn.disabled = !!p;
    if (!p) { trouble.replaceChildren(); return; }
    pick.hidden = true;
    const afresh = el('button', { type: 'button', class: 'btn btn-sm', 'data-act': 'start-afresh', onclick: () => {
      if (!downloaded && !window.confirm('Start afresh without downloading what is saved? The saved drafts will be gone for good.')) return;
      const r = drafts.startAfresh();
      say(r.ok ? 'Started afresh. New drafts are saved again.' : r.error);
      drawTrouble(); drawDrafts();
    } }, 'Start afresh');
    trouble.replaceChildren(el('strong', {}, 'Your saved drafts could not be read. '), 'Another tab or an older visit may have left them damaged. The studio will not save over them, because that would lose them: download what is saved, then start afresh.',
      el('span', { class: 'st-trouble-acts' },
        el('button', { type: 'button', class: 'btn btn-sm btn-primary', 'data-act': 'download-saved', onclick: () => {
          saveBlob(new Blob([drafts.savedText()], { type: 'application/json' }), 'loadout-studio-drafts.json');
          downloaded = true;
          say('What was saved is downloaded as loadout-studio-drafts.json.');
        } }, 'Download what is saved'), afresh));
  }

  // ---- the drafts ----
  const list = el('div', { class: 'st-drafts' });
  const goneGrid = el('div', { class: 'st-drafts' });
  const goneList = el('section', { class: 'st-list st-gone', 'aria-labelledby': 'st-gone-h', hidden: true }, el('h2', { class: 'h4', id: 'st-gone-h' }, 'Drafts that need a copy'), goneGrid);
  const draftsHead = el('h2', { class: 'h4', id: 'st-drafts-h' });
  const listBox = el('section', { class: 'st-list', 'aria-labelledby': 'st-drafts-h' }, draftsHead, list);
  function drawGone() {
    const items = drafts.gone();
    goneList.hidden = !items.length || !!drafts.problem();
    goneGrid.replaceChildren(...items.map((g) => el('article', { class: 'draft card', 'data-gone-draft': g.id },
      el('div', { class: 'card-meta' }, el('span', { class: 'card-title' }, g.name), el('span', { class: 'card-tag' }, el('span', {}, `Saved ${ago(g.savedAt)}`))),
      el('p', { class: 'quiet small', 'data-note': 'library-body-gone' }, GONE_NOTE),
      goneActions(g, drafts, { say, after: () => { drawGone(); drawDrafts(); say(`${g.name} removed.`); } }))));
  }
  function drawDrafts() {
    drawGone();
    const all = drafts.list();
    draftsHead.textContent = all.length ? `Your drafts (${all.length})` : 'Your drafts';
    const broken = drafts.broken();
    list.replaceChildren(...[
      ...(all.length || drafts.problem() ? [] : [el('p', { class: 'quiet' }, 'Nothing yet. Make a new one, or open a file you downloaded from the studio.')]),
      ...all.map((d) => el('article', { class: 'draft card' },
        el('a', { class: 'tile card-tile st-draft-pic', href: `#/studio/${d.id}`, 'aria-label': `Open ${d.name}` }, el('span', { class: 'card-pic' }, picture(d.definition, 150))),
        el('div', { class: 'card-meta' },
          el('a', { class: 'card-title', href: `#/studio/${d.id}` }, d.name),
          el('span', { class: 'card-tag' }, el('span', {}, `Saved ${ago(d.savedAt)}`), d.bagKey ? el('span', {}, 'In your bag') : null)),
        el('div', { class: 'st-draft-acts' },
          el('a', { class: 'btn btn-sm', href: `#/studio/${d.id}` }, 'Open'),
          el('button', { type: 'button', class: 'btn btn-sm', 'aria-label': `Remove ${d.name}`, onclick: () => remove(d) }, 'Remove')))),
      broken ? el('p', { class: 'quiet small st-broken' }, `${broken} saved draft${broken === 1 ? '' : 's'} could not be read and ${broken === 1 ? 'is' : 'are'} not shown.`) : null].filter(Boolean));
  }
  function remove(d) {
    const r = drafts.remove(d.id);
    if (!r.ok) { say(r.error); return; }
    drawDrafts();
    say(`${d.name} removed. `, el('button', { type: 'button', class: 'link', onclick: () => { const back = drafts.put(d.id, d.definition, d.bagKey ? { bagKey: d.bagKey } : {}); say(back.ok ? `${d.name} is back.` : back.error); drawDrafts(); } }, 'Put it back'));
  }

  document.title = 'Studio · Loadout';
  const main = el('main', { class: 'v2 home studio-home' },
    el('div', { class: 'st-intro' },
      el('h1', { class: 'h2' }, 'Studio'),
      el('p', { class: 'lede' }, `Make your own sprite: pick a body, shape it, make it move, name it. ${kept ? 'It is kept on this computer as you go, and downloads' : 'It downloads'} as a studio file to keep or a sheet for your game.`),
      el('div', { class: 'st-intro-acts' }, newBtn, openBtn, fileIn),
      trouble,
      kept ? null : el('p', { class: 'not-kept', role: 'note' }, el('strong', {}, 'This browser is not saving for this site. '), 'What you make here is gone when the tab closes: download the file before you leave.'),
      status),
    pick,
    listBox,
    goneList);
  app.replaceChildren(header('studio'), main);
  drawTrouble();
  drawDrafts();
  return () => {};
}
