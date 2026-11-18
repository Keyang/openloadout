#!/usr/bin/env node
// Writes tests/fixtures/search/catalog.json: a stand-in catalogue in the Contract 4 shape,
// written from the lists in docs/asset-taxonomy.md so that search can be tested at the size
// the real library is heading for. No art or sound exists for these entries.
//
//   node tests/fixtures/search/make-catalog.mjs
//
// Each line below is:  id | name | themes | game types | words | description
// Game types: P platformer, R top-down-rpg, F farming-sim, S shooter, Z puzzle, C card-game, * all.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const GAME = { P: 'platformer', R: 'top-down-rpg', F: 'farming-sim', S: 'shooter', Z: 'puzzle', C: 'card-game' };
const AUDIO = new Set(['sfx', 'ambience', 'jingle', 'music']);
const assets = [];

function add({ type, role, view = 'none' }, text) {
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const p = line.split('|').map((x) => x.trim());
    if (p.length !== 6) throw new Error('bad line: ' + line);
    const [id, name, themes, games, words, description] = p;
    const kind = type === 'music' ? 'music' : AUDIO.has(type) ? 'sound' : 'sprite';
    const gameTypes = games === '*' ? Object.values(GAME) : games.split(',').map((g) => {
      if (!GAME[g]) throw new Error('bad game type in: ' + line);
      return GAME[g];
    });
    const a = {
      id, kind, name, description, type, role,
      themes: themes.split(',').map((t) => t.trim()),
      gameTypes,
      view: kind === 'sprite' ? view : 'none',
      words: words.split(/\s+/),
      license: 'draft',
      bundles: [],
      src: kind === 'sprite' ? `sprites/${id}.js` : `sounds/${id}.json`,
    };
    assets.push(a);
  }
}

// ------------------------------------------------------------------ characters
add({ type: 'character', role: 'characters/player', view: 'side' }, `
knight | Hero knight | fantasy | P,R | knight hero sword warrior armor fight | A brave armoured adventurer with idle, run, jump, sword attack, hurt and die animations.
wizard | Wizard | fantasy | P,R | mage sorcerer magic staff spell robe | A robed spellcaster who walks, casts with a staff and teleports.
archer | Ranger | fantasy,forest | P,R | archer bow arrow hood hunter | A hooded archer who runs, jumps and draws a longbow.
rogue | Thief | fantasy,dungeon | P,R | rogue ninja dagger stealth sneak | A quick thief with daggers, a roll and a sneaking walk.
astronaut | Astronaut | space,sci-fi | P,S | spacesuit helmet jetpack explorer | A space explorer in a white suit with a jetpack hover.
robot-hero | Robot hero | sci-fi | P,S | android bot mech machine | A small friendly robot that rolls, jumps and fires an arm blaster.
space-marine | Space marine | sci-fi,space | S,P | soldier trooper rifle gun armor | An armoured trooper who runs and aims a rifle in eight directions.
pirate | Pirate captain | neutral | P | pirate sailor cutlass hat sea | A swaggering captain with a cutlass slash and a pistol shot.
diver | Diver | underwater | P | scuba swim ocean flippers | A scuba diver who swims in every direction and trails bubbles.
`);
add({ type: 'character', role: 'characters/player', view: 'top-down' }, `
farmer | Farmer | farm | F | farmer villager hoe tools plant harvest | Top-down farmer in four directions with hoe, watering can, axe, pickaxe and scythe animations.
angler | Angler | farm,neutral | F | fishing rod cast reel fisher | Top-down character who casts a line, waits and reels in a catch.
adventurer | Adventurer | fantasy | R | hero sword shield walk explore | Top-down hero with a four-direction walk, sword slash and shield raise.
space-pilot-ship | Fighter ship | space | S | spaceship player ship fighter jet | The player's small starfighter seen from above, with banking and thruster frames.
`);
add({ type: 'creature', role: 'characters/enemy', view: 'side' }, `
slime | Slime | fantasy,dungeon | P,R | blob jelly ooze monster bounce | A wobbling green blob that hops toward the player and splats when beaten.
bat | Bat | dungeon,horror | P,R | flying wings cave vampire night | A small winged cave dweller that flaps, swoops and hangs upside down.
wolf | Wolf | forest | P,R | beast dog howl bite predator | A grey wolf that prowls, lunges and howls.
skeleton | Skeleton | dungeon,horror | P,R | bones undead warrior crypt | A walking pile of bones that swings a rusty sword and collapses.
zombie | Zombie | horror | P,S,R | undead walker corpse shamble | A shambling corpse with outstretched arms and a slow bite.
ghost | Ghost | horror | P,R | spirit phantom haunt float spooky | A pale floating spirit that fades in and out and drifts through walls.
goblin | Goblin | fantasy,dungeon | P,R | grunt green club raider | A small green raider with a club and a cowardly run.
orc | Orc brute | fantasy | P,R | ogre brute axe heavy | A hulking brute with a slow overhead axe smash.
spider | Spider | dungeon,forest | P,R | bug web crawl arachnid | An eight-legged crawler that drops on a thread and scuttles.
mushroom-walker | Walking mushroom | forest,fantasy | P | fungus toadstool stomp goomba | A grumpy toadstool on legs that can be stomped flat.
alien-grunt | Alien grunt | space,sci-fi | S,P | invader extraterrestrial martian soldier | A green invader that marches and fires a ray gun.
flying-saucer | Flying saucer | space | S | ufo alien ship invader hover | A hovering alien craft that weaves and drops bombs.
drone | Security drone | sci-fi,city | S,P | robot flying camera patrol | A hovering patrol machine with a scanning light.
robot-guard | Robot guard | sci-fi | S,P | android sentinel mech patrol | A heavy two-legged machine that patrols and charges.
mummy | Mummy | desert,horror | P,R | bandages tomb undead pharaoh | A bandaged tomb guardian with a slow reaching walk.
vampire | Vampire | horror | P,R | dracula cape fangs undead | A caped count who turns into mist and bites.
witch | Witch | horror,fantasy | P,R | broom hag curse potion flying | A cackling hag who rides a broom and throws potions.
gummy-bear | Gummy bear | candy | P | jelly sweet bear bounce | A squishy sweet bear that bounces and tumbles.
yeti | Yeti | snow | P,R | bigfoot abominable beast ice | A shaggy mountain giant that pounds the ground.
floating-eye | Floating eye | dungeon,horror | P,R | eyeball beholder watcher stare | A hovering eyeball that tracks the player and fires a beam.
mimic | Mimic | dungeon | P,R | chest monster trap fake teeth | A monster disguised as a treasure chest that springs open with teeth.
`);
add({ type: 'creature', role: 'characters/boss', view: 'side' }, `
dragon | Dragon | fantasy | P,R | wyrm drake fire breath wings boss | A huge winged reptile that breathes fire, swoops and roars.
slime-king | Slime king | fantasy,dungeon | P,R | giant blob crown boss | A giant crowned blob that splits into smaller ones.
lich | Lich lord | dungeon,horror | P,R | skeleton king necromancer undead boss | A robed skeleton sorcerer who raises the dead.
kraken | Kraken | underwater | P | squid octopus tentacle sea boss | A giant squid whose tentacles rise from the deep.
mothership | Mothership | space | S | alien capital ship boss ufo | A screen-wide alien vessel with gun ports and a weak core.
mech-boss | War mech | sci-fi | S,P | giant robot walker boss machine | A towering walking machine with missile pods.
demon-lord | Demon lord | dungeon,horror | P,R | devil final boss horns hell | A horned ruler of the underworld with two phases.
`);
add({ type: 'character', role: 'characters/npc', view: 'top-down' }, `
shopkeeper | Shopkeeper | fantasy,farm | R,F | merchant vendor store seller trader | A friendly store owner who stands behind a counter and waves.
blacksmith | Blacksmith | fantasy | R | smith forge hammer craftsman | A burly smith hammering at an anvil.
villager-woman | Villager (woman) | farm,fantasy | R,F | townsfolk npc resident walk | A townswoman with a walk cycle and a talking animation.
villager-man | Villager (man) | farm,fantasy | R,F | townsfolk npc resident walk | A townsman with a walk cycle and a talking animation.
old-sage | Old sage | fantasy | R | elder wise mentor beard | A bearded elder who leans on a stick and nods.
fisherman | Fisherman | farm,neutral | F,R | fisher boat old sailor | An old sailor mending nets on the dock.
scientist | Scientist | sci-fi | P,S,Z | professor lab doctor coat | A lab-coated professor who fiddles with a gadget.
villager-portraits | Villager portraits | farm,fantasy | F,R | face dialogue expressions talk emotion | Dialogue portraits for six villagers, each neutral, happy, sad and angry.
`);
add({ type: 'creature', role: 'characters/animal', view: 'top-down' }, `
chicken | Chicken | farm | F | hen bird poultry egg peck | A farm bird that walks, pecks and sleeps, with a chick version.
cow | Cow | farm | F | cattle milk dairy graze | A spotted dairy animal that walks, grazes and lies down.
sheep | Sheep | farm | F | wool lamb flock graze | A woolly animal that walks, grazes and can be sheared.
pig | Pig | farm | F | hog swine truffle mud | A pink farm animal that trots and roots in the mud.
horse | Horse | farm,fantasy | F,R | pony ride mount gallop | A rideable mount with walk and gallop in four directions.
dog | Dog | farm,city | F,R | puppy pet companion fetch | A loyal pet that sits, runs and wags its tail.
cat | Cat | farm,city | F,R | kitten pet sleep purr | A house pet that stretches, walks and curls up.
rabbit | Rabbit | farm,forest | F,R | bunny hop hare | A long-eared hopper that nibbles and bolts.
songbird | Songbird | forest,farm | F,R,P | bird sparrow fly perch | A tiny bird that perches, hops and flies away when approached.
frog | Frog | forest | F,P | toad hop pond croak | A pond hopper that sits, croaks and leaps.
`);

