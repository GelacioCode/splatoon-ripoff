// Brand fonts, bundled with the game (OFL): Lilita One for titles and buttons, Fredoka for text.
import '@fontsource/lilita-one/400.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './style.css';
import { DEFAULT_SERVER_PORT } from '@paint-rush/shared';
import { parseRoute } from './net/route';
import { resolveServerUrl } from './net/serverUrl';
import { createDevOverlay } from './ui/devOverlay';

const overlay = createDevOverlay(requireElement('dev-overlay'));
const container = requireElement('app');

// The game (and Rapier, ~2 MB) loads as a separate chunk, so the page shows up right away.
// Online by default: the start screen, or a lobby's join screen for `/join/CODE` links.
// `?offline` opens the solo sandbox.
const start = new URLSearchParams(window.location.search).has('offline')
  ? import('./game/SandboxGame').then(({ startSandbox }) => startSandbox(container, overlay))
  : import('./game/OnlineGame').then(({ startOnline }) =>
      startOnline(
        container,
        overlay,
        resolveServerUrl({
          search: window.location.search,
          envUrl: import.meta.env.VITE_SERVER_URL,
          location: window.location,
          defaultPort: DEFAULT_SERVER_PORT,
        }),
        parseRoute(window.location.pathname, window.location.search),
      ),
    );
start.catch((error: unknown) => {
  console.error(error);
  overlay.update({ renderer: 'failed to start (see the browser console)' });
});

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id} in index.html`);
  return element;
}
