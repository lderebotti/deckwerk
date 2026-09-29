export interface PdfExportChoice {
  includeEachBuildStage: boolean;
  includeInk: boolean;
}

/**
 * Ask for the PDF-specific options without leaving the editor's UI. The ink
 * option only appears for a deck that has kept presentation ink.
 */
export function showPdfExportDialog(options: { hasInk?: boolean } = {}): Promise<PdfExportChoice | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'workflow-overlay';

    const dialog = document.createElement('section');
    dialog.className = 'workflow-dialog pdf-export-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'pdf-export-title');

    const title = document.createElement('h2');
    title.id = 'pdf-export-title';
    title.textContent = 'Export PDF';

    const option = document.createElement('label');
    option.className = 'field-check pdf-export-builds';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    const optionText = document.createElement('span');
    optionText.textContent = 'Include each stage of builds';
    option.append(checkbox, optionText);
    const ink = inkOption();

    const actions = document.createElement('div');
    actions.className = 'workflow-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    const submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'primary';
    submit.textContent = 'Export';
    actions.append(cancel, submit);

    let finished = false;
    const finish = (choice: PdfExportChoice | null): void => {
      if (finished) return;
      finished = true;
      overlay.remove();
      resolve(choice);
    };
    cancel.addEventListener('click', () => finish(null));
    submit.addEventListener('click', () => finish({
      includeEachBuildStage: checkbox.checked,
      includeInk: ink.checkbox.checked,
    }));
    overlay.addEventListener('pointerdown', (event) => {
      if (event.target === overlay) finish(null);
    });
    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') finish(null);
    });

    dialog.append(title, option, ...(options.hasInk ? [ink.option] : []), actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    checkbox.focus();
  });
}

/** "Include saved ink", checked: a checkbox row shared by the export dialogs. */
export function inkOption(): { option: HTMLLabelElement; checkbox: HTMLInputElement } {
  const option = document.createElement('label');
  option.className = 'field-check export-ink';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = true;
  const text = document.createElement('span');
  text.textContent = 'Include saved ink';
  option.append(checkbox, text);
  return { option, checkbox };
}
