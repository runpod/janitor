# Janitor AWS Cloud Runner
# Makefile for managing cloud infrastructure and running Janitor at scale

# Load environment variables from .env
ifneq (,$(wildcard ./.env))
    include .env
    export
endif

# Default values
ENV ?= dev
AWS_REGION ?= eu-west-2
AWS_PROFILE ?= runpod-janitor
REPOS_FILE ?= infra/repos.yaml
DOCKER_TAG ?= latest
SSH_KEY_PATH ?= ~/.ssh/janitor-key

# Validate required environment variables
check-env:
	@echo "🔍 Checking environment configuration..."
	@test -n "$(AWS_PROFILE)" || (echo "❌ AWS_PROFILE not set" && exit 1)
	@test -n "$(AWS_REGION)" || (echo "❌ AWS_REGION not set" && exit 1)
	@test -n "$(ACCOUNT_ID)" || (echo "❌ ACCOUNT_ID not set" && exit 1)
	@test -n "$(ANTHROPIC_API_KEY)" || (echo "❌ ANTHROPIC_API_KEY not set" && exit 1)
	@test -n "$(GITHUB_PERSONAL_ACCESS_TOKEN)" || (echo "❌ GITHUB_PERSONAL_ACCESS_TOKEN not set" && exit 1)
	@echo "✅ Environment configuration valid"
	@echo "   AWS_PROFILE: $(AWS_PROFILE)"
	@echo "   AWS_REGION: $(AWS_REGION)"
	@echo "   ACCOUNT_ID: $(ACCOUNT_ID)"
	@echo "   ENV: $(ENV)"

# =============================================================================
# Docker Image Management
# =============================================================================

