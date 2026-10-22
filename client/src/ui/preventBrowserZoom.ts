/** Two taps closer together than this (ms) count as a double tap. */
const DOUBLE_TAP_MS = 350;

/**
 * Stops the phone browser from zooming the page during play: pinching with two thumbs
 * (common while moving and aiming at once) and double-tapping a button. iPhone Safari
 * ignores the viewport's "no zoom" setting, so this blocks the gestures directly.
 */
export function preventBrowserZoom(): void {
  // Pinch: any move with more than one finger.
  document.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length > 1) event.preventDefault();
    },
    { passive: false },
  );

  // Double tap: a second tap right after the first.
  let lastTap = 0;
  document.addEventListener(
    'touchend',
    (event) => {
      const now = event.timeStamp;
      if (now - lastTap < DOUBLE_TAP_MS) event.preventDefault();
      lastTap = now;
    },
    { passive: false },
  );

  // iPhone Safari's own pinch gesture events.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
  }
}
