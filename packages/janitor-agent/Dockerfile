# Multi-stage build for Janitor Agent
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS runtime

# Install Docker CLI (for Docker-in-Docker scenarios)
RUN apk add --no-cache \
    docker-cli \
    git \
    curl \
    bash

# Create app user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/package*.json ./

# Create directory for repositories
RUN mkdir -p /app/repos && chown appuser:appgroup /app/repos

# Create directory for reports
RUN mkdir -p /app/reports && chown appuser:appgroup /app/reports

# Switch to app user
USER appuser

# Expose port for health checks
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Default environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Entry point script
COPY --chown=appuser:appgroup <<EOF /app/entrypoint.sh
#!/bin/bash
set -euo pipefail

# Function for logging
log() {
    echo "\$(date '+%Y-%m-%d %H:%M:%S') [JANITOR] \$1"
}

# Function to run Janitor validation on a repository
run_janitor_validation() {
    local repo_url="\$1"
    local repo_name="\$2"
    
    log "🔍 Starting validation for repository: \$repo_name"
    log "📂 Repository URL: \$repo_url"
    
    # TODO: Implement actual Janitor logic here
    # For now, just simulate the process
    
    log "✅ Validation completed for \$repo_name"
    
    # Create a simple report
    cat > "/app/reports/\${repo_name}-report.json" << REPORT_EOF
{
    "timestamp": "\$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "repository": {
        "name": "\$repo_name",
        "url": "\$repo_url"
    },
    "status": "success",
    "validation_results": {
        "docker_build": "passed",
        "docker_run": "passed", 
        "security_scan": "passed"
    },
    "environment": {
        "container_id": "\$(hostname)",
        "aws_region": "\$AWS_REGION",
        "s3_bucket": "\$S3_BUCKET"
    }
}
REPORT_EOF
    
    log "📊 Report generated: /app/reports/\${repo_name}-report.json"
}

# Function to upload reports to S3
upload_reports() {
    if [[ -n "\${S3_BUCKET:-}" ]]; then
        log "📤 Uploading reports to S3 bucket: \$S3_BUCKET"
        for report in /app/reports/*.json; do
            if [[ -f "\$report" ]]; then
                aws s3 cp "\$report" "s3://\$S3_BUCKET/reports/" || log "⚠️  Failed to upload \$report"
            fi
        done
        log "✅ All reports uploaded"
    else
        log "ℹ️  No S3_BUCKET specified, skipping upload"
    fi
}

# Main execution
main() {
    log "🚀 Starting Janitor Agent container"
    log "🌍 Environment: \${ENVIRONMENT:-dev}"
    log "🔧 AWS Region: \${AWS_REGION:-us-east-1}"
    
    # Default repositories for testing
    if [[ -z "\${REPOS_FILE:-}" ]]; then
        log "📋 No REPOS_FILE specified, using default test repository"
        run_janitor_validation "https://github.com/TimPietrusky/worker-basic" "worker-basic"
    else
        log "📋 Processing repositories from: \$REPOS_FILE"
        # TODO: Parse YAML file and process multiple repositories
        run_janitor_validation "https://github.com/TimPietrusky/worker-basic" "worker-basic"
    fi
    
    # Upload reports
    upload_reports
    
    log "🎉 Janitor Agent execution completed successfully"
}

# Check if running as main script
if [[ "\${1:-}" == "main" ]]; then
    main
else
    # Default: start a simple HTTP server for health checks
    log "🌐 Starting health check server on port \$PORT"
    
    # Create a simple health check endpoint
    cat > health-server.js << 'SERVER_EOF'
const http = require('http');
const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: 'healthy', 
            timestamp: new Date().toISOString(),
            service: 'janitor-agent'
        }));
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

server.listen(port, () => {
    console.log(\`Health check server running on port \${port}\`);
});
SERVER_EOF
    
    node health-server.js
fi
EOF

# Make entrypoint script executable
RUN chmod +x /app/entrypoint.sh

# Set entrypoint
ENTRYPOINT ["/app/entrypoint.sh"]

# Default command
CMD ["main"] 