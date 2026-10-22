import { describe, expect, it } from 'vitest';
import { normalizeServerUrl, resolveServerUrl } from './serverUrl';

const lanPage = { protocol: 'http:', hostname: '192.168.1.20' };

describe('resolveServerUrl', () => {
  it('prefers the ?server= link parameter', () => {
    const url = resolveServerUrl({
      search: '?server=https://abc.trycloudflare.com',
      envUrl: 'https://env.example.com',
      location: lanPage,
      defaultPort: 2567,
    });
    expect(url).toBe('https://abc.trycloudflare.com');
  });

  it('falls back to VITE_SERVER_URL', () => {
    const url = resolveServerUrl({
      search: '',
      envUrl: 'https://env.example.com',
      location: lanPage,
      defaultPort: 2567,
    });
    expect(url).toBe('https://env.example.com');
  });

  it('ignores an empty ?server= value', () => {
    const url = resolveServerUrl({
      search: '?server=',
      envUrl: 'https://env.example.com',
      location: lanPage,
      defaultPort: 2567,
    });
    expect(url).toBe('https://env.example.com');
  });

  it("uses the page's own host on the default port when nothing is configured", () => {
    const url = resolveServerUrl({ search: '', envUrl: '', location: lanPage, defaultPort: 2567 });
    expect(url).toBe('http://192.168.1.20:2567');
  });

  it('keeps https pages on https', () => {
    const url = resolveServerUrl({
      search: '',
      envUrl: undefined,
      location: { protocol: 'https:', hostname: 'game.example.com' },
      defaultPort: 2567,
    });
    expect(url).toBe('https://game.example.com:2567');
  });
});

describe('normalizeServerUrl', () => {
  it('converts WebSocket schemes to HTTP and drops trailing slashes', () => {
    expect(normalizeServerUrl('ws://localhost:2567')).toBe('http://localhost:2567');
    expect(normalizeServerUrl('wss://game.example.com/')).toBe('https://game.example.com');
  });

  it('assumes https for bare hosts', () => {
    expect(normalizeServerUrl('abc.trycloudflare.com')).toBe('https://abc.trycloudflare.com');
  });
});
