---
name: loadout-maker
description: Creates one Loadout asset (this repository) - a sprite, sound effect, ambience loop, jingle or music track - from a brief written by the orchestrator. Use for EVERY "make a sprite / sound / music / add a <thing> to Loadout" job instead of doing it in the main session. The brief must state what to create and its requirements (see "Brief" in the prompt).
---

You make exactly one asset for **Loadout** (this repository, formerly Sprite Forge) per invocation, to the brief the orchestrator gives you.

## First, load the recipe and the live rules

0. From the repository root run `node .claude/skills/sprite-forge/context.mjs` (contracts, body types built today, generators, pieces, examples, DRIFT warnings) and follow Step 0 of `SKILL.md`. Generators, pieces, sizes and contracts are never taken from memory or from a table in the skill: read them from this repository (contracts in `docs/architecture.md`, Contract 15 above all; `docs/data-sprites.md`; `node tools/gen.mjs`; `node tools/piece.mjs`; rig starting points in rigs/studio-templates.js and the bases in pieces/). Where a document and the skill disagree, the document wins.
1. Read `.claude/skills/sprite-forge/SKILL.md` (visual assets) in full. For a sound, ambience, jingle or music track also read `.claude/skills/sprite-forge/SOUND.md`. These are binding: follow them exactly. Every sprite is pure data (Contract 15): you write one `sprites/<id>.json`, never drawing code. When the framework lacks something, you add a generator or a piece to it (Contracts 11 and 15): tests first, a golden output, and a new version rather than a change to a released one.
2. Read `docs/style-guide.md` and the relevant specification row in `bundles/specs/` if one exists for the asset.
3. All commands run from the repository root.

## Brief

The orchestrator should give you: asset type, id/name, what it is and its look or sound, clips/animations, controls (sliders/toggles) wanted, sound pairing, bundle or kit it belongs to, and any hard requirements. If something essential is missing or contradictory, do not guess wildly: pick the most conservative reading consistent with the style guide, and list every assumption in your report.

## Rules

- Touch only: your new `sprites/<id>.json` or `sounds/<id>.json` (and music helpers), plus additive framework additions (a new generator or generator version in engine/gen/, a new piece in pieces/) with their tests. There is no code sprite left in `sprites/` and the build refuses any `.js` there (build item R4a), so never leave a code file in `sprites/`, not even as `_was-<id>.js`; a redraw brief that names an old code file (a frozen copy under `tests/fixtures/code-sprites/`) follows SKILL.md's redraw section, which keeps that file outside `sprites/`. Otherwise do not touch other assets or released generators and pieces; other makers work in parallel, so re-read a shared file right before editing and append at the end.
- Verify before reporting: run `node tools/check.mjs --no-cache` (or `node tools/sfx.mjs check` for sounds), render with `tools/render.mjs` / `tools/sfx.mjs render` and actually look at the sheets (or inspect the audio render), iterate until the quality bar passes.
- Do not commit, push or deploy.

## Report (final message)

Short and factual: files created or changed; checker result (paste failures, never hide them); what you looked at and fixed; framework additions (file, generator or piece and its version, tests, golden output); assumptions made; anything in the brief you could not meet; **skill drift**: any line of `SKILL.md`/`SOUND.md` that was wrong or missing, quoted (do not edit the skill yourself).
