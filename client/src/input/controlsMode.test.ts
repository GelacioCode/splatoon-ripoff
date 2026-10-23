import { describe, expect, it } from 'vitest';
import { chooseTouchControls } from './controlsMode';

const FINGER = true;
const MOUSE = false;

describe('chooseTouchControls', () => {
  it('follows the main input on auto: phones and foldables get touch, computers get mouse', () => {
    // A Galaxy Fold reports a finger as its main input (and a precise pointer besides).
    expect(chooseTouchControls('auto', '', FINGER)).toBe(true);
    // Desktops and touchscreen laptops: the main input is the mouse or trackpad.
    expect(chooseTouchControls('auto', '', MOUSE)).toBe(false);
  });

  it('uses the saved setting over the guess', () => {
    expect(chooseTouchControls('touch', '', MOUSE)).toBe(true);
    expect(chooseTouchControls('mouse', '', FINGER)).toBe(false);
  });

  it('lets the ?touch and ?desktop link options override everything', () => {
    expect(chooseTouchControls('mouse', '?touch', MOUSE)).toBe(true);
    expect(chooseTouchControls('touch', '?desktop', FINGER)).toBe(false);
    expect(chooseTouchControls('auto', '?debug&touch', MOUSE)).toBe(true);
  });
});
