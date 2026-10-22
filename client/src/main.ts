import './style.css';
import { DEFAULT_SERVER_PORT } from '@paint-rush/shared';
import { connectToSandbox } from './net/connection';
import { resolveServerUrl } from './net/serverUrl';
import { createDevOverlay } from './ui/devOverlay';

const overlay = createDevOverlay(requireElement('dev-overlay'));

// The game (and Rapier, ~2 MB) loads as a separate chunk, so the page shows up right away.
import('./game/SandboxGame')
  .then(({ startSandbox }) => startSandbox(requireElement('app'), overlay))
  .catch((error: unknown) => {
    console.error(error);
    overlay.update({ renderer: 'failed to start (see the browser console)' });
  });

// The Phase 0 server connection stays on as a live smoke test until networking (Phase 2).
const serverUrl = resolveServerUrl({
  search: window.location.search,
  envUrl: import.meta.env.VITE_SERVER_URL,
  location: window.location,
  defaultPort: DEFAULT_SERVER_PORT,
});
overlay.update({ serverUrl });
connectToSandbox(serverUrl, ({ state, players, rttMs }) =>
  overlay.update({ server: state, players, rttMs }),
);

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id} in index.html`);
  return element;
}
