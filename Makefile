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

# =============================================================================
# Instance Management
# =============================================================================

.PHONY: start
start:
	@echo "🚀 Starting GPU instance with full Janitor setup..."
	@chmod +x scripts/start-instance.sh
	@./scripts/start-instance.sh

.PHONY: stop
stop:
	@echo "🗑️  Terminating GPU instance (complete cleanup)..."
	@chmod +x scripts/stop-instance.sh
	@./scripts/stop-instance.sh

.PHONY: pause
pause:
	@echo "⏸️  Pausing GPU instance (preserve for restart)..."
	@chmod +x scripts/pause-instance.sh
	@./scripts/pause-instance.sh

.PHONY: deploy
deploy:
	@echo "🚀 Hot deploying Janitor code (zero downtime, atomic swap)..."
	@chmod +x scripts/deploy.sh
	@./scripts/deploy.sh

.PHONY: rollback
rollback:
ifdef RELEASE
	@echo "↩️  Rolling back to release: $(RELEASE)"
	@chmod +x scripts/rollback.sh
	@./scripts/rollback.sh "$(RELEASE)"
else
	@echo "📋 Available releases for rollback:"
	@chmod +x scripts/rollback.sh
	@./scripts/rollback.sh
endif

.PHONY: ssh
ssh:
	@echo "🔗 Connecting to GPU instance via SSH..."
	@if [ -f ".env" ]; then \
		source .env && \
		INSTANCE_ID=$$(aws ec2 describe-instances \
			--filters "Name=tag:Name,Values=janitor-gpu-instance" "Name=instance-state-name,Values=running" \
			--query "Reservations[0].Instances[0].InstanceId" \
			--output text \
			--profile "$$AWS_PROFILE" \
			--region "$$AWS_REGION" 2>/dev/null || echo "None"); \
		if [ "$$INSTANCE_ID" != "None" ] && [ "$$INSTANCE_ID" != "null" ]; then \
			PUBLIC_IP=$$(aws ec2 describe-instances \
				--instance-ids "$$INSTANCE_ID" \
				--query "Reservations[0].Instances[0].PublicIpAddress" \
				--output text \
				--profile "$$AWS_PROFILE" \
				--region "$$AWS_REGION"); \
			echo "📋 Instance: $$INSTANCE_ID"; \
			echo "🌐 IP: $$PUBLIC_IP"; \
			echo "🔑 Key: $$SSH_KEY_PATH"; \
			echo ""; \
			echo "🚀 Connecting to ubuntu@$$PUBLIC_IP..."; \
			echo "💡 Tip: Run 'nvidia-smi' or 'docker run --rm --gpus all nvidia/cuda:12.6.0-base-ubuntu22.04 nvidia-smi' to test GPU"; \
			echo ""; \
			ssh -i "$$SSH_KEY_PATH" -o StrictHostKeyChecking=no ubuntu@"$$PUBLIC_IP"; \
		else \
			echo "❌ No running instance found"; \
			echo "💡 Start one with: make start"; \
		fi; \
	else \
		echo "❌ .env file not found"; \
	fi

# =============================================================================
# Monitoring Commands
# =============================================================================

.PHONY: logs
logs:
	@echo "📊 Streaming Janitor agent logs (press Ctrl+C to exit)..."
	@chmod +x scripts/show-logs.sh
	@./scripts/show-logs.sh

