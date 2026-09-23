# syntax=docker/dockerfile:1.7

FROM node:24.21.0-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553 AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
COPY . .
ARG DEPLOYMENT_VERSION
ARG DEMO_MODE=false
ARG NEXT_PUBLIC_DEMO_MODE=false
ENV DEPLOYMENT_VERSION=$DEPLOYMENT_VERSION \
    DEMO_MODE=$DEMO_MODE \
    NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE
RUN node -e "if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(process.env.DEPLOYMENT_VERSION||'')){console.error('A valid DEPLOYMENT_VERSION build argument is required');process.exit(1)}" \
    && ./node_modules/.bin/prisma generate \
    && npm run build

# Demo deployments intentionally have no migration history. This target
# rebuilds the schema from prisma/schema.prisma and inserts deterministic data.
FROM dependencies AS demo-bootstrap
ENV NODE_ENV=production \
    DEMO_MODE=true \
    ALLOW_DEMO_DATABASE_RESET=true
COPY prisma ./prisma
COPY scripts/demo-reset-safety.mjs ./scripts/demo-reset-safety.mjs
COPY scripts/bootstrap-demo-database.mjs ./scripts/bootstrap-demo-database.mjs
COPY scripts/reset-and-seed-product-data.mjs ./scripts/reset-and-seed-product-data.mjs
COPY src/config/demo-accounts.json ./src/config/demo-accounts.json
RUN ./node_modules/.bin/prisma generate
USER node
CMD ["node", "scripts/bootstrap-demo-database.mjs", "--confirm=RESET_DEMO_DATABASE"]

FROM base AS runner
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
ARG DEPLOYMENT_VERSION
ENV DEPLOYMENT_VERSION=$DEPLOYMENT_VERSION

RUN groupadd --system --gid 1001 nextjs \
    && useradd --system --uid 1001 --gid nextjs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
RUN mkdir -p /app/.next/cache \
    /app/.local-data/private-attachments \
    && chown nextjs:nextjs /app/.next/cache \
    /app/.local-data/private-attachments \
    && chmod 0750 /app/.next/cache

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]

# Run as one independent replica. It calls the authenticated internal jobs and
# intentionally contains no application server or database credentials.
FROM base AS scheduler
ENV NODE_ENV=production
COPY --from=builder /app/scripts/maintenance-scheduler.mjs ./scripts/maintenance-scheduler.mjs
USER node
CMD ["node", "scripts/maintenance-scheduler.mjs"]
