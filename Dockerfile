# Build stage
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Production stage
FROM oven/bun:1-alpine

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S bunuser && \
    adduser -S bunuser -u 1001

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY --chown=bunuser:bunuser src ./src
COPY --chown=bunuser:bunuser package.json ./
COPY --chown=bunuser:bunuser .env ./.env

# Switch to non-root user
USER bunuser

# Expose the port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD bun -e "fetch('http://localhost:8080/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Start the application
CMD ["bun", "run", "src/app.js"]
