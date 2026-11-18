// A rig's description (rigs/<rig>-describe.js) is true of the pictures: every pose, part, held kind, hair style, body
// kind, effect and socket it lists is drawn through the function it names (tools/rig.mjs calls it from the description
// alone), paints pixels, shows in exactly the directions it says, and stays inside the frame at both ends of every
// range it gives. The other half (nothing in the code is left out) is rig-describe-data.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RIG_IDS, loadRig, drawPose, drawEntry, socketsOf, phasesOf, diff, offFrame, choicesOf } from '../../tools/rig.mjs';

const count = (g) => { let n = 0; for (const v of g.data) if (v) n++; return n; };
const inside = (g, what) => assert.equal(offFrame(g), null, `${what}: drawing touches the frame edge (${JSON.stringify(g.bounds())})`);

for (const id of RIG_IDS) {
  const L = await loadRig(id), { rig } = L;
  const BODIES = { standard: {}, smallest: Object.fromEntries(Object.entries(rig.body.controls).map(([k, o]) => [k, o.min])), largest: Object.fromEntries(Object.entries(rig.body.controls).map(([k, o]) => [k, o.max])) };

  test(`${id}: every pose draws a body in each of its directions, every frame inside the frame`, () => {
    for (const pose of rig.poses) {
      const still = drawPose(L, rig.poses[0], { direction: pose.directions[0], t: 0 });
      let moved = 0;
      for (const direction of pose.directions) for (const [size, body] of Object.entries(BODIES)) for (const t of phasesOf(pose)) {
        const g = drawPose(L, pose, { direction, t, body });
        assert.ok(count(g) > 60, `${id} ${pose.name} ${direction} ${size} t=${t.toFixed(2)}: a body is drawn`);
        inside(g, `${id} ${pose.name} ${direction} ${size} t=${t.toFixed(2)}`);
        if (size === 'standard' && direction === pose.directions[0]) moved += diff(g, still);
      }
      if (pose !== rig.poses[0]) assert.ok(moved > 0, `${id}: pose "${pose.name}" is the same picture as "${rig.poses[0].name}" on every frame: ${pose.fn} does not know it`);
    }
  });

  test(`${id}: pose options are accepted at both ends`, () => {
    for (const pose of rig.poses) for (const [key, o] of Object.entries(pose.options ?? {})) {
      if (!('min' in o)) continue;
      for (const v of [o.min, o.max]) for (const direction of pose.directions) for (const t of phasesOf(pose)) inside(drawPose(L, pose, { direction, t, m: { [key]: v } }), `${id} ${pose.name} ${direction} ${key}=${v}`);
    }
  });

  test(`${id}: every body kind and every hair style is drawn`, () => {
    for (const kind of rig.body.kinds) for (const direction of rig.directions) {
      const g = drawEntry(L, 'body', kind, { direction });
      assert.ok(count(g) > 60, `${id}: body "${kind.name}" ${direction}`);
      inside(g, `${id} body ${kind.name} ${direction}`);
    }
    const kinds = rig.body.kinds.map((k) => drawEntry(L, 'body', k, { direction: rig.directions[0] }));
    for (let i = 1; i < kinds.length; i++) assert.ok(diff(kinds[i], kinds[0]) > 0, `${id}: body "${rig.body.kinds[i].name}" is the same picture as "${rig.body.kinds[0].name}"`);
    for (const hair of rig.hair) for (const direction of rig.directions) {
      const g = drawEntry(L, 'hair', hair, { direction }), bare = drawEntry(L, 'hair', hair, { direction, bare: true });
      const shows = hair.directions.includes(direction);
      assert.equal(diff(g, bare) > 0, shows, `${id}: hair "${hair.name}" ${direction}: the description says it ${shows ? 'shows' : 'does not show'}`);
      inside(g, `${id} hair ${hair.name} ${direction}`);
    }
  });

  test(`${id}: every part paints pixels in exactly the directions it says`, () => {
    for (const part of rig.parts) for (const direction of rig.directions) {
      const g = drawEntry(L, 'parts', part, { direction }), bare = drawEntry(L, 'parts', part, { direction, bare: true });
      const shows = part.directions.includes(direction);
      assert.equal(diff(g, bare) > 0, shows, `${id}: part "${part.name}" facing ${direction}: the description says it ${shows ? 'shows' : 'does not show'}, and ${part.fn} ${shows ? 'painted nothing' : 'painted something'}`);
      inside(g, `${id} part ${part.name} ${direction}`);
    }
  });

  test(`${id}: every choice of a part is a different picture`, () => {
    for (const part of rig.parts) for (const [key, values] of choicesOf(part)) {
      const direction = part.directions[0], seen = [];
      for (const v of values) {
        const g = drawEntry(L, 'parts', part, { direction, options: { [key]: v } }), bare = drawEntry(L, 'parts', part, { direction, options: { [key]: v }, bare: true });
        assert.ok(diff(g, bare) > 0, `${id}: part "${part.name}" with ${key} "${v}" paints nothing`);
        for (const [w, h] of seen) assert.ok(diff(g, h) > 0, `${id}: part "${part.name}": ${key} "${v}" is the same picture as "${w}"`);
        seen.push([v, g]);
      }
    }
  });

  test(`${id}: every option range of a part is accepted at both ends, on every body, without leaving the frame`, () => {
    for (const part of rig.parts) {
      const kinds = choicesOf(part).find(([k]) => k === 'kind' || k === 'style')?.[1] ?? [undefined];
      for (const [key, o] of Object.entries(part.options ?? {})) {
        if (!('min' in o)) continue;
        for (const kind of kinds) for (const direction of part.directions) {
          const key0 = choicesOf(part).find(([k]) => k === 'kind' || k === 'style')?.[0];
          const base = kind === undefined ? {} : { [key0]: kind };
          for (const [size, body] of Object.entries(BODIES)) for (const v of [o.min, o.max]) {
            inside(drawEntry(L, 'parts', part, { direction, body, options: { ...base, [key]: v } }), `${id} part ${part.name}${kind ? ` (${kind})` : ''} ${direction} ${size} body ${key}=${v}`);
          }
          // the two ends are two pictures, unless the description says the option does nothing for this kind (`except`), and then they are one
          const changes = part.directions.some((dir) => diff(drawEntry(L, 'parts', part, { direction: dir, options: { ...base, [key]: o.min } }), drawEntry(L, 'parts', part, { direction: dir, options: { ...base, [key]: o.max } })) > 0);
          const excepted = !!o.except?.includes(kind);
          if (!o.subtle) assert.equal(changes, !excepted, `${id}: part "${part.name}"${kind ? ` (${kind})` : ''}: ${key} ${o.min} and ${o.max} are ${changes ? 'two pictures, and the description says the option does nothing here' : 'the same picture in every direction'}`);
        }
      }
    }
  });

  test(`${id}: every held kind is drawn in each direction it says, at both ends of its length, and stays in the frame through its clips`, () => {
    for (const held of rig.held) {
      const ways = [held, ...(held.also ?? []).filter((a) => a.fn).map((a) => ({ ...held, ...a, also: undefined }))];
      for (const way of ways) for (const direction of rig.directions) {
        const shows = way.directions.includes(direction);
        for (const scale of [way.length.min, way.length.default, way.length.max]) {
          const g = drawEntry(L, 'held', way, { direction, scale }), bare = drawEntry(L, 'held', way, { direction, scale, bare: true });
          assert.equal(diff(g, bare) > 0, shows, `${id}: held "${way.name}" through ${way.fn} facing ${direction} at length ${scale}: the description says it ${shows ? 'shows' : 'does not show'}`);
          inside(g, `${id} held ${way.name} ${direction} length ${scale}`);
        }
        // through every frame of the clips it is used in, at its longest, on the biggest body
        for (const action of way.clips ?? []) {
          const pose = rig.poses.find((p) => p.name === action);
          assert.ok(pose, `${id}: held "${way.name}" names the clip "${action}", which is not a pose`);
          if (!pose.directions.includes(direction)) continue;
          for (const t of phasesOf(pose)) inside(drawEntry(L, 'held', way, { direction, scale: way.length.max, action, t, body: BODIES.largest }), `${id} held ${way.name} ${direction} in ${action} t=${t.toFixed(2)}`);
        }
      }
      const a = drawEntry(L, 'held', held, { direction: held.directions[0], scale: held.length.min }), b = drawEntry(L, 'held', held, { direction: held.directions[0], scale: held.length.max });
      assert.ok(diff(a, b) > 0, `${id}: held "${held.name}": length ${held.length.min} and ${held.length.max} are the same picture`);
    }
    // two kinds that are told apart by name are two pictures
    for (const direction of rig.directions) {
      const seen = [];
      for (const held of rig.held.filter((h) => h.directions.includes(direction) && !h.sameAs)) {
        const g = drawEntry(L, 'held', held, { direction, scale: held.length.default });
        for (const [name, h] of seen) assert.ok(diff(g, h) > 0, `${id}: held "${held.name}" and "${name}" are the same picture facing ${direction}`);
        seen.push([held.name, g]);
      }
    }
  });

  test(`${id}: every manner, stance and body feature changes the picture`, () => {
    for (const m of rig.manners ?? []) {
      assert.ok(m.appliesTo.every((a) => rig.poses.some((p) => p.name === a)), `${id}: manner "${m.name}" acts on ${m.appliesTo.join(', ')}: each is a pose`);
      const changed = rig.directions.some((direction) => diff(drawEntry(L, 'manners', m, { direction }), drawEntry(L, 'manners', m, { direction, bare: true })) > 0);
      assert.ok(changed, `${id}: manner "${m.name}" through ${m.fn} changes nothing on ${JSON.stringify(m.shownWith)}`);
      for (const direction of rig.directions) inside(drawEntry(L, 'manners', m, { direction }), `${id} manner ${m.name} ${direction}`);
    }
    const stances = rig.stances ?? [];
    for (const s of stances.slice(1)) {
      assert.ok(diff(drawEntry(L, 'stances', s, {}), drawEntry(L, 'stances', s, { bare: true })) > 0, `${id}: stance "${s.name}" is the same picture as no stance`);
      for (const pose of rig.poses.filter((p) => p.fn === rig.poses[0].fn)) for (const t of phasesOf(pose)) inside(drawEntry(L, 'stances', s, { action: pose.name, t }), `${id} stance ${s.name} in ${pose.name} t=${t.toFixed(2)}`);
    }
    if (stances.length) assert.equal(diff(drawEntry(L, 'stances', stances[0], {}), drawEntry(L, 'stances', stances[0], { bare: true })), 0, `${id}: the first stance, "${stances[0].name}", is the body as it stands`);
    for (const f of rig.body.features ?? []) {
      const seen = [];
      for (const v of f.choices) {
        const g = drawEntry(L, 'body', f, { options: { [f.option]: v } });
        for (const [w, h] of seen) assert.ok(diff(g, h) > 0, `${id}: ${f.name} "${v}" is the same picture as "${w}"`);
        seen.push([v, g]);
      }
    }
  });

  test(`${id}: every effect is drawn on the frame it says`, () => {
    for (const fx of rig.effects) {
      const direction = fx.directions[0];
      const g = drawEntry(L, 'effects', fx, { direction }), bare = drawEntry(L, 'effects', fx, { direction, bare: true });
      assert.ok(diff(g, bare) > 0, `${id}: effect "${fx.name}" through ${fx.fn} paints nothing on ${JSON.stringify(fx.shownWith ?? {})}`);
      inside(g, `${id} effect ${fx.name}`);
    }
  });

  test(`${id}: the sockets are the ones listed, on every frame of every pose, inside the frame`, () => {
    const always = rig.sockets.filter((s) => !s.when).map((s) => s.name).sort(), all = new Set(rig.sockets.map((s) => s.name));
    for (const pose of rig.poses) for (const direction of pose.directions) for (const t of phasesOf(pose)) {
      const S = socketsOf(L, pose, { direction, t });
      for (const name of always) assert.ok(S[name], `${id} ${pose.name} ${direction}: no socket "${name}"`);
      for (const [name, at] of Object.entries(S)) {
        assert.ok(all.has(name), `${id} ${pose.name} ${direction}: the rig gives a socket "${name}" the description does not list`);
        assert.ok(Number.isFinite(at.x) && Number.isFinite(at.y) && Number.isFinite(at.angle), `${id} ${pose.name} ${direction} ${name}: x, y, angle`);
        assert.ok(at.x >= 0 && at.x <= rig.size[0] && at.y >= 0 && at.y <= rig.size[1], `${id} ${pose.name} ${direction} t=${t.toFixed(2)}: socket ${name} is outside the frame (${at.x.toFixed(1)}, ${at.y.toFixed(1)})`);
      }
    }
    // a socket that is only there when asked for is there when asked for
    for (const s of rig.sockets.filter((x) => x.when)) {
      const S = socketsOf(L, rig.poses[0], { direction: rig.directions[0], t: 0, ask: s.name });
      assert.ok(S[s.name], `${id}: socket "${s.name}" (${s.when}) is not given when asked for`);
    }
  });
}
