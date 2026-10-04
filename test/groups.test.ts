import { describe, expect, it } from 'vitest';
import { ElementSchema, type SlideElement } from '../src/shared/deck.js';
import {
  clickUnit, drillInto, drillOut, expandToUnits, groupElements, groupViolations,
  remintGroupIds, selectedGroups, tidyGroups, ungroupElements,
} from '../src/shared/groups.js';

const rect = (id: string, z: number, groupIds?: string[]): SlideElement => ElementSchema.parse({
  id, type: 'shape', shape: 'rect', x: 0, y: 0, w: 10, h: 10, z, ...(groupIds ? { groupIds } : {}),
});
const ids = (list: Iterable<string>) => new Set(list);

describe('groups', () => {
  it('groups two loose objects and pulls them together in the stacking order', () => {
    const elements = [rect('a', 1), rect('b', 2), rect('c', 3), rect('d', 4)];
    expect(groupElements(elements, ids(['a', 'c']), 'g')).toBe(true);
    expect(elements.map((element) => element.groupIds)).toEqual([['g'], undefined, ['g'], undefined]);
    // b was between them; the group now sits where c (the topmost member) was.
    const byZ = [...elements].sort((x, y) => x.z - y.z).map((element) => element.id);
    expect(byZ).toEqual(['b', 'a', 'c', 'd']);
    expect(groupViolations(elements)).toEqual([]);
  });

  it('refuses a single object, a group on its own, and layout-locked objects', () => {
    const elements = [rect('a', 1, ['g']), rect('b', 2, ['g']), rect('c', 3)];
    expect(groupElements(elements, ids(['c']), 'n')).toBe(false);
    expect(groupElements(elements, ids(['a', 'b']), 'n')).toBe(false);
    elements[2].layoutMasterId = 'master';
    expect(groupElements(elements, ids(['a', 'b', 'c']), 'n')).toBe(false);
  });

  it('nests a new group around whole groups, and inside a group being edited', () => {
    const elements = [rect('a', 1, ['g']), rect('b', 2, ['g']), rect('c', 3)];
    expect(groupElements(elements, ids(['a', 'b', 'c']), 'outer')).toBe(true);
    expect(elements.map((element) => element.groupIds)).toEqual([['outer', 'g'], ['outer', 'g'], ['outer']]);

    // Drilled into `outer`: grouping b and c makes a group inside it.
    const inner = [rect('a', 1, ['o']), rect('b', 2, ['o']), rect('c', 3, ['o'])];
    expect(groupElements(inner, ids(['b', 'c']), 'n')).toBe(true);
    expect(inner.map((element) => element.groupIds)).toEqual([['o'], ['o', 'n'], ['o', 'n']]);
    expect(groupViolations(inner)).toEqual([]);
  });

  it('brings a partly selected group along whole, so groups keep nesting', () => {
    const elements = [rect('a', 1, ['g']), rect('b', 2, ['g']), rect('c', 3)];
    expect(groupElements(elements, ids(['a', 'c']), 'n')).toBe(true);
    expect(elements.map((element) => element.groupIds)).toEqual([['n', 'g'], ['n', 'g'], ['n']]);
    expect(groupViolations(elements)).toEqual([]);
  });

  it('selects the outermost group on a click, then drills in a level per click', () => {
    const elements = [rect('a', 1, ['o', 'g']), rect('b', 2, ['o', 'g']), rect('c', 3, ['o']), rect('d', 4)];
    expect(clickUnit(elements, 'a', ids([]))).toEqual(['a', 'b', 'c']);
    expect(drillInto(elements, 'a', ids(['a', 'b', 'c']))).toEqual(['a', 'b']);
    expect(drillInto(elements, 'a', ids(['a', 'b']))).toEqual(['a']);
    expect(drillInto(elements, 'a', ids(['a']))).toBeNull();
    // Inside `o`, a click on c selects c alone, and a click elsewhere leaves the group.
    expect(clickUnit(elements, 'c', ids(['a', 'b']))).toEqual(['c']);
    expect(clickUnit(elements, 'd', ids(['a', 'b']))).toEqual(['d']);
    // Escape climbs back out one level at a time.
    expect(drillOut(elements, ids(['a']))).toEqual(['a', 'b']);
    expect(drillOut(elements, ids(['a', 'b']))).toEqual(['a', 'b', 'c']);
    expect(drillOut(elements, ids(['a', 'b', 'c']))).toBeNull();
  });

  it('widens a marquee to whole groups and frames only groups held whole', () => {
    const elements = [rect('a', 1, ['g']), rect('b', 2, ['g']), rect('c', 3)];
    expect(expandToUnits(elements, ['a', 'c']).sort()).toEqual(['a', 'b', 'c']);
    expect(selectedGroups(elements, ids(['a', 'b', 'c']))).toEqual([{ id: 'g', members: ['a', 'b'] }]);
    expect(selectedGroups(elements, ids(['a']))).toEqual([]);
  });

  it('ungroups the outermost level only', () => {
    const elements = [rect('a', 1, ['o', 'g']), rect('b', 2, ['o', 'g']), rect('c', 3, ['o'])];
    expect(ungroupElements(elements, ids(['a', 'b', 'c']))).toBe(true);
    expect(elements.map((element) => element.groupIds)).toEqual([['g'], ['g'], undefined]);
    expect(ungroupElements(elements, ids(['c']))).toBe(false);
  });

  it('ignores and tidies a group left with one member, and remints copies apart', () => {
    const elements = [rect('a', 1, ['g']), rect('b', 2, ['g'])];
    const lone = [elements[0]];
    expect(clickUnit(lone, 'a', ids([]))).toEqual(['a']);
    tidyGroups(lone);
    expect(lone[0].groupIds).toBeUndefined();

    const copies = [rect('a2', 1, ['g']), rect('b2', 2, ['g'])];
    let n = 0;
    remintGroupIds(copies, () => `new-${++n}`);
    expect(copies.map((element) => element.groupIds)).toEqual([['new-1'], ['new-1']]);
  });

  it('reports groups that do not nest', () => {
    const elements = [rect('a', 1, ['o', 'g']), rect('b', 2, ['g']), rect('c', 3, ['o'])];
    expect(groupViolations(elements)).toHaveLength(1);
  });
});
