// "Surprise me", wherever it is (an asset's panel, a kit's look, the landing line-up): one button that looks like it
// does something special. A colour-shifting fill and a twinkling star (app/css/base.css, .btn-magic), and on each
// press a small burst of sparkles from the button. Nothing moves for a visitor who asked for less motion.
//
//   makeMagic(button) -> the same button, dressed. Safe to import anywhere: it touches the page only when called.

const NS = 'http://www.w3.org/2000/svg';
// a four-point star and a small one beside it (24 units)
const STAR = 'M10 2.5l1.9 5.6 5.6 1.9-5.6 1.9L10 17.5l-1.9-5.6L2.5 10l5.6-1.9ZM18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z';
const COLOURS = ['#ff5fa2', '#ffb020', '#7c5cff', '#2ec4ff', '#ffe066'];
const SPARKS = 12;

function star() {
  const n = document.createElementNS(NS, 'svg');
  n.setAttribute('viewBox', '0 0 24 24'); n.setAttribute('width', '16'); n.setAttribute('height', '16');
  n.setAttribute('aria-hidden', 'true'); n.setAttribute('class', 'magic-star'); n.setAttribute('fill', 'currentColor');
  const p = document.createElementNS(NS, 'path'); p.setAttribute('d', STAR); n.append(p);
  return n;
}

/** Sparkles fly out from the button and fade. They sit on the page, so a button that is redrawn does not cut them short. */
function burst(button) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const r = button.getBoundingClientRect();
  const layer = document.createElement('span');
  layer.className = 'magic-burst';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.left = `${r.left + r.width / 2}px`;
  layer.style.top = `${r.top + r.height / 2}px`;
  for (let i = 0; i < SPARKS; i++) {
    const a = (i / SPARKS) * Math.PI * 2 + Math.random() * 0.4;
    const d = 34 + Math.random() * 30 + r.width * 0.25;
    const s = document.createElement('span');
    s.style.setProperty('--dx', `${Math.cos(a) * d}px`);
    s.style.setProperty('--dy', `${Math.sin(a) * d * 0.7}px`);
    s.style.setProperty('--c', COLOURS[i % COLOURS.length]);
    s.style.setProperty('--sz', `${8 + Math.round(Math.random() * 6)}px`);
    s.style.animationDelay = `${Math.round(Math.random() * 60)}ms`;
    layer.append(s);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 900);
  button.classList.remove('is-casting'); void button.offsetWidth; button.classList.add('is-casting');
}

/** Dress a "Surprise me" button: the magic look, a star before its words, sparkles on every press. Returns the button. */
export function makeMagic(button) {
  button.classList.remove('btn-secondary', 'btn-sm');
  button.classList.add('btn-magic');
  button.prepend(star());
  // (in the capture phase, so the burst takes its place from the button before whatever the press does redraws the page)
  button.addEventListener('click', () => burst(button), true);
  button.addEventListener('animationend', (e) => { if (e.animationName === 'magic-cast') button.classList.remove('is-casting'); });
  return button;
}