// ------------------------------------------------------------------ world
add({ type: 'tileset', role: 'world/tile', view: 'side' }, `
tiles-grassland | Grassland tiles | forest,neutral | P | ground grass dirt platform level | Side-view ground, ledges and slopes with grassy tops and earth below.
tiles-dungeon | Dungeon brick tiles | dungeon | P | stone wall bricks castle crypt | Mossy stone bricks, floors, pillars and arches for underground levels.
tiles-cave | Cave rock tiles | dungeon,neutral | P | cavern rocks underground stalactite | Rough rock walls, floors and hanging stalactites.
tiles-castle | Castle wall tiles | fantasy | P | battlement fortress stone rampart | Fortress walls, battlements, windows and banners.
tiles-snow | Snow and ice tiles | snow | P | winter frozen slippery glacier | Snow-capped ground and slippery blue ice blocks.
tiles-desert | Desert sand tiles | desert | P | dunes sandstone pyramid dry | Sand dunes, sandstone blocks and ruined pillars.
tiles-station | Space station tiles | sci-fi,space | P,S | metal panels corridor tech hull | Metal floor panels, bulkheads, vents and pipes.
tiles-asteroid | Asteroid tiles | space | P,S | moon rock crater alien planet | Cratered grey rock with glowing crystals.
tiles-candy | Candy land tiles | candy | P | sweets chocolate frosting biscuit | Chocolate ground with frosting tops and wafer platforms.
tiles-seabed | Seabed tiles | underwater | P | coral reef ocean floor sand | Sandy sea floor with coral, shells and seaweed.
tiles-graveyard | Graveyard tiles | horror | P | cemetery haunted fence dead ground | Dead earth, iron fences and crooked stone paths.
tiles-city | City street tiles | city | P,S | road pavement building urban rooftop | Pavement, brick walls, rooftops and fire escapes.
`);
add({ type: 'tileset', role: 'world/tile', view: 'top-down' }, `
tiles-farm-spring | Farm tiles, spring | farm | F | grass paths blossoms season outdoor | Top-down grass, paths, flowers and trees in fresh spring colours.
tiles-farm-summer | Farm tiles, summer | farm | F | grass paths bright season outdoor | Top-down grass, paths and full green trees in strong summer light.
tiles-farm-fall | Farm tiles, fall | farm | F | autumn leaves orange season outdoor | Top-down grass, paths and trees in orange and brown autumn colours.
tiles-farm-winter | Farm tiles, winter | farm,snow | F | snow frost bare season outdoor | Top-down snow-covered ground, icy paths and bare trees.
tiles-soil | Soil states | farm | F | dirt tilled watered field plot | One field tile drawn untilled, tilled, watered and fertilised.
tiles-interior | House interior tiles | farm,neutral | F,R | floor wallpaper room indoor wood | Wooden floors, walls, rugs and windows for indoor rooms.
tiles-town | Town path tiles | fantasy,farm | R,F | cobblestone road village plaza | Cobbled roads, plazas, kerbs and flower beds.
tiles-dungeon-topdown | Dungeon floor tiles | dungeon | R | stone rooms corridor wall pit | Top-down stone floors, walls, pits and doorways.
tiles-puzzle-board | Puzzle board tiles | neutral | Z | grid cell board checker square | Light and dark grid squares with highlighted and blocked states.
`);
add({ type: 'prop', role: 'world/prop', view: 'side' }, `
chest | Treasure chest | fantasy,dungeon | P,R | loot box reward open gold | A wooden chest banded with iron, with closed, opening and open frames.
crate | Wooden crate | neutral | P,S | box breakable container smash | A breakable wooden box with intact, cracked and shattered frames.
barrel | Barrel | neutral,fantasy | P,R | keg cask container explosive | A wooden cask, with a red explosive version.
wall-torch | Wall torch | dungeon,fantasy | P,R | flame light sconce fire | A flickering flame in an iron wall bracket.
campfire | Campfire | forest,neutral | P,R,F | bonfire fire logs camp rest | Crackling logs with dancing flames and rising sparks.
signpost | Signpost | neutral | P,R,F | sign board arrow direction notice | A wooden post with a blank board and an arrow version.
lever | Lever | dungeon,neutral | P,Z | switch handle pull toggle | A floor switch with a handle that tilts left or right.
pressure-plate | Pressure plate | dungeon,neutral | P,Z | floor button switch step trigger | A floor plate that sinks when something stands on it.
ladder | Ladder | neutral | P | climb rungs wood | A wooden climbing frame that tiles vertically.
checkpoint-flag | Checkpoint flag | neutral | P | save respawn pole banner | A flag that rises and waves when the player reaches it.
tree-oak | Oak tree | forest,farm | P,R,F | wood leaves nature trunk | A broad leafy tree with a swaying crown.
tree-pine | Pine tree | forest,snow | P,R,F | fir evergreen conifer wood | A tall evergreen, with a snow-dusted version.
boulder | Boulder | neutral | P,R,F | rock stone obstacle mine | A large grey rock that can be pushed or broken.
fence | Fence | farm | F,R | wooden rail gate boundary | Wooden rails with corner, end and gate pieces.
tombstone | Tombstone | horror | P,R | grave headstone cemetery rip | A cracked stone grave marker, with a cross version.
bed | Bed | neutral,farm | R,F | sleep furniture rest bedroom | A wooden bed with a patterned quilt.
anvil | Anvil | fantasy | R | forge smithing metal craft | A heavy iron block with a glowing workpiece.
cauldron | Cauldron | fantasy,horror | R,P | pot brew witch bubbling potion | A black pot of bubbling green brew.
crystal-cluster | Crystal cluster | dungeon,fantasy | P,R | gem mineral glow cave shard | A glowing clump of pointed crystals.
scarecrow | Scarecrow | farm | F | straw field crow guard | A straw figure on a pole with a floppy hat.
control-console | Control console | sci-fi,space | P,S | computer terminal panel screen buttons | A blinking computer panel with a flickering screen.
vending-machine | Vending machine | city | P,R | drinks snack dispenser machine | A glowing drinks dispenser with a flickering light.
`);
add({ type: 'prop', role: 'world/door', view: 'side' }, `
door-wood | Wooden door | fantasy,neutral | P,R | entrance exit open gate | A plank door that swings open, with a locked version.
gate-iron | Iron gate | dungeon,fantasy | P,R | portcullis bars castle barrier | A barred gate that slides up into the ceiling.
portal | Portal | fantasy,sci-fi | P,R,Z | teleport gateway warp doorway swirl | A swirling glowing gateway that carries the player to another place.
airlock | Airlock door | sci-fi,space | P,S | hatch sliding bulkhead door | A metal hatch that slides apart with warning lights.
`);
add({ type: 'prop', role: 'world/platform', view: 'side' }, `
moving-platform | Moving platform | neutral | P | lift elevator floating ride | A floating slab that carries the player along a path.
spring-pad | Spring pad | neutral | P | trampoline bounce jump launcher | A coiled pad that squashes and flings the player upward.
conveyor | Conveyor belt | sci-fi,city | P,Z | belt factory moving floor | A rolling belt that pushes whatever stands on it.
`);
add({ type: 'prop', role: 'world/hazard', view: 'side' }, `
spikes | Floor spikes | dungeon,neutral | P | trap danger pointed sharp | Rows of pointed metal spikes that damage anything touching them.
saw-blade | Saw blade | dungeon,sci-fi | P | spinning trap buzzsaw danger | A spinning circular blade on a track.
lava-pool | Lava pool | dungeon | P | magma fire molten danger | A bubbling molten surface that tiles sideways.
laser-gate | Laser gate | sci-fi | P,S | beam barrier security trap | A red beam that switches on and off between two emitters.
`);
add({ type: 'prop', role: 'world/building', view: 'top-down' }, `
farmhouse | Farmhouse | farm | F | home cottage house building | A cosy wooden house with a chimney and a porch.
barn | Barn | farm | F | animals shed red building | A big red building for cows and sheep.
coop | Chicken coop | farm | F | henhouse poultry building | A small raised hut for chickens.
shop-stall | Market stall | fantasy,farm | R,F | store stand booth trade | A striped awning over a counter of goods.
windmill | Windmill | farm,fantasy | F,R | mill blades grain turning | A stone tower with slowly turning sails.
furnace | Furnace | farm,fantasy | F,R | smelter machine oven fire | A stone smelter drawn unlit and glowing while working.
sprinkler | Sprinkler | farm | F | water irrigation machine spray | A garden device that sprays water in a circle.
`);

