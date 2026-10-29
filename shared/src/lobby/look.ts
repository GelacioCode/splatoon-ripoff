/**
 * How a player's blob looks: one choice per part, each an index into LOOK_OPTIONS. Body color
 * isn't here: it's always the team color. Body shape is looks only (collision stays the same).
 */
export const LOOK_OPTIONS = {
  eyes: ['Round', 'Sleepy', 'Happy', 'Star', 'Wink', 'Angry', 'Heart', 'Dot'],
  hat: [
    'None',
    'Cap',
    'Beanie',
    'Crown',
    'Bow',
    'Top hat',
    'Propeller',
    'Party cone',
    'Sprout',
    'Headphones',
  ],
  goggles: ['None', 'Round', 'Visor', 'Star shades', 'Monocle', 'Ski goggles'],
  shoes: ['Sneakers', 'Boots', 'Flippers', 'Sandals', 'Roller skates', 'Rain boots', 'Slippers'],
  body: ['Round', 'Tall', 'Wide', 'Bean', 'Chunky', 'Tiny'],
} as const;

export type LookPart = keyof typeof LOOK_OPTIONS;
export type Look = Record<LookPart, number>;

export const LOOK_PARTS = Object.keys(LOOK_OPTIONS) as LookPart[];

export const DEFAULT_LOOK: Readonly<Look> = { eyes: 0, hat: 0, goggles: 0, shoes: 0, body: 0 };

function choice(value: unknown, part: LookPart): number {
  const valid =
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < LOOK_OPTIONS[part].length;
  return valid ? value : DEFAULT_LOOK[part];
}

/** A look from untrusted data (a client, saved settings): unknown parts get the default. */
export function parseLook(value: unknown): Look {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const look = { ...DEFAULT_LOOK };
  for (const part of LOOK_PARTS) look[part] = choice(source[part], part);
  return look;
}

export function randomLook(random: () => number): Look {
  const look = { ...DEFAULT_LOOK };
  for (const part of LOOK_PARTS) {
    look[part] = Math.floor(random() * LOOK_OPTIONS[part].length);
  }
  return look;
}
