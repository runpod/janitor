# Simplified Janitor Makefile
# Replaces complex Terraform infrastructure with simple persistent GPU instance

# Load environment variables from .env
ifneq (,$(wildcard ./.env))
    include .env
    export
endif

# Default values
AWS_REGION ?= us-east-1
AWS_PROFILE ?= default
SSH_KEY_PATH ?= ~/.ssh/janitor-key

# =============================================================================
# Setup Commands (One-time)
# =============================================================================

.PHONY: setup-supabase
setup-supabase:
	@echo "🚀 Setting up Supabase for Janitor Agent..."
	@chmod +x scripts/setup-supabase.sh
	@./scripts/setup-supabase.sh

.PHONY: setup-instance
setup-instance:
	@echo "🚀 Creating GPU instance with full Janitor setup (everything included)..."
	@chmod +x scripts/start-instance.sh
	@./scripts/start-instance.sh

.PHONY: deploy-code
deploy-code:
	@echo "📦 Updating code on existing instance (not needed for fresh instances)..."
	@chmod +x scripts/deploy-code.sh
	@./scripts/deploy-code.sh

# =============================================================================
# Instance Management
# =============================================================================

.PHONY: start-instance
start-instance:
	@echo "🚀 Starting Janitor GPU instance..."
	@chmod +x scripts/start-instance.sh
	@./scripts/start-instance.sh

.PHONY: stop-instance
stop-instance:
	@echo "🛑 Stopping Janitor GPU instance to save costs..."
	@chmod +x scripts/stop-instance.sh
	@./scripts/stop-instance.sh

# =============================================================================
# Usage Commands
# =============================================================================

.PHONY: send-prompt
send-prompt:
	@echo "📤 Sending validation prompt to Mastra server..."
ifndef PROMPT
	@echo "❌ Error: PROMPT parameter required"
	@echo "Usage: make send-prompt PROMPT=\"validate RunPod/worker-basic\""
	@exit 1
endif
	@chmod +x scripts/send-prompt.sh
	@./scripts/send-prompt.sh "$(PROMPT)"

.PHONY: query-results
query-results:
	@echo "📊 Querying validation results from Supabase..."
	@chmod +x scripts/query-results.sh
	@./scripts/query-results.sh

# =============================================================================
# Local Development
# =============================================================================

.PHONY: install
install:
	@echo "📦 Installing dependencies..."
	@cd packages/janitor-agent && npm install

.PHONY: test-local
test-local:
	@echo "🧪 Running local tests..."
	@cd packages/janitor-agent && npm run start:local

# =============================================================================
# Help
# =============================================================================

.PHONY: help
help:
	@echo "🤖 Simplified Janitor Agent Commands"
	@echo "===================================="
	@echo ""
	@echo "Setup (one-time):"
	@echo "  make setup-supabase     - Set up Supabase database"
	@echo "  make setup-instance     - Launch GPU instance"
	@echo "  make deploy-code        - Deploy janitor code to instance"
	@echo ""
	@echo "Daily usage:"
	@echo "  make send-prompt PROMPT=\"validate RunPod/worker-basic\" - Send validation request"
	@echo "  make query-results                                       - Check recent results"
	@echo "  make query-results RUN_ID=your-run-id                   - Check specific run"
	@echo "  make query-results REPO=worker-basic                    - Check repository results"
	@echo ""
	@echo "Instance management:"
	@echo "  make start-instance     - Start the GPU instance"
	@echo "  make stop-instance      - Stop instance to save costs"
	@echo "  make deploy-code        - Deploy/update code on instance"
	@echo ""
	@echo "Development:"
	@echo "  make install            - Install dependencies locally"
	@echo "  make test-local         - Run local tests"
	@echo ""
	@echo "Examples:"
	@echo "  make send-prompt PROMPT=\"please validate these repos: RunPod/worker-basic\""
	@echo "  make send-prompt PROMPT=\"validate worker-template and create a PR if fixes needed\""

.DEFAULT_GOAL := help 