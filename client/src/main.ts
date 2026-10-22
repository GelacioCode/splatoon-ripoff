import './style.css';
import { REVISION } from 'three';
import { DEFAULT_SERVER_PORT } from '@paint-rush/shared';
import { connectToSandbox } from './net/connection';
import { resolveServerUrl } from './net/serverUrl';
import { startPlaceholderScene } from './scene/placeholderScene';
import { createDevOverlay } from './ui/devOverlay';

/** Placeholder paint color. Change it and save: the page reloads with the new color. */
const BLOB_COLOR = 0xfd3fb4;

const overlay = createDevOverlay(requireElement('dev-overlay'));

try {
  startPlaceholderScene(requireElement('app'), BLOB_COLOR);
  overlay.update({ renderer: `three r${REVISION} · WebGL2` });
} catch (error) {
  console.error(error);
  overlay.update({ renderer: 'WebGL2 unavailable on this device' });
}

// Rapier (~2 MB) loads on demand so it never delays the first frame.
import('@paint-rush/shared/physics')
  .then(({ initPhysics }) => initPhysics())
  .then((version) => overlay.update({ physics: `Rapier ${version}` }))
  .catch((error: unknown) => {
    console.error(error);
    overlay.update({ physics: 'failed to load' });
  });

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