// crops: a family, as in a farming game
const CROPS = [
  ['wheat', 'Wheat', 'grain cereal bread golden'], ['corn', 'Corn', 'maize cob tall yellow'],
  ['tomato', 'Tomato', 'vine red vegetable'], ['carrot', 'Carrot', 'root orange vegetable'],
  ['pumpkin', 'Pumpkin', 'gourd squash orange autumn'], ['strawberry', 'Strawberry', 'berry fruit red'],
  ['sunflower', 'Sunflower', 'flower tall yellow seeds'],
];
for (const [id, name, words] of CROPS) {
  add({ type: 'prop', role: 'world/crop', view: 'top-down' },
    `crop-${id} | ${name} crop | farm | F | ${words} plant grow harvest | ${name} drawn as a strip of growth stages from seed and sprout to ripe.`);
}

// ------------------------------------------------------------------ items
add({ type: 'pickup', role: 'items/pickup', view: 'side' }, `
coin | Gold coin | neutral,fantasy | P,R,S | money gold cash collect currency | A spinning gold piece with a glint, and a collected sparkle.
gem | Gem | fantasy,neutral | P,R,Z | jewel diamond ruby emerald crystal | A faceted jewel that turns and flashes, in red, green and blue.
heart | Heart | neutral | P,R,S | health life hp heal | A pulsing red heart that restores health.
star | Star | neutral | P,Z | bonus invincible collect shine | A twinkling yellow star.
power-mushroom | Power mushroom | fantasy,forest | P | powerup grow boost upgrade | A spotted mushroom that slides along the ground and makes the player bigger.
ammo-box | Ammo box | sci-fi,city | S | bullets ammunition supply crate | A small green crate of ammunition.
shield-orb | Shield orb | sci-fi,fantasy | S,P | protection barrier bubble powerup | A glowing blue ball that gives a protective bubble.
extra-life | Extra life | neutral | P,S | 1up one-up continue bonus | A small token of the hero's face that grants another try.
energy-cell | Energy cell | sci-fi,space | S,P | battery power fuel charge | A glowing battery that refills energy.
loot-bag | Loot bag | fantasy | R,P | sack treasure gold drop pouch | A bulging sack of treasure dropped by defeated enemies.
bomb-pickup | Bomb | neutral | P,S,R | explosive grenade fuse blast | A round black explosive with a fizzing fuse.
`);
add({ type: 'pickup', role: 'items/key', view: 'side' }, `
key-gold | Gold key | fantasy,dungeon | P,R,Z | unlock door open lock | A shiny key that bobs and glints.
keycard | Keycard | sci-fi | P,S,Z | pass access unlock security | A coloured access card in red, blue and yellow.
boss-key | Boss key | dungeon | R,P | skull unlock big ornate | A large ornate key with a skull bow.
`);
add({ type: 'pickup', role: 'items/food', view: 'side' }, `
potion-health | Health potion | fantasy | P,R | red flask heal elixir drink hp | A round flask of red liquid that restores health when drunk.
potion-mana | Mana potion | fantasy | P,R | blue flask magic elixir drink mp | A tall flask of blue liquid that restores magic.
apple | Apple | farm,neutral | F,R,P | fruit red food eat | A crisp red fruit.
bread | Bread loaf | farm,fantasy | F,R | food bake wheat eat | A crusty golden loaf.
stew | Stew | farm,fantasy | F,R | soup bowl meal cooked dish | A steaming bowl of cooked vegetables.
cake | Cake | candy,farm | F,P | dessert sweet birthday frosting | A frosted sponge with a cherry on top.
`);
add({ type: 'icon', role: 'items/weapon', view: 'none' }, `
sword | Iron sword | fantasy | P,R | blade weapon steel melee | A straight double-edged blade with a leather grip.
battle-axe | Battle axe | fantasy | P,R | weapon chop heavy blade | A two-handed war axe.
bow | Longbow | fantasy,forest | P,R | weapon archery ranged string | A curved wooden bow.
magic-staff | Magic staff | fantasy | P,R | wand rod weapon orb wizard | A gnarled staff topped with a glowing orb.
dagger | Dagger | fantasy | P,R | knife blade weapon short | A short stabbing blade.
shield | Round shield | fantasy | P,R | defense block guard buckler | A wooden shield with an iron boss.
blaster | Blaster pistol | sci-fi,space | S,P | gun weapon raygun pistol | A chunky energy sidearm.
laser-rifle | Laser rifle | sci-fi,space | S | gun weapon beam long | A long-barrelled energy rifle.
`);
add({ type: 'icon', role: 'items/icon', view: 'none' }, `
icon-hoe | Hoe | farm | F | tool till dig farming | A farming tool for tilling soil.
icon-watering-can | Watering can | farm | F | tool water pour farming | A tin can with a spout for watering crops.
icon-axe | Wood axe | farm,forest | F,R | tool chop lumber hatchet | A tool for felling trees.
icon-pickaxe | Pickaxe | farm,dungeon | F,R | tool mine rock dig | A two-pointed tool for mining stone and ore.
icon-scythe | Scythe | farm | F | tool cut grass reap | A curved blade on a long handle for cutting grass.
icon-fishing-rod | Fishing rod | farm,neutral | F | tool fish pole angling | A bendy pole with a line and float.
icon-seeds | Seed packet | farm | F | seeds plant sow bag | A paper packet of seeds.
icon-egg | Egg | farm | F | chicken food produce | A fresh brown egg.
icon-milk | Milk bottle | farm | F | dairy cow drink produce | A glass bottle of milk.
icon-wood | Wood log | farm,forest | F,R | lumber timber material craft | A cut section of tree trunk.
icon-stone | Stone | farm,neutral | F,R | rock material craft build | A grey lump of building stone.
icon-iron-ore | Iron ore | dungeon,farm | F,R | mineral metal mine material | A rough rock streaked with grey metal.
icon-gold-ore | Gold ore | dungeon,farm | F,R | mineral nugget mine material | A rough rock flecked with yellow metal.
icon-diamond | Diamond | dungeon,farm | F,R,Z | gem rare mineral precious | A rare clear gemstone.
icon-bass | Bass | farm,underwater | F | fish catch river | A common green river fish.
icon-pufferfish | Pufferfish | farm,underwater | F | fish catch spiky blowfish | A round spiky fish.
icon-ring | Ring | fantasy | R | jewelry accessory gold band | A gold band set with a small stone.
icon-scroll | Scroll | fantasy | R,C | parchment spell paper quest | A rolled parchment tied with ribbon.
icon-map | Map | fantasy,neutral | R,P | chart treasure navigation paper | A folded chart marked with an X.
icon-book | Spell book | fantasy | R,C | tome grimoire magic read | A thick leather-bound tome.
`);
add({ type: 'projectile', role: 'effects/projectile', view: 'side' }, `
arrow | Arrow | fantasy,forest | P,R | bolt shaft bow shoot | A feathered shaft that flies straight and sticks where it lands.
bullet | Bullet | sci-fi,city | S,P | shot round gun ammo | A small bright streak fired from a gun.
fireball | Fireball | fantasy,dungeon | P,R | flame magic burning shot | A roaring ball of flame with a trailing tail.
laser-bolt | Laser bolt | sci-fi,space | S | beam ray energy shot | A short glowing bar of energy.
magic-missile | Magic missile | fantasy | P,R | spell arcane homing shot | A glowing purple dart that curves toward its target.
ice-shard | Ice shard | snow,fantasy | P,R | frost spike freeze shot | A spinning sliver of ice.
rocket | Rocket | sci-fi,city | S | missile explosive launcher | A finned missile with a smoke trail.
shuriken | Throwing star | neutral | P | ninja blade spin throw | A spinning four-pointed blade.
`);

