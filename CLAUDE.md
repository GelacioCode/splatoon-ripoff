# Paint Rush

Persistent spec for a browser-based multiplayer 3D third-person paint-shooter game, built from scratch. Read it at the start of every session. The workflow rules (plan first and wait for approval, the user runs every terminal command, verify test results before calling anything done) come from the user's `CLAUDE.md` in the parent Downloads folder.

## Concept
Working title: "Paint Rush" (placeholder, easy to rename).
Two teams fight in a 3D arena by shooting paint. You can turn into a fast swimming form inside your own team's paint. Modes: PvP (build now) and PvE (later; keep the architecture ready for server-side AI bots).

IMPORTANT, ORIGINAL IP ONLY: this is inspired by the ink-shooter genre, but every character, name, logo, UI element, sound and art asset must be original. Do not copy or imitate Nintendo/Splatoon characters (Inklings/Octolings), names, logos, fonts or UI layouts. Art direction: bright neon paint colors, chunky toon/cel shading with outlines, glossy paint splats, playful rounded low-poly shapes. Characters are original "paint-blob creatures": a round, gummy body with stubby limbs that melts into a puddle when swimming. All art is procedural or built from simple meshes and shaders. No external copyrighted assets.

## Tech stack
- Monorepo using pnpm workspaces:
  - `/client`: Vite + TypeScript + Three.js
  - `/server`: Node.js + TypeScript + Colyseus (rooms, state sync, reconnection)
  - `/shared`: types, constants, and the movement/physics code used by both client and server
- Physics: Rapier (`@dimforge/rapier3d-compat`) on both client and server, for the kinematic character controller and level collision.
- Client deploys to Vercel. The game server is a long-running Node process. It must NOT run on Vercel, because all players in a lobby must stay connected to the same authoritative room.
  - Server URL comes from the env var `VITE_SERVER_URL`.
  - Local testing: run the server locally and expose it with Cloudflare Tunnel.
  - Later: a Dockerfile for VPS deployment, with Caddy for TLS (the server must be reachable over `wss://`).

## Netcode (must feel smooth with 30 players, many on phones)
- Server is authoritative. Server tick 30 Hz; snapshots sent at 20 Hz.
- Client-side prediction plus server reconciliation for the local player, using the same `/shared` movement code on both sides.
- Remote players are interpolated about 100 ms behind the server, with smoothed rotations.
- Shooting: the client spawns cosmetic projectiles instantly; the server simulates the real projectiles and decides hits and paint. Use simple lag compensation for hits.
- Keep bandwidth low: binary/compact messages, quantized positions and angles, delta state.

## Paint system
- Floors and walls can be painted. Each paintable surface has a paint grid (about 0.5 m cells) storing team ownership.
- The server owns the grid and broadcasts batched paint events: position, radius, team.
- Late joiners get a compressed full snapshot of the grid.
- The client renders paint with a render target / splat texture per surface, plus a shader that gives it a glossy, wet toon look.
- Gameplay effects:
  - Own paint: you can swim (fast, hidden, refills your ink tank, and lets you climb your own paint on walls).
  - Enemy paint: slows you and deals damage over time.
  - Unpainted ground: normal speed.

## Movement feel (TOP PRIORITY, iterate until fluid)
- Third-person over-the-shoulder camera with smooth follow, collision avoidance, and a slight FOV kick when swimming.
- Snappy acceleration, short coyote time, jump buffering, and air control.
- Swim form: transforms in about 0.15 s, high speed, a launch-out-of-paint jump, a wall climb on own paint, and splash particles.
- Shooting: auto-fire while held, an ink tank that drains, light recoil and spread, satisfying splat particles and sounds.

## Controls
- Desktop: WASD to move, mouse aim (pointer lock), left click to shoot, Shift to swim, Space to jump.
- Mobile (most players join by phone through the QR code, so this is required):
  - left virtual joystick to move
  - drag the right side of the screen to aim
  - on-screen buttons for shoot, swim and jump
  - optional gyro aim
- Mobile performance: target 60 fps on mid-range phones with 30 players.
  - instanced and low-poly meshes
  - dynamic resolution scaling
  - capped particle counts
  - a quality toggle

