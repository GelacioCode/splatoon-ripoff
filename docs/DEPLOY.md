# Deploying Paint Rush

Two parts, two places:

| Part | Address | Hosted on |
| --- | --- | --- |
| Game page (what players open, and the QR link) | `https://paintrush.samuelgelacio.io` | **Vercel** (free) |
| Game server (runs every match, 30 ticks a second) | `https://game.samuelgelacio.io` | **Hostinger VPS** (`187.127.114.35`), in Docker, behind **Caddy** |

Vercel can't run the game server: it only runs short functions, not something that stays connected to every player for a whole match. That's why the server lives on the VPS. Caddy gets and renews the https certificate by itself, so the page (https) can talk to the server (wss).

Order: **1 DNS → 2 push to GitHub → 3 VPS → 4 Vercel → 5 test.**

---

## 1. DNS (Hostinger → Domains → samuelgelacio.io → DNS / Nameservers)

| Type | Name | Points to | When |
| --- | --- | --- | --- |
| A | `game` | `187.127.114.35` | now (done) |
| CNAME | `paintrush` | the target Vercel shows you in step 4 | after step 4 |

Check from your PC (asks Google's DNS, which updates faster than some internet providers):

```powershell
nslookup game.samuelgelacio.io 8.8.8.8
```

Expect `Address: 187.127.114.35`.

## 2. Push the code to GitHub

The VPS and Vercel both download the code from `https://github.com/GelacioCode/splatoon-ripoff`, so commit and push first (from your PC):

```powershell
git add -A
git commit -m "feat: phase 6 deployment (docker, caddy, vercel)"
git push
```

## 3. Game server on the VPS

Connect from PowerShell on your PC:

```powershell
ssh root@187.127.114.35
```

Then, **on the VPS**:

```bash
# get the code (first time only)
git clone https://github.com/GelacioCode/splatoon-ripoff.git /opt/paint-rush
cd /opt/paint-rush

# build and start the game server and Caddy in the background (first build takes a few minutes)
docker compose up -d --build

# watch the logs (Ctrl+C stops watching; the server keeps running)
docker compose logs -f
```

In the logs, expect `[server] Rapier … ready` and `[server] listening …` from `game`, and from `caddy` a line saying it obtained a certificate for `game.samuelgelacio.io`.

Check it from the VPS (or open the address in your browser):

```bash
curl https://game.samuelgelacio.io/health
```

Expect something like `{"ok":true,"protocol":5,"rapier":"0.21.0"}`.

Both containers restart by themselves if they crash or the VPS reboots.

### Updating the server later

```bash
cd /opt/paint-rush
git pull
docker compose up -d --build
```

## 4. Game page on Vercel

1. Go to [vercel.com](https://vercel.com) and sign up / log in **with GitHub**.
2. **Add New… → Project**, then **Import** `GelacioCode/splatoon-ripoff`.
3. On the configure screen:
   - **Root Directory**: click **Edit** and choose `client`.
   - **Framework Preset**: Vite (usually picked automatically). Build and output settings come from `client/vercel.json`, so leave them as they are.
   - **Environment Variables** (add both):

     | Name | Value | Why |
     | --- | --- | --- |
     | `VITE_SERVER_URL` | `https://game.samuelgelacio.io` | Where the game server is |
     | `ENABLE_EXPERIMENTAL_COREPACK` | `1` | Makes Vercel use the same pnpm version as the project (`packageManager` in `package.json`) |

4. Click **Deploy**. When it's done, Vercel shows a test address like `splatoon-ripoff.vercel.app`. Open it: you should see the Paint Rush start screen.
5. Your own address: **Project → Settings → Domains → Add** `paintrush.samuelgelacio.io`. Vercel shows a **CNAME** value to add. In Hostinger DNS add: Type `CNAME`, Name `paintrush`, Points to *(that value)*. After a few minutes Vercel shows the domain as valid and sets up https for it.
6. (If the build fails on the Node version) **Settings → General → Node.js Version**: pick **24.x**, then **Deployments → … → Redeploy**.

Every `git push` to `main` makes Vercel rebuild the page automatically. The server on the VPS only updates when you run the update commands in step 3.

**Changing `VITE_SERVER_URL` later** (e.g. a new server address): edit it in **Settings → Environment Variables**, then **Redeploy**, because it's built into the page.

## 5. Test

1. `https://game.samuelgelacio.io/health` shows `"ok":true`.
2. Open `https://paintrush.samuelgelacio.io` on the PC → **Create Lobby**.
3. Scan the QR code with your phone **on mobile data** (not Wi-Fi), so it really goes over the internet. Join, start, play a round.
4. Add `?debug` to the address to see the status panel (ping, input delay, data use).

---

## Something's wrong?

| Symptom | Check |
| --- | --- |
| `/health` doesn't load | `docker compose ps` (both `Up`?) and `docker compose logs game`. |
| Caddy says it can't get a certificate | DNS: `nslookup game.samuelgelacio.io 8.8.8.8` must show the VPS IP. Ports 80 and 443 must be open (next row). Then `docker compose restart caddy`. |
| Ports blocked | On the VPS: `ufw status`. If it's active: `ufw allow 80/tcp`, `ufw allow 443/tcp`, `ufw allow 443/udp`. Also check the firewall in Hostinger's VPS panel, if it's turned on. |
| Page loads but stays on "connecting" or can't create a lobby | `VITE_SERVER_URL` on Vercel must be exactly `https://game.samuelgelacio.io` (no slash at the end), then **Redeploy**. The browser console (F12) shows the failing address. |
| `/join/CODE` links show a 404 | `client/vercel.json` must be in the repo, and Vercel's **Root Directory** must be `client`. |
| Players far away lag | Ping depends on distance to the VPS: check with `?debug`. |
