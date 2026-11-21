// The two contrast rules of the style guide, section 8, over EVERY interface sprite in sprites/
// (no list of ids: a new sprite of type `ui` is picked up by itself):
//   white text keeps 4.5 to 1 on a text area, and the frame or lit edge keeps 3 to 1 against it,
//   as made and under every whole-bundle look, for every face and frame swatch and every style.
// A sprite with a colour control named `face` says where its text goes with `textArea(clip, p)`,
// or marks a clip that never carries text `noText: true` (engine/ui.js, CONTRAST). The checking
// itself is contrastFaults() in the helper; the first half of this file tests that on made-up sprites.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defineSprite, range, choice, color } from '../../engine/sprite.js';
import { Surface } from '../../engine/surface.js';
import { librarySprites, libraryCoverage } from '../helpers/library.mjs';

// a code file or a data file (tests/helpers/library.mjs); a file that cannot be loaded is the checker's to report
let found = 0;
test('the scan covers every sprite file, code and data alike, and names any that did not load', async (t) => t.diagnostic(await libraryCoverage()));
