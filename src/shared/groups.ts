import type { SlideElement } from './deck.js';

/**
 * Groups are a label, not a container. An element's `groupIds` lists the
 * groups it belongs to, outermost first, and the elements sharing an id are
 * that group. Every renderer, export, Morph and agent operation keeps seeing
 * plain elements; only selection and transforms treat a group as one object.
 *
 * A group needs two members. An id held by one element (its partners deleted
 * by some path that did not tidy up) is ignored everywhere, so a stale id can
 * never make an object behave as a group of one.
 */

type Elements = readonly SlideElement[];

/** Member ids of every real group (two or more members) on a slide. */
export function liveGroups(elements: Elements): Map<string, string[]> {
  const members = new Map<string, string[]>();
  for (const element of elements) {
    for (const id of element.groupIds ?? []) {
      const list = members.get(id);
      if (list) list.push(element.id);
      else members.set(id, [element.id]);
    }
  }
  for (const [id, list] of members) if (list.length < 2) members.delete(id);
  return members;
}

/** The element's real groups, outermost first. */
function groupsOf(element: SlideElement, live: Map<string, string[]>): string[] {
  return (element.groupIds ?? []).filter((id) => live.has(id));
}

/**
 * What a click on `element` can select, from the outermost group in to the
 * element itself: each level is a list of element ids.
 */
export function unitLevels(elements: Elements, element: SlideElement): string[][] {
  const live = liveGroups(elements);
  return [...groupsOf(element, live).map((id) => live.get(id)!), [element.id]];
}

const sameSet = (a: readonly string[], b: ReadonlySet<string>) =>
  a.length === b.size && a.every((id) => b.has(id));

/**
 * The group the selection has been drilled into: the innermost group every
 * selected element shares, when the selection is only part of it.
 */
export function drillContext(elements: Elements, selection: ReadonlySet<string>): string | null {
  const live = liveGroups(elements);
  const selected = elements.filter((element) => selection.has(element.id));
  if (selected.length === 0) return null;
  const paths = selected.map((element) => groupsOf(element, live));
  let context: string | null = null;
  for (let depth = 0; paths.every((path) => path[depth] !== undefined && path[depth] === paths[0][depth]); depth++) {
    const id = paths[0][depth];
    if (sameSet(live.get(id)!, selection)) break;
    context = id;
  }
  return context;
}

/**
 * The ids a click on `hitId` selects: the outermost unit, or inside the group
 * the selection is drilled into, the unit one level below it.
 */
export function clickUnit(elements: Elements, hitId: string, selection: ReadonlySet<string>): string[] {
  const hit = elements.find((element) => element.id === hitId);
  if (!hit) return [hitId];
  const levels = unitLevels(elements, hit);
  const context = drillContext(elements, selection);
  if (context) {
    const at = groupsOf(hit, liveGroups(elements)).indexOf(context);
    if (at >= 0) return levels[at + 1];
  }
  return levels[0];
}

/**
 * A click (not a drag) on a selected group drills one level in, towards the
 * object under the pointer. Null when the selection is not exactly one of the
 * hit's enclosing groups.
 */
export function drillInto(elements: Elements, hitId: string, selection: ReadonlySet<string>): string[] | null {
  const hit = elements.find((element) => element.id === hitId);
  if (!hit) return null;
  const levels = unitLevels(elements, hit);
  for (let depth = 0; depth < levels.length - 1; depth++) {
    if (sameSet(levels[depth], selection)) return levels[depth + 1];
  }
  return null;
}

/** Escape from inside a group selects the group around it again. */
export function drillOut(elements: Elements, selection: ReadonlySet<string>): string[] | null {
  const context = drillContext(elements, selection);
  return context ? liveGroups(elements).get(context)! : null;
}

/** Widen ids to whole outermost groups, as a marquee or a fresh pick does. */
export function expandToUnits(elements: Elements, ids: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    const element = elements.find((candidate) => candidate.id === id);
    for (const member of element ? unitLevels(elements, element)[0] : [id]) out.add(member);
  }
  return [...out];
}

/**
 * The groups the selection holds whole, outermost only: each gets one frame
 * with handles, and its members are moved, sized and turned as one.
 */
