// The editing panel (app/panel.js) in browser tests: the right-hand column of an asset page.
/** The panel itself. */
export const panel = (page) => page.locator('.rx-panel');
/** Open one of the panel's Fine-tune tabs: 'shape' | 'parts' | 'colours' | 'motion' | 'sounds' | 'look' (a sound: 'tone' | 'timing' | 'character'). */
export async function openTab(page, id) {
  const tab = page.locator(`.rx-panel [role="tab"][data-tab="${id}"]`);
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
}
/** One control's row, by the control's key. It is in the page whichever tab is open; it is `hidden` while the control is not in effect. */
export const control = (page, key) => page.locator(`.rx-panel [data-control="${key}"]`);
/** Open the tab a control is in, and return its row. */
export async function showControl(page, key) {
  const row = control(page, key);
  await openTab(page, await row.evaluate((n) => n.closest('[data-pane]').dataset.pane));
  return row;
}
/** A part's block in the Parts tab, by the part's name as the page shows it ('Weapon'). */
export const partBlock = (page, title) => page.locator('.rx-panel .part').filter({ has: page.locator('.ctl.is-main .ctl-label', { hasText: new RegExp(`^\\s*${title}\\s*$`) }) });
/** The panel's Download button. */
export const downloadButton = (page) => page.locator('.rx-panel [data-act="download"]');
/** The saved state in the panel's footer ("Saved in your bag", "Changes save by themselves", or the not-kept warning). */
export const savedState = (page) => page.locator('.rx-panel .saved');
