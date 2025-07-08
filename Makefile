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
	MSYS_NO_PATHCONV=1 docker run --platform linux/amd64 --rm -v $(PWD):/workspace -w /workspace/packages/janitor-agent \
		node:20-alpine sh -c "npm install && npm run build"
	docker build --platform linux/amd64 -f packages/janitor-agent/docker/Dockerfile -t janitor:$(DOCKER_TAG) packages/janitor-agent/
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
	MSYS_NO_PATHCONV=1 docker run --platform linux/amd64 --rm -v $(PWD):/workspace -w /workspace/infra/terraform \
		-e AWS_PROFILE=$(AWS_PROFILE) \
		-e AWS_REGION=$(AWS_REGION) \
		-v ~/.aws:/root/.aws:ro \
		hashicorp/terraform:light init
	@echo "📦 Ensuring Packer directory exists..."
	@mkdir -p .packer.d/plugins
	@echo "📦 Initializing Packer..."
	MSYS_NO_PATHCONV=1 docker run --platform linux/amd64 --rm -v $(PWD):/workspace -w /workspace/infra/packer \
		-v $(PWD)/.packer.d:/root/.config/packer \
		hashicorp/packer:light init gpu-ami.pkr.hcl

.PHONY: infra-plan
infra-plan: check-env
	@echo "📋 Planning infrastructure changes for $(ENV)..."
	MSYS_NO_PATHCONV=1 docker run --platform linux/amd64 --rm -v $(PWD):/workspace -w /workspace/infra/terraform \
		-e AWS_PROFILE=$(AWS_PROFILE) \
		-e AWS_REGION=$(AWS_REGION) \
		-v ~/.aws:/root/.aws:ro \
		hashicorp/terraform:light plan \
		-var-file="env/$(ENV).tfvars" \
		-var="account_id=$(ACCOUNT_ID)" \
		-var="region=$(AWS_REGION)" \
		-var="anthropic_api_key=$(ANTHROPIC_API_KEY)" \
		-var="github_personal_access_token=$(GITHUB_PERSONAL_ACCESS_TOKEN)"

.PHONY: infra-output
infra-output: check-env
	@MSYS_NO_PATHCONV=1 docker run --platform linux/amd64 --rm -v $(PWD):/workspace -w /workspace/infra/terraform \
		-e AWS_PROFILE=$(AWS_PROFILE) \
		-e AWS_REGION=$(AWS_REGION) \
		-v ~/.aws:/root/.aws:ro \
		hashicorp/terraform:light output -raw $(OUTPUT) 2>/dev/null || echo "none"

.PHONY: infra-apply
infra-apply: check-env
	@echo "🚀 Applying infrastructure for $(ENV)..."
	MSYS_NO_PATHCONV=1 docker run --platform linux/amd64 --rm -v $(PWD):/workspace -w /workspace/infra/terraform \
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
	MSYS_NO_PATHCONV=1 docker run --platform linux/amd64 --rm -v $(PWD):/workspace -w /workspace/infra/terraform \
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
# Database Management
# =============================================================================

.PHONY: db-migrate
db-migrate: check-env
	@echo "🗄️ Running database migrations for $(ENV)..."
	@chmod +x scripts/db-migrate-local.sh
	@./scripts/db-migrate-local.sh $(ENV)

