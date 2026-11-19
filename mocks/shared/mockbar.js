// A small floating switcher shown on every mock page, so the five designs can be compared quickly.
// It is NOT part of any design. Include it last on each page:
//   <script type="module" src="../shared/mockbar.js"></script>
export const DESIGNS = [
  { slug: '1-studio', name: 'Studio' },
  { slug: '2-showcase', name: 'Showcase' },
  { slug: '3-playroom', name: 'Playroom' },
  { slug: '4-scene', name: 'Scene first' },
  { slug: '5-catalogue', name: 'Catalogue' },
];
const PAGES = [['landing', 'Landing'], ['library', 'Library'], ['remix', 'Remix']];

const m = location.pathname.match(/mocks\/([^/]+)\/([^/.]+)\.html/);
if (m) {
  const i = DESIGNS.findIndex((d) => d.slug === m[1]);
  const page = PAGES.some(([p]) => p === m[2]) ? m[2] : 'landing';
  const at = (k) => DESIGNS[(k + DESIGNS.length) % DESIGNS.length];
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host { all: initial; position: fixed; left: 50%; bottom: 14px; transform: translateX(-50%); z-index: 2147483000; font: 500 13px/1 system-ui, sans-serif; }
      nav { display: flex; align-items: center; gap: 2px; padding: 5px; border-radius: 999px; background: rgba(20, 22, 28, .92); color: #fff; box-shadow: 0 6px 24px rgba(0, 0, 0, .28); white-space: nowrap; }
      a, button { all: unset; cursor: pointer; padding: 8px 11px; border-radius: 999px; color: #c9cdd6; }
      a:hover, button:hover { color: #fff; background: rgba(255, 255, 255, .12); }
      a[aria-current] { color: #14161c; background: #fff; }
      a:focus-visible, button:focus-visible { outline: 2px solid #8ab4ff; }
      b { padding: 0 10px 0 12px; font-weight: 600; }
      i { width: 1px; height: 18px; background: rgba(255, 255, 255, .2); margin: 0 4px; }
      nav.min > :not(.keep) { display: none; }
      @media (max-width: 640px) { b span { display: none; } a, button { padding: 8px 8px; } }
    </style>
    <nav aria-label="Mock-up switcher">
      <a href="../index.html" class="keep" title="All five designs">All</a><i></i>
      <a href="../${at(i - 1).slug}/${page}.html" title="Previous design: ${at(i - 1).name}">‹</a>
      <b>${i + 1} of ${DESIGNS.length}<span> · ${DESIGNS[i]?.name ?? ''}</span></b>
      <a href="../${at(i + 1).slug}/${page}.html" title="Next design: ${at(i + 1).name}">›</a><i></i>
      ${PAGES.map(([p, label]) => `<a href="${p}.html" ${p === page ? 'aria-current="page"' : ''}>${label}</a>`).join('')}
      <i></i><button class="keep" title="Hide or show this switcher">–</button>
    </nav>`;
  const nav = root.querySelector('nav');
  root.querySelector('button').onclick = () => nav.classList.toggle('min');
  document.body.append(host);
}
