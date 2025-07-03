#!/bin/bash
set -euo pipefail

echo "🔍 Testing run-instances command specifically..."

# Test 1: Check if run-instances help works
echo "1. Testing run-instances help:"
aws ec2 run-instances help | head -10

echo -e "\n2. Testing run-instances syntax check:"
aws ec2 run-instances --generate-cli-skeleton

echo -e "\n3. Testing which aws command is being used:"
which aws
type aws

echo -e "\n4. Testing with dry-run and minimal parameters:"
aws ec2 run-instances \
  --image-id=ami-12345678 \
  --min-count=1 \
  --max-count=1 \
  --dry-run \
  --region=eu-west-2 \
  --profile=runpod-janitor

echo "✅ run-instances tests completed" 