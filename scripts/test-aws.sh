#!/bin/bash
set -euo pipefail

echo "🔍 Testing AWS CLI..."

# Test basic AWS CLI
echo "1. AWS CLI version:"
aws --version

# Test basic EC2 access
echo "2. Testing EC2 access:"
aws ec2 describe-regions --region eu-west-2 --profile runpod-janitor --output table --max-items 3

# Test describe-instances (should work)
echo "3. Testing describe-instances:"
aws ec2 describe-instances --region eu-west-2 --profile runpod-janitor --max-items 1 --output table

# Test the run-instances command with minimal parameters
echo "4. Testing run-instances help:"
aws ec2 run-instances help | head -20

echo "✅ All tests completed" 