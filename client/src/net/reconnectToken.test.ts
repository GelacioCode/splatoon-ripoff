import { describe, expect, it } from 'vitest';
import {
  clearReconnectToken,
  loadReconnectToken,
  saveReconnectToken,
  type TokenStorage,
} from './reconnectToken';

function fakeStorage(): TokenStorage {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

describe('reconnect token', () => {
  it('comes back right after a refresh', () => {
    const storage = fakeStorage();
    saveReconnectToken('abc', 1_000, storage);
    expect(loadReconnectToken(20, 3_000, storage)).toBe('abc');
  });

  it('is skipped once the server would have let the player go', () => {
    const storage = fakeStorage();
    saveReconnectToken('abc', 1_000, storage);
    expect(loadReconnectToken(20, 1_000 + 21_000, storage)).toBeNull();
  });

  it('is gone after clearing, and ignores damaged data', () => {
    const storage = fakeStorage();
    saveReconnectToken('abc', 1_000, storage);
    clearReconnectToken(storage);
    expect(loadReconnectToken(20, 1_000, storage)).toBeNull();
    storage.setItem('paint-rush.reconnect', '{oops');
    expect(loadReconnectToken(20, 1_000, storage)).toBeNull();
    expect(loadReconnectToken(20, 1_000, null)).toBeNull();
  });
});
