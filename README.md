# Janitor Agent - Simplified GPU Repository Validator

A streamlined AI agent system for validating Docker repositories with GPU support. This system uses a single persistent GPU instance + Supabase for simple, cost-effective repository validation.

## 🚀 Quick Start

```bash
# 1. Setup database (one-time)
make setup-supabase

# 2. Launch GPU instance & deploy
make start     # Launch GPU instance

# 3. Test with a repository
make prompt PROMPT="validate RunPod/worker-basic"

# 4. Stop when done
make stop                      # Stop when not needed
```

## 📋 Architecture

**Simple & Persistent:**

- **Single GPU Instance**: Persistent `g5.xlarge` with NVIDIA A10G
- **Supabase Database**: Managed PostgreSQL for validation results
- **Mastra Server**: HTTP API accepting natural language prompts
- **No Complex Infrastructure**: No Terraform, no Aurora, no S3

**Before vs After:**

- ❌ **Before**: 540-line Makefile, Terraform, custom AMIs, Aurora DB, CloudWatch
- ✅ **After**: 9 simple commands, single GPU instance, Supabase, direct API calls

## 🔧 Environment Setup

Create `.env` with required variables:

```bash
# API Keys (Required)
ANTHROPIC_API_KEY=             # Get from: https://console.anthropic.com/settings/keys
GITHUB_PERSONAL_ACCESS_TOKEN=  # Get from: https://github.com/settings/tokens (needs 'repo' scope)

# Supabase Configuration (Required)
SUPABASE_URL=                  # Your Supabase project URL (https://your-project.supabase.co)
SUPABASE_ANON_KEY=            # Your Supabase anon key (for read access)
SUPABASE_SERVICE_ROLE_KEY=    # Your Supabase service role key (for write access)

# AWS Configuration (Simplified - only for GPU instance)
AWS_PROFILE=                   # Your AWS profile name (run: aws configure --profile your-profile)
AWS_REGION=us-east-1          # AWS region for GPU instance (us-east-1 recommended for GPU availability)

# SSH Access (Optional - for debugging GPU instance)
SSH_KEY_NAME=janitor-key      # Name of your AWS key pair
SSH_KEY_PATH=~/.ssh/janitor-key # Path to private key (must be absolute on Windows)
```

## 📖 Commands

### Setup (One-time)

```bash
make setup-supabase     # Set up Supabase database
make setup-instance     # Launch GPU instance
make deploy-code        # Deploy janitor code to instance (if needed)
```

### Daily Usage

```bash
# Basic validation
make prompt PROMPT="validate RunPod/worker-basic"
make prompt PROMPT="please validate these repos: RunPod/worker-basic, RunPod/worker-template"
make prompt PROMPT="validate worker-template and create a PR if fixes needed"

# Multiline prompts
make prompt PROMPT="validate these repos:\nRunPod/worker-basic\nRunPod/worker-template"

# Complex requests
make prompt PROMPT="Please validate:\n1. RunPod/worker-basic\n2. RunPod/worker-template\n\nCreate PRs for any fixes needed"

# File-based prompts
echo "validate RunPod/worker-basic" > prompt.txt
make prompt FILE=prompt.txt

# Check results
make query-results                     # Recent results
make query-results RUN_ID=your-run-id # Specific run
make query-results REPO=worker-basic  # Repository history

# Monitor activity
make logs                              # Stream real-time agent logs
make status                            # Check service status
```

### Instance Management

```bash
make start              # Start GPU instance
make stop               # Stop instance to save costs
make deploy-code        # Deploy/update code on instance
```

### Development

```bash
make install            # Install dependencies locally
make test-local         # Run local tests
```

## 🔍 API Endpoints

The Mastra server running on your GPU instance exposes:

