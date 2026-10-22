import { describe, expect, it } from 'vitest';
import { joinUrl, parseRoute, pickLanAddress } from './route';

describe('parseRoute', () => {
  it('opens the join screen for /join/CODE links, tidying the code', () => {
    expect(parseRoute('/join/K7QX', '')).toEqual({ kind: 'join', code: 'K7QX' });
    expect(parseRoute('/join/k7qx/', '')).toEqual({ kind: 'join', code: 'K7QX' });
  });

  it('falls back to the home screen for anything else, noting a bad code', () => {
    expect(parseRoute('/', '')).toEqual({ kind: 'home' });
    expect(parseRoute('/join/NOPE1', '')).toEqual({ kind: 'home', badCode: 'NOPE1' });
    expect(parseRoute('/join/%E0%A4%A', '')).toEqual({ kind: 'home', badCode: '%E0%A4%A' });
  });

  it('knows the ?quick dev shortcut', () => {
    expect(parseRoute('/', '?quick')).toEqual({ kind: 'quick' });
  });
});

describe('joinUrl', () => {
  const site = { protocol: 'https:', hostname: 'paint.example', host: 'paint.example', port: '' };
  const local = { protocol: 'http:', hostname: 'localhost', host: 'localhost:5173', port: '5173' };

  it("uses the page's own address on a real site", () => {
    expect(joinUrl(site, 'K7QX', ['192.168.1.20'])).toBe('https://paint.example/join/K7QX');
  });

  it('swaps localhost for the network address so phones can open it', () => {
    expect(joinUrl(local, 'K7QX', ['172.20.0.2', '192.168.1.20'])).toBe(
      'http://192.168.1.20:5173/join/K7QX',
    );
    // Nothing reported: localhost is all we have.
    expect(joinUrl(local, 'K7QX')).toBe('http://localhost:5173/join/K7QX');
  });

  it('prefers home-network addresses', () => {
    expect(pickLanAddress(['25.1.2.3', '10.0.0.5', '192.168.0.9'])).toBe('192.168.0.9');
    expect(pickLanAddress([])).toBeNull();
  });
});
