/** The player's choice of controls; 'auto' asks the device. */
export type ControlsSetting = 'auto' | 'touch' | 'mouse';

export const CONTROLS_SETTINGS: ControlsSetting[] = ['auto', 'touch', 'mouse'];

/**
 * Touch controls or mouse and keyboard? In order: the `?touch` / `?desktop` link options, then
 * the saved setting, then the device's *main* input. That last one is a finger on phones,
 * tablets and foldables, even ones that also report a precise pointer (e.g. Galaxy Fold), and
 * a mouse or trackpad on computers, including touchscreen laptops.
 */
export function chooseTouchControls(
  setting: ControlsSetting,
  search: string,
  primaryPointerIsCoarse: boolean,
): boolean {
  const params = new URLSearchParams(search);
  if (params.has('touch')) return true;
  if (params.has('desktop')) return false;
  if (setting === 'touch') return true;
  if (setting === 'mouse') return false;
  return primaryPointerIsCoarse;
}
