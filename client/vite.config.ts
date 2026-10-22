import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Listen on your LAN too, so phones on the same Wi-Fi can open the dev server.
    host: true,
    port: 5173,
    strictPort: true,
    // Allow Cloudflare quick-tunnel hostnames (HTTPS testing on phones).
    allowedHosts: ['.trycloudflare.com'],
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
  },
  resolve: {
    // The client, the Colyseus SDK and /shared must share one copy, or synced state breaks.
    dedupe: ['@colyseus/schema'],
  },
});
