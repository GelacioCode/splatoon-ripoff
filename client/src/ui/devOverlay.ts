export interface DevOverlayState {
  renderer: string;
  physics: string;
  serverUrl: string;
  server: string;
  players?: number;
  /** Plain network round trip (ping message, answered right away). */
  pingMs?: number;
  /** Input sent → server has used it and confirmed (includes waiting in its queue). */
  inputDelayMs?: number;
  /** Network data use, when metered (dev builds and `?debug`). */
  downKBps?: number;
  upKBps?: number;
  fps?: number;
  tickRate?: number;
  /** Dynamic resolution scale (%). */
  resolution?: number;
}

/**
 * Shows or hides the status panel: always in development and with `?debug` in the link,
 * otherwise when the player turned on "Show FPS & ping".
 */
export function showStatsPanel(show: boolean): void {
  const element = document.getElementById('dev-overlay');
  if (!element) return;
  const debug = new URLSearchParams(window.location.search).has('debug');
  element.hidden = !(show || import.meta.env.DEV || debug);
}

/** Small always-on-top status panel for development. */
export function createDevOverlay(element: HTMLElement) {
  const state: DevOverlayState = {
    renderer: 'starting…',
    physics: 'loading…',
    serverUrl: '',
    server: 'connecting',
  };

  const ms = (value?: number) => (value === undefined ? '–' : `${value} ms`);
  const kb = (value?: number) => (value === undefined ? '–' : value.toFixed(1));
  const render = () => {
    element.textContent = [
      'Paint Rush · dev',
      `Renderer  ${state.renderer}`,
      `Physics   ${state.physics}`,
      `Frame     ${state.fps ?? '–'} fps · tick ${state.tickRate ?? '–'} Hz · res ${state.resolution ?? '–'}%`,
      `Server    ${state.server} · ${state.serverUrl}`,
      `Players   ${state.players ?? '–'}`,
      `Ping      ${ms(state.pingMs)} · input delay ${ms(state.inputDelayMs)}`,
      `Data      ↓ ${kb(state.downKBps)} KB/s · ↑ ${kb(state.upKBps)} KB/s`,
    ].join('\n');
  };

  render();
  return {
    update(patch: Partial<DevOverlayState>): void {
      Object.assign(state, patch);
      render();
    },
  };
}

export type DevOverlay = ReturnType<typeof createDevOverlay>;
