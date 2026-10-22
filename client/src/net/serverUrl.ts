export interface ServerUrlInputs {
  /** `window.location.search`, e.g. `?server=https://abc.trycloudflare.com`. */
  search: string;
  /** `import.meta.env.VITE_SERVER_URL`, baked in at build time. */
  envUrl: string | undefined;
  /** The page's own location, used for the same-host fallback. */
  location: { protocol: string; hostname: string };
  defaultPort: number;
}

/**
 * Picks the game server URL: the `?server=` link parameter, then `VITE_SERVER_URL`, then the
 * page's own host on the default port (which also works for phones on the same Wi-Fi).
 */
export function resolveServerUrl({ search, envUrl, location, defaultPort }: ServerUrlInputs) {
  const explicit = new URLSearchParams(search).get('server')?.trim() || envUrl?.trim();
  if (explicit) return normalizeServerUrl(explicit);

  const scheme = location.protocol === 'https:' ? 'https' : 'http';
  return `${scheme}://${location.hostname}:${defaultPort}`;
}

/** Colyseus expects an http(s) endpoint; accept ws(s):// and bare hosts (assumed https) too. */
export function normalizeServerUrl(url: string): string {
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(url) ? url : `https://${url}`;
  return withScheme.replace(/^ws(s?):\/\//i, 'http$1://').replace(/\/+$/, '');
}
