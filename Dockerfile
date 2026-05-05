# syntax=docker/dockerfile:1
FROM node:22-bookworm

WORKDIR /app

# Install build tools for native modules (better-sqlite3, bcryptjs)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first for better Docker layer caching
COPY backend/package.json backend/pnpm-lock.yaml* ./

# Install dependencies — pnpm's glob pattern in COPY fails if no lockfile exists
# We handle this by checking if the lockfile exists before copying
RUN (test -f backend/pnpm-lock.yaml && cp backend/pnpm-lock.yaml ./) || true
RUN corepack enable && pnpm install --frozen-lockfile --prod

# Create data directory for SQLite
RUN mkdir -p /app/data

# Named volume for SQLite persistence across container restarts
# This preserves auth.db (sessions + user accounts) when the container is recreated
VOLUME ["/app/data"]

# Copy backend source
COPY backend/ ./backend/

# Non-root user for security
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
USER appuser

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

# Run as non-root
CMD ["node", "backend/server.js"]
