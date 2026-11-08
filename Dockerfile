# Production multi-stage build for Tele-Pendant API (+ workspace packages).
# better-sqlite3 needs native toolchain.
FROM node:26-bookworm-slim AS builder

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@12.18.0 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc turbo.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/modbus-core/package.json ./packages/modbus-core/
COPY packages/plc-driver/package.json ./packages/plc-driver/
COPY apps/api/package.json ./apps/api/
COPY apps/modbus-sim/package.json ./apps/modbus-sim/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/modbus-sim ./apps/modbus-sim
COPY apps/web ./apps/web
COPY docs ./docs

RUN pnpm --filter @tele-pendant/shared build \
  && pnpm --filter @tele-pendant/modbus-core build \
  && pnpm --filter @tele-pendant/plc-driver build \
  && pnpm --filter @tele-pendant/api build \
  && pnpm --filter @tele-pendant/web build \
  && pnpm --filter @tele-pendant/modbus-sim build

# ---- API runtime ----
FROM node:26-bookworm-slim AS api

RUN apt-get update \
  && apt-get install -y --no-install-recommends gosu python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@12.18.0 --activate

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3010
ENV SQLITE_DIR=/app/data
ENV DATABASE_PATH=/app/data/tele-pendant.sqlite

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/modbus-core/package.json ./packages/modbus-core/
COPY packages/plc-driver/package.json ./packages/plc-driver/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile --prod --filter @tele-pendant/api...

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/modbus-core/dist ./packages/modbus-core/dist
COPY --from=builder /app/packages/plc-driver/dist ./packages/plc-driver/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/assets ./apps/api/assets
COPY --from=builder /app/apps/api/ota ./apps/api/ota
COPY --from=builder /app/docs ./docs
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/modbus-core/package.json ./packages/modbus-core/
COPY --from=builder /app/packages/plc-driver/package.json ./packages/plc-driver/
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN mkdir -p /app/data \
  && chown -R node:node /app/data \
  && chmod +x /usr/local/bin/docker-entrypoint.sh

WORKDIR /app/apps/api
ENV CURSOR_AGENT_CWD=/app
EXPOSE 3010

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3010)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]

# ---- Modbus sim runtime ----
FROM node:26-bookworm-slim AS modbus-sim

RUN corepack enable && corepack prepare pnpm@12.18.0 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/modbus-core/package.json ./packages/modbus-core/
COPY apps/modbus-sim/package.json ./apps/modbus-sim/

RUN pnpm install --frozen-lockfile --prod --filter @tele-pendant/modbus-sim...

COPY --from=builder /app/packages/modbus-core/dist ./packages/modbus-core/dist
COPY --from=builder /app/packages/modbus-core/package.json ./packages/modbus-core/
COPY --from=builder /app/apps/modbus-sim/dist ./apps/modbus-sim/dist

WORKDIR /app/apps/modbus-sim
ENV MODBUS_SIM_HOST=0.0.0.0
ENV MODBUS_SIM_PORT=1502
EXPOSE 1502
CMD ["node", "dist/main.js"]

# ---- Web (nginx) ----
FROM nginx:1.31-alpine AS web

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
