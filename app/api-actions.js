// The high-level actions of window.loadout, as an MCP server lists tools (docs/architecture.md, Contract 11).
// This is the one list: the build copies ACTIONS into generated/api.json, app/api-core.js builds the object from
// the same entries, app/api.js (the small file every visitor loads) names the same calls, and a unit test fails
// when they disagree. Plain data: it runs in Node for the build and the tests.
//
// name: the tool name. call: where it is on window.loadout. args: the properties of the input, in call order,
// so a caller with an input object does loadout.<call>(...args.map((a) => input[a])), or loadout.call(name, input).
// Lists that the code already holds (palette names) are read from the code, not written out again here.
import { PALETTES } from '../engine/theme.js';
import { LIMITS } from './api-source.js';

const TEXT_OR_LIST = (what) => ({ oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }], description: what });
const FILTERS = {
  kind: TEXT_OR_LIST('sprite, sound or music'),
  type: TEXT_OR_LIST('What it is: character, creature, tileset, prop, pickup, projectile, effect, background, ui, icon; or sfx, ambience, music, jingle'),
  role: TEXT_OR_LIST('What it is for in a game, as a path in the role tree: "characters/player", or "characters" for everything under it'),
  themes: TEXT_OR_LIST('fantasy, sci-fi, dungeon, forest, neutral and so on; a list means any of them'),
  gameTypes: TEXT_OR_LIST('platformer, turn-based-rpg, roguelike-action and so on'),
  view: TEXT_OR_LIST('sprites only: side, top-down, front or none'),
  bundle: TEXT_OR_LIST('A bundle id: only assets in that bundle'),
  runtime: { type: 'boolean', description: 'true: only assets made on this visit with make_sprite or make_sound; false: only catalogue assets' },
};
const ID = (what) => ({ type: 'string', description: what, pattern: '^[a-z][a-z0-9-]*$' });
const HEX = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' };
const OR_NONE = (schema, what) => ({ oneOf: [schema, { type: 'null' }], description: what });
/** A whole-bundle look (Contract 7), every part spelled out. Parts left out stay neutral. */
export const LOOK = {
  type: 'object',
  description: 'A look for many assets at once, so they match. Every part is optional; a part left out stays neutral (changes nothing).',
  properties: {
    seed: { type: 'integer', description: 'Which variation, when shapes is true: the same seed gives the same result' },
    colour: {
      type: 'object',
      description: 'Recolours every sprite after it is drawn',
      properties: {
        hue: { type: 'number', minimum: -180, maximum: 180, description: 'Degrees to turn every colour round the colour wheel (0 leaves them)' },
        saturation: { type: 'number', minimum: 0, maximum: 2, description: '1 leaves colours as they are; 0 is grey; 2 is twice as vivid' },
        contrast: { type: 'number', minimum: 0.5, maximum: 1.5, description: '1 leaves light and dark as they are' },
        tint: OR_NONE(HEX, 'A colour to wash everything with, as "#rrggbb", or null for none'),
        tintAmount: { type: 'number', minimum: 0, maximum: 1, description: 'How strong the tint is (0 none, 1 everything is that colour)' },
        palette: OR_NONE({ type: 'string', enum: PALETTES.map((x) => x.name) }, 'Snap every colour to one of the built-in palettes, by name, or null for none'),
        outline: OR_NONE(HEX, 'A colour for every outline (eyes and pupils included), as "#rrggbb", or null to keep the standard one'),
      },
      additionalProperties: false,
    },
    sound: {
      type: 'object',
      description: 'Changes every sound effect after it is rendered',
      properties: {
        pitch: { type: 'number', minimum: -12, maximum: 12, description: 'Semitones up or down (0 leaves it)' },
        brightness: { type: 'number', minimum: -1, maximum: 1, description: '-1 duller, 0 as it is, 1 brighter' },
      },
      additionalProperties: false,
    },
    music: {
      type: 'object',
      description: 'Changes every music track through its own controls',
      properties: {
        tempo: { type: 'number', minimum: 0.5, maximum: 2, description: 'Speed, as a multiple (1 leaves it)' },
        intensity: OR_NONE({ type: 'number', minimum: 0, maximum: 1 }, 'How full the arrangement is, 0 to 1, or null to leave each track alone'),
      },
      additionalProperties: false,
    },
    shapes: { type: 'boolean', description: 'true: also vary each sprite\'s own controls from the seed' },
  },
  additionalProperties: false,
};
const PARAMS = (what) => ({ type: 'object', additionalProperties: true, description: what });
const CUE = {
  type: 'object',
  description: 'One sound played on one frame of a clip',
  properties: {
    sound: { type: 'string', description: 'The id of a sound effect' },
    frame: { type: 'integer', minimum: 0, description: 'The frame it plays on, counted from 0' },
    preset: OR_NONE({ type: 'string' }, 'One of that sound\'s named styles, or null'),
    params: OR_NONE(PARAMS('Settings for that sound\'s controls, by id'), 'Settings for that sound\'s controls, or null for its own'),
    volume: { type: 'number', minimum: 0, maximum: 1, description: '1 unless given' },
    when: { type: 'object', additionalProperties: { type: 'array', items: { type: ['string', 'number', 'boolean'] } }, description: 'Play it only at these settings of the sprite: { controlKey: [values] }' },
  },
  required: ['sound', 'frame'], additionalProperties: false,
};
/** What a bag item's settings may hold. Which properties apply depends on the asset\'s kind; one that does not apply is ignored, with a warning. */
export const SETTINGS = {
  type: 'object',
  description: 'How this item is set up. Sprite: { params, cues, scale, artStyle }. Sound: { params, style, seed }. Music: { params, style }. A property that does not apply to the asset\'s kind is ignored and named in the answer\'s warnings. Leave settings out for the asset as it comes.',
  properties: {
    params: PARAMS('Settings for the asset\'s controls, by key (assets_get lists them, with their ranges and options). Left-out controls stay at their defaults'),
    cues: OR_NONE({ type: 'object', additionalProperties: { type: 'array', items: CUE }, description: '{ clipName: [cue, ...] }' }, 'Sprites: the sounds its animations play, by clip, replacing its own; null or left out keeps its own'),
    scale: { type: 'integer', enum: [1, 2, 3, 4, 6, 8], description: 'Sprites: whole-number pixel size of the exported sheet (1 unless given)' },
    artStyle: { type: 'string', description: 'Sprites: the art style to draw and export it in, one of the styles the sprite lists (assets_get shows them). Left out means its first' },
    style: OR_NONE({ type: 'string' }, 'Sounds and music: one of its named styles (assets_get lists them), or null'),
    seed: { type: 'integer', minimum: 1, description: 'Sounds: which take (1 unless given)' },
  },
  additionalProperties: false,
};

