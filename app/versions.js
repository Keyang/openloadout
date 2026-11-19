// Ready-made versions for the pages (docs/site-design.md, section 4). The build writes every catalogue asset's versions
// to generated/versions.json (tools/lib/versions-build.mjs); the pages read them from there, one fetch for the whole
// site. An asset that file does not know (one made on this visit) gets its versions made on the spot by the framework
// (engine/versions.js), which is loaded only then.
export const VERSIONS_URL = 'generated/versions.json';

let all = null;

/**
 * Every asset's versions, as the build wrote them: { id: [{ name, made, params? , style? }] }. Fetched once.
 * A file that cannot be read gives {} (every asset then gets versions made on the spot). opts.fetcher: for tests.
 */
export function loadVersions({ url = VERSIONS_URL, fetcher = (u) => fetch(u) } = {}) {
  all ??= Promise.resolve().then(() => fetcher(url)).then((r) => (r.ok ? r.json() : {})).then((v) => (v && typeof v === 'object' ? v : {})).catch(() => ({}));
  return all;
}
/** Forget what was fetched (tests, and after the catalogue is swapped). */
export function forgetVersions() { all = null; }

/**
 * The first n ready-made versions of one asset: [{ name, made: 'hand' | 'generated', params?, style? }].
 *   kind   'sprite' | 'sound' | 'music'
 *   asset  the sprite's program, or the sound's or track's patch (anything with an id)
 * A sprite version's params are the controls that differ from the sprite's own; a sound version has a style (one of
 * the patch's named styles), params (its controls), or both. Fewer versions are always the first of more.
 */
export async function versionsFor(kind, asset, n = 12, opts = {}) {
  const file = await loadVersions(opts);
  if (Array.isArray(file[asset.id])) return file[asset.id].slice(0, n);
  try {
    const { versionsOf, soundVersionsOf } = await import('../engine/versions.js');
    return kind === 'sprite' ? versionsOf(asset, n) : soundVersionsOf(asset, n);
  } catch (e) { console.error('versions:', e); return []; }
}