## Lobby flow
1. The host opens the site and clicks "Create Lobby". The server creates a room with a short code (e.g., `K7QX`).
2. The host screen shows a big QR code linking to `https://<client-url>/join/K7QX`, plus the code as text.
3. Players scan it, enter a name, and customize their character:
   - eyes, hat, goggles, shoes, body shape
   - a live 3D preview
   - body/paint color is set by team later
   - customization is saved to localStorage for next time
4. The host sees a live player list and can kick players, set match length, and press Start. The host also plays.
5. On Start, the server auto-balances players into two even teams (randomized; keep it pluggable so it can later balance by skill). Show a team reveal screen, then a countdown.
- Max 30 players per lobby, configurable.
- Handle reconnection: refreshing the page rejoins the same player.

## PvP mode: Capture the Flag
- One neutral flag spawns in the center of a symmetrical arena. Each team has a base zone on its side.
- Grab the flag and carry it to your own base to score. The flag then resets to the center after a short delay.
- The flag carrier cannot swim and moves at about 80% speed, so teammates must escort and paint a path.
- If the carrier gets splatted, the flag drops where they died and anyone can pick it up. A dropped flag left untouched for 15 s returns to the center.
- Players have 100 HP and regenerate when out of combat and not standing in enemy paint. When splatted, they respawn at their team spawn after 5 s.
- Win condition: first to 3 captures, or the most captures when the 5-minute timer ends. If tied, the team with more turf painted wins (show a percentage).
- HUD:
  - scores and timer
  - flag direction indicator and carrier highlight
  - ink tank meter
  - kill feed
  - minimap showing the paint coverage
- End screen: results, top players, and a "Play Again" button that returns everyone to the lobby.

## Arena
Build one original, symmetrical CTF map from simple geometry: ramps, ledges, walls to climb, cover blocks, and a raised center area for the flag. Keep the map definition data-driven so more maps can be added later.

## Build in phases. Stop after each phase so I can test it, and tell me exactly how to run it.
- Phase 0: monorepo scaffold, dev scripts (`pnpm dev` runs client and server together), lint, README.
- Phase 1: offline sandbox. Movement, camera, shooting, paint, swim, and wall climb on the test map, with desktop and mobile controls. Polish the feel here.
- Phase 2: networking. Several browser tabs in one room, with prediction, reconciliation and interpolation working.
- Phase 3: lobby, QR join, name entry and customization, host controls, auto-balance.
- Phase 4: Capture the Flag rules, HUD, match flow, end screen.
- Phase 5: a load test with a headless bot script that connects 30 simulated players. Measure server tick time, bandwidth, and client fps, then optimize.
- Phase 6: deployment. Vercel config for the client, a guide for a Cloudflare Tunnel to the local server, a Dockerfile, and a Caddy guide for the VPS.

Rules while working: keep the code clean and modular, put tunable gameplay values in one config file, commit after each phase with a clear message, and ask me before adding big dependencies or changing the stack.

## Status
- [x] Phase 0: monorepo scaffold. Verified 2026-10-23: `pnpm install`, typecheck, lint, Prettier, 14 unit tests, the browser scene (WebGL2, Rapier 0.21.0, server connected, RTT shown) and `/health`. Not yet reported: the two-tab player count and the automatic rejoin after a server restart.
- [x] Phase 1: offline sandbox (done 2026-10-23), split into milestones with a test stop after each:
  - [x] 1A walk the arena (user confirmed working and pushed, 2026-10-23)
  - [x] 1B paint + shooting, plus the reload system and 15-shot tank (user confirmed and pushed)
  - [x] 1C swim, climb, enemy paint (user confirmed and pushed)
  - [x] 1D phones + performance (user confirmed working on their phone and pushed)
  - [x] 1E feel polish: camera 4.6 m back, paint drips drawn as thin streaks, landing puffs, shot streaks, and aim mode (right mouse / AIM toggle: zoom, 0.6° spread, longer straight flight, 65% walk speed). User confirmed and pushed. Open item: the user suspected a small FPS drop after 1E; never measured.