export const ACTIONS = [
  {
    name: 'assets_list', call: 'assets.list', args: ['filter'],
    description: 'List the assets on the site (sprites, sounds, music), with what each is for and its measured facts. Give a filter to narrow the list. Assets made on this visit are included and marked runtime: true.',
    inputSchema: { type: 'object', properties: { filter: { type: 'object', description: 'Leave out for everything.', properties: FILTERS, additionalProperties: false } }, additionalProperties: false },
  },
  {
    name: 'assets_get', call: 'assets.get', args: ['id'],
    description: 'Everything about one asset: its catalogue row plus its controls (the settings render and the bag accept), its clips or styles, and for an asset made on this visit its last quality verdict. A sprite\'s "styles" are the art styles it can be drawn and exported in, best first (render and bag_add take one as "artStyle"); a sound\'s "styles" are its named variations.',
    inputSchema: { type: 'object', properties: { id: ID('The asset id, for example "knight" or "coin-pickup"') }, required: ['id'], additionalProperties: false },
  },
  {
    name: 'assets_search', call: 'assets.search', args: ['text', 'filters'],
    description: 'Find assets by words, best match first, the way the site\'s search box does. Filters narrow the result; filters.limit caps how many come back (30 unless given).',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'What to look for: "money", "sword swing", "boss music"' },
        filters: { type: 'object', properties: { ...FILTERS, limit: { type: 'integer', minimum: 1, maximum: 1000, description: 'How many results at most (30 unless given)' } }, additionalProperties: false },
      },
      required: ['text'], additionalProperties: false,
    },
  },
  {
    name: 'assets_similar', call: 'assets.similar', args: ['id', 'count'],
    description: 'The assets most like this one (same role, shared words, same bundle), best first.',
    inputSchema: { type: 'object', properties: { id: ID('The asset to start from'), count: { type: 'integer', minimum: 1, maximum: 50, description: 'How many (6 unless given)' } }, required: ['id'], additionalProperties: false },
  },
  {
    name: 'assets_remove', call: 'assets.remove', args: ['id'],
    description: 'Forget an asset made on this visit with make_sprite or make_sound. Catalogue assets cannot be removed, and an asset that is in the bag has to be taken out of the bag first.',
    inputSchema: { type: 'object', properties: { id: ID('The id of an asset made on this visit') }, required: ['id'], additionalProperties: false },
  },
  {
    name: 'make_sprite', call: 'make.sprite', args: ['source'],
    description: `Define a new sprite on this visit from source text: one ES module written like the sprites of the site, importing the framework by relative path ('../engine/sprite.js', '../engine/fx.js', '../rigs/humanoid.js') and ending in "export default defineSprite({ ... })". The source runs in a worker of its own, never in the page: it has the framework it imports and nothing else (no page, no network, no storage), and it is stopped if it takes too long. The quality bar runs on it and its verdict comes back as { id, ok, errors, warnings }. From then on it behaves like a catalogue asset on this visit: it has a page, can be rendered, put in the bag and exported. One with errors is kept as a draft (it can be rendered and has a page, but cannot go in the bag): fix the source and make it again under the same id, which replaces it; a failing version does not replace one that is in the bag. Limits: source at most ${LIMITS.sourceChars.toLocaleString('en')} characters, a frame at most ${LIMITS.frameWidth} by ${LIMITS.frameHeight} pixels, at most ${LIMITS.framesPerClip} frames in a clip and ${LIMITS.clips} clips, ${LIMITS.loadMs / 1000} seconds to load and ${LIMITS.checkMs / 1000} seconds for the quality bar. The id must not be one the catalogue already uses.`,
    inputSchema: { type: 'object', properties: { source: { type: 'string', minLength: 1, description: 'The module source text' } }, required: ['source'], additionalProperties: false },
  },
  {
    name: 'make_sound', call: 'make.sound', args: ['patch'],
    description: 'Define a new sound effect or music track on this visit from a synthesis patch: an object { format, id, name, category, meta, duration, params, nodes, out } (music has "category": "music"). A patch is data, not code: named controls, sound-making blocks (their types and fields are in `(await loadout.framework).sfx.NODE_TYPES`) and expressions that wire them. The quality bar runs on it and its verdict comes back as { id, ok, errors, warnings, notes }. From then on it behaves like a catalogue sound on this visit, and a sprite made afterwards can cue it by its id. One with errors is kept as a draft that cannot go in the bag; making the same id again replaces it. A music track takes minutes to check.',
    inputSchema: { type: 'object', properties: { patch: { oneOf: [{ type: 'object', additionalProperties: true }, { type: 'string' }], description: 'The patch object, or its JSON text' } }, required: ['patch'], additionalProperties: false },
  },
  {
    name: 'check', call: 'check', args: ['idOrDefinition'],
    description: 'Run the quality bar and return its verdict { ok, errors, warnings, metrics } without keeping anything: for an asset id (catalogue or made on this visit), for sprite source text, or for a sound patch.',
    inputSchema: { type: 'object', properties: { idOrDefinition: { oneOf: [{ type: 'string' }, { type: 'object', additionalProperties: true }], description: 'An asset id, sprite source text, or a sound patch object' } }, required: ['idOrDefinition'], additionalProperties: false },
  },
  {
    name: 'render', call: 'render', args: ['id', 'options'],
    description: 'Draw or play an asset and return the result as data. A sprite gives a PNG data address of one frame, or of a whole clip in one row when frame is left out, with its size and how many pixels are drawn, in the art style asked for (its first unless given). A sound or music track gives a WAV data address, or its samples.',
    inputSchema: {
      type: 'object',
      properties: {
        id: ID('The asset id (catalogue or made on this visit)'),
        options: {
          type: 'object',
          properties: {
            clip: { type: 'string', description: 'Sprites: which animation (the preview clip unless given)' },
            frame: { type: 'integer', minimum: 0, description: 'Sprites: one frame, counted from 0. Leave out for every frame of the clip in one row' },
            scale: { type: 'integer', minimum: 1, maximum: 8, description: 'Sprites: whole-number pixel size (1 unless given)' },
            params: PARAMS('Settings for the asset\'s controls, by key (assets_get lists them). Left-out controls stay at their defaults'),
            look: LOOK,
            artStyle: { type: 'string', description: 'Sprites: the art style to draw it in, one of the styles the sprite lists (assets_get shows them; its first unless given). Asking for one it does not list is refused' },
            style: { type: 'string', description: 'Sounds: one of the sound\'s named styles' },
            seed: { type: 'integer', minimum: 1, description: 'Sounds: which take (1 unless given); another seed is another variation' },
            format: { type: 'string', enum: ['wav', 'samples'], description: 'Sounds: "wav" (a data address, the default) or "samples" (one list of numbers per channel)' },
            maxSeconds: { type: 'number', minimum: 0.05, description: 'Sounds: stop after this long' },
          },
          additionalProperties: false,
        },
      },
      required: ['id'], additionalProperties: false,
    },
  },
  {
    name: 'bag_add', call: 'bag.add', args: ['id', 'settings'],
    description: 'Put an asset in the visitor\'s bag with its settings: a catalogue asset, or one made on this visit that passes the quality bar (warnings do not block; a draft with errors is refused). An asset made on this visit goes in with its whole definition, so it is still in the bag after a reload. Returns the new item\'s key. The same asset may be added more than once with different settings.',
    inputSchema: {
      type: 'object',
      properties: {
        id: ID('The asset id'),
        settings: SETTINGS,
      },
      required: ['id'], additionalProperties: false,
    },
  },
  {
    name: 'bag_items', call: 'bag.items', args: [],
    description: 'What is in the bag: each item\'s key, kind, id and settings, and the look applied to the whole bag. An item made on a visit also has its definition and a state: "ready", or "needs re-making" with the reason (it came from a link or an earlier visit and did not pass the quality bar again, so it is not drawn or exported).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'bag_remove', call: 'bag.remove', args: ['key'],
    description: 'Take one item out of the bag by its key (bag_items lists the keys).',
    inputSchema: { type: 'object', properties: { key: { type: 'string', description: 'The item key, for example "i3"' } }, required: ['key'], additionalProperties: false },
  },
  {
    name: 'bag_update', call: 'bag.update', args: ['key', 'settings'],
    description: 'Replace the settings of one bag item, by its key. The item stays the same asset; only how it is set up changes.',
    inputSchema: { type: 'object', properties: { key: { type: 'string', description: 'The item key, for example "i3"' }, settings: SETTINGS }, required: ['key', 'settings'], additionalProperties: false },
  },
  {
    name: 'bag_clear', call: 'bag.clear', args: [],
    description: 'Take everything out of the bag. The look applied to the bag stays. This cannot be undone.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'bag_link', call: 'bag.link', args: [],
    description: `A link that opens this same bag (items, settings and look) in someone else's browser. An item made on a visit travels with its whole source, so a link is refused when it would be longer than the 8,000 characters that chat and mail apps carry safely: share the download then.`,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'bag_set_look', call: 'bag.setLook', args: ['look'],
    description: 'Set the look applied to everything in the bag when it is downloaded, so the assets match. Leave look out to go back to the plain look.',
    inputSchema: { type: 'object', properties: { look: LOOK }, additionalProperties: false },
  },
  {
    name: 'bag_download', call: 'bag.download', args: ['options'],
    description: 'Build the bag as one zip package (sprite sheets, their JSON, WAV files, a manifest and a guide; for an asset made on this visit also its source) and start the browser download. Returns the file names and the size.',
    inputSchema: {
      type: 'object',
      properties: {
        options: {
          type: 'object',
          properties: {
            save: { type: 'boolean', description: 'false: build the package but do not start a download' },
            data: { type: 'boolean', description: 'true: also return the zip as a data address' },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'go', call: 'go', args: ['route'],
    description: 'Open a page of the site: "/" (home), "/browse?kind=sprite", "/sprite/<id>", "/sound/<id>", "/music/<id>", "/bundle/<id>", "/bundles", "/bag", "/play".',
    inputSchema: { type: 'object', properties: { route: { type: 'string', description: 'The part of the address after "#"' } }, required: ['route'], additionalProperties: false },
  },
  ...studioActions(),
];

// ---- the studio (docs/studio.md section 7, item S11; Contract 14 rule 10): app/api-studio.js -----------------------
// The numbers in these descriptions are STUDIO_API_LIMITS of app/api-studio.js (not imported here: this list is loaded
// by the build and by every first use of window.loadout, and the studio's modules only when a studio action is called);
// tests/unit/api-studio.test.mjs fails when they drift apart.
/** The studio's actions, in the order a person meets them. */
function studioActions() {
  const DRAFT = { type: 'string', pattern: '^[a-z][a-z0-9-]{0,39}$', description: 'A draft\'s name, as studio_create and studio_list give it, for example "moss-beast"' };
  const DEFINITION = { oneOf: [{ type: 'object', additionalProperties: true }, { type: 'string' }], description: 'A studio sprite: the object { "format": "loadout-sprite", "version": 1, id, name, blurb, meta, body, colours, controls, parts, clips, preview, ... } (docs/studio.md section 2; studio_get shows a whole one), or its JSON text. At most 64 KB of JSON. Data only: no code anywhere' };
  const EITHER = { oneOf: [DRAFT, { type: 'object', additionalProperties: true }], description: 'A draft\'s name, or a whole studio sprite definition (which is used, not kept)' };
  const NONE = { type: 'object', properties: {}, additionalProperties: false };
  return [
    {
      name: 'studio_starts', call: 'studio.starts', args: [],
      description: 'What a new studio sprite can start from: bone-rig templates (Two legs, Four legs, Crawler, Flyer, Blob, Blank, and top-down ones) and library bodies with a preset (the Hero). Each has a "from" to give studio_create, its view, frame size and clips.',
      inputSchema: NONE,
    },
    {
      name: 'studio_create', call: 'studio.create', args: ['from', 'name'],
      description: 'Make a new studio draft from a start (studio_starts lists them) and save it on this computer. The draft\'s name and the sprite\'s id come from the name ("Moss beast" -> "moss-beast"), never one the library or another draft uses. Returns { ok, draft, definition, saved, warnings }. The studio keeps at most 40 drafts and 2 MB; saved is false, with a warning, when this browser does not keep them.',
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'What to start from, as studio_starts gives it: "template:four-legs", "template:blank", "library:knight" (a template\'s id alone also works)' },
          name: { type: 'string', maxLength: 60, description: 'What the sprite is called, in everyday words ("Moss beast"); the start\'s own name when left out' },
        },
        required: ['from'], additionalProperties: false,
      },
    },
    {
      name: 'studio_list', call: 'studio.list', args: [],
      description: 'The drafts kept on this computer, newest first: each one\'s name, id, sprite name, when it was saved, whether it is in the bag, and its state ("ready", or "damaged" with the reasons: what is saved no longer passes the checks, so it is not drawn). kept is false when this browser does not keep drafts after the tab closes.',
      inputSchema: NONE,
    },
    {
      name: 'studio_get', call: 'studio.get', args: ['draft'],
      description: 'One draft\'s whole definition (the studio sprite as data), checked again as it is read. Change it and give it back with studio_set.',
      inputSchema: { type: 'object', properties: { draft: DRAFT }, required: ['draft'], additionalProperties: false },
    },
    {
      name: 'studio_set', call: 'studio.set', args: ['draft', 'definition'],
      description: 'Replace a draft\'s definition. It is checked first (at most 64 KB of JSON; counts capped: 48 bones, 160 shapes, 32 clips, 64 frames a clip and 256 in all; unknown fields dropped; numbers clamped; every reference must resolve; the id may not be one the library uses; sounds must exist) and only the cleaned copy is kept. Returns { ok, errors, warnings, definition, saved }; a refused definition changes nothing. A draft that is in the bag updates its bag item too.',
      inputSchema: { type: 'object', properties: { draft: DRAFT, definition: DEFINITION }, required: ['draft', 'definition'], additionalProperties: false },
    },
    {
      name: 'studio_validate', call: 'studio.validate', args: ['definition'],
      description: 'Check a studio sprite definition without keeping it: { ok, errors, warnings, value } where value is the cleaned copy that studio_set would keep. Errors stop it being drawn or kept; warnings are advice.',
      inputSchema: { type: 'object', properties: { definition: DEFINITION }, required: ['definition'], additionalProperties: false },
    },
    {
      name: 'studio_bake', call: 'studio.bake', args: ['draft', 'clip', 'from'],
      description: 'For a library body (the Hero): turn one of the body\'s own poses into keys for a clip, one key on every frame ("Start this clip over"), replacing that clip\'s keys and keeping its frame count, speed, sounds and nudges; a clip the draft has not got yet is made, with the pose\'s own frame count. Then move or delete keys with studio_set. Bone rigs have no poses to bake from.',
      inputSchema: {
        type: 'object',
        properties: {
          draft: DRAFT,
          clip: { type: 'string', description: 'The clip to bake into, an existing one or a new one ("walk", "wave")' },
          from: { type: 'string', description: 'The pose to take: idle, walk, run, jump, attack, punch, thrust, shoot, cast, block, hurt, die, victory, talk, stab, throw, toss or steal. Left out: the pose the clip was baked from before' },
        },
        required: ['draft', 'clip'], additionalProperties: false,
      },
    },
    {
      name: 'studio_render', call: 'studio.render', args: ['draftOrDefinition', 'options'],
      description: 'Draw a draft (or a definition given whole) and return a PNG data address: one frame, or a whole clip with every frame in one row when frame is left out, enlarged by scale (1 to 8), with its size, frame count, speed and how many pixels are drawn. bones: true draws the skeleton over a bone rig. At most 4,000,000 pixels in one picture.',
      inputSchema: {
        type: 'object',
        properties: {
          draftOrDefinition: EITHER,
          options: {
            type: 'object',
            properties: {
              clip: { type: 'string', description: 'Which animation (the sprite\'s preview clip unless given)' },
              frame: { type: 'integer', minimum: 0, description: 'One frame, counted from 0. Leave out for every frame of the clip in one row' },
              scale: { type: 'integer', minimum: 1, maximum: 8, description: 'Whole-number pixel size (1 unless given)' },
              params: { type: 'object', additionalProperties: true, description: 'Settings for the sprite\'s controls by key: colour slots ("#rrggbb"), sliders, parts (true or false). Left-out controls stay at their defaults' },
              bones: { type: 'boolean', description: 'true: draw the skeleton (a line per bone, a dot per joint) over the picture, as the studio does' },
            },
            additionalProperties: false,
          },
        },
        required: ['draftOrDefinition'], additionalProperties: false,
      },
    },
    {
      name: 'studio_advice', call: 'studio.advice', args: ['draftOrDefinition'],
      description: 'What the quality bar would say about a draft, as advice: { passes, problems (what the library would refuse), suggestions, metrics }. A studio sprite is not held to the bar: it goes in the bag and downloads whatever this says. The bar applies when the file is added to the library (sprites/<id>.js).',
      inputSchema: { type: 'object', properties: { draftOrDefinition: EITHER }, required: ['draftOrDefinition'], additionalProperties: false },
    },
    {
      name: 'studio_to_bag', call: 'studio.toBag', args: ['draft'],
      description: 'Put a draft in the visitor\'s bag, linked to it: later studio_set calls update the bag item. Returns the item\'s key. Not ready yet: until the bag learns studio sprites (studio work item S8) this answers "not yet" and changes nothing; use studio_file meanwhile.',
      inputSchema: { type: 'object', properties: { draft: DRAFT }, required: ['draft'], additionalProperties: false },
    },
    {
      name: 'studio_file', call: 'studio.file', args: ['draftOrDefinition'],
      description: 'The draft as a file for the library: { name: "<id>.js", text }, a fixed three-line wrapper around the definition as JSON (data, never code) to put in sprites/. library tells whether the library would take it as it is (its stricter checks: full metadata), with the reasons when not.',
      inputSchema: { type: 'object', properties: { draftOrDefinition: EITHER }, required: ['draftOrDefinition'], additionalProperties: false },
    },
    {
      name: 'studio_remove', call: 'studio.remove', args: ['draft'],
      description: 'Delete a draft from this computer. This cannot be undone: download it first (studio_file) to keep it. A bag item made from it stays in the bag.',
      inputSchema: { type: 'object', properties: { draft: DRAFT }, required: ['draft'], additionalProperties: false },
    },
  ];
}

