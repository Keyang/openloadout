// The site's art style (the toggle before the Bag button): one choice for the whole site, kept in this browser.
// It is only the default: a sprite that does not list the chosen style is shown in its first, and an item or a link
// that names a style keeps it. engine/styles.js preferStyle is what the drawing code reads (artStyleOf).
import { styleIds, styleById, preferStyle, preferredStyle } from '../engine/styles.js';

const KEY = 'loadout.artStyle';
const keep = (() => { try { return window.localStorage; } catch { return null; } })();

/** Read the saved choice once, when the site starts. */
export function startArtStyle() {
  let id = 'pixel';
  try { id = keep?.getItem(KEY) || 'pixel'; } catch { /* private window: pixel */ }
  preferStyle(id);
}

/** The site's art style: a style id. */
export const siteStyle = () => preferredStyle();

/** Choose the site's art style, keep it, and tell the page (it draws again). */
export function setSiteStyle(id) {
  const now = preferStyle(id);
  try { keep?.setItem(KEY, now); } catch { /* not kept */ }
  window.dispatchEvent(new CustomEvent('loadout:artstyle', { detail: now }));
  return now;
}

/** The styles the toggle offers: every style of the site, in order, as { id, label, about }. */
export const toggleStyles = () => styleIds().map((id) => ({ id, label: styleById(id).label, about: styleById(id).about }));
