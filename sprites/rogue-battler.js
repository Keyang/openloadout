// Converted from code to data for the Loadout library. This file is data, not code: the build refuses it with anything else in it.
import { dataSprite } from '../engine/data-sprite.js';
export default dataSprite({
  "format": "loadout-sprite",
  "version": 1,
  "id": "rogue-battler",
  "name": "Rogue",
  "blurb": "A hooded rogue for a battle screen or a platformer, who stabs twice, throws a knife and tosses a dagger to cheer. Change the build, hood, scarf, blades and colours.",
  "body": {
    "library": "humanoid",
    "figure": {
      "stance": "crouched",
      "moves": {"attack":"stab","shoot":"throw","victory":"toss"},
      "body": {"height":0.45,"build":0.3,"head":0.5},
      "motion": {"bounce":0.5,"stride":0.5},
      "look": {"skin":"#f6d3b0","top":"#2f8f9d","bottom":"#19708e","boots":"#5a5f7a"},
      "hair": {"style":"short","colour":"#e6c96a"},
      "held": {
        "kind": "daggers",
        "length": 1,
        "angle": 0,
        "metal": "#c2c9d6",
        "hilt": "#f2c230"
      },
      "headgear": {"kind":"hood","size":1,"colour":"#2f8f9d"},
      "scarf": {"kind":"long","length":1,"colour":"#5a5f7a"},
      "belt": {"colour":"#5a5f7a","buckle":"#c2c9d6"},
      "thrown": {"metal":"#c2c9d6","hilt":"#9a6a3e"}
    },
    "paint": {
      "look.skin": "skin",
      "look.top": "outfit",
      "look.bottom": {"rule":"tone","of":"outfit","by":-0.6},
      "look.boots": {"rule":"apart","of":"trim","from":["outfit"],"least":0.05},
      "held.metal": "metal",
      "headgear.colour": "outfit",
      "scarf.colour": {"rule":"apart","of":"trim","from":["outfit"],"least":0.05},
      "belt.colour": {"rule":"apart","of":"trim","from":["outfit"],"least":0.05}
    }
  },
  "meta": {
    "type": "character",
    "role": "characters/player",
    "view": "side",
    "license": "draft",
    "themes": ["fantasy"],
    "gameTypes": ["turn-based-rpg","platformer"],
    "words": [
      "rogue",
      "thief",
      "assassin",
      "ninja",
      "party member",
      "hood",
      "scarf",
      "daggers",
      "stab",
      "throw",
      "run",
      "jump",
      "sneaky",
      "battle"
    ]
  },
  "size": [64,64],
  "grounded": true,
  "pivot": [28,58],
  "colours": {"skin":"#f6d3b0","outfit":"#2f8f9d","trim":"#5a5f7a","metal":"#c2c9d6"},
  "controls": [
    {
      "key": "height",
      "label": "Height",
      "lo": "Short",
      "hi": "Tall",
      "min": 0,
      "max": 1,
      "default": 0.45,
      "sets": "height"
    },
    {
      "key": "build",
      "label": "Build",
      "lo": "Slim",
      "hi": "Stocky",
      "min": 0,
      "max": 1,
      "default": 0.3,
      "sets": "build"
    },
    {
      "key": "head",
      "label": "Head",
      "lo": "Small",
      "hi": "Big",
      "min": 0,
      "max": 1,
      "default": 0.5,
      "sets": "head"
    },
    {
      "key": "weapon",
      "kind": "choice",
      "label": "Weapon",
      "sets": "held.kind",
      "options": ["daggers","short sword","claws","none"],
      "default": "daggers"
    },
    {
      "key": "weaponLength",
      "label": "Length",
      "lo": "Short",
      "hi": "Long",
      "min": 0.65,
      "max": 1.35,
      "step": 0.05,
      "default": 1,
      "sets": "held.length"
    },
    {
      "key": "weaponAngle",
      "label": "Hold angle",
      "lo": "Upright",
      "hi": "Forward",
      "min": -10,
      "max": 40,
      "step": 1,
      "default": 0,
      "sets": "held.angle"
    },
    {
      "key": "headgear",
      "kind": "choice",
      "label": "Headgear",
      "sets": "headgear.kind",
      "options": ["hood","bandana","mask","none"],
      "default": "hood"
    },
    {
      "key": "headgearSize",
      "label": "Size",
      "lo": "Small",
      "hi": "Big",
      "min": 0.5,
      "max": 1.8,
      "step": 0.05,
      "default": 1,
      "sets": "headgear.size"
    },
    {
      "key": "scarf",
      "kind": "choice",
      "label": "Scarf",
      "sets": "scarf.kind",
      "options": ["short","long","none"],
      "default": "long"
    },
    {
      "key": "scarfLength",
      "label": "Length",
      "lo": "Short",
      "hi": "Long",
      "min": 0.65,
      "max": 1.35,
      "step": 0.05,
      "default": 1,
      "sets": "scarf.length"
    },
    {
      "key": "skin",
      "kind": "colour",
      "label": "Skin",
      "swatches": ["#f6d3b0","#e8b088","#c98a5c","#9a6240","#6e4428","#9bd18a","#b9a7e0"]
    },
    {
      "key": "outfit",
      "kind": "colour",
      "label": "Outfit",
      "swatches": [
        "#2f8f9d",
        "#3f6fd1",
        "#7a4fc4",
        "#c9423a",
        "#8e3a4a",
        "#4f9d57",
        "#e08a2c",
        "#e6c545"
      ]
    },
    {
      "key": "trim",
      "kind": "colour",
      "label": "Scarf and trim",
      "swatches": [
        "#5a5f7a",
        "#a8a4a0",
        "#c9423a",
        "#f2c230",
        "#c8553a",
        "#2f8f9d",
        "#7a4fc4",
        "#f0ead8"
      ]
    },
    {
      "key": "metal",
      "kind": "colour",
      "label": "Metal",
      "swatches": [
        "#c2c9d6",
        "#f2c230",
        "#a8a4a0",
        "#a8806a",
        "#5a5f7a",
        "#8f97a8",
        "#e6c545",
        "#c98a4a"
      ],
      "when": {"weapon":["daggers","short sword","claws"]}
    },
    {
      "key": "bounce",
      "label": "Bounce",
      "lo": "Calm",
      "hi": "Bouncy",
      "min": 0,
      "max": 1,
      "default": 0.5,
      "sets": "motion.bounce",
      "group": "Motion"
    },
    {
      "key": "stride",
      "label": "Stride",
      "lo": "Small steps",
      "hi": "Big steps",
      "min": 0,
      "max": 1,
      "default": 0.5,
      "sets": "motion.stride",
      "group": "Motion"
    },
    {"key":"speed","standard":"speed"}
  ],
  "parts": {
    "weapon": {
      "label": "Weapon",
      "params": ["weapon","weaponLength","weaponAngle"],
      "none": "none",
      "socket": "hand"
    },
    "headgear": {
      "label": "Headgear",
      "params": ["headgear","headgearSize"],
      "none": "none",
      "socket": "head"
    },
    "scarf": {
      "label": "Scarf",
      "params": ["scarf","scarfLength"],
      "none": "none",
      "socket": "back"
    }
  },
  "clips": {
    "idle": {"label":"Idle","frames":8,"fps":7,"loop":true,"keys":[]},
    "walk": {
      "label": "Walk",
      "frames": 8,
      "fps": 10,
      "loop": true,
      "keys": [],
      "sounds": [
        {"sound":"footstep-gravel","frame":0,"preset":"Sneaking","volume":0.45},
        {"sound":"footstep-gravel","frame":4,"preset":"Sneaking","volume":0.45}
      ]
    },
    "run": {
      "label": "Run",
      "frames": 8,
      "fps": 14,
      "loop": true,
      "keys": [],
      "sounds": [
        {"sound":"footstep-gravel","frame":0,"preset":"Sneaking","volume":0.45},
        {"sound":"footstep-gravel","frame":4,"preset":"Sneaking","volume":0.45}
      ]
    },
    "jump": {
      "label": "Jump",
      "frames": 8,
      "fps": 11,
      "loop": false,
      "keys": [],
      "sounds": [{"sound":"jump","frame":2,"preset":"Tiny hop","volume":0.7}]
    },
    "attack": {
      "label": "Stab",
      "frames": 8,
      "fps": 13,
      "loop": false,
      "keys": [],
      "sounds": [
        {"sound":"sword-slash","frame":3,"preset":"Quick dagger","volume":0.7,"when":{"weapon":["daggers","short sword","claws"]}},
        {"sound":"whoosh","frame":3,"preset":"Quick swipe","volume":0.7,"when":{"weapon":["none"]}}
      ]
    },
    "shoot": {
      "label": "Throw",
      "frames": 6,
      "fps": 14,
      "loop": false,
      "keys": [],
      "sounds": [{"sound":"whoosh","frame":1,"preset":"Quick swipe","volume":0.85}]
    },
    "hurt": {
      "label": "Hurt",
      "frames": 4,
      "fps": 9,
      "loop": false,
      "keys": [],
      "frameEdits": {"0":{"flash":true}},
      "sounds": [{"sound":"punch","frame":0,"preset":"Light jab","volume":0.9}]
    },
    "die": {
      "label": "Die",
      "frames": 8,
      "fps": 10,
      "loop": false,
      "keys": [],
      "frameEdits": {"0":{"flash":true}},
      "sounds": [{"sound":"punch","frame":0,"preset":"Heavy body blow","volume":1}]
    },
    "victory": {"label":"Victory","frames":8,"fps":8,"loop":true,"keys":[]}
  },
  "preview": "walk",
  "made": {"in":"library","from":"code:rogue-battler"}
});
