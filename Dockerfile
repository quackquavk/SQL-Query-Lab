# syntax=docker/dockerfile:1
FROM node:22-bookworm

WORKDIR /app

# Install build tools for native modules (better-sqlite3, bcryptjs)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install only production deps
COPY backend/package.json backend/pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile --prod

# Create data directory for SQLite
RUN mkdir -p /app/data
# VOLUME ["/app/data"]

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