export function selectedGroups(elements: Elements, selection: ReadonlySet<string>): Array<{ id: string; members: string[] }> {
  const live = liveGroups(elements);
  const out = new Map<string, string[]>();
  for (const element of elements) {
    if (!selection.has(element.id)) continue;
    const id = groupsOf(element, live).find((group) => live.get(group)!.every((member) => selection.has(member)));
    if (id) out.set(id, live.get(id)!);
  }
  return [...out].map(([id, members]) => ({ id, members }));
}

/**
 * The top-level objects the selection is made of: a group whose outermost
 * real group is shared counts once.
 */
function selectedUnits(elements: Elements, ids: ReadonlySet<string>, prefix: number, live: Map<string, string[]>): Set<string> {
  return new Set(elements
    .filter((element) => ids.has(element.id))
    .map((element) => groupsOf(element, live)[prefix] ?? element.id));
}

/**
 * Group the selected objects under `newId`. The new group nests inside the
 * groups all of them already share, and its members become neighbours in the
 * stacking order, at the topmost member's place. Returns false when there are
 * not two objects to group or a selected object is locked to its layout.
 */
export function groupElements(elements: SlideElement[], ids: ReadonlySet<string>, newId: string): boolean {
  const live = liveGroups(elements);
  const selected = elements.filter((element) => ids.has(element.id));
  if (selected.some((element) => element.layoutMasterId || (element.type === 'text' && element.layoutPlaceholder))) return false;
  const paths = selected.map((element) => groupsOf(element, live));
  let prefix = 0;
  while (paths.length > 0 && paths.every((path) => path[prefix] !== undefined && path[prefix] === paths[0][prefix])) prefix++;
  // A group selected whole is one object at its own level, not two inside it.
  const selectedIds = new Set(selected.map((element) => element.id));
  while (prefix > 0 && sameSet(live.get(paths[0][prefix - 1])!, selectedIds)) prefix--;
  const units = selectedUnits(elements, ids, prefix, live);
  if (units.size < 2) return false;
  // Whole units join: a selected member brings the rest of its group along,
  // or the group would be split across two nests.
  const shared = paths[0].slice(0, prefix);
  const members = new Set(elements.filter((element) => {
    const path = groupsOf(element, live);
    return shared.every((id, depth) => path[depth] === id) && units.has(path[prefix] ?? element.id);
  }).map((element) => element.id));
  for (const element of elements) {
    if (!members.has(element.id)) continue;
    const path = groupsOf(element, live);
    element.groupIds = [...path.slice(0, prefix), newId, ...path.slice(prefix)];
  }
  // Paint order: pull the members together at the topmost member's place.
  const ordered = elements.map((element, index) => ({ element, index }))
    .sort((a, b) => a.element.z - b.element.z || a.index - b.index)
    .map(({ element }) => element);
  const top = ordered.reduce((last, element, index) => (members.has(element.id) ? index : last), -1);
  const restacked = [
    ...ordered.slice(0, top + 1).filter((element) => !members.has(element.id)),
    ...ordered.filter((element) => members.has(element.id)),
    ...ordered.slice(top + 1),
  ];
  restacked.forEach((element, index) => { element.z = index + 1; });
  return true;
}

/** Undo the outermost groups the selection holds whole. Returns false when it holds none. */
export function ungroupElements(elements: SlideElement[], ids: ReadonlySet<string>): boolean {
  const groups = selectedGroups(elements, ids);
  if (groups.length === 0) return false;
  const dissolved = new Set(groups.map((group) => group.id));
  for (const element of elements) {
    if (!element.groupIds?.some((id) => dissolved.has(id))) continue;
    const kept = element.groupIds.filter((id) => !dissolved.has(id));
    if (kept.length > 0) element.groupIds = kept;
    else delete element.groupIds;
  }
  return true;
}

/** Drop group ids that no longer name a group of two, after a delete or a partial copy. */
export function tidyGroups(elements: SlideElement[]): void {
  const live = liveGroups(elements);
  for (const element of elements) {
    if (!element.groupIds) continue;
    const kept = element.groupIds.filter((id) => live.has(id));
    if (kept.length > 0) element.groupIds = kept;
    else delete element.groupIds;
  }
}

/** Fresh group ids for copied elements, so a copy is a group of its own. */
export function remintGroupIds(elements: SlideElement[], mint: () => string): void {
  const remap = new Map<string, string>();
  for (const element of elements) {
    if (!element.groupIds) continue;
    element.groupIds = element.groupIds.map((id) => {
      if (!remap.has(id)) remap.set(id, mint());
      return remap.get(id)!;
    });
  }
  tidyGroups(elements);
}

