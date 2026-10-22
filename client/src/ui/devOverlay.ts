export interface DevOverlayState {
  renderer: string;
  physics: string;
  serverUrl: string;
  server: string;
  players?: number;
  rttMs?: number;
  fps?: number;
  tickRate?: number;
}

/** Small always-on-top status panel for development. */
export function createDevOverlay(element: HTMLElement) {
  const state: DevOverlayState = {
    renderer: 'starting…',
    physics: 'loading…',
    serverUrl: '',
    server: 'connecting',
  };

  const render = () => {
    element.textContent = [
      'Paint Rush · dev',
      `Renderer  ${state.renderer}`,
      `Physics   ${state.physics}`,
      `Frame     ${state.fps ?? '–'} fps · tick ${state.tickRate ?? '–'} Hz`,
      `Server    ${state.server} · ${state.serverUrl}`,
      `Players   ${state.players ?? '–'}`,
      `RTT       ${state.rttMs === undefined ? '–' : `${state.rttMs} ms`}`,
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
