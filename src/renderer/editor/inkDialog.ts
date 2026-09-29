/** Ask, after a show, whether its pen ink stays on the slides (PowerPoint's "Keep your ink annotations?"). */
export function showKeepInkDialog(strokes: number, slides: number): Promise<boolean> {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const overlay = document.createElement('div');
    overlay.className = 'workflow-overlay';

    const dialog = document.createElement('section');
    dialog.className = 'workflow-dialog keep-ink-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'keep-ink-title');
    dialog.setAttribute('aria-describedby', 'keep-ink-description');

    const title = document.createElement('h2');
    title.id = 'keep-ink-title';
    title.textContent = 'Keep your ink annotations?';

    const description = document.createElement('p');
    description.id = 'keep-ink-description';
    description.className = 'paste-theme-description';
    description.textContent = `You drew ${strokes} stroke${strokes === 1 ? '' : 's'}`
      + ` on ${slides} slide${slides === 1 ? '' : 's'} during the presentation.`;

    const detail = document.createElement('p');
    detail.className = 'paste-theme-detail';
    detail.textContent = 'Kept ink becomes ordinary shapes you can move, restyle or delete, '
      + 'and one undo removes it all.';

    const actions = document.createElement('div');
    actions.className = 'workflow-actions';
    const discard = document.createElement('button');
    discard.type = 'button';
    discard.textContent = 'Discard';
    const keep = document.createElement('button');
    keep.type = 'button';
    keep.className = 'primary';
    keep.textContent = 'Keep';
    actions.append(discard, keep);

    let finished = false;
    const finish = (choice: boolean): void => {
      if (finished) return;
      finished = true;
      overlay.remove();
      previousFocus?.focus();
      resolve(choice);
    };
    discard.addEventListener('click', () => finish(false));
    keep.addEventListener('click', () => finish(true));
    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') finish(false);
    });

    dialog.append(title, description, detail, actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    keep.focus();
  });
}
