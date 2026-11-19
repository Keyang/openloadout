// Everyday words for what an asset is, so plain search understands people who are not artists:
// "bad guy" finds the enemies, "money" the coins, "floor" the tiles. Data only; search/core.js applies it
// whenever a search index is built (the keyword index in the browser and the index file at build time),
// so a new asset gets these words from its kind, type and role with nothing to edit.
//
// Each entry: { when, words }
//   when    which assets it is for. Every key given must match; a list means any one of them.
//             kind    'sprite' | 'sound' | 'music'
//             type    an asset type (character, creature, tileset, sfx, music, ...)
//             role    a role, which also matches everything under it ('characters/enemy', 'music')
//             named   the asset's own name or words must hold one of these (for "money": only the pickups that are coins or gems)
//   words   what people call it. A phrase of several words ("bad guy") is found only when typed together, so
//           its parts ("bad", "guy") do not each make every enemy a result.
//
// Keep the words everyday: what a person would type, not what an artist or a programmer would.

const HOSTILE = ['characters/enemy', 'characters/boss'];
const CASH = ['coin', 'coins', 'gold', 'gem', 'jewel', 'credit', 'money', 'cash', 'currency', 'treasure'];
const HEALTHY = ['heart', 'health', 'life', 'heal', 'hp', 'medkit'];

