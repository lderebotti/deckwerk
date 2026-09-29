import type { Player } from './player.js';
import { bindInk, clearInk, createInkPalette } from './ink.js';

/**
 * The presenting key map, shared by the present window and the export bundle so
 * the keys behave identically whether or not the app is installed.
 */
export interface KeyHandlers {
  onExit?: () => void;
  onOverview?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  onHome?: () => void;
}

/**
 * The laser pointer: a red dot that follows the mouse while presenting, toggled
 * with L (Ctrl+L as in PowerPoint). The present windows hide the cursor, so the
 * dot is the only pointer the audience sees.
 */
export function bindLaserPointer(target: Window | HTMLElement): {
  toggle: () => boolean;
  setVisible: (visible: boolean) => void;
  visible: () => boolean;
  dispose: () => void;
} {
  const doc = 'document' in target ? target.document : target.ownerDocument;
  const dot = doc.createElement('div');
  dot.className = 'laser-pointer';
  dot.hidden = true;
  dot.style.transform = 'translate(-100px, -100px)';
  doc.body.appendChild(dot);
  const onMove = (ev: Event) => {
    const e = ev as MouseEvent;
    dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
  };
  target.addEventListener('mousemove', onMove);
  return {
    toggle: () => (dot.hidden = !dot.hidden, !dot.hidden),
    setVisible: (visible) => { dot.hidden = !visible; },
    visible: () => !dot.hidden,
    dispose: () => {
      target.removeEventListener('mousemove', onMove);
      dot.remove();
    },
  };
}

/**
 * Show the laser dot at a fraction of `stage`, for a pointer relayed from
 * Speaker View; null hides it. Uses the dot `bindPresentKeys` created.
 */
export function pointLaserAt(stage: Element | null, at: { x: number; y: number } | null): void {
  const dot = stage?.ownerDocument.querySelector<HTMLElement>('.laser-pointer');
  if (!stage || !dot) return;
  dot.hidden = !at;
  if (!at) return;
  const r = stage.getBoundingClientRect();
  dot.style.transform = `translate(${r.left + at.x * r.width}px, ${r.top + at.y * r.height}px)`;
}

export function bindPresentKeys(
  target: Window | HTMLElement,
  player: Player,
  handlers: KeyHandlers = {},
): () => void {
  const laser = bindLaserPointer(target);
  const doc = 'document' in target ? target.document : target.ownerDocument;
  const stage = () => doc.querySelector<HTMLElement>('.player-root > .stage');
  const ink = bindInk(target, stage);
  const next = () => (handlers.onNext ? handlers.onNext() : player.next());
  const prev = () => (handlers.onPrev ? handlers.onPrev() : player.prev());
  // The pen and the laser are one pointer; picking up either puts the other down.
  const toggleLaser = () => {
    if (laser.toggle()) ink.setActive(false);
    toolbar.sync();
  };
  const togglePen = () => {
    if (ink.toggle()) laser.setVisible(false);
    toolbar.sync();
  };
  const toolbar = createPresentToolbar(doc, {
    prev,
    next,
    toggleLaser,
    togglePen,
    erase: () => clearInk(stage()),
    laserOn: laser.visible,
    penOn: ink.active,
    palette: createInkPalette(doc, ink.pen),
  });
  target.addEventListener('mousemove', toolbar.reveal);
  const onKey = (ev: Event) => {
    const e = ev as KeyboardEvent;
    // Never steal keys from a focused field; the editor preview shares this map.
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) {
      return;
    }

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
      case ' ':
      case 'PageDown':
      case 'Enter':
        e.preventDefault();
        next();
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'PageUp':
      case 'Backspace':
        e.preventDefault();
        prev();
        break;
      case 'Home':
        e.preventDefault();
        if (handlers.onHome) handlers.onHome();
        else player.goToSlide(0);
        break;
      case 'b':
      case 'B':
        e.preventDefault();
        player.toggleBlank();
        break;
      case 'Escape':
        e.preventDefault();
        // Escape puts the pen down first, as in PowerPoint, rather than ending the show.
        if (ink.active()) {
          ink.setActive(false);
          toolbar.sync();
        } else handlers.onExit?.();
        break;
      case 'l':
      case 'L':
        e.preventDefault();
        toggleLaser();
        break;
      case 'p':
      case 'P':
        e.preventDefault();
        togglePen();
        break;
      case 'e':
      case 'E':
        e.preventDefault();
        clearInk(stage());
        break;
      case 'o':
      case 'O':
        e.preventDefault();
        handlers.onOverview?.();
        break;
    }
  };

  target.addEventListener('keydown', onKey);
  return () => {
    target.removeEventListener('keydown', onKey);
    target.removeEventListener('mousemove', toolbar.reveal);
    laser.dispose();
    ink.dispose();
    toolbar.dispose();
  };
}

