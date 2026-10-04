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
 * The laser's smear is opt-in: on only when this preference is "true". Every
 * DeckWerk window shares one origin and the laser reads it as it moves, so
 * switching it in Speaker View reaches the audience window straight away.
 */
const LASER_TRAIL_KEY = 'deckwerk.laserTrail';
export function laserTrailEnabled(): boolean {
  try { return localStorage.getItem(LASER_TRAIL_KEY) === 'true'; } catch { return false; }
}
export function setLaserTrail(on: boolean): void {
  try { localStorage.setItem(LASER_TRAIL_KEY, String(on)); } catch { /* not remembered */ }
}

/** How long the laser's smear lingers behind the dot, in milliseconds. */
const TRAIL_MS = 120;
/** Each dot's trail, so a pointer relayed from Speaker View smears too. */
const trails = new WeakMap<HTMLElement, (x: number, y: number) => void>();

function moveDot(dot: HTMLElement, x: number, y: number): void {
  dot.style.transform = `translate(${x}px, ${y}px)`;
  if (!dot.hidden) trails.get(dot)?.(x, y);
}

/**
 * The smear, as in PowerPoint: the laser's last few positions drawn behind the
 * dot, thinning and fading out within TRAIL_MS. It animates only while there
 * is something left to fade, so a resting laser costs nothing.
 */
function createLaserTrail(doc: Document): { push: (x: number, y: number) => void; dispose: () => void } {
  const win = doc.defaultView!;
  const canvas = doc.createElement('canvas');
  canvas.className = 'laser-trail';
  doc.body.appendChild(canvas);
  let points: Array<{ x: number; y: number; t: number }> = [];
  let frame = 0;
  const draw = () => {
    frame = 0;
    const now = performance.now();
    points = points.filter((p) => now - p.t < TRAIL_MS);
    const dpr = win.devicePixelRatio || 1;
    const w = win.innerWidth;
    const h = win.innerHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(255, 0, 0, 0.8)';
    ctx.shadowBlur = 6;
    for (let i = 1; i < points.length; i++) {
      const life = 1 - (now - points[i].t) / TRAIL_MS;
      ctx.strokeStyle = `rgba(255, 42, 42, ${0.6 * life})`;
      ctx.lineWidth = 1.5 + 5 * life;
      ctx.beginPath();
      ctx.moveTo(points[i - 1].x, points[i - 1].y);
      ctx.lineTo(points[i].x, points[i].y);
      ctx.stroke();
    }
    if (points.length) frame = win.requestAnimationFrame(draw);
  };
  return {
    push: (x, y) => {
      points.push({ x, y, t: performance.now() });
      if (!frame) frame = win.requestAnimationFrame(draw);
    },
    dispose: () => {
      win.cancelAnimationFrame(frame);
      canvas.remove();
    },
  };
}

/**
 * The laser pointer: a red dot that follows the mouse while presenting, toggled
 * with L (Ctrl+L as in PowerPoint), smearing behind it as it moves if the
 * presenter opted in (setLaserTrail). The present
 * windows hide the cursor, so the dot is the only pointer the audience sees.
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
  // The trail's canvas is made the first time it has something to draw.
  let trail: ReturnType<typeof createLaserTrail> | null = null;
  trails.set(dot, (x, y) => {
    if (laserTrailEnabled()) (trail ??= createLaserTrail(doc)).push(x, y);
  });
  const onMove = (ev: Event) => {
    const e = ev as MouseEvent;
    moveDot(dot, e.clientX, e.clientY);
  };
  target.addEventListener('mousemove', onMove);
  return {
    toggle: () => (dot.hidden = !dot.hidden, !dot.hidden),
    setVisible: (visible) => { dot.hidden = !visible; },
    visible: () => !dot.hidden,
    dispose: () => {
      target.removeEventListener('mousemove', onMove);
      trail?.dispose();
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
  moveDot(dot, r.left + at.x * r.width, r.top + at.y * r.height);
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
  // The present window hides the cursor (present/index.html); as in PowerPoint
  // it comes back while the mouse moves and goes again once it rests.
  let cursorTimer: ReturnType<typeof setTimeout> | undefined;
  const showCursor = () => {
    doc.body.classList.add('pointer-moving');
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => doc.body.classList.remove('pointer-moving'), 2500);
  };
  target.addEventListener('mousemove', showCursor);
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
    target.removeEventListener('mousemove', showCursor);
    clearTimeout(cursorTimer);
    doc.body.classList.remove('pointer-moving');
    laser.dispose();
    ink.dispose();
    toolbar.dispose();
  };
}

const ICONS = {
  prev: '<path d="M10 3.5L5.5 8l4.5 4.5"/>',
  next: '<path d="M6 3.5L10.5 8 6 12.5"/>',
  laser: '<circle cx="8" cy="8" r="2.2" fill="currentColor"/><circle cx="8" cy="8" r="5.2"/>',
  trail: '<circle cx="11.5" cy="4.5" r="2" fill="currentColor"/><path d="M9.6 6.4L2.5 13.5"/>'
    + '<path d="M8.2 4.6L4.5 8.3" opacity=".55"/><path d="M11.4 7.8L7.7 11.5" opacity=".55"/>',
  pen: '<path d="M10.5 2.5l3 3-7.5 7.5H3v-3z"/><path d="M9 4l3 3"/>',
  erase: '<path d="M9.5 2.8l3.7 3.7-6.2 6.2H3.8L2.5 11.4z"/><path d="M6.5 5.8l3.7 3.7"/><path d="M7 12.7h6.5"/>',
};

/**
 * The slideshow toolbar, PowerPoint's: bottom left, shown while the mouse
 * moves and gone after it rests, so a presenter on one screen can reach the
 * laser (and switch its trail), the pen and its colours without knowing the
 * keys. While a pointer
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
  const trail = button('trail', 'Laser trail', () => {
    setLaserTrail(!laserTrailEnabled());
    sync();
  });
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
    trail.setAttribute('aria-pressed', String(laserTrailEnabled()));
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