.PHONY: query-db
query-db: check-env
	@echo "🔍 Querying repository status: $(REPO)"
	@test -n "$(REPO)" || (echo "❌ REPO parameter required. Usage: make query-db ENV=dev REPO=repo-name" && exit 1)
	@QUERY_SECRET_ARN=$$(MSYS_NO_PATHCONV=1 docker run --platform linux/amd64 --rm -v $(PWD):/workspace -w /workspace/infra/terraform \
		-e AWS_PROFILE=$(AWS_PROFILE) \
		-e AWS_REGION=$(AWS_REGION) \
		-v ~/.aws:/root/.aws:ro \
		hashicorp/terraform:light output -raw database_query_secret_arn) && \
	DB_ENDPOINT=$$(MSYS_NO_PATHCONV=1 docker run --platform linux/amd64 --rm -v $(PWD):/workspace -w /workspace/infra/terraform \
		-e AWS_PROFILE=$(AWS_PROFILE) \
		-e AWS_REGION=$(AWS_REGION) \
		-v ~/.aws:/root/.aws:ro \
		hashicorp/terraform:light output -raw database_cluster_endpoint) && \
	DB_NAME=$$(MSYS_NO_PATHCONV=1 docker run --platform linux/amd64 --rm -v $(PWD):/workspace -w /workspace/infra/terraform \
		-e AWS_PROFILE=$(AWS_PROFILE) \
		-e AWS_REGION=$(AWS_REGION) \
		-v ~/.aws:/root/.aws:ro \
		hashicorp/terraform:light output -raw database_name) && \
	QUERY_PASSWORD=$$(aws secretsmanager get-secret-value \
		--secret-id "$$QUERY_SECRET_ARN" \
		--query "SecretString" \
		--output text \
		--profile $(AWS_PROFILE) | jq -r ".password") && \
	PGPASSWORD="$$QUERY_PASSWORD" psql -h "$$DB_ENDPOINT" -U "janitor_query" -d "$$DB_NAME" \
		-c "SELECT rv.repository_name, rv.organization, rv.validation_status, rv.validation_type, rv.build_success, rv.container_execution_success, rv.gpu_available, rv.cuda_detected, rv.error_message, rv.execution_time_seconds, rv.created_at, vr.environment, vr.instance_id FROM repository_validations rv JOIN validation_runs vr ON rv.run_id = vr.run_id WHERE rv.repository_name = '$(REPO)' ORDER BY rv.created_at DESC LIMIT 5;"

.PHONY: query-runs
query-runs: check-env
	@echo "📊 Querying recent validation runs for $(ENV)..."
	@QUERY_SECRET_ARN=$$(MSYS_NO_PATHCONV=1 docker run --platform linux/amd64 --rm -v $(PWD):/workspace -w /workspace/infra/terraform \
		-e AWS_PROFILE=$(AWS_PROFILE) \
		-e AWS_REGION=$(AWS_REGION) \
		-v ~/.aws:/root/.aws:ro \
		hashicorp/terraform:light output -raw database_query_secret_arn) && \
	DB_ENDPOINT=$$(MSYS_NO_PATHCONV=1 docker run --platform linux/amd64 --rm -v $(PWD):/workspace -w /workspace/infra/terraform \
		-e AWS_PROFILE=$(AWS_PROFILE) \
		-e AWS_REGION=$(AWS_REGION) \
		-v ~/.aws:/root/.aws:ro \
		hashicorp/terraform:light output -raw database_cluster_endpoint) && \
	DB_NAME=$$(MSYS_NO_PATHCONV=1 docker run --platform linux/amd64 --rm -v $(PWD):/workspace -w /workspace/infra/terraform \
		-e AWS_PROFILE=$(AWS_PROFILE) \
		-e AWS_REGION=$(AWS_REGION) \
		-v ~/.aws:/root/.aws:ro \
		hashicorp/terraform:light output -raw database_name) && \
	QUERY_PASSWORD=$$(aws secretsmanager get-secret-value \
		--secret-id "$$QUERY_SECRET_ARN" \
		--query "SecretString" \
		--output text \
		--profile $(AWS_PROFILE) | jq -r ".password") && \
	PGPASSWORD="$$QUERY_PASSWORD" psql -h "$$DB_ENDPOINT" -U "janitor_query" -d "$$DB_NAME" \
		-c "SELECT vr.run_id, vr.environment, vr.instance_id, vr.started_at, vr.completed_at, vr.status, vr.repository_count, COUNT(rv.id) as total_repos, COUNT(CASE WHEN rv.validation_status = 'success' THEN 1 END) as successful_repos, COUNT(CASE WHEN rv.validation_status = 'failed' THEN 1 END) as failed_repos FROM validation_runs vr LEFT JOIN repository_validations rv ON vr.run_id = rv.run_id WHERE vr.environment = '$(ENV)' GROUP BY vr.run_id, vr.environment, vr.instance_id, vr.started_at, vr.completed_at, vr.status, vr.repository_count ORDER BY vr.started_at DESC LIMIT 10;"