- [ ] Phase 2: networking (plan approved 2026-10-23; milestones 2A move together, 2B shoot and paint together, 2C reconnection, bandwidth and real-network testing)
  - [x] 2A move together: user confirmed two tabs see each other (after fixing quantized fields → float32). Open item: RTT shows ~150 ms on localhost (expected a few ms), probably inputs queueing on the server; investigate in 2C.
  - [x] Roles (user request, inserted before 2B): Sniper / Assault / Machine gun, picked on the start/pause menu. User confirmed working and pushed, 2026-10-23.
  - [ ] 2B shoot and paint together: written 2026-10-23, awaiting the user's test.
- [ ] Phase 3: lobby, QR join, customization, auto-balance
- [ ] Phase 4: Capture the Flag
- [ ] Phase 5: 30-bot load test
- [ ] Phase 6: deployment

## Decisions log
- 2026-10-23: Versions (checked on the npm registry): Node >= 22.12 (dev machine has Node 24 LTS), pnpm 12, TypeScript ~6.0, Vite 8, three 0.186 with `WebGLRenderer` (WebGL2), Colyseus 0.18, `@colyseus/schema` 5, Rapier `@dimforge/rapier3d-compat` 0.21, tsx 4, ESLint 10 + typescript-eslint 8, Prettier 3, Vitest 5.
- TypeScript stays on 6.0 until typescript-eslint supports TypeScript 7 (its peer range is `<6.1.0`).
- Server depends on `@colyseus/core` + `@colyseus/ws-transport`, not the `colyseus` meta-package. The meta-package auto-installs uWebSockets.js from GitHub (blocked by pnpm 11+) plus auth/redis/monitor packages we don't use. The client uses `@colyseus/sdk`.
- Synced state uses schema 5's decorator-free `schema({...}, 'Name')` syntax, so no decorator tsconfig flags are needed.
- pnpm 11+ fails installs on unreviewed dependency build scripts: `allowBuilds` in `pnpm-workspace.yaml` allows `esbuild` and skips `msgpackr-extract`.
- Vitest added for unit tests (approved with the Phase 0 plan).
- `/shared` is consumed as TypeScript source (no build step). Rapier sits behind the `@paint-rush/shared/physics` subpath so the client can lazy-load it.
- Tunable gameplay values: `shared/src/config.ts`.
- Client server-URL order: `?server=` link parameter, then `VITE_SERVER_URL`, then `http(s)://<page host>:2567`.
- Git: repo at https://github.com/GelacioCode/splatter-ripoff (branch `main`). Commit messages are plain, with no Co-Authored-By trailer (user preference).
- Phase 1 plan approved 2026-10-23: lil-gui for the dev tuning panel (lazy-loaded, backtick key); enemy paint damage stops at a 40 HP floor; milestones 1A–1E.
- Simulation conventions: game rules live in `shared/src/sim` (`@paint-rush/shared/sim`, everything that needs Rapier) as step functions on flat `PlayerState` objects. The state stores the feet position; yaw 0 looks toward −Z. The capsule (radius 0.4, half-height 0.2) is only a probe for Rapier's character controller. Players don't collide with each other. `PhysicsWorld` steps Rapier once after building the map, because colliders aren't visible to queries before a step.
- Arena "Drip Yard" (`shared/src/maps/arena.ts`): 36 × 64 m, built from boxes. It's defined for team 0's half and turned 180° for team 1, so both sides play alike.
- Paint: `PaintGrid` (shared, 0.5 m cells, team per cell) is the gameplay truth. The client's `PaintAtlas` is one 2048² render target with a region per paintable surface (`atlasPacker`). Its texels store coverage in red and team in green, and the map shader turns that into glossy paint. Splats are spheres projected onto every nearby surface (`projectSplat`).
- Shots: `stepWeapon` + `stepProjectiles` in `shared/src/sim`. The spread is seeded by player seed and shot number, so it's deterministic. The client corrects aim pitch so shots go from the nozzle to the crosshair target.
- Ink/reload (user decision, 2026-10-23): ink never trickles back while shooting. A full reload takes 2.5 s and nothing fires during it. It starts when the tank is empty, after 10 s without shooting, or on R. Swimming in own paint will still refill ink fast (1C).
- Roles (user request, 2026-10-23): `PlayerState.weapon` is an index into `WEAPON_KINDS` (0 assault, 1 sniper, 2 machine gun; `shared/src/weapons.ts`). Per-role values are in `CONFIG.weapons` (magazine 20 / 5 / 40; walk speed ×1 / ×1.1 / ×0.8; sniper longest range, machine gun shortest). Values shared by every role stay in `CONFIG.weapon`. The client joins with `{ weapon }` and switches with the `chooseWeapon` message. The server validates both with `parseWeaponChoice` and ignores re-picking the current role. A switch refills the tank; Phase 4 may restrict switching to respawn. The choice is saved in `Settings.weapon`.
- Swim/climb (1C):
  - `stepPlayer` takes an optional `PaintGrid` and reads the paint under the feet (short ray down) and on a wall ahead (short ray along the move direction).
  - `swimBlend` 0→1 over `transformTime`.
  - `submerged` = puddle form on own paint, or climbing own-painted wall: fast, hidden, ink refills, and a full tank ends a reload.
  - No shooting unless `swimBlend` is 0.
  - Enemy paint: slow, lower jump, damage down to the 40 HP floor; regen after `regenDelay`.