.PHONY: status
status:
	@echo "🔍 Checking Janitor service status..."
	@if [ -f ".env" ]; then \
		source .env && \
		INSTANCE_ID=$$(aws ec2 describe-instances \
			--filters "Name=tag:Name,Values=janitor-gpu-instance" "Name=instance-state-name,Values=running" \
			--query "Reservations[0].Instances[0].InstanceId" \
			--output text \
			--profile "$$AWS_PROFILE" \
			--region "$$AWS_REGION" 2>/dev/null || echo "None"); \
		if [ "$$INSTANCE_ID" != "None" ] && [ "$$INSTANCE_ID" != "null" ]; then \
			PUBLIC_IP=$$(aws ec2 describe-instances \
				--instance-ids "$$INSTANCE_ID" \
				--query "Reservations[0].Instances[0].PublicIpAddress" \
				--output text \
				--profile "$$AWS_PROFILE" \
				--region "$$AWS_REGION"); \
			echo "📋 Instance: $$INSTANCE_ID"; \
			echo "🌐 IP: $$PUBLIC_IP"; \
			echo ""; \
			SERVICE_STATUS=$$(ssh -i "$$SSH_KEY_PATH" -o StrictHostKeyChecking=no ubuntu@"$$PUBLIC_IP" 'sudo systemctl is-active janitor-mastra' 2>/dev/null || echo "unknown"); \
			if [ "$$SERVICE_STATUS" = "active" ]; then \
				echo "✅ Service is running"; \
				ssh -i "$$SSH_KEY_PATH" -o StrictHostKeyChecking=no ubuntu@"$$PUBLIC_IP" 'sudo systemctl status janitor-mastra --no-pager --lines=5' || true; \
			elif [ "$$SERVICE_STATUS" = "inactive" ]; then \
				echo "⚠️  Service is not running"; \
				echo "🔧 To start: ssh -i $$SSH_KEY_PATH ubuntu@$$PUBLIC_IP 'sudo systemctl start janitor-mastra'"; \
				echo "📊 To check logs: make logs"; \
			else \
				echo "❓ Service status unknown - checking full status..."; \
				ssh -i "$$SSH_KEY_PATH" -o StrictHostKeyChecking=no ubuntu@"$$PUBLIC_IP" 'sudo systemctl status janitor-mastra --no-pager' || true; \
			fi; \
		else \
			echo "❌ No running instance found"; \
		fi; \
	else \
		echo "❌ .env file not found"; \
	fi

.PHONY: restart
restart:
	@echo "🔄 Restarting Janitor service..."
	@if [ -f ".env" ]; then \
		source .env && \
		INSTANCE_ID=$$(aws ec2 describe-instances \
			--filters "Name=tag:Name,Values=janitor-gpu-instance" "Name=instance-state-name,Values=running" \
			--query "Reservations[0].Instances[0].InstanceId" \
			--output text \
			--profile "$$AWS_PROFILE" \
			--region "$$AWS_REGION" 2>/dev/null || echo "None"); \
		if [ "$$INSTANCE_ID" != "None" ] && [ "$$INSTANCE_ID" != "null" ]; then \
			PUBLIC_IP=$$(aws ec2 describe-instances \
				--instance-ids "$$INSTANCE_ID" \
				--query "Reservations[0].Instances[0].PublicIpAddress" \
				--output text \
				--profile "$$AWS_PROFILE" \
				--region "$$AWS_REGION"); \
			echo "📋 Instance: $$INSTANCE_ID"; \
			echo "🌐 IP: $$PUBLIC_IP"; \
			echo ""; \
			ssh -i "$$SSH_KEY_PATH" -o StrictHostKeyChecking=no ubuntu@"$$PUBLIC_IP" 'sudo systemctl restart janitor-mastra'; \
			echo "⏳ Waiting for service to start..."; \
			sleep 5; \
			SERVICE_STATUS=$$(ssh -i "$$SSH_KEY_PATH" -o StrictHostKeyChecking=no ubuntu@"$$PUBLIC_IP" 'sudo systemctl is-active janitor-mastra' 2>/dev/null || echo "failed"); \
			if [ "$$SERVICE_STATUS" = "active" ]; then \
				echo "✅ Service restarted successfully"; \
			else \
				echo "❌ Service failed to start"; \
				echo "📊 Check logs with: make logs"; \
			fi; \
		else \
			echo "❌ No running instance found"; \
		fi; \
	else \
		echo "❌ .env file not found"; \
	fi

# =============================================================================
# Usage Commands
# =============================================================================

.PHONY: prompt
prompt:
	@echo "📤 Sending prompt to Mastra server..."
