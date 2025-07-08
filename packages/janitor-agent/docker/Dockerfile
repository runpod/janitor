# Multi-stage build for Janitor Agent
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS runtime

# Install system dependencies
RUN apk add --no-cache \
    docker-cli \
    git \
    curl \
    bash \
    jq \
    aws-cli

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Copy Docker scripts and database operations
COPY docker/entrypoint.sh /app/entrypoint.sh
COPY docker/run-janitor.js /app/run-janitor.js
COPY docker/health-server.js /app/health-server.js
COPY src/db-operations.js /app/db-operations.js

# Make scripts executable
RUN chmod +x /app/entrypoint.sh

# Create directories
RUN mkdir -p /app/repos /app/reports

# Expose port for health checks
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Default environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Set entrypoint
ENTRYPOINT ["/app/entrypoint.sh"]

# Default command
CMD ["main"] 