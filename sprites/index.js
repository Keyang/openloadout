// The gallery. Add a new sprite by importing it here and adding it to the list.
import knight from './knight.js';
import wizard from './wizard.js';
import wolf from './wolf.js';
import slime from './slime.js';
import bat from './bat.js';
import coin from './coin.js';
import campfire from './campfire.js';

export const sprites = [knight, wizard, wolf, slime, bat, coin, campfire];
export const byId = Object.fromEntries(sprites.map((s) => [s.id, s]));
