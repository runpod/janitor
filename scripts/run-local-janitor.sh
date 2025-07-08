#!/bin/bash

# Local Janitor Development Script
# This script allows you to run the janitor system locally for debugging

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🤖 Local Janitor Development Runner${NC}"
echo -e "${BLUE}====================================${NC}"

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  No .env file found. Creating one from .env.example...${NC}"
    cp .env.example .env
    echo -e "${YELLOW}📝 Please edit .env file with your actual values before running again${NC}"
    echo -e "${YELLOW}   Required: ANTHROPIC_API_KEY, GITHUB_PERSONAL_ACCESS_TOKEN${NC}"
    echo -e "${YELLOW}   Optional: AWS credentials for database testing${NC}"
    exit 1
fi

# Load environment variables
source .env

# Check required environment variables
if [ -z "$ANTHROPIC_API_KEY" ] || [ -z "$GITHUB_PERSONAL_ACCESS_TOKEN" ]; then
    echo -e "${RED}❌ Required environment variables not set${NC}"
    echo -e "${RED}   Please set ANTHROPIC_API_KEY and GITHUB_PERSONAL_ACCESS_TOKEN in .env${NC}"
    exit 1
fi

# Default values
DOCKER_TAG=${DOCKER_TAG:-latest}
REPOS_FILE=${REPOS_FILE:-infra/repos.yaml}
MODE=${1:-docker}

echo -e "${GREEN}🔧 Configuration:${NC}"
echo -e "   Mode: $MODE"
echo -e "   Docker Tag: $DOCKER_TAG"
echo -e "   Repos File: $REPOS_FILE"
echo -e "   Environment: local"

# Function to build Docker image locally
build_local_image() {
    echo -e "${BLUE}🐳 Building Docker image locally...${NC}"
    
    # Build the TypeScript code
    echo -e "${YELLOW}📦 Building TypeScript code...${NC}"
    cd packages/janitor-agent
    npm install
    npm run build
    cd ../..
    
    # Detect platform for Docker build
    BUILD_PLATFORM="linux/amd64"
    if [[ "$(uname -m)" == "arm64" ]]; then
        BUILD_PLATFORM="linux/arm64"
        echo -e "${BLUE}🍎 Building for Apple Silicon: $BUILD_PLATFORM${NC}"
    else
        echo -e "${BLUE}🖥️  Building for Intel/AMD: $BUILD_PLATFORM${NC}"
    fi
    
    # Build Docker image
    echo -e "${YELLOW}🔨 Building Docker image...${NC}"
    docker build --platform $BUILD_PLATFORM -f packages/janitor-agent/docker/Dockerfile -t janitor:$DOCKER_TAG packages/janitor-agent/
    
    echo -e "${GREEN}✅ Docker image built successfully${NC}"
}

# Function to run container locally
run_local_container() {
    echo -e "${BLUE}🚀 Running janitor container locally...${NC}"
    
    # Use the actual repos file from the project (convert to absolute path)
    REPOS_FILE_PATH="$(pwd)/$REPOS_FILE"
    
    if [[ ! -f "$REPOS_FILE_PATH" ]]; then
        echo -e "${RED}❌ Repository file not found: $REPOS_FILE_PATH${NC}"
        echo -e "${YELLOW}📝 Creating a simple test repos file...${NC}"
        
        # Create a temporary repos file with just a few repos for testing
        REPOS_FILE_PATH="/tmp/test-repos.yaml"
        cat > "$REPOS_FILE_PATH" << 'EOF'
repositories:
  - name: "hello-world"
    organization: "library"
    url: "https://github.com/docker-library/hello-world"
    validation_type: "basic"
EOF
    fi
    
    # Detect platform for local development
    PLATFORM="linux/amd64"
    if [[ "$(uname -m)" == "arm64" ]]; then
        PLATFORM="linux/arm64"
        echo -e "${BLUE}🍎 Detected Apple Silicon - using platform: $PLATFORM${NC}"
    else
        echo -e "${BLUE}🖥️  Detected Intel/AMD - using platform: $PLATFORM${NC}"
    fi
    
    # Run the container
    docker run --rm -it \
        --platform $PLATFORM \
        -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
        -e GITHUB_PERSONAL_ACCESS_TOKEN="$GITHUB_PERSONAL_ACCESS_TOKEN" \
        -e ENVIRONMENT="local" \
        -e INSTANCE_ID="local-debug" \
        -e DEBUG="true" \
        -e REPOS_FILE="/app/repos.yaml" \
        -e DATABASE_HOST="${DATABASE_HOST:-localhost}" \
        -e DATABASE_PORT="${DATABASE_PORT:-5432}" \
        -e DATABASE_NAME="${DATABASE_NAME:-janitor}" \
        -e DATABASE_USER="${DATABASE_USER:-janitor_agent}" \
        -e DATABASE_PASSWORD="${DATABASE_PASSWORD:-}" \
        -e DATABASE_AGENT_SECRET_ARN="${DATABASE_AGENT_SECRET_ARN:-}" \
        -e DATABASE_QUERY_SECRET_ARN="${DATABASE_QUERY_SECRET_ARN:-}" \
        -e AWS_PROFILE="${AWS_PROFILE:-}" \
        -e AWS_REGION="${AWS_REGION:-}" \
        -e AWS_DEFAULT_REGION="${AWS_REGION:-}" \
        -e ACCOUNT_ID="${ACCOUNT_ID:-}" \
        -v "$REPOS_FILE_PATH:/app/repos.yaml" \
        -v "$(pwd)/local-output:/app/output" \
        -v ~/.aws:/root/.aws:ro \
        -v /var/run/docker.sock:/var/run/docker.sock \
        janitor:$DOCKER_TAG
    
    echo -e "${GREEN}✅ Container execution completed${NC}"
    echo -e "${BLUE}📁 Check ./local-output/ for results${NC}"
}

