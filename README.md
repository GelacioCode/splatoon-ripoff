# Paint Rush

A browser-based multiplayer paint shooter: two teams, a 3D arena, swimming through your own paint, and Capture the Flag. Players join from their phones by scanning a QR code.

> **Status: Phase 4 (Capture the Flag) in progress.** Lobbies with QR join, customization, health and splatting, and Capture the Flag with scoring and a match timer.

## Game modes (page address options)

| Address | What you get |
| --- | --- |
| `http://localhost:5173` | **Start screen** (needs `pnpm dev` running): **Create Lobby**, or join one with its code. |
| `…/join/K7QX` | **Join screen** for lobby `K7QX`: this is the link in the lobby's QR code. |
| `…/?quick` | Dev shortcut: creates a lobby and starts it at once (solo testing of online play). |
| `…/?offline` | **Offline sandbox**: play solo without the server (handy for tuning the feel). |
| `…/?debug` | Online, plus Colyseus' netcode panel: prediction drift and a **latency simulator** to test lag. Works together with the others, e.g. `?quick&debug`. |

## Arena size

The arena grows with the number of players at Start, and keeps that size for the whole match:

| Players | Arena |
| --- | --- |
| up to 10 | 36 × 64 m (normal) |
| 11 to 20 | 1.25× wider and longer |
| 21 and more | 1.5× wider and longer |

Heights stay the same, so jumps and walls feel the same. Bigger arenas get more cover, and their first round is a fixed layout ("Big Yard"), since Drip Yard is made for the normal size. For testing with only a few players, add `?arena=1` or `?arena=2` to the host's link in `pnpm dev`; it's ignored in production.

## Lobbies

1. The host clicks **Create Lobby**, enters a name and picks a role. The lobby shows a big **QR code** and a 4-character **code**.
2. Players scan the QR code (or open the site and type the code), enter a name, design their blob (eyes, hat, goggles, shoes, body shape, with a turning 3D preview), pick a role and join. Name, look and role are remembered on each device. **Edit look** in the lobby changes it for everyone at once.
3. The host sees everyone in the list. They can remove a player (✕), set the match length (3 / 5 / 7 minutes) and the captures to win (3 / 5 / 7), and press **Start**, which needs 2 players. The host plays too.
4. On Start, players are shuffled into two even teams. A **team reveal** shows, then **3 · 2 · 1 · GO!** while everyone waits on their spawn pad. Then click or tap to play.
5. Players who join while a match is on go straight in, on the smaller team.
6. In the arena, other players' names float over their heads in their team's colour. Names hide behind walls and disappear while a player is a puddle, so hiding in paint still works.

When you run `pnpm dev` and open the host page as `localhost`, the QR code uses your PC's network address instead, so phones on the same Wi-Fi can open it. If Windows asks, allow Node.js on private networks.

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

## Online play

- **Refreshing the page puts you back as the same player** (same lobby, team, role and position), as long as you're back within 20 seconds. Each tab is its own player.
- The dev overlay (top left) shows:
  - **Ping:** the plain network round trip to the server.
  - **Input delay:** from pressing something until the server has used it and told you. It's always a bit higher than ping, because it includes waiting for the server's next tick and update. If inputs pile up, the server runs the extras straight away so the delay doesn't keep growing.
  - **Data:** KB/s down and up. Only shown in `pnpm dev`, or with `?debug` in the link.
- `?debug` also opens the Colyseus netcode panel, which has a latency simulator for testing lag.

## Capture the Flag

- One neutral flag starts on the raised platform in the middle, with a light beam above it. An arrow at the screen edge points to it when it's off screen.
- **Take it** by touching it while standing (not as a puddle). It rides on your back in your team colour.
- **Carrier rules:** you can't swim and you move at 80 % speed, so your team has to escort you and paint a path.
- **Score** by carrying it into **your own base**, the glowing area in your colour in front of your spawn. The flag reappears in the middle 3 seconds later.
- **Splatted carrier:** the flag drops on the spot, and anyone can take it. Left untouched for 15 s, it goes back to the middle.
- **A fresh round after every capture** (that doesn't win):
  - "Pink scores!" shows, then everyone goes back to their spawn, the paint is wiped, and the arena gets a **brand-new random layout**, followed by 3 · 2 · 1 · GO.
  - The first round is always the hand-made Drip Yard.
  - The match clock pauses between rounds.
- **Winning:** the first team to reach the host's goal (**3, 5 or 7 captures**, set in the lobby) wins. When the host's match time runs out, the team with more captures wins; on a tie, the team that painted more over the whole match wins. An exact tie is a draw.
- The scoreboard at top centre shows captures, time left, and what to do right now.

## Stats, minimap and results

- **KDA:** splats (K), times splatted (D) and assists (A), meaning you damaged someone within 5 s before a teammate splatted them. Captures and paint points (ground you painted) are counted too. Hold **Tab** (or tap **📊** on touch) for the live scoreboard.
- **Respawn time** grows each time you're splatted in a match: 3 s the first time, +1 s each time after, up to 10 s.
- **Minimap** (top left): the arena from above with live team paint, you (arrow), your teammates (dots) and the flag. Enemies aren't shown. Tap it or press **M** for the big map.
- **Results screen** when the match ends: the winner, captures, turf, and everyone's stats with "Most splats", "Most captures" and "Most paint" badges. The host's **Play again** takes everyone back to the lobby, with names and looks kept and paint wiped.

## Health and splatting

- Everyone has 100 HP. Hits from the other team hurt; your own team's shots pass through you.
- At 0 HP you're **splatted**: you burst into the attacker's paint, see "Splatted by …", and respawn on your team's pad (3–10 s, longer the more often you're splatted). For 2 seconds after respawning you blink and can't be hurt.
- A small marker on the crosshair (red for a splat) and a tick sound tell you your shot hit. A red flash means you got hit.
- The kill feed at top right shows who splatted whom.
- Hits are checked against where the shooter saw the target, so what you hit on your screen counts even with some lag.
- Health still regenerates after a few seconds out of combat, as long as you're not standing in enemy paint.

