import type { Player } from './player.js';

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
        if (handlers.onNext) handlers.onNext();
        else player.next();
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'PageUp':
      case 'Backspace':
        e.preventDefault();
        if (handlers.onPrev) handlers.onPrev();
        else player.prev();
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
        handlers.onExit?.();
        break;
      case 'l':
      case 'L':
        e.preventDefault();
        laser.toggle();
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
    laser.dispose();
  };
}
