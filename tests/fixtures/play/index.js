// Fixture assets for the playground tests. They are not in the catalogue or the bag's storage:
// a test hands them to the open playground with
//   const fx = await import('/tests/fixtures/play/index.js');
//   await window.__loadoutPlay.addAssets(fx.topDown);
// and the playground treats them exactly like bag items (roles come from each sprite's meta).
import walker from './walker.js';
import tilesSide from './tiles-side.js';
import tilesTop from './tiles-top.js';
import backdrop from './backdrop.js';

import { icons, bar, menu } from './ui.js';

export { walker, tilesSide, tilesTop, backdrop, icons, bar, menu };
export const all = [walker, tilesSide, tilesTop, backdrop, icons, bar, menu];
/** Interface pieces for the score and health strip. */
export const display = [icons, bar, menu];
/** A top-down scene: the walker as the player in the fixture room. */
export const topDown = [walker, tilesTop];
/** Extras for a side-view scene: ground tiles and background layers. */
export const sideExtras = [tilesSide, backdrop];
