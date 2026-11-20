// engine/surface.js as the ported helpers in this folder see it (migration batch M9): `Surface` is
// engine/gen/port-surface.js PortSurface (paint refs, the same calls and geometry); the shape tests are engine/surface.js's
// own. A helper copied here with its `./surface.js` import pointed at this module draws on paint-ref grids, and the
// grids it makes for itself share the running port's paint table (withPaintTable), so blitting them keeps their paints.
/** The paint-ref grid the ported helpers draw on, under engine/surface.js's name. */
export { PortSurface as Surface } from '../port-surface.js';
/** The site's pure shape tests (engine/surface.js), unchanged. */
export { ellipseIn, polyIn, rectIn, capsuleIn } from '../../surface.js';
