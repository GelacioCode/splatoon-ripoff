import RAPIER from '@dimforge/rapier3d-compat';

let ready: Promise<string> | undefined;

/** Loads Rapier's WebAssembly once (safe to call repeatedly) and resolves to its version. */
export function initPhysics(): Promise<string> {
  ready ??= RAPIER.init().then(() => RAPIER.version());
  return ready;
}

export { RAPIER };
export type { Collider } from '@dimforge/rapier3d-compat';
export * from './bombs';
export * from './health';
export * from './input';
export * from './physicsWorld';
export * from './playerState';
export * from './projectiles';
export * from './stepPlayer';
export * from './weapon';
