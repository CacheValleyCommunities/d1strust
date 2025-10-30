# Use Bun official image
FROM oven/bun:1 AS base

# Set working directory
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/
COPY public/ ./public/
COPY drizzle/ ./drizzle/

# Create data directory for database
RUN mkdir -p /app/data

# Expose port (will be overridden by PORT env var, but good practice)
EXPOSE 3000

# Set default environment variables
ENV PORT=3000
ENV DB_PATH=/app/data/ots.db
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD bun -e "fetch('http://localhost:${PORT}/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Run migrations on startup, then start server
CMD bun run migrate && bun run start

