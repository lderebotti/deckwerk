import type { InkPoint, InkStroke, SlideInk } from '@shared/ink.js';

/**
 * The pen: freehand ink drawn over the slide while presenting, as in
 * PowerPoint and Google Slides. Ink is painted on a canvas inside the stage, in
 * the deck's own canvas pixels, so it scales with the slide and hides with a
 * blanked screen. Every stroke is also kept by slide id for the rest of the
 * show, so a slide comes back with its ink, and `takeInk` hands it all over
 * when the show ends.
 */

export type { InkPoint };
export interface InkPen { color: string; width: number }
/** One step of a stroke; `start` begins a new stroke. */
export interface InkSegment extends InkPen { from: InkPoint; to: InkPoint; start?: boolean }

// ponytail: one show per window, so one module-level log.
const shownInk = new Map<string, InkStroke[]>();

const slideIdOf = (stage: Element) =>
  stage.querySelector<HTMLElement>(':scope > [data-slide-id]')?.dataset.slideId;

/** The pen's colours and widths (in deck canvas pixels); the first of each is the default. */
export const INK_COLORS: ReadonlyArray<{ name: string; color: string }> = [
  { name: 'Red', color: '#ff2a2a' },
  { name: 'Yellow', color: '#ffd400' },
  { name: 'Green', color: '#22c55e' },
  { name: 'Blue', color: '#3b82f6' },
  { name: 'White', color: '#ffffff' },
  { name: 'Black', color: '#111111' },
];
export const INK_WIDTHS: ReadonlyArray<{ name: string; width: number }> = [
  { name: 'Medium', width: 6 },
  { name: 'Thin', width: 3 },
  { name: 'Thick', width: 14 },
];

function inkContext(stage: HTMLElement): CanvasRenderingContext2D | null {
  let canvas = stage.querySelector<HTMLCanvasElement>(':scope > canvas.ink');
  if (!canvas) {
    canvas = stage.ownerDocument.createElement('canvas');
    canvas.className = 'ink';
    // ponytail: 1 backing pixel per canvas pixel; soft on a projector scaled past 1920 wide.
    canvas.width = parseFloat(stage.style.width) || 1920;
    canvas.height = parseFloat(stage.style.height) || 1080;
    stage.appendChild(canvas);
  }
  return canvas.getContext('2d');
}

function paint(stage: HTMLElement, pen: InkPen, points: InkPoint[]): void {
  const ctx = points.length ? inkContext(stage) : null;
  if (!ctx) return;
  ctx.strokeStyle = pen.color;
  ctx.lineWidth = pen.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const p of points.length > 1 ? points.slice(1) : points) ctx.lineTo(p.x, p.y);
  ctx.stroke();
}

/** Paint one segment on the stage's slide and keep it with that slide's ink. */
export function drawInk(stage: Element | null, segment: InkSegment): void {
  if (!(stage instanceof HTMLElement)) return;
  paint(stage, segment, [segment.from, segment.to]);
  const slideId = slideIdOf(stage);
  if (!slideId) return;
  const strokes = shownInk.get(slideId) ?? [];
  shownInk.set(slideId, strokes);
  const current = strokes.at(-1);
  if (segment.start || !current) {
    strokes.push({ color: segment.color, width: segment.width, points: [segment.from] });
  } else {
    current.points.push(segment.to);
  }
}

/** Erase the ink on the stage's slide, for the rest of the show too. */
export function clearInk(stage: Element | null): void {
  stage?.querySelector(':scope > canvas.ink')?.remove();
  const slideId = stage && slideIdOf(stage);
  if (slideId) shownInk.delete(slideId);
}

/** Repaint the slide's kept ink on a freshly rendered stage; a no-op when it is already there. */
export function restoreInk(stage: Element | null): void {
  if (!(stage instanceof HTMLElement) || stage.querySelector(':scope > canvas.ink')) return;
  const slideId = slideIdOf(stage);
  for (const stroke of (slideId && shownInk.get(slideId)) || []) paint(stage, stroke, stroke.points);
}

/** Everything drawn this show, by slide, leaving none behind. */
export function takeInk(): SlideInk[] {
  const ink = [...shownInk].map(([slideId, strokes]) => ({ slideId, strokes }));
  shownInk.clear();
  return ink.filter((slide) => slide.strokes.length);
}

/**
 * Draw with the primary button while the pen is on. Clicks are swallowed so
 * finishing a stroke does not advance the slide. `onSegment` hears every
 * segment drawn, for relaying it to another screen.
 */