.PHONY: db-allow-local
db-allow-local: check-env
	@echo "🔓 Adding your IP to database security group..."
	@CURRENT_IP=$$(curl -s https://ipinfo.io/ip) && \
	echo "📍 Your current IP: $$CURRENT_IP" && \
	aws ec2 authorize-security-group-ingress \
		--group-id $$(make -s infra-output ENV=$(ENV) OUTPUT=database_security_group_id) \
		--protocol tcp \
		--port 5432 \
		--cidr $$CURRENT_IP/32 \
		--region $(AWS_REGION) \
		--profile $(AWS_PROFILE) 2>/dev/null || \
	echo "✅ IP already allowed or added successfully"

.PHONY: db-connect
db-connect: check-env
	@echo "🔌 Connecting to database for manual queries..."
	@QUERY_SECRET_ARN=$$(MSYS_NO_PATHCONV=1 docker run --platform linux/amd64 --rm -v $(PWD):/workspace -w /workspace/infra/terraform \
		-e AWS_PROFILE=$(AWS_PROFILE) \
		-e AWS_REGION=$(AWS_REGION) \
		-v ~/.aws:/root/.aws:ro \
		hashicorp/terraform:light output -raw database_query_secret_arn) && \
	DB_ENDPOINT=$$(MSYS_NO_PATHCONV=1 docker run --platform linux/amd64 --rm -v $(PWD):/workspace -w /workspace/infra/terraform \
		-e AWS_PROFILE=$(AWS_PROFILE) \
		-e AWS_REGION=$(AWS_REGION) \
		-v ~/.aws:/root/.aws:ro \
		hashicorp/terraform:light output -raw database_cluster_endpoint) && \
	DB_NAME=$$(MSYS_NO_PATHCONV=1 docker run --platform linux/amd64 --rm -v $(PWD):/workspace -w /workspace/infra/terraform \
		-e AWS_PROFILE=$(AWS_PROFILE) \
		-e AWS_REGION=$(AWS_REGION) \
		-v ~/.aws:/root/.aws:ro \
		hashicorp/terraform:light output -raw database_name) && \
	QUERY_PASSWORD=$$(aws secretsmanager get-secret-value \
		--secret-id "$$QUERY_SECRET_ARN" \
		--query "SecretString" \
		--output text \
		--profile $(AWS_PROFILE) | jq -r ".password") && \
	echo "🔍 Connecting to: $$DB_ENDPOINT/$$DB_NAME as janitor_query" && \
	PGPASSWORD="$$QUERY_PASSWORD" psql -h "$$DB_ENDPOINT" -U "janitor_query" -d "$$DB_NAME"

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
	@LAUNCH_TEMPLATE_ID=$$(MSYS_NO_PATHCONV=1 docker run --platform linux/amd64 --rm -v $(PWD):/workspace -w /workspace/infra/terraform \
		-e AWS_PROFILE=$(AWS_PROFILE) \
		-e AWS_REGION=$(AWS_REGION) \
		-v ~/.aws:/root/.aws:ro \
		hashicorp/terraform:light output -raw launch_template_id) && \
	AWS_REGION=$(AWS_REGION) AWS_PROFILE=$(AWS_PROFILE) ENV=$(ENV) LAUNCH_TEMPLATE_ID=$$LAUNCH_TEMPLATE_ID bash scripts/launch-janitor.sh

# =============================================================================
# Database Reports (replaces S3 reports)
# =============================================================================

.PHONY: fetch-report
fetch-report: check-env
	@echo "⚠️  DEPRECATED: S3 report fetching has been replaced with database queries"
	@echo "📊 Use the following commands instead:"
	@echo "   make query-runs ENV=$(ENV)          # List recent validation runs"
	@echo "   make query-db ENV=$(ENV) REPO=name  # Query specific repository"
	@echo "   make db-connect ENV=$(ENV)          # Connect to database directly"
	@echo ""
	@echo "🗄️  Database commands provide real-time, structured access to validation results"

# =============================================================================
# AMI Building (Packer)
# =============================================================================

.PHONY: build-ami
build-ami: check-env
	@echo "📦 Building GPU AMI with Packer..."
	MSYS_NO_PATHCONV=1 docker run --platform linux/amd64 --rm -v $(PWD):/workspace -w /workspace/infra/packer \
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

.PHONY: local
local:  ## Run janitor locally for development/debugging
	@echo "🏠 Running janitor locally..."
	@chmod +x scripts/run-local-janitor.sh
	@./scripts/run-local-janitor.sh docker

.PHONY: local-dev
local-dev:  ## Run janitor agent directly for development
	@echo "🔧 Running janitor agent in development mode..."
	@chmod +x scripts/run-local-janitor.sh
	@./scripts/run-local-janitor.sh dev

.PHONY: ci
ci:
	@echo "🔍 Running CI checks..."
	@echo "📋 Validating Terraform..."
	MSYS_NO_PATHCONV=1 docker run --platform linux/amd64 --rm -v $(PWD):/workspace -w /workspace/infra/terraform \
		hashicorp/terraform:light validate
	@echo "📦 Validating Packer..."
	MSYS_NO_PATHCONV=1 docker run --platform linux/amd64 --rm -v $(PWD):/workspace -w /workspace/infra/packer \
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
	@echo "🗄️  Database:"
	@echo "  make db-migrate ENV=dev       - Run database migrations (locally)"
	@echo "  make db-allow-local ENV=dev   - Add your IP to database security group"
	@echo "  make query-db ENV=dev REPO=name - Query repository status"
	@echo "  make query-runs ENV=dev       - List recent validation runs"
	@echo "  make validation-details ENV=dev - Show complete latest validation run details"
	@echo "  make db-connect ENV=dev       - Connect to database (psql)"
	@echo ""
	@echo "🤖 Janitor Execution:"
	@echo "  make run-janitor ENV=dev      - Build image and launch Janitor instance"
	@echo "  make launch-instance ENV=dev  - Launch Janitor instance (skip build)"
	@echo "  make check-instances ENV=dev  - Check for any running instances"
	@echo "  make kill-instances ENV=dev   - Terminate all running instances"
	@echo "  make fetch-report ENV=dev     - [DEPRECATED] Use query-db instead"
	@echo ""
	@echo "📋 Logs & Monitoring:"
	@echo "  make logs ENV=dev             - Get ALL logs from CloudWatch (dump and exit)"
	@echo "  make logs-all ENV=dev         - Follow ALL logs from CloudWatch (real-time streaming)"
	@echo "  make status ENV=dev           - Check infrastructure status"
	@echo ""
	@echo "🔧 Debugging & Access:"
	@echo "  make setup-ssh-key ENV=dev    - Create and import SSH key to AWS"
	@echo "  make ssh ENV=dev              - Connect to instance via SSH"
	@echo ""
	@echo "🧹 Cleanup:"
	@echo "  make kill-instances ENV=dev   - Terminate all running instances"
	@echo ""
	@echo "🔧 Development:"
	@echo "  make local                    - Run janitor locally for debugging (Docker)"
	@echo "  make local-dev                - Run janitor agent directly for development"
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

.PHONY: validation-details
validation-details: check-env
	@echo "📊 Getting complete validation run details for $(ENV)..."
	@QUERY_SECRET_ARN=$$(MSYS_NO_PATHCONV=1 docker run --platform linux/amd64 --rm -v $(PWD):/workspace -w /workspace/infra/terraform \
		-e AWS_PROFILE=$(AWS_PROFILE) \
		-e AWS_REGION=$(AWS_REGION) \
		-v ~/.aws:/root/.aws:ro \
		hashicorp/terraform:light output -raw database_query_secret_arn) && \
	DB_ENDPOINT=$$(MSYS_NO_PATHCONV=1 docker run --platform linux/amd64 --rm -v $(PWD):/workspace -w /workspace/infra/terraform \
		-e AWS_PROFILE=$(AWS_PROFILE) \
		-e AWS_REGION=$(AWS_REGION) \
		-v ~/.aws:/root/.aws:ro \
		hashicorp/terraform:light output -raw database_cluster_endpoint) && \
	DB_NAME=$$(MSYS_NO_PATHCONV=1 docker run --platform linux/amd64 --rm -v $(PWD):/workspace -w /workspace/infra/terraform \
		-e AWS_PROFILE=$(AWS_PROFILE) \
		-e AWS_REGION=$(AWS_REGION) \
		-v ~/.aws:/root/.aws:ro \
		hashicorp/terraform:light output -raw database_name) && \
	QUERY_PASSWORD=$$(aws secretsmanager get-secret-value \
		--secret-id "$$QUERY_SECRET_ARN" \
		--query "SecretString" \
		--output text \
		--profile $(AWS_PROFILE) | jq -r ".password") && \
	echo "🔍 Latest Validation Run:" && \
	PGPASSWORD="$$QUERY_PASSWORD" psql -h "$$DB_ENDPOINT" -U "janitor_query" -d "$$DB_NAME" \
		-c "SELECT run_id, environment, instance_id, started_at, completed_at, status, repository_count FROM validation_runs WHERE environment = '$(ENV)' ORDER BY started_at DESC LIMIT 1;" && \
	echo "" && echo "📋 Repository Validations for Latest Run:" && \
	PGPASSWORD="$$QUERY_PASSWORD" psql -h "$$DB_ENDPOINT" -U "janitor_query" -d "$$DB_NAME" \
		-c "SELECT rv.repository_name, rv.organization, rv.validation_status, rv.validation_type, rv.build_success, rv.container_execution_success, rv.gpu_available, rv.cuda_detected, rv.execution_time_seconds, rv.error_message FROM repository_validations rv JOIN validation_runs vr ON rv.run_id = vr.run_id WHERE vr.environment = '$(ENV)' ORDER BY vr.started_at DESC, rv.created_at DESC LIMIT 5;" && \
	echo "" && echo "📄 Validation Reports for Latest Run:" && \
	PGPASSWORD="$$QUERY_PASSWORD" psql -h "$$DB_ENDPOINT" -U "janitor_query" -d "$$DB_NAME" \
		-c "SELECT vr.report_type, LENGTH(vr.report_data::text) as report_size_chars, vr.created_at FROM validation_reports vr JOIN repository_validations rv ON vr.validation_id = rv.id JOIN validation_runs vrun ON rv.run_id = vrun.run_id WHERE vrun.environment = '$(ENV)' ORDER BY vrun.started_at DESC, vr.created_at DESC LIMIT 5;"

.PHONY: setup-ssh-key
setup-ssh-key: check-env
	@echo "🔑 Setting up SSH key for AWS access..."
	@if [ ! -f "$(SSH_KEY_PATH)" ]; then \
		echo "🔧 Creating new SSH key..."; \
		ssh-keygen -t rsa -b 4096 -f $(SSH_KEY_PATH) -N "" -C "janitor-$(ENV)"; \
	else \
		echo "✅ SSH key already exists at $(SSH_KEY_PATH)"; \
	fi
	@echo "🔍 Local key fingerprint:"
	@ssh-keygen -l -f $(SSH_KEY_PATH).pub
	@echo "🗑️  Deleting existing 'janitor-key' from AWS (if exists)..."
	@if aws ec2 describe-key-pairs --key-names janitor-key --region $(AWS_REGION) --profile $(AWS_PROFILE) >/dev/null 2>&1; then \
		echo "   Found existing key, deleting..."; \
		aws ec2 delete-key-pair --key-name janitor-key --region $(AWS_REGION) --profile $(AWS_PROFILE); \
		echo "   ✅ Deleted existing key"; \
	else \
		echo "   ℹ️  No existing key found"; \
	fi
	@echo "📤 Importing LOCAL public key to AWS..."
	@aws ec2 import-key-pair \
		--key-name "janitor-key" \
		--public-key-material fileb://$(SSH_KEY_PATH).pub \
		--region $(AWS_REGION) \
		--profile $(AWS_PROFILE)
	@echo "✅ SSH key 'janitor-key' imported to AWS"
	@echo "🔍 AWS key fingerprint:"
	@aws ec2 describe-key-pairs --key-names janitor-key --region $(AWS_REGION) --profile $(AWS_PROFILE) --query 'KeyPairs[0].KeyFingerprint' --output text
	@echo "🎯 SSH key setup complete! Local key is now active in AWS."

# Default target
.DEFAULT_GOAL := help 