const ICONS = {
  prev: '<path d="M10 3.5L5.5 8l4.5 4.5"/>',
  next: '<path d="M6 3.5L10.5 8 6 12.5"/>',
  laser: '<circle cx="8" cy="8" r="2.2" fill="currentColor"/><circle cx="8" cy="8" r="5.2"/>',
  pen: '<path d="M10.5 2.5l3 3-7.5 7.5H3v-3z"/><path d="M9 4l3 3"/>',
  erase: '<path d="M9.5 2.8l3.7 3.7-6.2 6.2H3.8L2.5 11.4z"/><path d="M6.5 5.8l3.7 3.7"/><path d="M7 12.7h6.5"/>',
};

/**
 * The slideshow toolbar, PowerPoint's: bottom left, shown while the mouse
 * moves and gone after it rests, so a presenter on one screen can reach the
 * laser, the pen and its colours without knowing the keys. While a pointer
 * tool is in use it waits until the mouse comes to its corner, so the ink and
 * the laser are not drawn under a toolbar. Its clicks stop here, so pressing
 * a button never advances the slide.
 */
function createPresentToolbar(doc: Document, tools: {
  prev: () => void;
  next: () => void;
  toggleLaser: () => void;
  togglePen: () => void;
  erase: () => void;
  laserOn: () => boolean;
  penOn: () => boolean;
  palette: HTMLElement;
}): { sync: () => void; reveal: (event: Event) => void; dispose: () => void } {
  const bar = doc.createElement('div');
  bar.className = 'present-toolbar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Presentation tools');
  const button = (name: keyof typeof ICONS, label: string, action: () => void) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = `present-tool present-tool-${name}`;
    b.title = label;
    b.setAttribute('aria-label', label);
    b.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${ICONS[name]}</svg>`;
    b.addEventListener('click', action);
    bar.appendChild(b);
    return b;
  };
  button('prev', 'Previous (←)', tools.prev);
  button('next', 'Next (→)', tools.next);
  const laser = button('laser', 'Laser pointer (L)', tools.toggleLaser);
  const pen = button('pen', 'Pen (P)', tools.togglePen);
  button('erase', 'Erase ink (E)', tools.erase);
  bar.appendChild(tools.palette);
  for (const type of ['click', 'mousedown', 'dblclick', 'contextmenu']) {
    bar.addEventListener(type, (event) => event.stopPropagation());
  }
  doc.body.appendChild(bar);

  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  const hideSoon = () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!bar.matches(':hover')) bar.classList.remove('shown');
    }, 2500);
  };
  const sync = () => {
    laser.setAttribute('aria-pressed', String(tools.laserOn()));
    pen.setAttribute('aria-pressed', String(tools.penOn()));
  };
  const reveal = (event: Event) => {
    const e = event as MouseEvent;
    if (e.buttons) return; // mid-stroke
    if (tools.laserOn() || tools.penOn()) {
      const r = bar.getBoundingClientRect();
      const near = e.clientX <= r.right + 60 && e.clientY >= r.top - 60;
      if (!near) return;
    }
    sync();
    bar.classList.add('shown');
    hideSoon();
  };
  bar.addEventListener('mouseleave', hideSoon);
  sync();
  return {
    sync,
    reveal,
    dispose: () => {
      clearTimeout(hideTimer);
      bar.remove();
    },
  };
}
