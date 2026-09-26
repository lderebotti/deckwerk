export interface ToolbarPickerOption {
  label: string;
  action: () => void;
  /** Tooltip, e.g. the full path behind a short name. */
  title?: string;
  disabled?: boolean;
}

/**
 * An item that opens a flyout beside the menu, like File → Open Recent. Its
 * options load each time the menu opens, so the menu itself opens at once.
 */
export interface ToolbarPickerSubmenu {
  label: string;
  submenu: () => Promise<ToolbarPickerOption[]>;
}

export interface ToolbarPickerSection {
  label: string;
  options: Array<ToolbarPickerOption | ToolbarPickerSubmenu>;
}

export type ToolbarPickerEntry = ToolbarPickerOption | ToolbarPickerSection | ToolbarPickerSubmenu;

export interface ToolbarSplitButtonConfig {
  deckOnly?: boolean;
  menuLabel?: string;
  variant?: 'primary';
}

const CHEVRON_RIGHT = '<svg class="shape-menu-chevron" viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">' +
  '<path d="M3.5 2l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.5" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * A compact toolbar dropdown. It deliberately uses the existing Shape menu
 * classes so grouped file actions have the toolbar's exact density, borders,
 * focus treatment, and placement.
 *
 * `entries` may be a function, read each time the menu opens, for lists that
 * change behind the menu's back (recent decks).
 */
