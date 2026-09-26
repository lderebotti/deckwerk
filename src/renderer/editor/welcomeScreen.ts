import type { RecentDeck } from '@shared/ipc.js';

export interface WelcomeActions {
  newPresentation: () => void | Promise<void>;
  openPresentation: () => void | Promise<void>;
  importKeynote: () => void | Promise<void>;
  importPowerPoint: () => void | Promise<void>;
  /** Recently opened decks, most recent first. The list is left out when empty. */
  recentPresentations?: () => Promise<RecentDeck[]>;
  openRecentPresentation?: (dir: string) => void | Promise<void>;
}

/** The intentional no-deck state shown before the user opens any presentation. */
export class WelcomeScreen {
  readonly element: HTMLElement;

  constructor(
    private host: HTMLElement,
    actions: WelcomeActions,
  ) {
    const screen = document.createElement('section');
    screen.className = 'welcome-screen';
    screen.setAttribute('aria-label', 'Start a presentation');

    const mark = document.createElement('div');
    mark.className = 'welcome-mark';
    mark.textContent = 'DW';
    mark.setAttribute('aria-hidden', 'true');

    const title = document.createElement('h1');
    title.textContent = 'What would you like to present?';
    const detail = document.createElement('p');
    detail.textContent = 'Create a deck, open a DeckWerk folder, or bring in an existing Keynote or PowerPoint presentation.';

    const choices = document.createElement('div');
    choices.className = 'welcome-actions';
    choices.append(
      actionButton('New presentation', 'Start with a title and body slide', 'new', actions.newPresentation),
      actionButton('Open presentation', 'Open a folder containing deck.json', 'open', actions.openPresentation),
      actionButton('Import from Keynote', 'Convert a .key presentation into an editable deck', 'keynote', actions.importKeynote),
      actionButton('Import from PowerPoint', 'Convert a .pptx presentation into an editable deck', 'powerpoint', actions.importPowerPoint),
    );

    screen.append(mark, title, detail, choices);
    void actions.recentPresentations?.().then((decks) => {
      if (decks.length === 0 || !actions.openRecentPresentation) return;
      screen.appendChild(recentList(decks, actions.openRecentPresentation));
    });
    this.element = screen;
    this.host.appendChild(screen);
    this.setVisible(true);
  }

  setVisible(visible: boolean): void {
    this.element.hidden = !visible;
    this.host.classList.toggle('welcome-mode', visible);
    document.getElementById('body')?.classList.toggle('welcome-mode', visible);
    document.body.classList.toggle('welcome-mode', visible);
  }
}

function recentList(decks: RecentDeck[], open: (dir: string) => void | Promise<void>): HTMLElement {
  const section = document.createElement('section');
  section.className = 'welcome-recent';
  const heading = document.createElement('h2');
  heading.textContent = 'Recent';
  section.appendChild(heading);
  for (const deck of decks) {
    const button = document.createElement('button');
    button.className = 'welcome-recent-item';
    button.title = deck.dir;
    const name = document.createElement('strong');
    name.textContent = deck.name;
    const path = document.createElement('span');
    path.textContent = deck.dir;
    button.append(name, path);
    button.addEventListener('click', () => void open(deck.dir));
    section.appendChild(button);
  }
  return section;
}

function actionButton(
  title: string,
  detail: string,
  action: string,
  run: () => void | Promise<void>,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'welcome-action';
  button.dataset.action = action;
  const heading = document.createElement('strong');
  heading.textContent = title;
  const description = document.createElement('span');
  description.textContent = detail;
  button.append(heading, description);
  button.addEventListener('click', () => void run());
  return button;
}
