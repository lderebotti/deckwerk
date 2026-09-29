import '../player/player.css';
import '../appChrome.css';
import './presenter.css';
import type { DeckSession } from '@shared/ipc.js';
import { withoutInk } from '@shared/ink.js';
import { bindSpeakerKeys, createSpeakerView } from './speakerView.js';
import { installWindowApiPosterProvider } from '../player/previewPosterProvider.js';

// Thumbnails in Speaker View take their frames from the main process, so this
// window never opens a video pipeline for a preview (see posterCache.ts).
installWindowApiPosterProvider();

/**
 * The desktop Speaker View window. The view itself is shared with the browser
 * collaboration client; this file is only the Electron transport for it.
 */

const view = createSpeakerView({
  host: document.getElementById('root')!,
  resolveSrc: (src) => window.api.assetUrl(src),
  onCommand: (command) => window.api.sendPresentCommand(command),
});

// Its previews match an audience presenting without kept ink (PresentOptions.hideInk).
const hideInk = new URLSearchParams(location.search).has('hideInk');

async function load(session: DeckSession): Promise<void> {
  view.setTheme(await window.api.loadTheme());
  view.setDeck(hideInk ? withoutInk(session.deck) : session.deck);
}

window.api.onDeckState((session) => void load(session));
window.api.onPresentState((state) => view.setState(state));
window.addEventListener('resize', () => view.refresh());
bindSpeakerKeys(window, (command) => window.api.sendPresentCommand(command), view);

void window.api.getDeck().then((session) => session && load(session));
