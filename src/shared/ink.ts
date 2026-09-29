import type { Deck, SlideElement } from './deck.js';
import { makeId } from './geometry.js';

/**
 * Pen ink drawn while presenting, and the slide objects it becomes when kept.
 * Everything is in deck canvas pixels.
 */

export interface InkPoint { x: number; y: number }
export interface InkStroke { color: string; width: number; points: InkPoint[] }
/** One slide's ink, as the audience window hands it back when the show ends. */
export interface SlideInk { slideId: string; strokes: InkStroke[] }

type Shape = Extract<SlideElement, { type: 'shape' }>;

/** Tolerance, in canvas pixels, for dropping points that do not change a stroke's shape. */
const SIMPLIFY_TOLERANCE = 1;
// The colour lands in SVG markup, so only plain hex colours are accepted.
const HEX_COLOR = /^#[0-9a-f]{3,8}$/i;

/** Ramer–Douglas–Peucker: the fewest points that stay within `tolerance` of the drawn line. */
export function simplifyStroke(points: InkPoint[], tolerance = SIMPLIFY_TOLERANCE): InkPoint[] {
  if (points.length <= 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const length = Math.hypot(dx, dy);
  let farthest = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const distance = length
      ? Math.abs(dy * p.x - dx * p.y + last.x * first.y - last.y * first.x) / length
      : Math.hypot(p.x - first.x, p.y - first.y);
    if (distance > farthest) { farthest = distance; index = i; }
  }
  if (farthest <= tolerance) return [first, last];
  return [
    ...simplifyStroke(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplifyStroke(points.slice(index), tolerance),
  ];
}

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * A stroke as a `path` shape marked `ink`, boxed to the stroke plus half its
 * width so nothing spills past the object a person selects. Null for a stroke
 * that is not well formed; the payload crosses a process boundary.
 */
export function inkShape(stroke: InkStroke, z: number): Shape | null {
  if (!HEX_COLOR.test(stroke.color) || !(stroke.width > 0 && stroke.width < 200)) return null;
  const points = stroke.points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!points.length) return null;
  const kept = simplifyStroke(points);
  const pad = stroke.width / 2;
  const left = Math.min(...kept.map((p) => p.x)) - pad;
  const top = Math.min(...kept.map((p) => p.y)) - pad;
  const w = round(Math.max(...kept.map((p) => p.x)) + pad - left);
  const h = round(Math.max(...kept.map((p) => p.y)) + pad - top);
  // A tap is a single point; a zero-length segment with round caps draws it as a dot.
  const path = (kept.length === 1 ? [kept[0], kept[0]] : kept)
    .map((p, i) => `${i ? 'L' : 'M'}${round(p.x - left)} ${round(p.y - top)}`)
    .join(' ');
  return {
    type: 'shape',
    id: makeId('ink'),
    x: round(left),
    y: round(top),
    w,
    h,
    rot: 0,
    z,
    opacity: 1,
    class: [],
    style: {},
    shape: 'path',
    fill: null,
    stroke: stroke.color,
    strokeWidth: stroke.width,
    radius: 0,
    path,
    pathSize: { w, h },
    arrowStart: false,
    arrowEnd: false,
    ink: true,
  };
}

/**
 * Put a show's ink on its slides, above everything already there. Mutates
 * `deck` (call it inside a commit) and returns how many strokes landed; ink
 * for a slide deleted mid-show has nowhere to go and is dropped.
 */
export function addInk(deck: Deck, ink: SlideInk[]): number {
  let added = 0;
  for (const { slideId, strokes } of ink) {
    const slide = deck.slides.find((s) => s.id === slideId);
    if (!slide || !Array.isArray(strokes)) continue;
    let z = Math.max(0, ...slide.elements.map((e) => e.z)) + 1;
    for (const stroke of strokes) {
      const shape = inkShape(stroke, z);
      if (!shape) continue;
      slide.elements.push(shape);
      z += 1;
      added += 1;
    }
  }
  return added;
}