export function bindInk(
  target: Window | HTMLElement,
  stageOf: () => HTMLElement | null,
  onSegment?: (segment: InkSegment) => void,
): {
  /** The colour and width the next stroke uses; the palette writes it. */
  pen: InkPen;
  toggle: () => boolean;
  setActive: (on: boolean) => void;
  active: () => boolean;
  dispose: () => void;
} {
  const doc = 'document' in target ? target.document : target.ownerDocument;
  const pen: InkPen = { color: INK_COLORS[0].color, width: INK_WIDTHS[0].width };
  let on = false;
  let last: InkPoint | null = null;

  const pointAt = (e: MouseEvent): InkPoint | null => {
    const stage = stageOf();
    if (!stage) return null;
    const r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const w = parseFloat(stage.style.width) || 1920;
    const h = parseFloat(stage.style.height) || 1080;
    return { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h };
  };
  const onDown = (ev: Event) => {
    const e = ev as PointerEvent;
    if (!on || e.button !== 0 || onPalette(e)) return;
    e.preventDefault(); // no text selection while drawing
    last = pointAt(e);
    // A dot, so a tap leaves a mark.
    if (last) stroke({ ...pen, from: last, to: last, start: true });
  };
  const onMove = (ev: Event) => {
    const e = ev as PointerEvent;
    if (!on || !last || !(e.buttons & 1)) return;
    // Chromium delivers one move per frame; the coalesced ones keep a fast stroke curved.
    for (const move of e.getCoalescedEvents?.() ?? [e]) {
      const next = pointAt(move);
      if (!next || !last) continue;
      stroke({ ...pen, from: last, to: next });
      last = next;
    }
  };
  const onUp = () => { last = null; };
  const stroke = (segment: InkSegment) => {
    drawInk(stageOf(), segment);
    onSegment?.(segment);
  };
  // Capture on the window runs before the presenting windows' own click and
  // mousedown handlers, which would otherwise advance the slide. The palette
  // is let through; it stops its own clicks (createInkPalette).
  const swallow = (ev: Event) => {
    if (on && (ev as MouseEvent).button === 0 && !onPalette(ev)) ev.stopImmediatePropagation();
  };
  const setActive = (next: boolean) => {
    on = next;
    last = null;
    // `inking` shows the palette; the crosshair is only over the slide the pen draws on.
    doc.body.classList.toggle('inking', on);
    ('document' in target ? doc.body : target).classList.toggle('ink-surface', on);
  };

  target.addEventListener('pointerdown', onDown);
  target.addEventListener('pointermove', onMove);
  target.addEventListener('pointerup', onUp);
  target.addEventListener('pointercancel', onUp);
  target.addEventListener('mousedown', swallow, true);
  target.addEventListener('click', swallow, true);
  return {
    pen,
    toggle: () => (setActive(!on), on),
    setActive,
    active: () => on,
    dispose: () => {
      setActive(false);
      target.removeEventListener('pointerdown', onDown);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      target.removeEventListener('mousedown', swallow, true);
      target.removeEventListener('click', swallow, true);
    },
  };
}

const onPalette = (event: Event) =>
  event.target instanceof Element && !!event.target.closest('.ink-palette, .present-toolbar');

/**
 * Colour and width buttons for `pen`, shown while the pen is on (player.css).
 * Its clicks stop at the palette so picking a colour never advances the slide.
 */
export function createInkPalette(doc: Document, pen: InkPen): HTMLElement {
  const palette = doc.createElement('div');
  palette.className = 'ink-palette';
  palette.setAttribute('role', 'toolbar');
  palette.setAttribute('aria-label', 'Pen');
  const buttons: Array<{ button: HTMLButtonElement; selected: () => boolean }> = [];
  const sync = () => {
    for (const { button, selected } of buttons) button.setAttribute('aria-pressed', String(selected()));
  };
  const add = (className: string, name: string, value: string, pick: () => void, selected: () => boolean) => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = className;
    button.title = name;
    button.setAttribute('aria-label', name);
    button.style.setProperty('--ink', value);
    button.addEventListener('click', () => { pick(); sync(); });
    buttons.push({ button, selected });
    palette.appendChild(button);
  };
  for (const { name, color } of INK_COLORS) {
    add('ink-swatch', `${name} pen`, color, () => { pen.color = color; }, () => pen.color === color);
  }
  for (const { name, width } of [...INK_WIDTHS].sort((a, b) => a.width - b.width)) {
    // The dot is the line's width at the slide's usual on-screen scale, kept legible.
    add('ink-width', `${name} line`, `${Math.max(3, width)}px`, () => { pen.width = width; }, () => pen.width === width);
  }
  for (const type of ['click', 'mousedown', 'dblclick']) {
    palette.addEventListener(type, (event) => event.stopPropagation());
  }
  sync();
  return palette;
}