- Phones (1D):
  - `(pointer: coarse)` → touch controls (`TouchControls`, Pointer Events).
  - `InputManager.playing` gates all input. Desktop plays while the mouse is captured; touch plays after "Tap to play" until II.
  - Settings live in localStorage (`client/src/settings.ts`).
  - Quality presets in `render/quality.ts`; changing quality reloads the page.
  - `DynamicResolution` scales the pixel ratio to hold 60 fps.
- Netcode (2A):
  - `ArenaRoom` (server): `defineInput(NetInput)` with a hold-last-input idle policy, `setFixedTimestep(30 Hz)`, `next()` per player then the shared `stepPlayer`; `allowReconnection` for 20 s in `onDrop`.
  - `NetPlayer` (`shared/src/net/schemas.ts`) has every `PlayerState` field. Pose fields are public; timers and ink are `.view()`, owner only via `client.view.add(player)`.
  - **Gotcha (found in testing):** the Colyseus reconciler only mirrors plain numeric fields. `t.quantized()` / `t.angle()` fields came through as `undefined`, leaving the predicted player with no position (blank screen). Use `t.float32()` for anything prediction reads.
  - Client `OnlineGame`:
    - `Predict.get(room, lerp 100 ms)`, with `attachAll` for remotes (yaw as an angle).
    - `predict.reconciler(ownPlayer, step = stepPlayer)`.
    - One `input.send()` per `predict.tick()` step, with yaw wrapped to −π…π.
    - `?offline` = sandbox, `?debug` = Colyseus netcode panel.
  - Shared scene code is in `client/src/game/World.ts`.
- Netcode (2B, shots and paint):
  - The server runs `stepWeapon` (seeded with `seedFromString(sessionId)`) and `stepProjectiles` for everyone. Its shots are the real ones.
  - Each tick, the paint that landed is packed (`encodePaintEvents`, 11 bytes each, cm positions) and broadcast as bytes (`MSG_PAINT`). The server paints its own grid from the *decoded* values, so client grids match it exactly.
  - New shots go to everyone except the shooter (`MSG_SHOTS`, 11 bytes each). Clients fly them for show only.
  - Own shots: the reconciler step runs `stepPlayer` + `stepWeapon`. `NewShotFilter` uses `shotCount` so replays don't show shots twice. The server keeps `shotCount` across respawns for this.
  - All on-screen shots are cosmetic: hits make splashes and sounds, never paint. Paint only comes from `MSG_PAINT`, so your own paint shows about one round trip after your shot lands (user accepted; an instant local-paint option was offered).
  - Late join and reconnect: the client sends `MSG_REQUEST_PAINT` once its handlers are set up. The server replies with `MSG_PAINT_SNAPSHOT` (run-length cells, `encodePaintSnapshot`), and the client redraws every painted cell as a soft blob (`PaintAtlas.addBlob`).
- Netcode plan: Colyseus 0.18 ships prediction/reconciliation (`Predict` reconciler, `predict.sim` for Rapier), `setFixedTimestep`, `defineInput`, interpolation, lag compensation (`allowRewindState`) and quantized schema fields. Phase 2 starts with a spike on these; fall back to hand-written netcode in `/shared` if they fall short.
