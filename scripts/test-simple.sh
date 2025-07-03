#!/bin/bash
set -euo pipefail

echo "🔍 Testing parameter parsing..."

# Test 1: Simple command without problematic parameters
echo "1. Testing basic describe-regions:"
aws ec2 describe-regions --region eu-west-2 --profile runpod-janitor --output json | head -5

# Test 2: Try using equals sign syntax
echo "2. Testing with equals syntax:"
aws ec2 describe-regions --region=eu-west-2 --profile=runpod-janitor --output=json | head -5

echo "✅ Parameter tests completed" 