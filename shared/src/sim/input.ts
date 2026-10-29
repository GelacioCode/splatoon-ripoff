/** What a player asks to do during one simulation tick. Phase 2 sends this over the network. */
export interface PlayerInput {
  /** Strafe: −1 (left) to +1 (right). */
  moveX: number;
  /** Walk: −1 (back) to +1 (forward). */
  moveY: number;
  /** Aim direction in radians. Yaw 0 looks toward −Z; positive pitch looks up. */
  aimYaw: number;
  aimPitch: number;
  fire: boolean;
  swim: boolean;
  jump: boolean;
  /** Asks for a reload now (ignored while already reloading or when the tank is full). */
  reload: boolean;
  /** Aim mode: zoomed, accurate long-range shots, slower walking. Swimming cancels it. */
  aim: boolean;
  /** What to hold: 0 the role's weapon, 1 a bomb (PRIMARY_SLOT / BOMB_SLOT). */
  slot: number;
}

/**
 * The input with everything but looking around (and picking what to hold) switched off: for
 * the countdown before a match, when players stand on their spawn pads. Server and
 * prediction both use it.
 */
export function frozenInput(input: PlayerInput): PlayerInput {
  return { ...createInput(), aimYaw: input.aimYaw, aimPitch: input.aimPitch, slot: input.slot };
}

export function createInput(): PlayerInput {
  return {
    moveX: 0,
    moveY: 0,
    aimYaw: 0,
    aimPitch: 0,
    fire: false,
    swim: false,
    jump: false,
    reload: false,
    aim: false,
    slot: 0,
  };
}
