# SmartSentinel Production Dockerfile
# Multi-stage build for optimal image size and security

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++ git

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY config/ ./config/

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache \
    ca-certificates \
    curl \
    dumb-init \
    && update-ca-certificates

# Create non-root user
RUN addgroup -g 1001 -S smartsentinel && \
    adduser -S -D -u 1001 -G smartsentinel smartsentinel

# Copy built application from builder
COPY --from=builder --chown=smartsentinel:smartsentinel /app/dist ./dist
COPY --from=builder --chown=smartsentinel:smartsentinel /app/node_modules ./node_modules
COPY --from=builder --chown=smartsentinel:smartsentinel /app/package.json ./package.json

# Copy configuration templates
COPY config/ ./config/

# Create data directories
RUN mkdir -p /app/data /app/logs /app/models && \
    chown -R smartsentinel:smartsentinel /app/data /app/logs /app/models

# Switch to non-root user
USER smartsentinel

# Expose health check port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Set environment defaults
ENV NODE_ENV=production
ENV PORT=3000
ENV AUTO_PAUSE_ENABLED=false

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start application
CMD ["node", "dist/main.js"]