// ------------------------------------------------------------------ effects
add({ type: 'effect', role: 'effects/explosion', view: 'none' }, `
fx-explosion | Explosion | neutral | P,S,R | blast boom fire burst | A bright fireball that swells, breaks into smoke and fades.
fx-pop | Small pop | neutral | P,Z,S | burst puff tiny bubble | A quick white burst for small things disappearing.
fx-enemy-poof | Defeat poof | neutral | P,R | vanish smoke enemy die cloud | A cloud of smoke left where a beaten enemy vanishes.
`);
add({ type: 'effect', role: 'effects/spark', view: 'none' }, `
fx-hit-spark | Hit spark | neutral | P,R,S | impact strike flash damage | A sharp white star at the point where an attack connects.
fx-sparkle | Sparkle | neutral | P,R,Z,F | glint shine twinkle collect | Small twinkling stars for something collected or precious.
fx-lightning | Lightning strike | fantasy,neutral | P,R | bolt thunder electric zap | A jagged bolt that flashes down from above.
fx-slash | Slash trail | neutral,fantasy | P,R | sword arc swipe swing | A curved white arc that follows a blade.
fx-confetti | Confetti | neutral | Z,C,P | celebrate party win paper | Coloured paper pieces that burst and flutter down.
`);
add({ type: 'effect', role: 'effects/dust', view: 'none' }, `
fx-dust-puff | Dust puff | neutral | P,R | land dirt cloud jump skid | A small cloud of dirt kicked up when a character lands or turns.
fx-smoke | Smoke | neutral | P,S,R | fumes grey rising chimney | Grey wisps that rise and thin out.
fx-splash | Water splash | neutral,underwater | P,F | droplets wet dive ripple | A crown of droplets where something hits water.
`);
add({ type: 'effect', role: 'effects/magic', view: 'none' }, `
fx-heal | Healing glow | fantasy | P,R | restore green aura cure | Soft green light and rising plus signs around a healed character.
fx-level-up | Level-up burst | fantasy,neutral | P,R | levelup upgrade glow rise | A column of golden light that rises around the character.
fx-shield | Shield bubble | sci-fi,fantasy | P,S | barrier protect dome force | A shimmering dome around a protected character.
fx-teleport | Teleport swirl | fantasy,sci-fi | P,R | warp vanish appear beam | A spiral of light as something disappears or arrives.
fx-freeze | Freeze | snow,fantasy | P,R | ice frost frozen shatter | Ice crystals that encase a target and then shatter.
fx-fire-burst | Fire burst | fantasy,dungeon | P,R | flame ignite burn blaze | A sudden flare of flame that licks upward.
`);
add({ type: 'effect', role: 'effects/weather', view: 'none' }, `
fx-rain | Rain | neutral,farm | P,R,F | storm drops wet weather | Slanting streaks and small ground splashes, as a looping overlay.
fx-snow | Snowfall | snow | P,R,F | flakes winter weather drift | Slow drifting flakes as a looping overlay.
fx-leaves | Falling leaves | forest,farm | P,R,F | autumn fall wind drift | Orange leaves spiralling down as a looping overlay.
fx-fireflies | Fireflies | forest,farm | R,F,P | glow bugs night lights | Tiny drifting lights that blink at night.
fx-bubbles | Rising bubbles | underwater | P | air water float sea | Wobbling air bubbles drifting upward.
`);
add({ type: 'effect', role: 'interface/icon', view: 'none' }, `
fx-alert | Alert bubble | neutral | F,R,P | exclamation notice surprise bite | A speech bubble with an exclamation mark that pops up over a character.
fx-speech | Speech bubble | neutral | R,F | talk dialogue chat dots | A bubble with three dots that bounce while someone talks.
`);

// ------------------------------------------------------------------ backgrounds
add({ type: 'background', role: 'environment/background', view: 'side' }, `
bg-sky | Sky and clouds | neutral | P,S | blue day clouds parallax | A soft blue sky with drifting clouds in three layers.
bg-mountains | Distant mountains | neutral,forest | P | hills peaks range parallax | Layered blue-grey ridges fading into the distance.
bg-forest | Forest backdrop | forest | P,R | trees woods trunks parallax | Rows of trunks and leaves in three depths.
bg-cave | Cave backdrop | dungeon | P | cavern dark rocks underground | Dim rock walls with faint glowing crystals.
bg-castle-hall | Castle hall | fantasy | P | interior pillars windows throne | Stone pillars, tall windows and hanging banners.
bg-starfield | Starfield | space | S,P | stars night galaxy scrolling | Three layers of stars that scroll at different speeds.
bg-nebula | Nebula | space | S | cosmic cloud purple galaxy | A glowing purple and blue gas cloud for deep space.
bg-city-night | City skyline at night | city | P,S | buildings skyscrapers lights urban | Dark towers dotted with lit windows under a glowing sky.
bg-desert | Desert dunes | desert | P | sand sunset pyramids hot | Rolling dunes under an orange evening sky.
bg-deep-sea | Deep sea | underwater | P | ocean blue light rays water | Blue gradients with shafts of light and distant fish.
bg-haunted-woods | Haunted woods | horror | P,R | dead trees moon spooky night | Twisted bare trees in front of a huge moon.
bg-farm-fields | Farm fields | farm | F,P | countryside meadow barn hills | Green patchwork fields with a distant barn.
bg-space-corridor | Station corridor | sci-fi | P,S | interior ship hallway lights | A metal hallway with blinking lights and windows onto space.
`);
add({ type: 'background', role: 'environment/lighting', view: 'none' }, `
light-night-tint | Night tint | neutral | F,R,P | dark evening overlay blue | A dark blue overlay that turns day scenes into night.
light-torch-glow | Torch glow | dungeon | P,R | halo warm flicker radius | A warm flickering circle of light to place over a flame.
`);

// ------------------------------------------------------------------ interface
add({ type: 'ui', role: 'interface/button', view: 'none' }, `
ui-button | Button | neutral | * | press click menu control | A rounded rectangle with normal, hover and pressed states.
ui-close-button | Close button | neutral | * | x exit cancel dismiss | A round button with a cross.
ui-toggle | Toggle switch | neutral | * | checkbox on off option setting | A sliding switch with on and off states.
`);
add({ type: 'ui', role: 'interface/panel', view: 'none' }, `
ui-panel | Panel | neutral | * | window frame box menu background | A stretchable window frame with a title strip.
ui-dialogue-box | Dialogue box | neutral,fantasy | R,F | text speech conversation talk window | A wide text box with a name tag and a space for a portrait.
ui-inventory | Inventory grid | neutral | R,F | bag slots backpack items storage | A grid of square slots with a selected highlight.
ui-toolbar | Toolbar | neutral,farm | F,R | hotbar quick slots tools belt | A single row of item slots along the bottom of the screen.
ui-shop-menu | Shop menu | neutral | R,F | store buy sell price list | A list of goods with prices and a buy button.
ui-clock | Clock and calendar | farm | F | time day date season | A dial showing the time of day, date and season.
ui-title-banner | Title banner | neutral,fantasy | * | logo ribbon heading scroll | A ribbon for a game title or a heading.
ui-card-frame | Card frame | neutral,fantasy | C | card border face deck | A playing-card front with spaces for art, cost and text.
ui-card-back | Card back | neutral,fantasy | C | card deck reverse pattern | A patterned reverse for a deck of cards.
`);
add({ type: 'ui', role: 'interface/bar', view: 'none' }, `
ui-health-bar | Health bar | neutral | P,R,S | hp life meter gauge red | A red bar that drains as the player loses health.
ui-mana-bar | Mana bar | fantasy | R,P | mp magic meter gauge blue | A blue bar that drains as magic is used.
ui-xp-bar | Experience bar | neutral | R,P | xp level progress meter | A thin bar that fills toward the next level.
ui-heart-containers | Heart containers | neutral | P,R | health lives hp row | A row of hearts shown full, half and empty.
ui-boss-bar | Boss health bar | neutral,fantasy | P,R,S | hp enemy large meter | A wide ornate bar for a boss's health.
ui-timer | Hourglass timer | neutral | Z,P | time countdown sand clock | An hourglass with falling sand.
`);
add({ type: 'ui', role: 'interface/cursor', view: 'none' }, `
ui-cursor | Cursor | neutral | * | pointer mouse arrow select | An arrow pointer with a click frame.
ui-hand-cursor | Hand cursor | neutral | Z,C,F | pointer grab finger drag | A pointing hand that closes to grab.
ui-crosshair | Crosshair | neutral,sci-fi | S | aim reticle target sight | A targeting reticle that tightens when aiming.
ui-quest-marker | Quest marker | neutral,fantasy | R | exclamation objective waypoint goal | A bobbing marker over someone with a task to give.
`);
add({ type: 'icon', role: 'interface/icon', view: 'none' }, `
ui-icon-settings | Settings icon | neutral | * | gear cog options config | A gear wheel.
ui-icon-sound | Sound icon | neutral | * | volume speaker mute audio | A speaker shown on and muted.
ui-icon-trophy | Trophy icon | neutral | * | cup award winner prize achievement | A gold cup.
ui-icon-skull | Skull icon | neutral,horror | P,R,S | death danger poison dead | A small white skull.
ui-coin-counter | Coin counter | neutral | P,R | money score gold total | A coin symbol beside a number.
ui-card-suits | Card suits | neutral | C | hearts spades clubs diamonds | The four suit symbols in red and black.
ui-dice | Dice | neutral | C,Z | die roll random six | A six-sided die showing each face, with a tumbling roll.
ui-puzzle-gems | Puzzle gems | neutral,candy | Z | match three jewels pieces swap | Six coloured pieces for a match-three board, each with a shine.
ui-puzzle-block | Puzzle blocks | neutral | Z | tetromino brick falling stack | Coloured square blocks for falling-block puzzles.
`);