.PHONY: image
image: check-env
	@echo "🐳 Building and pushing Janitor Docker image..."
	MSYS_NO_PATHCONV=1 docker run --rm -v $(PWD):/workspace -w /workspace/packages/janitor-agent \
		node:20-alpine sh -c "npm install && npm run build"
	docker build -f packages/janitor-agent/docker/Dockerfile -t janitor:$(DOCKER_TAG) packages/janitor-agent/
	@echo "🚀 Tagging and pushing to ECR..."
	aws ecr get-login-password --region $(AWS_REGION) --profile $(AWS_PROFILE) | \
		docker login --username AWS --password-stdin $(ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com
	docker tag janitor:$(DOCKER_TAG) $(ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com/janitor:$(DOCKER_TAG)
	docker push $(ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com/janitor:$(DOCKER_TAG)
	@echo "✅ Docker image pushed successfully"

# =============================================================================
# Infrastructure Management
# =============================================================================

.PHONY: infra-init
infra-init: check-env
	@echo "🏗️  Initializing Terraform..."
	MSYS_NO_PATHCONV=1 docker run --rm -v $(PWD):/workspace -w /workspace/infra/terraform \
		-e AWS_PROFILE=$(AWS_PROFILE) \
		-e AWS_REGION=$(AWS_REGION) \
		-v ~/.aws:/root/.aws:ro \
		hashicorp/terraform:light init
	@echo "📦 Ensuring Packer directory exists..."
	@mkdir -p .packer.d/plugins
	@echo "📦 Initializing Packer..."
	MSYS_NO_PATHCONV=1 docker run --rm -v $(PWD):/workspace -w /workspace/infra/packer \
		-v $(PWD)/.packer.d:/root/.config/packer \
		hashicorp/packer:light init gpu-ami.pkr.hcl

.PHONY: infra-plan
infra-plan: check-env
	@echo "📋 Planning infrastructure changes for $(ENV)..."
	MSYS_NO_PATHCONV=1 docker run --rm -v $(PWD):/workspace -w /workspace/infra/terraform \
		-e AWS_PROFILE=$(AWS_PROFILE) \
		-e AWS_REGION=$(AWS_REGION) \
		-v ~/.aws:/root/.aws:ro \
		hashicorp/terraform:light plan \
		-var-file="env/$(ENV).tfvars" \
		-var="account_id=$(ACCOUNT_ID)" \
		-var="region=$(AWS_REGION)" \
		-var="anthropic_api_key=$(ANTHROPIC_API_KEY)" \
		-var="github_personal_access_token=$(GITHUB_PERSONAL_ACCESS_TOKEN)"

.PHONY: infra-apply
infra-apply: check-env
	@echo "🚀 Applying infrastructure for $(ENV)..."
	MSYS_NO_PATHCONV=1 docker run --rm -v $(PWD):/workspace -w /workspace/infra/terraform \
		-e AWS_PROFILE=$(AWS_PROFILE) \
		-e AWS_REGION=$(AWS_REGION) \
		-v ~/.aws:/root/.aws:ro \
		hashicorp/terraform:light apply \
		-var-file="env/$(ENV).tfvars" \
		-var="account_id=$(ACCOUNT_ID)" \
		-var="region=$(AWS_REGION)" \
		-var="anthropic_api_key=$(ANTHROPIC_API_KEY)" \
		-var="github_personal_access_token=$(GITHUB_PERSONAL_ACCESS_TOKEN)" \
		-auto-approve

.PHONY: destroy
destroy: check-env
	@echo "💥 Destroying infrastructure for $(ENV)..."
	@read -p "Are you sure you want to destroy $(ENV) environment? (y/N): " confirm && \
		[ "$$confirm" = "y" ] || exit 1
	MSYS_NO_PATHCONV=1 docker run --rm -v $(PWD):/workspace -w /workspace/infra/terraform \
		-e AWS_PROFILE=$(AWS_PROFILE) \
		-e AWS_REGION=$(AWS_REGION) \
		-v ~/.aws:/root/.aws:ro \
		hashicorp/terraform:light destroy \
		-var-file="env/$(ENV).tfvars" \
		-var="account_id=$(ACCOUNT_ID)" \
		-var="region=$(AWS_REGION)" \
		-var="anthropic_api_key=$(ANTHROPIC_API_KEY)" \
		-var="github_personal_access_token=$(GITHUB_PERSONAL_ACCESS_TOKEN)" \
		-auto-approve

# =============================================================================
# Janitor Cloud Execution
# =============================================================================

.PHONY: run-janitor launch-instance
run-janitor: image launch-instance  ## Complete Janitor run: build, push, and launch

logs: check-env  ## Get ALL logs from CloudWatch for instance (dump and exit)
	@echo "📋 Getting all logs from CloudWatch..."
	@INSTANCE_ID=$$(aws ec2 describe-instances \
		--region $(AWS_REGION) \
		--profile $(AWS_PROFILE) \
		--filters "Name=tag:Project,Values=janitor-$(ENV)" "Name=instance-state-name,Values=running,stopped" \
		--query 'Reservations[0].Instances[0].InstanceId' \
		--output text 2>/dev/null || echo "none") && \
	if [ "$$INSTANCE_ID" != "none" ] && [ "$$INSTANCE_ID" != "None" ]; then \
		echo "🎯 Getting logs for instance: $$INSTANCE_ID"; \
		echo ""; \
		echo "📂 Getting logs for instance streams (showing all available streams)"; \
		MSYS_NO_PATHCONV=1 aws logs tail /janitor-runner \
			--region $(AWS_REGION) \
			--profile $(AWS_PROFILE) \
			--no-cli-pager \
			--format short \
			--since 24h | grep "$$INSTANCE_ID" || echo "⚠️  No logs found for instance $$INSTANCE_ID yet"; \
	else \
		echo "❌ No running or stopped instance found"; \
	fi

logs-all: check-env  ## Follow ALL logs from CloudWatch (FULL history + new)
	@echo "📋 Following all logs from CloudWatch (full history)..."
	@INSTANCE_ID=$$(aws ec2 describe-instances \
		--region $(AWS_REGION) \
		--profile $(AWS_PROFILE) \
		--filters "Name=tag:Project,Values=janitor-$(ENV)" "Name=instance-state-name,Values=running" \
		--query 'Reservations[0].Instances[0].InstanceId' \
		--output text 2>/dev/null || echo "none") && \
	if [ "$$INSTANCE_ID" != "none" ] && [ "$$INSTANCE_ID" != "None" ]; then \
		echo "🎯 Following logs for instance: $$INSTANCE_ID"; \
		echo "🔄 Press Ctrl+C to stop following logs"; \
		echo ""; \
		echo "📂 Following logs for instance (will show when streams become available)"; \
		MSYS_NO_PATHCONV=1 stdbuf -o0 aws logs tail /janitor-runner \
			--follow \
			--region $(AWS_REGION) \
			--profile $(AWS_PROFILE) \
			--no-cli-pager \
			--format short \
			--since 5m; \
	else \
		echo "❌ No running instance found"; \
	fi

check-instances: check-env  ## Check for any running instances
	@echo "🔍 Checking for running instances..."
	@INSTANCE_IDS=$$(aws ec2 describe-instances \
		--region $(AWS_REGION) \
		--profile $(AWS_PROFILE) \
		--filters "Name=tag:Project,Values=janitor-$(ENV)" "Name=instance-state-name,Values=running" \
		--query 'Reservations[].Instances[].InstanceId' \
		--output text 2>/dev/null || echo "none") && \
	if [ "$$INSTANCE_IDS" != "none" ] && [ "$$INSTANCE_IDS" != "" ]; then \
		echo "⚠️  Found running instances: $$INSTANCE_IDS"; \
		aws ec2 describe-instances \
			--region $(AWS_REGION) \
			--profile $(AWS_PROFILE) \
			--instance-ids $$INSTANCE_IDS \
			--query 'Reservations[].Instances[].[InstanceId,State.Name,InstanceType,LaunchTime,PublicIpAddress]' \
			--output table; \
	else \
		echo "✅ No running instances found"; \
	fi

kill-instances: check-env  ## Terminate all running instances
	@echo "💥 Terminating all running instances for $(ENV)..."
	@INSTANCE_IDS=$$(aws ec2 describe-instances \
		--region $(AWS_REGION) \
		--profile $(AWS_PROFILE) \
		--filters "Name=tag:Project,Values=janitor-$(ENV)" "Name=instance-state-name,Values=running" \
		--query 'Reservations[].Instances[].InstanceId' \
		--output text 2>/dev/null || echo "none") && \
	if [ "$$INSTANCE_IDS" != "none" ] && [ "$$INSTANCE_IDS" != "" ]; then \
		echo "🎯 Terminating instances: $$INSTANCE_IDS"; \
		aws ec2 terminate-instances --instance-ids $$INSTANCE_IDS --region $(AWS_REGION) --profile $(AWS_PROFILE); \
		echo "⏳ Waiting for instances to terminate..."; \
		aws ec2 wait instance-terminated --instance-ids $$INSTANCE_IDS --region $(AWS_REGION) --profile $(AWS_PROFILE); \
		echo "✅ All instances terminated"; \
	else \
		echo "ℹ️  No running instances found"; \
	fi

launch-instance: check-env  ## Launch EC2 instance to run Janitor
	@echo "🤖 Launching cloud Janitor instance..."
	@test -f "$(REPOS_FILE)" || (echo "❌ Repository file not found: $(REPOS_FILE)" && exit 1)
	@echo "📂 Using repository list: $(REPOS_FILE)"
	@echo "🔍 Getting launch template ID from Terraform..."
	@LAUNCH_TEMPLATE_ID=$$(MSYS_NO_PATHCONV=1 docker run --rm -v $(PWD):/workspace -w /workspace/infra/terraform \
		-e AWS_PROFILE=$(AWS_PROFILE) \
		-e AWS_REGION=$(AWS_REGION) \
		-v ~/.aws:/root/.aws:ro \
		hashicorp/terraform:light output -raw launch_template_id) && \
	AWS_REGION=$(AWS_REGION) AWS_PROFILE=$(AWS_PROFILE) ENV=$(ENV) LAUNCH_TEMPLATE_ID=$$LAUNCH_TEMPLATE_ID bash scripts/launch-janitor.sh

.PHONY: fetch-report
fetch-report: check-env
	@echo "📊 Fetching latest Janitor report..."
	@mkdir -p reports
	@S3_BUCKET=$$(MSYS_NO_PATHCONV=1 docker run --rm -v $(PWD):/workspace -w /workspace/infra/terraform \
		-e AWS_PROFILE=$(AWS_PROFILE) \
		-e AWS_REGION=$(AWS_REGION) \
		-v ~/.aws:/root/.aws:ro \
		hashicorp/terraform:light output -raw s3_bucket_name) && \
	aws s3 sync s3://$$S3_BUCKET/reports/ reports/ \
		--region $(AWS_REGION) \
		--profile $(AWS_PROFILE)
	@echo "✅ Reports downloaded to ./reports/"

# =============================================================================
# AMI Building (Packer)
# =============================================================================

.PHONY: build-ami
build-ami: check-env
	@echo "📦 Building GPU AMI with Packer..."
	MSYS_NO_PATHCONV=1 docker run --rm -v $(PWD):/workspace -w /workspace/infra/packer \
		-e AWS_PROFILE=$(AWS_PROFILE) \
		-e AWS_REGION=$(AWS_REGION) \
		-v ~/.aws:/root/.aws:ro \
		-v $(PWD)/.packer.d:/root/.config/packer \
		hashicorp/packer:light build \
		-var="region=$(AWS_REGION)" \
		-var="account_id=$(ACCOUNT_ID)" \
		gpu-ami.pkr.hcl

# =============================================================================
# Development & Testing
# =============================================================================

.PHONY: ci
ci:
	@echo "🔍 Running CI checks..."
	@echo "📋 Validating Terraform..."
	MSYS_NO_PATHCONV=1 docker run --rm -v $(PWD):/workspace -w /workspace/infra/terraform \
		hashicorp/terraform:light validate
	@echo "📦 Validating Packer..."
	MSYS_NO_PATHCONV=1 docker run --rm -v $(PWD):/workspace -w /workspace/infra/packer \
		-v $(PWD)/.packer.d:/root/.config/packer \
		hashicorp/packer:light validate \
		-var="region=$(AWS_REGION)" \
		-var="account_id=$(ACCOUNT_ID)" \
		gpu-ami.pkr.hcl
	@echo "✅ All CI checks passed"

.PHONY: status
status: check-env
	@echo "📊 Current infrastructure status for $(ENV):"
	aws ec2 describe-instances \
		--region $(AWS_REGION) \
		--profile $(AWS_PROFILE) \
		--filters "Name=tag:Project,Values=janitor-$(ENV)" \
		--query 'Reservations[].Instances[].[InstanceId,State.Name,InstanceType,PublicIpAddress]' \
		--output table







ssh: check-env  ## Connect to instance via SSH
	@echo "🔗 Connecting to instance via SSH..."
	@test -f "$(SSH_KEY_PATH)" || (echo "❌ SSH key not found: $(SSH_KEY_PATH)" && echo "   Set SSH_KEY_PATH in .env or create key with: ssh-keygen -t rsa -b 4096 -f $(SSH_KEY_PATH)" && exit 1)
	@INSTANCE_ID=$$(aws ec2 describe-instances \
		--region $(AWS_REGION) \
		--profile $(AWS_PROFILE) \
		--filters "Name=tag:Project,Values=janitor-$(ENV)" "Name=instance-state-name,Values=running" \
		--query 'Reservations[0].Instances[0].InstanceId' \
		--output text 2>/dev/null || echo "none") && \
	PUBLIC_IP=$$(aws ec2 describe-instances \
		--region $(AWS_REGION) \
		--profile $(AWS_PROFILE) \
		--filters "Name=tag:Project,Values=janitor-$(ENV)" "Name=instance-state-name,Values=running" \
		--query 'Reservations[0].Instances[0].PublicIpAddress' \
		--output text 2>/dev/null || echo "none") && \
	if [ "$$PUBLIC_IP" != "none" ] && [ "$$PUBLIC_IP" != "None" ]; then \
		echo "🚀 Connecting to $$INSTANCE_ID ($$PUBLIC_IP)..."; \
		ssh -i "$(SSH_KEY_PATH)" -o StrictHostKeyChecking=no ec2-user@$$PUBLIC_IP; \
	else \
		echo "❌ No running instance found"; \
	fi









.PHONY: help
help:
	@echo "🤖 Janitor AWS Cloud Runner Commands"
	@echo ""
	@echo "📦 Image Management:"
	@echo "  make image                    - Build and push Janitor Docker image to ECR"
	@echo ""
	@echo "🏗️  Infrastructure:"
	@echo "  make infra-init               - Initialize Terraform"
	@echo "  make infra-plan ENV=dev       - Preview infrastructure changes"
	@echo "  make infra-apply ENV=dev      - Apply infrastructure"
	@echo "  make destroy ENV=dev          - Destroy infrastructure"
	@echo ""
	@echo "🤖 Janitor Execution:"
	@echo "  make run-janitor ENV=dev      - Build image and launch Janitor instance"
	@echo "  make launch-instance ENV=dev  - Launch Janitor instance (skip build)"
	@echo "  make check-instances ENV=dev  - Check for any running instances"
	@echo "  make kill-instances ENV=dev   - Terminate all running instances"
	@echo "  make fetch-report ENV=dev     - Download latest reports"
	@echo ""
	@echo "📋 Logs & Monitoring:"
	@echo "  make logs ENV=dev             - Get ALL logs from CloudWatch (dump and exit)"
	@echo "  make logs-all ENV=dev         - Follow ALL logs from CloudWatch (real-time streaming)"
	@echo "  make status ENV=dev           - Check infrastructure status"
	@echo ""
	@echo "🔧 Debugging & Access:"
	@echo "  make ssh ENV=dev              - Connect to instance via SSH"
	@echo ""
	@echo "🧹 Cleanup:"
	@echo "  make kill-instances ENV=dev   - Terminate all running instances"
	@echo ""
	@echo "🔧 Development:"
	@echo "  make build-ami                - Build GPU AMI with Packer"
	@echo "  make ci                       - Run CI validation"
	@echo ""
	@echo "Environment variables (set in .env):"
	@echo "  AWS_PROFILE                   - AWS credential profile"
	@echo "  AWS_REGION                    - AWS region (default: eu-west-2)"
	@echo "  ACCOUNT_ID                    - AWS account ID"
	@echo "  ANTHROPIC_API_KEY             - Anthropic API key for AI services"
	@echo "  GITHUB_PERSONAL_ACCESS_TOKEN  - GitHub Personal Access Token for repository operations"
	@echo "  SSH_KEY_PATH                  - Path to SSH private key (default: ~/.ssh/janitor-key)"

# Default target
.DEFAULT_GOAL := help 