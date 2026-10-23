# The Paint Rush game server (Colyseus + Rapier), for a VPS. Built and run by
# docker-compose.yml, behind Caddy (https / wss). See docs/DEPLOY.md.
FROM node:24-slim

WORKDIR /app

# The pnpm version pinned in package.json ("packageManager").
RUN corepack enable

# Dependencies first, so code changes don't reinstall everything. The client's package.json
# is only here because pnpm checks the whole workspace against the lockfile.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN pnpm install --frozen-lockfile --filter "@paint-rush/server..."

COPY shared shared
COPY server server

ENV NODE_ENV=production
ENV PORT=2567
EXPOSE 2567

CMD ["pnpm", "--filter", "@paint-rush/server", "start"]