// ------------------------------------------------------------------ sounds
const SURFACES = [
  ['grass', 'Soft swishing steps through short grass.', 'meadow lawn field'],
  ['dirt', 'Dull padded steps on a packed earth path.', 'earth soil path'],
  ['wood', 'Hollow knocking steps on floorboards.', 'floor planks boards indoor'],
  ['stone', 'Hard clicking steps on flagstones.', 'rock pavement dungeon hard'],
  ['snow', 'Squeaky crunching steps in fresh snow.', 'winter crunch ice cold'],
  ['sand', 'Soft shuffling steps on a beach.', 'beach desert shuffle'],
  ['gravel', 'Gritty crunching steps on loose stones.', 'pebbles crunch path'],
  ['metal', 'Ringing clanks on a steel walkway.', 'steel grate clank station'],
  ['water', 'Sloshing steps wading through a puddle.', 'puddle wade splash wet'],
  ['mud', 'Sticky squelching steps in a swamp.', 'squelch swamp bog wet'],
];
for (const [s, desc, words] of SURFACES) {
  add({ type: 'sfx', role: 'characters/footstep' },
    `footstep-${s} | Footsteps on ${s} | neutral | P,R,F | footstep walk step run ${words} | ${desc} Four variations.`);
}
add({ type: 'sfx', role: 'characters/voice' }, `
grunt-effort | Effort grunt | neutral | P,R | voice hup attack exertion | A short breathy voice sound for jumping or swinging.
monster-growl | Monster growl | horror,fantasy | P,R | snarl beast enemy threat | A low throaty rumble from a creature that has seen the player.
boss-roar | Boss roar | fantasy,horror | P,R | scream dragon giant bellow | A huge echoing bellow for a big enemy's entrance.
zombie-groan | Zombie groan | horror | P,S,R | moan undead walker | A long hollow moan.
ghost-wail | Ghost wail | horror | P,R | spooky moan spirit haunt | A wavering high cry that fades in and out.
slime-squish | Slime squish | fantasy,dungeon | P,R | blob wet jelly bounce | A wet rubbery squelch for a hopping blob.
bat-squeak | Bat squeak | dungeon,horror | P,R | screech chirp flying cave | A burst of thin high chirps.
wolf-howl | Wolf howl | forest,horror | P,R | awoo night moon dog | A long rising cry at the moon.
robot-chatter | Robot chatter | sci-fi | P,S | beep boop droid talk | A string of bleeps that sounds like a machine speaking.
alien-chatter | Alien chatter | space,sci-fi | S,P | gibberish invader talk warble | Warbling nonsense syllables.
evil-laugh | Evil laugh | horror,fantasy | P,R | cackle villain witch mwahaha | A cackling villain's chuckle.
skeleton-rattle | Skeleton rattle | dungeon,horror | P,R | bones clatter undead xylophone | Dry clacking bones.
`);
add({ type: 'sfx', role: 'characters/hurt' }, `
player-hurt | Player hurt | neutral | P,R,S | damage ouch hit pain oof | A short pained yelp when the hero takes damage.
enemy-hurt | Enemy hurt | neutral | P,R,S | damage hit squeal flinch | A quick squeal when an enemy takes a hit.
`);
add({ type: 'sfx', role: 'characters/death' }, `
player-death | Player death | neutral | P,R,S | die dead lose life fail | A falling, fading tone that plays when the hero is defeated.
enemy-death | Enemy defeated | neutral | P,R,S | die kill poof vanish | A quick downward blip and puff when an enemy is beaten.
boss-death | Boss defeated | fantasy,neutral | P,R,S | die explode collapse final | A long rumbling collapse with a string of blasts.
`);
add({ type: 'sfx', role: 'characters/animal' }, `
chicken-cluck | Chicken cluck | farm | F | hen bawk bird poultry | A few short clucks.
cow-moo | Cow moo | farm | F | cattle low dairy | A long low moo.
sheep-baa | Sheep baa | farm | F | bleat lamb wool | A wobbly bleat.
pig-oink | Pig oink | farm | F | snort grunt hog | Two snorting grunts.
horse-neigh | Horse neigh | farm,fantasy | F,R | whinny pony mount | A rising and falling whinny.
dog-bark | Dog bark | farm,city | F,R | woof puppy pet | Two sharp woofs.
cat-meow | Cat meow | farm,city | F,R | miaow kitten pet | A short questioning miaow.
duck-quack | Duck quack | farm | F | bird pond | Three nasal quacks.
bird-chirp | Bird chirp | forest,farm | F,R,P | tweet songbird whistle | A bright two-note tweet.
frog-croak | Frog croak | forest | F,P | ribbit toad pond | A deep ribbit.
pet-happy | Happy pet | farm | F | purr content love pat | A warm purring trill when an animal is petted.
rooster-crow | Rooster crow | farm | F | cock-a-doodle-doo morning wake dawn | A loud crow that starts the day.
`);
add({ type: 'sfx', role: 'actions/swing' }, `
sword-swing | Sword swing | fantasy | P,R | slash whoosh blade attack swipe | A fast airy whoosh of a blade cutting through the air.
heavy-swing | Heavy swing | fantasy | P,R | club hammer whoosh big slow | A slow deep whoosh for a large weapon.
axe-chop | Axe chop | farm,forest | F,R | wood tree chop hack lumber | A solid thunk of an axe biting into a tree trunk.
pickaxe-strike | Pickaxe strike | farm,dungeon | F,R | mine rock stone clink dig | A sharp clink of metal on stone.
hoe-dig | Hoe dig | farm | F | till soil dirt thud farming | A soft thud as a hoe breaks the soil.
scythe-swish | Scythe swish | farm | F | cut grass reap mow | A long light swish through tall grass.
watering | Watering | farm | F | water pour splash sprinkle can | A gentle pattering pour from a watering can.
whoosh-throw | Throw whoosh | neutral | P,R | toss fling hurl air | A short rush of air for something thrown.
`);
add({ type: 'sfx', role: 'actions/hit' }, `
punch | Punch | neutral,city | P,S | hit thump fist smack fight | A meaty thump of a fist landing.
hit-impact | Hit impact | neutral | P,R,S | strike thud damage blow | A short punchy thud for any attack that connects.
metal-clang | Metal clang | fantasy,neutral | P,R | sword clash parry ring steel | A bright ring of steel striking steel.
shield-block | Shield block | fantasy | P,R | deflect guard bonk parry | A dull wooden knock as a blow is stopped.
arrow-hit | Arrow hit | fantasy,forest | P,R | thunk stick impact wood | A quick thunk as an arrow sticks into wood.
critical-hit | Critical hit | neutral | R,P | crit smash big bonus damage | A crunchy accented blow with a bright ring on top.
`);
add({ type: 'sfx', role: 'actions/jump' }, `
jump | Jump | neutral | P | hop leap boing spring up | A quick rising chirp as the hero leaves the ground.
double-jump | Double jump | neutral | P | air second flip leap | A lighter, higher chirp for a second jump in the air.
spring-bounce | Spring bounce | neutral | P | boing trampoline launch | A cartoon boing.
`);
add({ type: 'sfx', role: 'actions/land' }, `
land | Land | neutral | P | thud drop ground touch-down | A soft thump as feet touch the ground after a fall.
heavy-land | Heavy landing | neutral | P | slam ground pound quake | A deep slam with a rumble for a big creature or a ground pound.
`);
add({ type: 'sfx', role: 'actions/dash' }, `
dash | Dash | neutral | P,R | rush dodge zoom sprint whoosh | A sharp rush of air for a quick burst of speed.
swim | Swim stroke | underwater | P | paddle water splash stroke | A watery swish for each stroke.
`);
add({ type: 'sfx', role: 'actions/shoot' }, `
bow-release | Bow release | fantasy,forest | P,R | arrow twang shoot string fire | A springy twang as an arrow is loosed.
pistol-shot | Pistol shot | city,neutral | S | gun bang gunshot fire | A dry bang.
shotgun-blast | Shotgun blast | city,horror | S | gun boom pump fire | A wide heavy boom followed by a pump click.
machine-gun | Machine gun burst | city,sci-fi | S | rapid fire rattle automatic | A fast rattling burst.
laser-shot | Laser shot | sci-fi,space | S,P | pew zap blaster ray fire | A bright descending zap from an energy weapon.
rocket-launch | Rocket launch | sci-fi,city | S | missile whoosh fire launcher | A hissing rush as a missile leaves its tube.
reload | Reload | city,sci-fi | S | magazine click clack gun | A clip sliding home and a bolt snapping shut.
empty-click | Empty click | city | S | no ammo dry fire gun | A dry click from a gun with nothing left.
cannon-fire | Cannon fire | fantasy,neutral | P,S | boom artillery blast pirate | A deep booming thump.
`);
add({ type: 'sfx', role: 'actions/cast' }, `
magic-cast | Magic cast | fantasy | P,R | spell shimmer wizard conjure | A rising shimmer as a spell is released.
fireball-cast | Fireball whoosh | fantasy,dungeon | P,R | flame fire spell roar | A roaring rush of flame.
ice-spell | Ice spell | snow,fantasy | P,R | frost freeze crystal tinkle | A glassy crackle and tinkle.
lightning-zap | Lightning zap | fantasy,sci-fi | P,R,S | electric shock thunder bolt | A crackling electric snap.
heal-spell | Heal spell | fantasy | P,R | restore cure chime soft | A warm rising chime as health returns.
teleport | Teleport | fantasy,sci-fi | P,R | warp blink vanish zap | A quick sucking whoosh and pop.
fishing-cast | Fishing cast | farm | F | rod line throw whip | A whip of the rod and a whirring line.
bobber-plop | Bobber plop | farm | F | float water drop fishing | A tiny plop as the float hits the water.
fishing-reel | Fishing reel | farm | F | wind line crank tension | A fast clicking crank.
fishing-bite | Fish bite alert | farm | F | nibble alarm tug fishing | A sharp double ping that tells the player to react.
`);
add({ type: 'sfx', role: 'items/pickup' }, `
coin-pickup | Coin pickup | neutral | P,R,S | collect money gold ding chime | A bright two-note chime for collecting a coin.
gem-pickup | Gem pickup | neutral,fantasy | P,R,Z | collect jewel sparkle crystal | A glassy sparkling arpeggio.
key-pickup | Key pickup | fantasy,dungeon | P,R,Z | collect jingle metal | A small metallic jingle.
heart-pickup | Heart pickup | neutral | P,R | health heal restore life | A soft warm two-note rise as health is restored.
powerup | Power-up | neutral | P,S | boost upgrade grow strong | A rising sweep of notes as the hero gets stronger.
item-pop | Item pop | neutral,farm | F,R | pick collect bubble grab | A light bubbly pop for picking something off the ground.
ammo-pickup | Ammo pickup | sci-fi,city | S | bullets clip grab reload | A chunky metallic clack.
harvest-pop | Harvest pop | farm | F | crop pick pull pluck gather | A satisfying pluck as a ripe crop comes out of the ground.
`);
add({ type: 'sfx', role: 'items/equip' }, `
equip-sword | Draw sword | fantasy | P,R | unsheathe blade ring equip | A metallic sliding ring as a blade is drawn.
equip-armor | Equip armour | fantasy | R | wear clank buckle gear | A clink of buckles and plates.
inventory-open | Bag open | neutral | R,F | inventory backpack rustle zip | A cloth rustle as a bag is opened.
item-place | Item placed | farm,neutral | F,R,Z | put set down thunk build | A soft wooden thunk as something is set down.
seed-plant | Seed planted | farm | F | sow plant soil pat | A soft pat of soil over a seed.
craft-complete | Crafting complete | neutral,farm | F,R | make build done hammer | Two hammer taps and a bright ding.
`);
add({ type: 'sfx', role: 'items/consume' }, `
potion-drink | Potion drink | fantasy | P,R | gulp swallow drink bottle | Three quick gulps and a sigh.
eat-crunch | Eat | farm,neutral | F,R,P | bite munch chew food | A couple of crunchy bites.
`);
add({ type: 'sfx', role: 'items/drop' }, `
item-drop | Item drop | neutral | R,F | discard thud fall toss | A small thud as something hits the ground.
coins-spill | Coins spill | fantasy,neutral | R,P | money scatter jingle loot | A shower of coins scattering across the floor.
`);
add({ type: 'sfx', role: 'world/door' }, `
door-open | Door creak | fantasy,horror | P,R | open hinge squeak wood | A slow squeal of old hinges as a door opens.
door-close | Door slam | neutral | P,R | shut bang close wood | A heavy wooden bang.
door-locked | Locked door | neutral,dungeon | P,R,Z | rattle handle stuck denied | A rattling handle that will not turn.
door-unlock | Unlock | neutral,dungeon | P,R,Z | key turn click latch open | A key turning and a latch clicking free.
gate-raise | Gate raise | dungeon,fantasy | P,R | portcullis chain grind metal | Grinding chains hauling up a heavy gate.
airlock-hiss | Airlock hiss | sci-fi,space | P,S | sliding door pneumatic whoosh | A pneumatic hiss as a sliding door parts.
`);
add({ type: 'sfx', role: 'world/chest' }, `
chest-open | Chest open | fantasy,dungeon | P,R | creak lid treasure loot unlock | A wooden creak and a clunk as a lid swings back.
chest-reward | Treasure reveal | fantasy | P,R | sparkle shine loot found | A shimmering flourish as the contents are revealed.
`);
add({ type: 'sfx', role: 'world/lever' }, `
lever-pull | Lever pull | dungeon,neutral | P,Z | switch clunk ratchet toggle | A ratchet and a solid clunk.
pressure-click | Pressure plate click | dungeon,neutral | P,Z | step switch stone press | A low stone click underfoot.
switch-electric | Power switch | sci-fi | P,S,Z | on hum electric flip | A snap followed by a rising electric hum.
`);
add({ type: 'sfx', role: 'world/break' }, `
crate-break | Crate smash | neutral | P,S | wood break splinter destroy box | Splintering planks as a wooden box is broken open.
glass-shatter | Glass shatter | neutral,city | P,S | break window smash tinkle | A crash and a rain of tinkling shards.
rock-break | Rock break | farm,dungeon | F,R,P | stone crack crumble mine | A crack and a tumble of rubble.
tree-fall | Tree falling | farm,forest | F | timber creak crash wood | A long creak and a leafy crash.
`);
add({ type: 'sfx', role: 'world/machine' }, `
furnace-ignite | Furnace ignite | farm,fantasy | F,R | fire light whoomph smelt | A whoomph of flame catching.
machine-hum | Machine hum | sci-fi,farm | F,S,P | engine motor drone working | A steady low mechanical drone.
sprinkler-spray | Sprinkler spray | farm | F | water hiss tick irrigation | A ticking hiss of sprayed water.
elevator | Elevator | sci-fi,city | P | lift motor ding ride | A smooth motor whirr ending in a ding.
saw-whirr | Saw whirr | dungeon,sci-fi | P | buzz blade spin trap | A rising and falling buzz of a spinning blade.
spike-trap | Spike trap | dungeon | P,R | shing stab metal spring | A fast metallic shing as spikes shoot out.
anvil-strike | Anvil strike | fantasy | R | hammer forge smith metal ring | A hammer ringing on hot iron.
cauldron-bubble | Cauldron bubbling | fantasy,horror | R,P | boil brew potion glug | A thick slow glugging boil.
bell-toll | Bell toll | fantasy,horror | R,P | church gong chime tower | A single deep bell with a long tail.
clock-tick | Clock tick | neutral | Z,R | tock second time pendulum | A steady tick and tock.
alarm | Alarm siren | sci-fi,city | S,P | warning alert klaxon danger | A two-tone warning siren.
`);
add({ type: 'sfx', role: 'effects/explosion' }, `
explosion | Explosion | neutral | P,S,R | boom blast bomb detonate | A deep boom with a crackling, rumbling tail.
explosion-small | Small explosion | neutral | P,S | pop bang burst firecracker | A short sharp bang.
thunder | Thunder clap | neutral | P,R,F | storm rumble lightning boom | A crack of thunder that rolls away.
ground-quake | Ground quake | neutral,dungeon | P,R | rumble shake earthquake tremor | A long low shaking rumble.
`);
add({ type: 'sfx', role: 'effects/magic' }, `
magic-sparkle | Magic sparkle | fantasy | P,R,Z | shimmer twinkle fairy glitter | A cascade of tiny bright bells.
freeze | Freeze | snow,fantasy | P,R | ice frost crystallize chill | A crisp crystalline sweep upward.
shield-up | Shield up | sci-fi,fantasy | P,S | barrier hum activate protect | A rising hum as a barrier switches on.
shield-break | Shield break | sci-fi,fantasy | P,S | shatter barrier fail crack | A glassy shatter with a falling tone.
laser-charge | Laser charge | sci-fi | S | power up whine beam build | A rising whine that builds before a big shot.
poison-hiss | Poison hiss | dungeon,horror | P,R | acid gas sizzle toxic | A sizzling hiss.
`);
add({ type: 'sfx', role: 'effects/impact' }, `
body-fall | Body fall | neutral | P,R,S | thud collapse drop corpse | A heavy slump to the floor.
splash | Splash | neutral,underwater | P,F | water dive plunge wet | A full plunge into water.
fire-whoosh | Fire whoosh | fantasy,dungeon | P,R | flame ignite burst burn | A fast breathy burst of flame.
electric-spark | Electric spark | sci-fi | P,S | zap crackle short shock | A short snapping crackle.
`);
add({ type: 'ambience', role: 'environment/ambience' }, `
amb-cave | Cave drips | dungeon | P,R | cavern echo water dripping dark | Slow echoing water drops and a faint low air tone in a dark cavern.
amb-torch | Torch crackle | dungeon,fantasy | P,R | fire flame burning loop | A close gentle crackle of a small flame.
amb-forest-day | Forest birds | forest | P,R,F | birdsong woodland nature day | Layered birdsong with rustling leaves.
amb-night-crickets | Night crickets | farm,forest | F,R,P | insects evening chirping dark | A steady chorus of crickets with an occasional owl.
amb-ocean | Ocean waves | neutral,underwater | F,R,P | sea surf beach shore | Waves rolling in and drawing back over sand.
amb-river | River stream | forest,farm | F,R | brook water flowing babble | A lively babbling brook.
amb-market | Market crowd | fantasy,city | R | people chatter town busy | A busy murmur of voices, footsteps and calls.
amb-tavern | Tavern chatter | fantasy | R,C | inn pub laughter mugs | Warm indoor chatter with clinking mugs.
amb-spaceship | Spaceship hum | space,sci-fi | S,P | engine drone ship interior | A deep steady engine drone with soft beeps.
amb-computer-room | Computer room | sci-fi | P,S,Z | servers beeps fans lab | Whirring fans and scattered electronic chirps.
amb-underwater | Underwater | underwater | P | deep muffled bubbles sea | A muffled deep rumble with passing bubbles.
amb-swamp | Swamp | forest,horror | P,R | frogs insects bog marsh | Croaks, buzzing and slow bubbling mud.
amb-haunted | Haunted whispers | horror | P,R | ghost eerie creepy voices | Faint whispers and distant creaks in an empty house.
amb-city | City traffic | city | P,S | cars horns street urban | Passing cars, distant horns and a low city hum.
amb-dungeon | Dungeon drone | dungeon,horror | P,R | dark rumble ominous chains | A low ominous tone with far-off chains.
amb-factory | Factory floor | sci-fi,city | P,Z | machines clank steam industrial | Rhythmic clanks and bursts of steam.
amb-farm-morning | Farm morning | farm | F | dawn birds rooster countryside | Early birdsong, a distant rooster and a light breeze.
`);
add({ type: 'ambience', role: 'environment/weather' }, `
amb-wind | Wind | neutral | P,R,F | breeze gust blowing air | A soft rising and falling breeze.
amb-rain | Rain | neutral,farm | P,R,F | shower drizzle storm drops | Steady rainfall on leaves and ground.
amb-thunderstorm | Thunderstorm | neutral,horror | P,R,F | storm heavy rain lightning | Heavy rain with rolling thunder.
amb-blizzard | Blizzard | snow | P,R | snowstorm howling wind cold | A howling icy gale.
amb-desert-wind | Desert wind | desert | P,R | sand dry gust dunes | A dry hissing wind carrying sand.
`);
add({ type: 'sfx', role: 'interface/click' }, `
ui-click | Click | neutral | * | button press tap select | A short crisp tick for pressing a button.
ui-text-blip | Text blip | neutral | R,F | dialogue letter typing talk beep | A tiny beep played for each letter as dialogue appears.
ui-menu-open | Menu open | neutral | * | popup window whoosh show | A soft upward swish as a window appears.
ui-menu-close | Menu close | neutral | * | dismiss window whoosh hide | A soft downward swish as a window goes away.
ui-tab-switch | Tab switch | neutral | * | page flip change section | A light flick.
card-flip | Card flip | neutral | C | turn reveal paper snap | A crisp snap of a card turning over.
card-shuffle | Card shuffle | neutral | C | deck riffle mix cards | A riffle of a whole deck.
card-deal | Card deal | neutral | C | draw slide place hand | A quick slide of a card across a table.
dice-roll | Dice roll | neutral | C,Z | throw rattle tumble die | A rattle and tumble across a table.
block-place | Block place | neutral | Z | drop piece set thunk lock | A firm click as a piece locks into place.
piece-swap | Piece swap | neutral | Z | switch slide move swoosh | A quick double swish.
`);
add({ type: 'sfx', role: 'interface/hover' }, `
ui-hover | Hover | neutral | * | rollover highlight focus tick | A very quiet soft tick when the pointer moves over a button.
`);
add({ type: 'sfx', role: 'interface/confirm' }, `
ui-confirm | Confirm | neutral | * | accept ok yes select | A bright rising two-note blip.
ui-cancel | Cancel | neutral | * | back no close decline | A soft falling two-note blip.
ui-purchase | Purchase | neutral | R,F | buy cha-ching coins sale shop | A cash-register ring and a clink of coins when something is bought or sold.
ui-save | Game saved | neutral | * | save disk done stored | A gentle three-note confirmation.
ui-pause | Pause | neutral | * | stop freeze halt | A short falling tone.
ui-countdown | Countdown beep | neutral | Z,S,P | three two one timer start | A single clean beep, with a higher final one.
ui-notification | Notification | neutral | * | ping alert message new | A friendly glassy ping.
match-clear | Match clear | neutral,candy | Z | combo line pop clear | A bright pop and sparkle as matched pieces disappear.
combo | Combo chime | neutral | Z,P | chain streak multiplier rising | A chime that climbs one step higher with each hit in a row.
`);
add({ type: 'sfx', role: 'interface/error' }, `
ui-error | Error buzz | neutral | * | wrong denied invalid no buzzer | A short low buzz for something that is not allowed.
ui-low-time | Low time warning | neutral | Z,P | hurry ticking urgent timer | Fast urgent ticking as time runs out.
ui-low-health | Low health warning | neutral | P,R,S | heartbeat danger beep critical | A slow repeating pulse when the hero is nearly beaten.
`);
add({ type: 'jingle', role: 'interface/reward' }, `
jingle-level-up | Level up | neutral,fantasy | P,R,F | levelup upgrade fanfare rank | A quick triumphant rising phrase.
jingle-checkpoint | Checkpoint | neutral | P | save flag progress reached | A short bright phrase when progress is saved.
jingle-quest-complete | Quest complete | fantasy,neutral | R,F | mission done task finished | A warm resolved phrase with a final chord.
jingle-new-day | New day | farm | F | morning wake sunrise start | A gentle rising phrase that opens the day.
jingle-rare-item | Rare item found | fantasy,neutral | R,F | treasure discovery special legendary | A sparkling flourish that hangs on a high note.
jingle-secret | Secret found | neutral | P,R | hidden discovery mystery puzzle | A curious eight-note riddle phrase.
jingle-achievement | Achievement unlocked | neutral | * | trophy award badge reward | A proud two-chord sting.
jingle-extra-life | Extra life | neutral | P,S | 1up bonus continue | A cheeky upward run.
jingle-stage-start | Stage start | neutral | P,S | ready go begin intro | A short get-ready phrase.
jingle-fish-caught | Fish caught | farm | F | catch success fishing landed | A bouncy phrase for landing a fish.
jingle-puzzle-solved | Puzzle solved | neutral | Z | correct solved clear success | A tidy resolving phrase.
jingle-shop-bell | Shop bell | fantasy,farm | R,F | door welcome enter store ding | A small bell that rings as the player walks into a store.
`);
add({ type: 'jingle', role: 'music/victory' }, `
jingle-victory | Victory fanfare | neutral,fantasy | P,R,S | win level clear success triumph | A bold brass phrase for finishing a level.
jingle-boss-defeated | Boss defeated fanfare | fantasy | P,R,S | win triumph big finale | A long triumphant fanfare after a big fight.
`);
add({ type: 'jingle', role: 'music/gameover' }, `
jingle-game-over | Game over | neutral | P,R,S | lose fail defeat end sad | A slow falling phrase that ends unresolved.
jingle-time-up | Time up | neutral | Z,P | timeout fail buzzer end | A deflating downward slide.
`);

