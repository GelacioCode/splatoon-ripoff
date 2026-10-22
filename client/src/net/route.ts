import { parseLobbyCode } from '@paint-rush/shared';

/** Which screen a link opens (`?offline`, the sandbox, is handled before this). */
export type Route =
  | { kind: 'home'; badCode?: string }
  | { kind: 'join'; code: string }
  /** Dev shortcut: make a lobby and start it right away. */
  | { kind: 'quick' };

export function parseRoute(pathname: string, search: string): Route {
  if (new URLSearchParams(search).has('quick')) return { kind: 'quick' };
  const match = /^\/join\/([^/]+)\/?$/i.exec(pathname);
  if (!match) return { kind: 'home' };
  let typed = match[1];
  try {
    typed = decodeURIComponent(typed);
  } catch {
    // Not valid percent-encoding: check it as typed.
  }
  const code = parseLobbyCode(typed);
  return code ? { kind: 'join', code } : { kind: 'home', badCode: typed };
}

export function joinPath(code: string): string {
  return `/join/${code}`;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** The best address for phones on the same Wi-Fi: home-network ranges first. */
export function pickLanAddress(addresses: readonly string[]): string | null {
  const ranked = (address: string) => {
    if (address.startsWith('192.168.')) return 0;
    if (address.startsWith('10.')) return 1;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 2;
    return 3;
  };
  const sorted = [...addresses].sort((a, b) => ranked(a) - ranked(b));
  return sorted[0] ?? null;
}

/**
 * The link for the QR code. On the real site that's the page's own address. On a page opened
 * as `localhost`, phones can't use that, so this computer's network address goes in instead
 * (same port), if the server reported one.
 */
export function joinUrl(
  location: Pick<Location, 'protocol' | 'hostname' | 'host' | 'port'>,
  code: string,
  lanAddresses: readonly string[] = [],
): string {
  const lan = LOCAL_HOSTS.has(location.hostname) ? pickLanAddress(lanAddresses) : null;
  const host = lan ? `${lan}${location.port ? `:${location.port}` : ''}` : location.host;
  return `${location.protocol}//${host}${joinPath(code)}`;
}

/** Whether the page is on this computer only, so the QR code needs the network address. */
export function isLocalPage(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname);
}