## Roles

Pick a role on the start screen. Your pick is remembered on this device, and you can switch any time from the pause menu (switching refills your tank).

| Role | Shots per reload | Damage per hit | Range | Walking speed |
| --- | --- | --- | --- | --- |
| Sniper | 5 | 50 (2 hits) | Long, fast shots with a long trail | Fastest |
| Assault | 20 | 34 (3 hits) | Medium (all-rounder) | Normal |
| Machine gun | 40 | 34 (3 hits) | Short, wide spray | Slowest |

Each role has its own blaster shape. All role values live in `CONFIG.weapons` in `shared/src/config.ts`, and the tuning panel has a folder per role.

## Controls (desktop)

| Action | Key |
| --- | --- |
| Start playing (captures the mouse) | Click the screen |
| Move | WASD or arrow keys |
| Look and aim | Mouse |
| Jump | Space |
| Shoot paint (hold to keep firing) | Left mouse button |
| Reload (2.5–3 s depending on role, no shooting meanwhile) | R |
| Aim: zoom in for precise long shots, walk slower (hold) | Right mouse button |
| Swim: melt into a puddle (fast and hidden in your own paint, climbs painted walls, refills ink) | Shift (hold) |
| Pause (frees the mouse) | Esc |
| Live tuning panel (for development) | `` ` `` (backtick, left of 1) |

## Controls (phones and tablets)

- **Left thumb:** touch anywhere on the left half and drag to move (the joystick appears where you touch).
- **Right thumb:** drag on the right half to aim. You can also drag the **SHOOT** button to aim while shooting.
- **Buttons:** SHOOT (hold), SWIM (hold), JUMP, R (reload), AIM (tap to toggle zoom), II (pause).
- **Which controls you get:** phones, tablets and foldables (like the Galaxy Fold) get touch controls; computers, including touchscreen laptops, get mouse and keyboard.
  - If a device guesses wrong, tapping the screen with a finger before playing switches to touch controls.
  - You can also choose in the pause menu (**Controls: Auto / Touch / Mouse & keyboard**), or add `?touch` / `?desktop` to the link.
- **Optional gyro aim:** turn it on in the pause menu. It needs an `https://` page (see the Cloudflare tunnel tip below), and iPhones ask for permission.

The pause menu (Esc on desktop, II on touch) has the role picker, sensitivity, invert up/down, volume, gyro and **graphics quality** (Auto / Low / Medium / High). Changing quality reloads the page. Resolution also drops automatically when the frame rate does, shown as `res …%` in the dev overlay.

To test gyro over https on your phone, run a temporary tunnel to the dev server: `cloudflared tunnel --url http://localhost:5173`. Install it once with `winget install --id Cloudflare.cloudflared`.

The tuning panel has sliders for movement and camera feel. **Copy tuning** copies the current values so they can be saved into `shared/src/config.ts`.

## Load test (bots)

Simple bots fill a lobby to test how the game holds up with many players. They move, shoot nearby enemies, swim now and then, go for the flag and bring it home.

```bash
# with pnpm dev running: 29 bots join the lobby your browser shows (use its real code)
pnpm --filter @paint-rush/server bots -- --code K7QX --count 29
# or: bots make their own lobby and start it straight away (join late from the browser)
pnpm --filter @paint-rush/server bots -- --create --start --count 30
```

- **Server timing:** while players are in, the `pnpm dev` terminal prints a line every 5 s:
  `[perf] K7QX: 30 players · tick 2.1 ms avg / 3.4 p95 / 7.9 max (budget 33.3 ms)`. A tick must stay well under the budget, or the game slows down.
- **Data use:** the bots' terminal prints every 5 s how much data each bot receives and sends (KB/s).
- **Stopping:** Ctrl+C in the bots' terminal makes them all leave.

## Deployment

- **Game page** on Vercel: `https://paintrush.samuelgelacio.io`.
- **Game server** on a Hostinger VPS in Docker, behind Caddy for https/wss: `https://game.samuelgelacio.io`.
- Step by step, including updates and troubleshooting: **[docs/DEPLOY.md](docs/DEPLOY.md)**.
- Files involved: `Dockerfile`, `docker-compose.yml`, `deploy/Caddyfile` and `client/vercel.json`.

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
