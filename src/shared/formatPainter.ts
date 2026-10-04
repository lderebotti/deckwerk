import type { SlideElement } from './deck.js';
import { THEME_TEXT_PROPERTIES, clearTextProperties } from './themes.js';

/**
 * What the format painter carries from one object to another: a copy of the
 * source element, read only for the fields that are formatting. Geometry,
 * content (text, media source, crop), identity and comments never travel.
 */
export interface ElementFormat {
  source: SlideElement;
}

type Kind = 'text' | 'shape' | 'media' | 'other';

function kindOf(element: SlideElement): Kind {
  if (element.type === 'text') return 'text';
  if (element.type === 'shape') return 'shape';
  if (element.type === 'image' || element.type === 'video') return 'media';
  return 'other';
}

/** Classes that record what an element *is*, not how it looks. */
const STRUCTURAL_CLASSES = new Set(['placeholder', 'layout-master-element']);

export function copyFormat(element: SlideElement): ElementFormat {
  return { source: structuredClone(element) };
}

/**
 * Restyle `target` like the copied source. Objects of the same kind (text,
 * shape, picture/video) take everything that is formatting; across kinds
 * only what both have: opacity, and effects where the target supports them.
 */
export function applyFormat(target: SlideElement, format: ElementFormat): void {
  const source = format.source;
  target.opacity = source.opacity;
  if ('effects' in source && (target.type === 'text' || target.type === 'image' || target.type === 'video')) {
    if (source.effects?.length) target.effects = structuredClone(source.effects);
    else delete target.effects;
  }
  if (kindOf(source) !== kindOf(target) || kindOf(target) === 'other') return;

  // Look-only classes travel; a role travels with text. What marks the target
  // as an unwritten prompt or a layout copy stays the target's own.
  const kept = target.class.filter((name) => STRUCTURAL_CLASSES.has(name)
    || (target.type !== 'text' && name.startsWith('role-')));
  const taken = source.class.filter((name) => !STRUCTURAL_CLASSES.has(name)
    && (source.type === 'text' || !name.startsWith('role-')));
  target.class = [...new Set([...taken, ...kept])];

  if (target.type === 'text' && source.type === 'text') {
    // Type set on the target's own runs would outrank the box; clear it so the
    // copied box style decides, as a whole-box change in the inspector does.
    // A table's cells are its content, so they keep their own formatting.
    if (!target.table) clearTextProperties(target, [...THEME_TEXT_PROPERTIES]);
    target.style = { ...source.style };
    if (source.contentStyle) target.contentStyle = { ...source.contentStyle };
    else delete target.contentStyle;
    if (source.overrides?.length) target.overrides = [...source.overrides];
    else delete target.overrides;
    target.align = source.align;
    target.valign = source.valign;
    for (const key of ['paragraphSpacing', 'autoFit', 'noWrap', 'noWrapMode'] as const) {
      if (source[key] === undefined) delete target[key];
      else (target as Record<string, unknown>)[key] = source[key];
    }
    return;
  }

  target.style = { ...source.style };
  if (target.type === 'shape' && source.type === 'shape') {
    target.fill = source.fill;
    target.stroke = source.stroke;
    target.strokeWidth = source.strokeWidth;
    target.radius = source.radius;
    // Arrowheads only mean something between two lines.
    const isLine = (shape: string) => shape === 'line' || shape === 'arrow';
    if (isLine(source.shape) && isLine(target.shape)) {
      target.arrowStart = source.arrowStart;
      target.arrowEnd = source.arrowEnd;
    }
    return;
  }
  if ((target.type === 'image' || target.type === 'video') && (source.type === 'image' || source.type === 'video')) {
    for (const key of ['borderColor', 'borderWidth', 'borderRadius'] as const) {
      if (source[key] === undefined) delete target[key];
      else (target as Record<string, unknown>)[key] = source[key];
    }
  }
}
