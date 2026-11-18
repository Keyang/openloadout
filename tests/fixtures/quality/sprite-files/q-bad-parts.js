// A sprite file that cannot be defined: its part lists a key that is not a control,
// so defineSprite throws while the file loads. The checker must report it, not crash.
import { partMissingKey } from '../sprites.mjs';
export default partMissingKey();
