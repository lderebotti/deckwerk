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
 * The laser pointer: a red dot that follows the mouse while presenting, toggled
 * with L (Ctrl+L as in PowerPoint). The present windows hide the cursor, so the
 * dot is the only pointer the audience sees.
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
  const onMove = (ev: Event) => {
    const e = ev as MouseEvent;
    dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
  };
  target.addEventListener('mousemove', onMove);
  return {
    toggle: () => (dot.hidden = !dot.hidden, !dot.hidden),
    setVisible: (visible) => { dot.hidden = !visible; },
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
