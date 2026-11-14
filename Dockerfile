# syntax=docker/dockerfile:1

# ---- base: Node plus the pnpm version pinned in package.json ("packageManager") ----
FROM node:26.13.1-alpine AS base
WORKDIR /app
# Node 25 and later no longer ship Corepack, so pnpm is installed with npm.
RUN npm install --global pnpm@12.18.0

# ---- build: all dependencies, bundle src/ into dist/server.js ----
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

# ---- prod-deps: production dependencies only ----
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

# ---- runtime: no pnpm, no sources, no dev dependencies, non-root ----
FROM node:26.13.1-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# node runs as PID 1 and handles SIGTERM itself (see src/server.ts), so `docker stop` is graceful.
CMD ["node", "--enable-source-maps", "dist/server.js"]
