// Playground: what the visitor is pressing, from the keyboard and from the on-screen buttons.
//   walk: arrow keys or W A S D     jump: Space (or Up / W in side view)
//   action: X or J                  run: hold Shift
//   block: C                        dodge: V
// Keys typed into a form field are left alone, and Space on a focused button still presses that button.

const KEYS = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  Space: 'jump', KeyX: 'action', KeyJ: 'action', ShiftLeft: 'run', ShiftRight: 'run', KeyC: 'block', KeyV: 'dodge',
};

/**
 * pad: the element holding the on-screen buttons; each button says what it does in data-hold
 * (left | right | up | down | jump | action | block). ignore: a selector; keys pressed inside a match are left alone
 * (the editing panel beside the scene). Returns { state(mode), destroy() }.
 */
export function createInput({ pad = null, ignore = null } = {}) {
  const keys = new Set(), touch = new Set();
  const tapped = new Set();      // pressed since the scene last looked, so a tap shorter than one frame still counts
  const field = (el) => !!(el && el.closest && el.closest('input, select, textarea, [contenteditable=""], [contenteditable="true"]'));
  const control = (el) => !!(el && el.closest && el.closest('button, a, summary'));

  const down = (e) => {
    const name = KEYS[e.code];
    if (!name || e.metaKey || e.ctrlKey || e.altKey || field(e.target)) return;
    if (ignore && e.target && e.target.closest && e.target.closest(ignore)) return;      // the keyboard is in the editing panel: its keys are the panel's
    if (e.code === 'Space' && control(e.target)) return;
    keys.add(name); tapped.add(name);
    if (name !== 'run') e.preventDefault();          // the arrow keys and Space would scroll the page
  };
  const up = (e) => { const name = KEYS[e.code]; if (name) keys.delete(name); };
  const clear = () => { keys.clear(); touch.clear(); tapped.clear(); sync(); };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', clear);

  const buttons = pad ? [...pad.querySelectorAll('[data-hold]')] : [];
  const sync = () => { for (const b of buttons) b.classList.toggle('held', touch.has(b.dataset.hold)); };
  const press = (e) => {
    e.preventDefault();
    touch.add(e.currentTarget.dataset.hold); tapped.add(e.currentTarget.dataset.hold);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* an old browser: the button still works */ }
    sync();
  };
  const release = (e) => { touch.delete(e.currentTarget.dataset.hold); sync(); };
  const nothing = (e) => e.preventDefault();
  for (const b of buttons) {
    b.addEventListener('pointerdown', press);
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    b.addEventListener('lostpointercapture', release);
    b.addEventListener('contextmenu', nothing);
  }

  const on = (name) => keys.has(name) || touch.has(name) || tapped.has(name);
  return {
    /** What is held now, or was tapped since the last call (call it once a frame). In side view Up also jumps. */
    state(mode) {
      const out = {
        left: on('left'), right: on('right'), up: on('up'), down: on('down'),
        jump: on('jump') || (mode !== 'top' && on('up')), action: on('action'), run: on('run'), block: on('block'), dodge: on('dodge'),
      };
      tapped.clear();
      return out;
    },
    destroy() {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      for (const b of buttons) {
        b.removeEventListener('pointerdown', press);
        b.removeEventListener('pointerup', release);
        b.removeEventListener('pointercancel', release);
        b.removeEventListener('lostpointercapture', release);
        b.removeEventListener('contextmenu', nothing);
      }
    },
  };
}