/**
 * Groups must nest: two elements sharing a group share every group around it.
 * Returns a description of each violation.
 */
export function groupViolations(elements: Elements): string[] {
  const problems: string[] = [];
  const live = liveGroups(elements);
  const outer = new Map<string, string>();
  for (const element of elements) {
    const path = groupsOf(element, live);
    path.forEach((id, depth) => {
      const around = path.slice(0, depth).join('/');
      const seen = outer.get(id);
      if (seen === undefined) outer.set(id, around);
      else if (seen !== around) problems.push(`group ${id} is inside [${seen}] for one member and [${around}] for ${element.id}`);
    });
  }
  return problems;
}

export interface Box { x: number; y: number; w: number; h: number }

/**
 * The objects a selection acts as: each group it holds whole is one unit,
 * and every other selected object is a unit of its own. Align, distribute
 * and the Props geometry fields move and size units, never a group's
 * members one by one.
 */
export function selectionUnits(elements: Elements, selection: ReadonlySet<string>): Array<{ id: string; members: string[] }> {
  const groups = selectedGroups(elements, selection);
  const grouped = new Set(groups.flatMap((group) => group.members));
  return [
    ...groups,
    ...elements
      .filter((element) => selection.has(element.id) && !grouped.has(element.id))
      .map((element) => ({ id: element.id, members: [element.id] })),
  ];
}

/** An element's axis-aligned bounds as drawn, turned about its centre. */
function drawnBounds(element: SlideElement): Box {
  if (!element.rot) return { x: element.x, y: element.y, w: element.w, h: element.h };
  const radians = (element.rot * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const w = element.w * cos + element.h * sin;
  const h = element.w * sin + element.h * cos;
  return { x: element.x + (element.w - w) / 2, y: element.y + (element.h - h) / 2, w, h };
}

/**
 * A unit's box: a lone object's own box (as its geometry fields read), a
 * group's the axis-aligned box around its members as drawn.
 */
export function unitBox(elements: Elements, members: readonly string[]): Box {
  const found = elements.filter((element) => members.includes(element.id));
  if (found.length === 1) {
    const [only] = found;
    return { x: only.x, y: only.y, w: only.w, h: only.h };
  }
  const boxes = found.map(drawnBounds);
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  return {
    x,
    y,
    w: Math.max(...boxes.map((box) => box.x + box.w)) - x,
    h: Math.max(...boxes.map((box) => box.y + box.h)) - y,
  };
}

/**
 * A member's box after its group's box went from `from` to `to`: its centre
 * keeps its place within the group and its size scales with it. Text keeps
 * its type size, as in PowerPoint; only the box changes.
 */
export function placeInScaledBox(origin: Box, from: Box, to: Box): Box {
  const fx = to.w / from.w;
  const fy = to.h / from.h;
  const w = origin.w * fx;
  const h = origin.h * fy;
  return {
    x: to.x + (origin.x + origin.w / 2 - from.x) * fx - w / 2,
    y: to.y + (origin.y + origin.h / 2 - from.y) * fy - h / 2,
    w,
    h,
  };
}

/**
 * Move and size a unit so its box takes the given edges. A lone object takes
 * them directly; a group's members are placed inside the new box.
 */
export function fitUnit(elements: SlideElement[], members: readonly string[], to: Partial<Box>): void {
  const from = unitBox(elements, members);
  const target = { ...from, ...to, w: Math.max(1, to.w ?? from.w), h: Math.max(1, to.h ?? from.h) };
  for (const element of elements) {
    if (!members.includes(element.id)) continue;
    const placed = members.length === 1 ? target : placeInScaledBox(element, from, target);
    const before = { x: element.x, y: element.y, w: element.w, h: element.h };
    element.x = Math.round(placed.x);
    element.y = Math.round(placed.y);
    element.w = Math.max(1, Math.round(placed.w));
    element.h = Math.max(1, Math.round(placed.h));
    // A curve's bend point travels with its box.
    if (element.type === 'shape' && element.control) {
      element.control = {
        x: Math.round(element.x + (element.control.x - before.x) * (element.w / before.w)),
        y: Math.round(element.y + (element.control.y - before.y) * (element.h / before.h)),
      };
    }
  }
}
