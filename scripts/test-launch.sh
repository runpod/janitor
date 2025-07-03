#!/bin/bash
set -euo pipefail

echo "🧪 Testing EC2 run-instances command..."

# Try the most basic run-instances command possible
echo "1. Testing basic run-instances syntax:"
aws ec2 run-instances \
  --image-id ami-12345678 \
  --min-count 1 \
  --max-count 1 \
  --dry-run \
  --region eu-west-2 \
  --profile runpod-janitor

echo "✅ Basic syntax test completed" 