// Fixture assets for the playground tests. They are not in the catalogue or the bag's storage:
// a test hands them to the open playground with
//   const fx = await import('/tests/fixtures/play/index.js');
//   await window.__loadoutPlay.addAssets(fx.topDown);
// and the playground treats them exactly like bag items (roles come from each sprite's meta).
import walker from './walker.js';
import tilesSide from './tiles-side.js';
import tilesTop from './tiles-top.js';
import backdrop from './backdrop.js';

export { walker, tilesSide, tilesTop, backdrop };
export const all = [walker, tilesSide, tilesTop, backdrop];
/** A top-down scene: the walker as the player in the fixture room. */
export const topDown = [walker, tilesTop];
/** Extras for a side-view scene: ground tiles and background layers. */
export const sideExtras = [tilesSide, backdrop];
