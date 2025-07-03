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

# Validate required environment variables
check-env:
	@echo "🔍 Checking environment configuration..."
	@test -n "$(AWS_PROFILE)" || (echo "❌ AWS_PROFILE not set" && exit 1)
	@test -n "$(AWS_REGION)" || (echo "❌ AWS_REGION not set" && exit 1)
	@test -n "$(ACCOUNT_ID)" || (echo "❌ ACCOUNT_ID not set" && exit 1)
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
	docker build -t janitor:$(DOCKER_TAG) packages/janitor-agent/
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
		-var="region=$(AWS_REGION)"

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
		-auto-approve

# =============================================================================
# Janitor Cloud Execution
# =============================================================================

.PHONY: run-janitor launch-instance
run-janitor: image launch-instance  ## Complete Janitor run: build, push, and launch

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
	AWS_REGION=$(AWS_REGION) AWS_PROFILE=$(AWS_PROFILE) ENV=$(ENV) LAUNCH_TEMPLATE_ID=$$LAUNCH_TEMPLATE_ID bash scripts/launch-janitor-v2.sh

.PHONY: fetch-report
fetch-report: check-env
	@echo "📊 Fetching latest Janitor report..."
	@mkdir -p reports
	aws s3 sync s3://janitor-reports-$(ENV)/ reports/ \
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

.PHONY: help
help:
	@echo "🤖 Janitor AWS Cloud Runner Commands"
	@echo ""
	@echo "📦 Image Management:"
	@echo "  make image                    - Build and push Janitor Docker image to ECR"
	@echo ""
	@echo "🏗️  Infrastructure:"
	@echo "  make infra-init               - Initialize Terraform"
	@echo "  make infra-plan ENV=dev       - Plan infrastructure changes"
	@echo "  make infra-apply ENV=dev      - Apply infrastructure"
	@echo "  make destroy ENV=dev          - Destroy infrastructure"
	@echo ""
	@echo "🤖 Janitor Execution:"
	@echo "  make run-janitor ENV=dev      - Build image and launch Janitor instance"
	@echo "  make launch-instance ENV=dev  - Launch Janitor instance (skip build)"
	@echo "  make fetch-report ENV=dev     - Download latest reports"
	@echo ""
	@echo "🔧 Development:"
	@echo "  make build-ami                - Build GPU AMI with Packer"
	@echo "  make ci                       - Run CI validation"
	@echo "  make status ENV=dev           - Check infrastructure status"
	@echo ""
	@echo "Environment variables (set in .env):"
	@echo "  AWS_PROFILE                   - AWS credential profile"
	@echo "  AWS_REGION                    - AWS region (default: eu-west-2)"
	@echo "  ACCOUNT_ID                    - AWS account ID"

# Default target
.DEFAULT_GOAL := help 