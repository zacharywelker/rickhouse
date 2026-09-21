# syntax=docker/dockerfile:1

# ---------- deps ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- build ----------
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# The build only needs these to type-check and prerender; real values come
# from the environment at run time.
ENV DATABASE_URL=postgres://build:build@localhost:5432/build \
    APP_PASSWORD=build-time-placeholder \
    SESSION_SECRET=build-time-placeholder-secret-not-used-at-runtime
RUN npm run build && npm run build:scripts

# ---------- runner ----------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    UPLOAD_DIR=/data/uploads

# su-exec drops privileges after the entrypoint fixes up ownership; wget backs
# the container health check.
RUN apk add --no-cache su-exec wget

# Next.js standalone output: server + only the traced node_modules.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Bundled migrate/seed runners plus the SQL they apply.
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /data/uploads

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --spider -q http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