// ------------------------------------------------------------------ music
add({ type: 'music', role: 'music/menu' }, `
music-menu-calm | Quiet menu | neutral | * | title calm gentle loop start | A soft slow loop with a simple melody for a title screen.
music-title-heroic | Heroic title | fantasy | P,R | title epic adventure theme main | A bold adventurous theme with a march beat.
music-credits | Credits | neutral | * | ending finale closing thanks | A warm reflective tune for the end of the game.
`);
add({ type: 'music', role: 'music/exploration' }, `
music-overworld | Overworld | fantasy | R,P | adventure journey travel map | A bright striding tune for crossing open country.
music-forest | Forest stroll | forest | P,R | woods nature light walking | A light playful tune with plucked notes.
music-village | Village | fantasy,farm | R,F | town peaceful home cosy | A gentle friendly tune for a safe place.
music-dungeon | Dungeon depths | dungeon | P,R | dark tense underground crypt | A slow uneasy tune with a deep bass.
music-cave | Crystal cave | dungeon | P,R | mysterious echo underground glitter | A sparse echoing tune with bell-like notes.
music-space | Deep space | space | S,P | ambient synth cosmic drift | A slow drifting synth piece.
music-station | Station alert | sci-fi | S,P | tense pulse tech electronic | A pulsing electronic tune with a steady beat.
music-spring | Spring morning | farm | F | cheerful fresh season bright | A cheerful easy-going tune with flute and guitar for a new season.
music-summer | Summer fields | farm | F | sunny warm season lively | A lively sunny tune.
music-fall | Autumn harvest | farm | F | fall mellow season nostalgic | A mellow nostalgic tune.
music-winter | Winter hush | farm,snow | F | snow gentle bells season quiet | A quiet tune with soft bells.
music-night | Night time | farm,neutral | F,R | evening calm stars sleepy | A slow sleepy tune for after dark.
music-rainy | Rainy day | farm,neutral | F,R | rain cosy soft melancholy | A soft thoughtful tune for bad weather.
music-mines | The mines | farm,dungeon | F,R | cave digging rhythm steady | A steady rhythmic tune for working underground.
music-beach | Beach | neutral,underwater | F,P | tropical island sunny steel-drum | A breezy tropical tune.
music-desert | Desert | desert | P,R | sand mystery east caravan | A winding tune over a hand drum.
music-snow | Snow level | snow | P | ice winter sparkle sleigh | A sparkling brisk tune.
music-haunted | Haunted house | horror | P,R | spooky organ creepy ghost | A creepy waltz with organ and odd notes.
music-underwater | Underwater | underwater | P | dreamy flowing ocean float | A dreamy flowing tune in three-time.
music-candy | Candy land | candy | P | bubbly cute sweet bouncy | A bouncy sugary tune.
music-city | City groove | city | P,S | funk urban bass street | A funky tune with a walking bass.
music-castle | Castle march | fantasy | P,R | regal royal fortress stately | A stately march with drums.
music-puzzle | Thinking time | neutral | Z | chill relaxed lofi focus | A relaxed unhurried loop for thinking.
music-cards | Card table | neutral,fantasy | C | tavern jazz lounge swing | A laid-back swinging tune.
`);
add({ type: 'music', role: 'music/battle' }, `
music-battle | Battle theme | fantasy | P,R | fight combat action fast | A fast driving tune for ordinary fights.
music-shooter | Dogfight | space,sci-fi | S | action techno fast synthwave | A fast electronic tune with a driving beat.
music-chase | Hurry up | neutral | P,S | chase escape urgent timer | A frantic speeding tune for when time is short.
music-stealth | Sneaking | city,dungeon | P,R | stealth tense quiet suspense | A quiet tense tune with a creeping bass for staying hidden.
`);
add({ type: 'music', role: 'music/boss' }, `
music-boss | Boss battle | fantasy | P,R | fight intense danger showdown | An intense heavy tune for a big enemy.
music-final-boss | Final boss | fantasy,horror | P,R | last epic climax choir | The biggest, most dramatic tune in the game.
music-mothership | Mothership assault | space,sci-fi | S | boss alien intense synth | A heavy electronic tune for the largest enemy ship.
`);
add({ type: 'music', role: 'music/shop' }, `
music-shop | Shop | fantasy,farm | R,F | store merchant jaunty browsing | A jaunty little tune for browsing goods.
music-festival | Festival | farm,fantasy | F,R | fair dance celebration party | A lively dance tune for a town celebration.
`);
add({ type: 'music', role: 'music/victory' }, `
music-victory-loop | Results screen | neutral | P,S,Z | win score tally happy | A happy loop that plays while the score is counted.
music-emotional | Farewell | neutral | R,F | sad piano emotional cutscene | A slow sad piano piece for a quiet moment in the story.
`);

