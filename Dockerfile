# ============================================================================
# WhatsCommerce Multi-Process Production Dockerfile
# Combines Next.js (port 3000) and Evolution API (port 8080) in one container
# Controlled via Supervisord for a single $7/mo Render deployment.
# ============================================================================

# ── STAGE 1: BUILD NEXT.JS APPLICATION ────────────────────────────────────────
FROM node:20-alpine AS next-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── STAGE 2: BUILD EVOLUTION API GATEWAY ─────────────────────────────────────
FROM node:20-alpine AS evolution-builder
WORKDIR /evolution
RUN apk add --no-cache git
RUN git clone --depth 1 -b main https://github.com/evolution-foundation/evolution-api.git .
RUN npm ci
RUN npm run build

# ── STAGE 3: FINAL PRODUCTION RUNNER ──────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Install supervisor to manage multi-node execution
RUN apk add --no-cache supervisor

# Copy Next.js production files
COPY --from=next-builder /app/.next /app/.next
COPY --from=next-builder /app/package*.json /app/
COPY --from=next-builder /app/node_modules /app/node_modules
COPY --from=next-builder /app/public /app/public
COPY --from=next-builder /app/lib /app/lib

# Copy Evolution API compiled files
COPY --from=evolution-builder /evolution /evolution

# Copy supervisord process manager config
COPY supervisord.conf /etc/supervisord.conf

# Render routes public traffic to port 3000 (Next.js)
EXPOSE 3000

# Run supervisor to start Next.js and Evolution API concurrently
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
