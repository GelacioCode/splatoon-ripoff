# Paint Rush

A browser-based multiplayer paint shooter: two teams, a 3D arena, swimming through your own paint, and Capture the Flag. Players join from their phones by scanning a QR code.

> **Status: Phase 1 (offline sandbox) in progress.** You can run and jump around the arena. Painting, swimming and phone controls come next.

## Requirements

- Node.js 22.12 or newer (24 LTS recommended)
- pnpm 12: `npm install -g pnpm@12`
- Git

## Getting started

```bash
pnpm install   # install everything (client, server, shared)
pnpm dev       # start the client (Vite) and the game server (Colyseus) together
```

Open http://localhost:5173. The game server listens on http://localhost:2567 and has a health check at http://localhost:2567/health.

## Controls (desktop)

| Action | Key |
| --- | --- |
| Start playing (captures the mouse) | Click the screen |
| Move | WASD or arrow keys |
| Look and aim | Mouse |
| Jump | Space |
| Shoot paint (hold to keep firing) | Left mouse button |
| Reload (2.5 s, no shooting meanwhile) | R |
| Swim: melt into a puddle (fast and hidden in your own paint, climbs painted walls, refills ink) | Shift (hold) |
| Pause (frees the mouse) | Esc |
| Live tuning panel (for development) | `` ` `` (backtick, left of 1) |

## Controls (phones and tablets)

- **Left thumb:** touch anywhere on the left half and drag to move (the joystick appears where you touch).
- **Right thumb:** drag on the right half to aim. You can also drag the **SHOOT** button to aim while shooting.
- **Buttons:** SHOOT (hold), SWIM (hold), JUMP, R (reload), II (pause).
- **Optional gyro aim:** turn it on in the pause menu. It needs an `https://` page (see the Cloudflare tunnel tip below), and iPhones ask for permission.

The pause menu (Esc on desktop, II on touch) has sensitivity, invert up/down, volume, gyro and **graphics quality** (Auto / Low / Medium / High). Changing quality reloads the page. Resolution also drops automatically when the frame rate does, shown as `res …%` in the dev overlay.

To test gyro over https on your phone, run a temporary tunnel to the dev server: `cloudflared tunnel --url http://localhost:5173`. Install it once with `winget install --id Cloudflare.cloudflared`.

The tuning panel has sliders for movement and camera feel. **Copy tuning** copies the current values so they can be saved into `shared/src/config.ts`.

## Scripts (run from the repo root)

| Command | What it does |
| --- | --- |
| `pnpm dev` | Client on port 5173 and server on port 2567; both reload when you save |
| `pnpm check` | Typecheck, lint, format check and tests in one go |
| `pnpm typecheck` | TypeScript checks for every package |
| `pnpm lint` | ESLint |
| `pnpm format` | Rewrite files in the project's Prettier style |
| `pnpm format:check` | List files that need formatting |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm build` | Production build of the client into `client/dist` |

## Project structure

```
client/   Vite + TypeScript + Three.js: the game in the browser
server/   Node.js + TypeScript + Colyseus: authoritative game rooms
shared/   Code both sides use: config, protocol, synced state, math, physics
          shared/src/config.ts holds every tunable gameplay value
```

## Configuration

| Where | Setting | Default | Purpose |
| --- | --- | --- | --- |
| client | `VITE_SERVER_URL` | empty | Game server URL baked into client builds, e.g. `https://game.example.com` |
| client | `?server=` in the page URL | none | Overrides the server for one visit, e.g. `?server=https://abc.trycloudflare.com` |
| server | `PORT` | `2567` | Port the game server listens on |

With nothing configured, the client connects to port 2567 on the same host that served the page, so phones on your Wi-Fi work without any setup. To set `VITE_SERVER_URL` locally, copy `client/.env.example` to `client/.env.local`.

## Testing on your phone (same Wi-Fi)

1. Run `pnpm dev` and find the `Network: http://192.168.x.x:5173/` line in the output.
2. Open that address on your phone.
3. If Windows Firewall asks about Node.js, allow it on **Private** networks. Windows must also treat your Wi-Fi as a Private network (Settings → Network & internet → Wi-Fi → your network).

## Troubleshooting

- **"running scripts is disabled on this system" (PowerShell):** run `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`, answer `Y`, and try again.
- **"pnpm is not recognized":** close and reopen the terminal after installing pnpm.
- **`ERR_PNPM_IGNORED_BUILDS` during install:** a dependency wants to run an install script nobody has reviewed. List it under `allowBuilds` in `pnpm-workspace.yaml` (`true` runs the script, `false` skips it).
- **Port 5173 or 2567 already in use:** an old dev server is still running. Close other terminals running `pnpm dev`, or restart VS Code.
- **Phone can't connect:** make sure the phone and PC share the same Wi-Fi, the network is set to Private, and the firewall allowed Node.js.

## Roadmap

0. Monorepo scaffold (done)
1. Offline sandbox: movement, camera, shooting, paint, swimming, wall climbing, desktop and mobile controls (current phase)
2. Networking: client prediction, server reconciliation, interpolation
3. Lobby: QR join, names and customization, host controls, auto-balanced teams
4. Capture the Flag: rules, HUD, match flow, end screen
5. Load test with 30 headless bots
6. Deployment: client on Vercel, Cloudflare Tunnel, Docker + Caddy on a VPS
