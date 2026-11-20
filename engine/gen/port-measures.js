// The slices and text areas (Contract 8) of migration batch M9's port generators, for the panel layout (engine/gen/ui.js
// finds a piece's measure in engine/gen/ui-pieces.js UI_MEASURES, which spreads this in). Importing the port family
// modules here first makes sure every port generator with a measure is declared before the set is frozen.
import './ui-inputs.js';
import './ui-hud.js';
import './ui-bubbles.js';
import { portMeasures } from './port-sprite.js';

/** "<id>@<v>" -> (args with defaults, ctx) -> { slice?, textArea? } in the call's pixels, for every M9 port generator that measures (engine/gen/port-sprite.js). */
export const PORT_MEASURES = Object.freeze(portMeasures());