export const EVERYDAY_WORDS = [
  // ---- characters
  { when: { kind: 'sprite', role: HOSTILE }, words: ['bad guy', 'bad', 'baddie', 'villain', 'foe', 'enemy', 'monster', 'opponent', 'evil', 'hostile', 'mob', 'creep', 'attacker'] },
  { when: { kind: 'sprite', role: 'characters/boss' }, words: ['boss', 'big boss', 'final boss', 'mini boss', 'boss fight', 'big bad', 'giant'] },
  { when: { kind: 'sprite', role: 'characters/player' }, words: ['good guy', 'hero', 'player', 'main character', 'protagonist', 'playable', 'player character', 'avatar'] },
  { when: { kind: 'sprite', role: 'characters/npc' }, words: ['npc', 'villager', 'townspeople', 'townsfolk', 'townsperson', 'friendly', 'shopkeeper', 'quest giver', 'bystander', 'non player'] },
  { when: { kind: 'sprite', role: 'characters/animal' }, words: ['animal', 'critter', 'pet', 'wildlife'] },
  { when: { kind: 'sprite', type: 'character' }, words: ['guy', 'person', 'people', 'dude', 'someone'] },

  // ---- items
  { when: { role: ['items/pickup', 'items/icon'], named: CASH }, words: ['money', 'cash', 'coin', 'loot', 'treasure', 'currency', 'gold', 'riches', 'score'] },
  { when: { role: ['items/pickup', 'items/food', 'items/key'], kind: 'sprite' }, words: ['collectible', 'pickup', 'item', 'goodie', 'bonus', 'collect'] },
  { when: { role: 'items/pickup', named: HEALTHY }, words: ['health', 'life', 'extra life', 'lives', 'one up', '1up', 'hp', 'heal', 'healing'] },
  { when: { role: 'items/food' }, words: ['health', 'healing', 'heal', 'restore', 'food', 'snack', 'eat', 'drink', 'consumable'] },
  { when: { role: 'items/key' }, words: ['key', 'unlock', 'keycard', 'pass', 'access'] },
  { when: { role: 'items/weapon' }, words: ['weapon', 'weapons', 'gear', 'equipment', 'arsenal'] },
  { when: { role: 'items/icon' }, words: ['inventory', 'item icon'] },
  { when: { role: ['items/consume', 'items/equip'] }, words: ['power up', 'upgrade', 'boost', 'buff'] },

  // ---- world
  { when: { type: 'tileset' }, words: ['floor', 'ground', 'wall', 'walls', 'terrain', 'tiles', 'land'] },
  { when: { kind: 'sprite', role: 'world/platform' }, words: ['platform', 'ledge', 'floor', 'ground', 'moving platform'] },
  { when: { role: 'world/hazard' }, words: ['trap', 'danger', 'dangerous', 'hazard', 'obstacle', 'deadly', 'harmful'] },
  { when: { role: 'world/door' }, words: ['door', 'gate', 'exit', 'entrance', 'doorway', 'unlock'] },
  { when: { role: 'world/building' }, words: ['house', 'home', 'building', 'shop', 'store', 'hut'] },
  { when: { role: 'world/chest' }, words: ['treasure', 'loot', 'chest', 'open chest', 'reward', 'unlock'] },
  { when: { role: 'world/prop', named: ['chest', 'cache', 'treasure'] }, words: ['treasure', 'loot', 'chest', 'reward', 'unlock'] },
  { when: { role: 'world/lever' }, words: ['switch', 'lever', 'toggle', 'pull', 'unlock'] },
  { when: { role: 'world/break' }, words: ['break', 'smash', 'shatter', 'destroy'] },
  { when: { role: 'world/crop' }, words: ['crop', 'plant', 'farm', 'harvest', 'vegetable'] },
  { when: { kind: 'sprite', role: 'world/prop' }, words: ['prop', 'object', 'decoration', 'decor', 'furniture'] },

  // ---- effects
  { when: { role: 'effects/explosion' }, words: ['boom', 'kaboom', 'blow up', 'blast', 'bomb', 'explode', 'explosion'] },
  { when: { role: 'effects/projectile' }, words: ['bullet', 'shot', 'shoot', 'gun', 'ammo', 'missile', 'pew'] },
  { when: { role: 'effects/impact' }, words: ['smash', 'crash', 'bang', 'thump', 'clang'] },
  { when: { role: 'effects/dust' }, words: ['dust', 'smoke', 'puff', 'poof', 'cloud'] },
  { when: { role: 'effects/spark' }, words: ['sparkle', 'flash', 'shine', 'glint', 'spark'] },
  { when: { role: ['effects/magic', 'actions/cast'] }, words: ['magic', 'spell', 'cast', 'sorcery', 'mana'] },
  { when: { role: 'effects/weather' }, words: ['weather', 'rain', 'snow', 'storm'] },

  // ---- environment
  { when: { type: 'background' }, words: ['sky', 'scenery', 'backdrop', 'background', 'landscape', 'parallax', 'setting', 'wallpaper'] },
  { when: { role: 'environment/ambience' }, words: ['background noise', 'ambient', 'atmosphere', 'mood', 'room tone'] },
  { when: { role: 'environment/weather' }, words: ['weather', 'wind', 'rain', 'storm'] },

  // ---- sounds of actions and characters
  { when: { role: 'actions/jump' }, words: ['jump', 'jumping', 'hop', 'leap', 'boing', 'bounce'] },
  { when: { role: 'actions/land' }, words: ['land', 'landing', 'thud', 'fall'] },
  { when: { role: 'actions/shoot' }, words: ['gun', 'shoot', 'shot', 'bullet', 'blast', 'pew', 'firing', 'gunshot'] },
  { when: { role: 'actions/swing' }, words: ['swing', 'slash', 'sword', 'whoosh', 'swoosh', 'attack', 'melee', 'swipe'] },
  { when: { role: 'actions/dash' }, words: ['dash', 'dodge', 'whoosh', 'swoosh', 'rush'] },
  { when: { role: ['actions/hit', 'characters/hurt'] }, words: ['ouch', 'oof', 'pain', 'hurt', 'damage', 'get hit', 'hit', 'injury'] },
  { when: { role: 'characters/footstep' }, words: ['footsteps', 'steps', 'walking', 'walking sound', 'walk', 'running', 'footfall'] },
  { when: { role: 'characters/death' }, words: ['dying', 'die', 'dies', 'death', 'dead', 'killed', 'defeat', 'defeated'] },
  { when: { role: 'characters/voice' }, words: ['voice', 'growl', 'roar', 'scream', 'shout', 'yell', 'grunt'] },

  // ---- interface
  { when: { role: 'interface/bar' }, words: ['health bar', 'hp', 'hp bar', 'life bar', 'lives', 'health', 'life', 'energy bar', 'mana bar', 'meter', 'gauge', 'hud', 'score'] },
  { when: { role: 'interface/button' }, words: ['button', 'buttons', 'press'] },
  { when: { role: 'interface/panel' }, words: ['menu', 'window', 'popup', 'pop up', 'box', 'dialog', 'text box', 'panel', 'frame'] },
  { when: { role: 'interface/cursor' }, words: ['cursor', 'mouse', 'mouse pointer', 'pointer', 'aim', 'crosshair', 'reticle'] },
  { when: { kind: 'sprite', role: 'interface/icon' }, words: ['icon', 'symbol', 'portrait'] },
  { when: { role: ['interface/click', 'interface/confirm', 'interface/hover'] }, words: ['button sound', 'menu sound', 'click', 'ui sound', 'beep', 'blip', 'tap', 'select'] },
  { when: { role: 'interface/error' }, words: ['wrong', 'denied', 'fail', 'error', 'nope', 'buzzer'] },
  { when: { role: ['interface/reward', 'music/victory'] }, words: ['win', 'won', 'winning', 'victory', 'success', 'level complete', 'level clear', 'well done', 'you win', 'reward', 'celebration', 'achievement'] },

  // ---- music
  { when: { kind: 'music' }, words: ['background music', 'bgm', 'soundtrack', 'song', 'tune'] },
  { when: { role: 'music/gameover' }, words: ['game over', 'lose', 'lost', 'losing', 'fail', 'defeat', 'sad'] },
  { when: { role: 'music/battle' }, words: ['fight', 'fight music', 'combat', 'battle', 'fighting', 'war'] },
  { when: { role: 'music/boss' }, words: ['boss fight', 'boss battle', 'final boss', 'fight', 'fight music', 'combat', 'epic'] },
  { when: { role: 'music/exploration' }, words: ['level music', 'exploring', 'adventure', 'calm', 'overworld', 'main theme'] },
  { when: { role: 'music/menu' }, words: ['title music', 'menu music', 'title screen', 'start screen'] },
  { when: { role: 'music/shop' }, words: ['shop', 'store', 'shopping'] },
];