# Function to run agent directly (for development)
run_local_agent() {
    echo -e "${BLUE}🔧 Running janitor agent directly for development...${NC}"
    
    cd packages/janitor-agent
    
    # Create local .env if it doesn't exist
    if [ ! -f .env ]; then
        echo -e "${YELLOW}📝 Creating local .env file...${NC}"
        cp .env.example .env
        echo "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" >> .env
        echo "GITHUB_PERSONAL_ACCESS_TOKEN=$GITHUB_PERSONAL_ACCESS_TOKEN" >> .env
    fi
    
    # Install dependencies
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm install
    
    # Run in development mode
    echo -e "${YELLOW}🚀 Starting development server...${NC}"
    npm run dev
}

# Function to test database connection
test_database() {
    echo -e "${BLUE}🗄️  Testing database connection...${NC}"
    
    if [ -z "$DATABASE_HOST" ] || [ -z "$DATABASE_PASSWORD" ]; then
        echo -e "${YELLOW}⚠️  Database credentials not set in .env${NC}"
        echo -e "${YELLOW}   For local testing, set DATABASE_HOST, DATABASE_PASSWORD, etc.${NC}"
        echo -e "${YELLOW}   For AWS testing, the container will fetch credentials from Secrets Manager${NC}"
        return 0
    fi
    
    cd packages/janitor-agent
    
    # Create a simple database test
    cat > test-db-local.js << 'EOF'
const { Client } = require('pg');

async function testDatabase() {
    try {
        console.log('🔍 Testing database connection...');
        console.log('📍 Host:', process.env.DATABASE_HOST || 'not set');
        console.log('👤 User:', process.env.DATABASE_USER || 'not set');
        console.log('🗄️  Database:', process.env.DATABASE_NAME || 'not set');
        
        if (!process.env.DATABASE_HOST || !process.env.DATABASE_PASSWORD) {
            console.log('⚠️  Database credentials not provided via environment variables');
            console.log('   The agent receives credentials from the container environment');
            return;
        }
        
        const client = new Client({
            host: process.env.DATABASE_HOST,
            port: process.env.DATABASE_PORT || 5432,
            database: process.env.DATABASE_NAME,
            user: process.env.DATABASE_USER,
            password: process.env.DATABASE_PASSWORD,
            ssl: { rejectUnauthorized: false }
        });
        
        await client.connect();
        const result = await client.query('SELECT NOW()');
        console.log('✅ Database connection successful!');
        console.log('⏰ Server time:', result.rows[0].now);
        await client.end();
        
    } catch (error) {
        console.error('❌ Database test failed:', error.message);
    }
}

testDatabase();
EOF
    
    DATABASE_HOST="$DATABASE_HOST" \
    DATABASE_PORT="$DATABASE_PORT" \
    DATABASE_NAME="$DATABASE_NAME" \
    DATABASE_USER="$DATABASE_USER" \
    DATABASE_PASSWORD="$DATABASE_PASSWORD" \
    node test-db-local.js
    
    rm test-db-local.js
    
    cd ../..
}

# Create output directory
mkdir -p local-output

# Main execution
case $MODE in
    "docker")
        build_local_image
        run_local_container
        ;;
    "dev")
        run_local_agent
        ;;
    "build")
        build_local_image
        ;;
    "db-test")
        test_database
        ;;
    *)
        echo -e "${RED}❌ Invalid mode: $MODE${NC}"
        echo -e "${BLUE}Usage: $0 [docker|dev|build|db-test]${NC}"
        echo -e "${BLUE}  docker   - Build and run full container (default)${NC}"
        echo -e "${BLUE}  dev      - Run agent directly for development${NC}"
        echo -e "${BLUE}  build    - Just build the Docker image${NC}"
        echo -e "${BLUE}  db-test  - Test database connectivity${NC}"
        exit 1
        ;;
esac

echo -e "${GREEN}✅ Local janitor execution completed${NC}" 