export function createToolbarPicker(
  label: string,
  entries: ToolbarPickerEntry[] | (() => Promise<ToolbarPickerEntry[]>),
  config: { deckOnly?: boolean; escapeClipping?: boolean } = {},
): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = `shape-menu-wrap${config.deckOnly ? ' deck-only' : ''}`;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'shape-menu-trigger';
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.innerHTML = `<span>${label}</span>` +
    '<svg class="shape-menu-chevron" viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">' +
    '<path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';

  let menu: HTMLDivElement | null = null;
  const close = (): void => {
    menu?.remove();
    menu = null;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', keys, true);
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place, true);
  };
  const outside = (event: PointerEvent): void => {
    if (!wrap.contains(event.target as Node)) close();
  };
  /**
   * Inside a dialog the menu's nearest scroll container clips it (every
   * `.workflow-dialog` is `max-height` + `overflow: auto`), so there it is
   * positioned in viewport coordinates instead, escaping the clip. It then
   * has to follow the trigger when anything moves, hence the listeners.
   */
  const place = (): void => {
    if (!menu || !config.escapeClipping) return;
    const anchor = trigger.getBoundingClientRect();
    const height = menu.offsetHeight;
    const below = window.innerHeight - anchor.bottom - 8;
    // Open downward when there is room, upward when there is not — and if
    // neither fits, sit against the bottom edge rather than off-screen.
    const top = below >= height || anchor.top - 8 < height
      ? Math.min(anchor.bottom + 4, window.innerHeight - height - 8)
      : anchor.top - 4 - height;
    menu.style.top = `${Math.max(8, top)}px`;
    menu.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - menu.offsetWidth - 8))}px`;
  };
  const keys = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') close();
  };
  let opening = 0;
  const open = async (): Promise<void> => {
    // A second click while the entries load wins; the first open is dropped.
    const request = ++opening;
    const list = typeof entries === 'function' ? await entries() : entries;
    if (request !== opening || menu) return;
    menu = document.createElement('div');
    menu.className = `shape-menu${config.escapeClipping ? ' shape-menu-fixed' : ''}`;
    menu.setAttribute('role', 'menu');
    const appendOption = (option: ToolbarPickerOption, parent: HTMLElement): void => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'shape-menu-item';
      item.setAttribute('role', 'menuitem');
      item.textContent = option.label;
      if (option.title) item.title = option.title;
      item.disabled = option.disabled ?? false;
      item.addEventListener('click', () => {
        close();
        trigger.blur();
        option.action();
      });
      parent.appendChild(item);
    };
    const appendSubmenu = (entry: ToolbarPickerSubmenu, parent: HTMLElement): void => {
      const holder = document.createElement('div');
      holder.className = 'shape-menu-submenu';
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'shape-menu-item';
      item.setAttribute('role', 'menuitem');
      item.setAttribute('aria-haspopup', 'menu');
      item.setAttribute('aria-expanded', 'false');
      const text = document.createElement('span');
      text.textContent = entry.label;
      item.append(text);
      item.insertAdjacentHTML('beforeend', CHEVRON_RIGHT);
      const flyout = document.createElement('div');
      flyout.className = 'shape-menu shape-menu-flyout';
      flyout.setAttribute('role', 'menu');
      flyout.hidden = true;
      void entry.submenu().then((options) => {
        for (const option of options) appendOption(option, flyout);
      });
      const show = (on: boolean): void => {
        flyout.hidden = !on;
        item.setAttribute('aria-expanded', String(on));
      };
      holder.addEventListener('pointerenter', () => show(true));
      holder.addEventListener('pointerleave', () => show(false));
      // Click or Enter opens it and moves focus in, for keyboard users.
      item.addEventListener('click', () => {
        show(true);
        flyout.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
      });
      holder.append(item, flyout);
      parent.appendChild(holder);
    };
    for (const entry of list) {
      if ('submenu' in entry) {
        appendSubmenu(entry, menu);
        continue;
      }
      if (!('options' in entry)) {
        appendOption(entry, menu);
        continue;
      }
      const section = document.createElement('div');
      section.className = 'shape-menu-section';
      section.setAttribute('role', 'group');
      section.setAttribute('aria-label', entry.label);
      const heading = document.createElement('div');
      heading.className = 'shape-menu-section-label';
      heading.textContent = entry.label;
      section.appendChild(heading);
      for (const option of entry.options) {
        if ('submenu' in option) appendSubmenu(option, section);
        else appendOption(option, section);
      }
      menu.appendChild(section);
    }
    wrap.appendChild(menu);
    place();
    trigger.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', keys, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    menu.querySelector<HTMLButtonElement>('button')?.focus();
  };
  trigger.addEventListener('click', () => (menu ? close() : void open()));
  wrap.appendChild(trigger);
  return wrap;
}

/** A persistent primary action with a narrow, separately clickable menu segment. */
export function createToolbarSplitButton(
  label: string,
  action: () => void,
  options: ToolbarPickerOption[],
  config: ToolbarSplitButtonConfig = {},
): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = `toolbar-split-button shape-menu-wrap${config.deckOnly ? ' deck-only' : ''}`;

  const main = document.createElement('button');
  main.type = 'button';
  main.className = `toolbar-split-main${config.variant === 'primary' ? ' primary' : ''}`;
  main.textContent = label;
  main.addEventListener('click', action);

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = `toolbar-split-menu${config.variant === 'primary' ? ' primary' : ''}`;
  trigger.setAttribute('aria-label', config.menuLabel ?? `More ${label} options`);
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.innerHTML = '<svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">' +
    '<path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';

  let menu: HTMLDivElement | null = null;
  const close = (): void => {
    menu?.remove();
    menu = null;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', keys, true);
  };
  const outside = (event: PointerEvent): void => {
    if (!wrap.contains(event.target as Node)) close();
  };
  const keys = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') close();
  };
  const open = (): void => {
    menu = document.createElement('div');
    menu.className = 'shape-menu toolbar-split-popover';
    menu.setAttribute('role', 'menu');
    for (const option of options) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'shape-menu-item';
      item.setAttribute('role', 'menuitem');
      item.textContent = option.label;
      item.addEventListener('click', () => {
        close();
        trigger.blur();
        option.action();
      });
      menu.appendChild(item);
    }
    wrap.appendChild(menu);
    trigger.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', keys, true);
    menu.querySelector<HTMLButtonElement>('button')?.focus();
  };
  trigger.addEventListener('click', () => (menu ? close() : open()));
  wrap.append(main, trigger);
  return wrap;
}
