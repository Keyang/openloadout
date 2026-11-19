// Made in the Loadout studio. This file is data: open it in the studio (#/studio, "Open a file") to change it.
import { dataSprite } from '../engine/data-sprite.js';
export default dataSprite({
  "format": "loadout-sprite",
  "version": 1,
  "id": "road-bandit",
  "name": "Bandit",
  "blurb": "A masked robber for a battle screen, who clubs the party and snatches a bag of coins. Change the build, weapon, headgear, pack and colours.",
  "body": {
    "library": "humanoid",
    "figure": {
      "stance": "slouched",
      "body": {"height":0.5,"build":0.75,"head":0.5},
      "motion": {"bounce":0.5,"stride":0.5},
      "look": {"skin":"#f6d3b0","top":"#8e3a4a","bottom":"#c9a06a","boots":"#9a6a3e"},
      "hair": {"style":"short","colour":"#a8806a"},
      "held": {
        "kind": "club",
        "length": 1,
        "angle": 0,
        "metal": "#c2c9d6",
        "wood": "#9a6a3e",
        "hilt": "#f2c230",
        "cord": "#f0ead8"
      },
      "headgear": {"kind":"bandana","size":1,"colour":"#8e3a4a","band":"#8e3a4a"},
      "mask": {"colour":"#bfa068","drape":3},
      "coat": {"colour":"#8e3a4a","belt":"#bfa068","ragged":0.35,"length":0.42},
      "pack": {
        "kind": "none",
        "size": 1,
        "colour": "#c9a06a",
        "trim": "#9a6a3e",
        "leather": "#9a6a3e",
        "fletching": "#f0ead8",
        "shaft": "#a8806a"
      },
      "loot": {"colour":"#e6c96a","tie":"#9a6a3e","glint":"#f2c230"}
    },
    "paint": {
      "look.skin": "skin",
      "look.top": "outfit",
      "headgear.colour": {
        "rule": "choose",
        "when": {"headgear":["wide hat"]},
        "then": "trim",
        "else": "outfit"
      },
      "headgear.band": "outfit",
      "mask.colour": {"rule":"apart","of":"trim","from":[["outfit",0.3],["skin",0.19]]},
      "coat.colour": "outfit",
      "coat.belt": {"rule":"apart","of":"trim","from":[["outfit",0.3]]},
      "pack.trim": {
        "rule": "choose",
        "when": {"trim":["#c9a06a"]},
        "then": {"rule":"tone","of":"trim","by":-0.85},
        "else": "trim"
      }
    }
  },
  "meta": {
    "type": "character",
    "role": "characters/enemy",
    "view": "side",
    "license": "draft",
    "themes": ["fantasy"],
    "gameTypes": ["turn-based-rpg","platformer"],
    "words": [
      "bandit",
      "robber",
      "thief",
      "outlaw",
      "highwayman",
      "thug",
      "club",
      "kerchief",
      "steal",
      "attack",
      "walk",
      "ambush",
      "battle",
      "rough"
    ]
  },
  "size": [64,64],
  "grounded": true,
  "pivot": [28,58],
  "colours": {"skin":"#f6d3b0","outfit":"#8e3a4a","trim":"#9a6a3e"},
  "controls": [
    {
      "key": "height",
      "label": "Height",
      "lo": "Short",
      "hi": "Tall",
      "min": 0,
      "max": 1,
      "default": 0.5,
      "sets": "height"
    },
    {
      "key": "build",
      "label": "Build",
      "lo": "Slim",
      "hi": "Stocky",
      "min": 0,
      "max": 1,
      "default": 0.75,
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
      "options": ["club","cutlass","sling","none"],
      "default": "club"
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
      "options": ["bandana","wide hat","hood","none"],
      "default": "bandana"
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
      "key": "pack",
      "kind": "choice",
      "label": "Pack",
      "sets": "pack.kind",
      "options": ["none","loot sack","quiver"],
      "default": "none"
    },
    {
      "key": "packSize",
      "label": "Size",
      "lo": "Small",
      "hi": "Big",
      "min": 0.65,
      "max": 1.35,
      "step": 0.05,
      "default": 1,
      "sets": "pack.size"
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
      "label": "Coat",
      "swatches": ["#8e3a4a","#3f6fd1","#7a4fc4","#2f8f9d","#c9423a","#4f9d57"]
    },
    {
      "key": "trim",
      "kind": "colour",
      "label": "Kerchief and trim",
      "swatches": ["#9a6a3e","#c9a06a","#e6c96a","#a8a4a0","#c8553a","#f0ead8"]
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
    "pack": {
      "label": "Pack",
      "params": ["pack","packSize"],
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
        {"sound":"footstep-gravel","frame":0,"preset":"Boots","volume":0.45},
        {"sound":"footstep-gravel","frame":4,"preset":"Boots","volume":0.45}
      ]
    },
    "attack": {
      "label": "Attack",
      "frames": 8,
      "fps": 13,
      "loop": false,
      "keys": [],
      "sounds": [
        {"sound":"whoosh","frame":3,"preset":"Heavy swing","volume":0.7},
        {"sound":"punch","frame":4,"preset":"Heavy body blow","volume":0.85}
      ]
    },
    "steal": {
      "label": "Steal",
      "frames": 8,
      "fps": 13,
      "loop": false,
      "keys": [],
      "sounds": [
        {"sound":"whoosh","frame":3,"preset":"Quick swipe","volume":0.7},
        {"sound":"coin-pickup","frame":5,"preset":"Dull token","volume":0.7}
      ]
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
      "sounds": [{"sound":"monster-fade","frame":0,"preset":"Monster fades","volume":1}]
    }
  },
  "preview": "walk",
  "made": {"in":"studio","from":"library:road-bandit"}
});