ifdef FILE
	@echo "📄 Resolving prompt file: $(FILE)"
	@# Try direct path first
	@if [ -f "$(FILE)" ]; then \
		echo "✅ Found: $(FILE)"; \
		chmod +x scripts/send-prompt.sh; \
		./scripts/send-prompt.sh "$$(cat $(FILE))"; \
	elif [ -f "prompts/$(FILE)" ]; then \
		echo "✅ Found: prompts/$(FILE)"; \
		chmod +x scripts/send-prompt.sh; \
		./scripts/send-prompt.sh "$$(cat prompts/$(FILE))"; \
	elif [ -f "prompts/$(FILE).md" ]; then \
		echo "✅ Found: prompts/$(FILE).md"; \
		chmod +x scripts/send-prompt.sh; \
		./scripts/send-prompt.sh "$$(cat prompts/$(FILE).md)"; \
	else \
		echo "❌ Error: Prompt file not found"; \
		echo ""; \
		echo "Searched locations:"; \
		echo "  - $(FILE)"; \
		echo "  - prompts/$(FILE)"; \
		echo "  - prompts/$(FILE).md"; \
		echo ""; \
		echo "💡 Create a prompt file:"; \
		echo "  cat > prompts/$(FILE).md << 'EOF'"; \
		echo "  # PROMPT"; \
		echo "  Add your detailed instructions here"; \
		echo "  "; \
		echo "  # REPOS"; \
		echo "  - worker-basic"; \
		echo "  - worker-template"; \
		echo "  EOF"; \
		echo ""; \
		echo "📁 Available prompt files:"; \
		if [ -d "prompts" ]; then \
			ls -la prompts/ 2>/dev/null | grep -E '\.(md|txt)$$' || echo "  (no .md or .txt files found)"; \
		else \
			echo "  (prompts/ folder does not exist)"; \
		fi; \
		exit 1; \
	fi
else ifndef PROMPT
	@echo "❌ Error: PROMPT parameter or FILE parameter required"
	@echo ""
	@echo "Usage:"
	@echo "  make prompt PROMPT=\"validate RunPod/worker-basic\""
	@echo "  make prompt FILE=\"validate\"              # Uses prompts/validate.md"
	@echo "  make prompt FILE=\"prompts/custom.md\"     # Direct path"
	@echo ""
	@echo "🚀 Markdown prompts:"
	@echo "  make prompt FILE=validate                  # Uses default validation prompt"
	@echo ""
	@echo "📁 Create custom prompts in markdown:"
	@echo "  cat > prompts/my-task.md << 'EOF'"
	@echo "  # PROMPT"
	@echo "  Add comprehensive logging with structured output"
	@echo "  "
	@echo "  # REPOS"
	@echo "  - worker-basic"
	@echo "  - worker-template"
	@echo "  EOF"
	@echo ""
	@echo "Legacy format (still supported):"
	@echo "  make prompt PROMPT=\"validate worker-basic, worker-template\""
	@exit 1
else
	@chmod +x scripts/send-prompt.sh
	@./scripts/send-prompt.sh "$(PROMPT)"
endif

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

.PHONY: check-build
check-build:
	@echo "🔍 Running pre-deployment build checks..."
	@chmod +x scripts/check-build.sh
	@./scripts/check-build.sh

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
	@echo "  make start              - Launch GPU instance"
	@echo "  make deploy             - Hot deploy janitor code (zero downtime)"
	@echo ""
	@echo "Daily usage:"
	@echo "  make prompt PROMPT=\"validate RunPod/worker-basic\" - Send validation request"
	@echo "  make query-results                                       - Check recent results"
	@echo "  make query-results RUN_ID=your-run-id                   - Check specific run"
	@echo "  make query-results REPO=worker-basic                    - Check repository results"
	@echo ""
	@echo "Instance management:"
	@echo "  make start              - Start GPU instance (reuses stopped or creates new)"
	@echo "  make stop               - Terminate instance (complete cleanup, no costs)"
	@echo "  make pause              - Pause instance (preserve for quick restart)"
	@echo "  make deploy             - Hot deploy code (zero downtime, atomic swap)"
	@echo "  make rollback           - List releases or rollback (RELEASE=timestamp)"
	@echo "  make ssh                - SSH into running instance for debugging"
	@echo ""
	@echo "Monitoring commands:"
	@echo "  make status             - Check service status"
	@echo "  make logs               - Stream real-time logs"
	@echo "  make restart            - Restart the service"
	@echo ""
	@echo "Development:"
	@echo "  make install            - Install dependencies locally"
	@echo "  make test-local         - Run local tests"
	@echo "  make check-build        - Verify TypeScript compilation before deploy"
	@echo ""
	@echo "Examples:"
	@echo "  make prompt PROMPT=\"please validate these repos: RunPod/worker-basic\""
	@echo "  make prompt PROMPT=\"validate worker-template and create a PR if fixes needed\""
	@echo "  make deploy                                           # Hot deploy latest code"
	@echo "  make rollback                                         # List available releases"
	@echo "  make rollback RELEASE=20250103-143022                # Rollback to specific release"

.DEFAULT_GOAL := help 