// ------------------------------------------------------------------ bundles
const BUNDLES = [
  { id: 'fantasy-platformer', name: 'Fantasy platformer', gameType: 'platformer', blurb: 'A knight, a dungeon and everything in it.',
    pick: (a) => a.gameTypes.includes('platformer') && a.themes.some((t) => ['fantasy', 'dungeon'].includes(t)) },
  { id: 'farming-sim-starter', name: 'Farming sim starter', gameType: 'farming-sim', blurb: 'A farmer, crops, animals and a town.',
    pick: (a) => a.gameTypes.includes('farming-sim') && a.themes.includes('farm') },
  { id: 'space-shooter', name: 'Space shooter', gameType: 'shooter', blurb: 'Ships, lasers and a mothership.',
    pick: (a) => a.gameTypes.includes('shooter') && a.themes.some((t) => ['space', 'sci-fi'].includes(t)) },
];
const bundles = BUNDLES.map((b) => {
  const members = assets.filter(b.pick);
  for (const a of members) a.bundles.push(b.id);
  const ids = (k) => members.filter((a) => a.kind === k).map((a) => a.id);
  return { id: b.id, name: b.name, gameType: b.gameType, blurb: b.blurb, sprites: ids('sprite'), sounds: ids('sound'), music: ids('music') };
});

const seen = new Set();
for (const a of assets) {
  if (seen.has(a.id)) throw new Error('duplicate id ' + a.id);
  seen.add(a.id);
}
const out = path.join(here, 'catalog.json');
fs.writeFileSync(out, JSON.stringify({ version: 1, assets, bundles }, null, 1) + '\n');
const by = (k) => assets.filter((a) => a.kind === k).length;
console.log(`wrote ${path.relative(process.cwd(), out)}: ${assets.length} assets (${by('sprite')} sprites, ${by('sound')} sounds, ${by('music')} music), ${bundles.length} bundles`);