```bash
# Health check
curl http://YOUR-INSTANCE-IP:3000/health

# Send validation prompt
curl -X POST http://YOUR-INSTANCE-IP:3000/api/prompt \
  -H "Content-Type: application/json" \
  -d '{"message": "validate RunPod/worker-basic"}'

# Get results by run ID
curl http://YOUR-INSTANCE-IP:3000/api/results/YOUR-RUN-ID

# Get results by repository
curl http://YOUR-INSTANCE-IP:3000/api/results/repo/worker-basic
```

## 💾 Database Schema

Simple Supabase table for validation results:

```sql
CREATE TABLE validation_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL,
  repository_name TEXT NOT NULL,
  organization TEXT NOT NULL,
  validation_status TEXT NOT NULL, -- 'success', 'failed', 'running'
  results_json JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

View results in Supabase dashboard: `https://app.supabase.com/project/your-project/editor`

## 🎯 GPU-Aware Validation

The system intelligently handles CUDA vs non-CUDA repositories:

- **Non-CUDA Images**: Full validation (build + run + logs)
- **CUDA Images + No GPU**: Build-only validation with clear messaging
- **CUDA Images + GPU Available**: Full validation including container execution

## 💰 Cost Management

**Predictable Costs:**

- GPU Instance: ~$0.50-1.00/hour when running (g5.xlarge)
- Supabase: Free tier covers expected usage
- **Stop instance when not actively validating** to save costs

**No Hidden Costs:**

- No Aurora database charges
- No CloudWatch log storage
- No S3 storage costs
- No complex infrastructure overhead

## 🔧 Troubleshooting

### Instance Issues

```bash
# Check instance status
aws ec2 describe-instances --filters "Name=tag:Name,Values=janitor-gpu-instance"

# SSH for debugging
ssh -i ~/.ssh/janitor-key ubuntu@YOUR-INSTANCE-IP

# Check Mastra server logs
ssh -i ~/.ssh/janitor-key ubuntu@YOUR-INSTANCE-IP 'sudo journalctl -u janitor-mastra -f'
```

### Service Management

```bash
# Restart the Mastra server
ssh -i ~/.ssh/janitor-key ubuntu@YOUR-INSTANCE-IP 'sudo systemctl restart janitor-mastra'

# Check service status
ssh -i ~/.ssh/janitor-key ubuntu@YOUR-INSTANCE-IP 'sudo systemctl status janitor-mastra'
```

## 📁 Project Structure (Simplified)

```
janitor/
├── packages/janitor-agent/     # Mastra agent with Supabase integration
│   ├── src/
│   │   ├── server.ts          # Express + Mastra server
│   │   ├── utils/supabase.ts  # Database operations
│   │   └── utils/prompt-parser.ts # Natural language parsing
│   └── package.json           # Dependencies
├── infra/
│   ├── supabase/schema.sql    # Database schema
│   └── user-data.sh           # Instance bootstrap script
├── scripts/                   # 6 simple scripts for operations
├── docs/                      # Documentation
└── Makefile                   # 9 simple commands (vs 540 lines before)
```

## 🚧 Migration from Complex Setup

If you're migrating from the previous complex infrastructure:

1. **Backup any important data** from Aurora/CloudWatch
2. **Terminate old Terraform resources** to avoid charges
3. **Follow the Quick Start** above for the new simplified setup

The new system maintains all core functionality while being **80% simpler** to manage.

## 📚 Documentation

- [Conventions](docs/conventions.md) - Development patterns and guidelines
- [Simplified Setup Plan](docs/planning/008_simplified_setup.md) - Architecture details

## 🤝 Contributing

1. Follow patterns in `docs/conventions.md`
2. Test locally with `make test-local`
3. Deploy and test with `make deploy-code`
4. Submit PR with validation results

---

**Key Benefits:**
✅ **80% reduction in complexity** (9 commands vs 50+ files)  
✅ **Predictable costs** (single instance + Supabase free tier)  
✅ **Natural language interface** ("validate these repos: worker-basic")  
✅ **GPU-aware validation** (automatic CUDA detection)  
✅ **Persistent instance** (no complex provisioning/teardown)  
✅ **Real-time results** (Supabase dashboard + API)
