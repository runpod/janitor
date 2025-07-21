#!/bin/bash

# Send Prompt Script for Janitor Agent
# Use this to send natural language validation requests to the Mastra server

set -e

# Load environment variables
if [ -f ".env" ]; then
    source .env
else
    echo "❌ Error: .env file not found. Please copy .env.example to .env and configure it."
    exit 1
fi

# Validate required environment variables
if [ -z "$AWS_PROFILE" ] || [ -z "$AWS_REGION" ]; then
    echo "❌ Error: Required AWS variables not set in .env:"
    echo "  AWS_PROFILE, AWS_REGION"
    exit 1
fi

# Check if prompt was provided
if [ -z "$1" ]; then
    echo "❌ Error: No prompt provided"
    echo ""
    echo "Usage:"
    echo "  $0 \"please validate these repos: RunPod/worker-basic\""
    echo "  make send-prompt PROMPT=\"validate RunPod/worker-basic, RunPod/worker-template\""
    echo ""
    echo "Examples:"
    echo "  $0 \"validate these repositories: RunPod/worker-basic\""
    echo "  $0 \"please check if these repos build correctly: RunPod/worker-template, RunPod/worker-pytorch\""
    echo "  $0 \"run validation on RunPod/worker-basic and create a PR if fixes are needed\""
    exit 1
fi

PROMPT="$1"
INSTANCE_NAME="janitor-gpu-instance"

echo "🔍 Finding running instance..."

# Find the running instance
INSTANCE_ID=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=$INSTANCE_NAME" "Name=instance-state-name,Values=running" \
    --query "Reservations[0].Instances[0].InstanceId" \
    --output text \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" 2>/dev/null || echo "None")

if [ "$INSTANCE_ID" = "None" ] || [ "$INSTANCE_ID" = "null" ]; then
    echo "❌ Error: No running instance found with name: $INSTANCE_NAME"
    echo ""
    echo "Please start the instance first:"
    echo "  make start-instance"
    exit 1
fi

# Get public IP
PUBLIC_IP=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --query "Reservations[0].Instances[0].PublicIpAddress" \
    --output text \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION")

if [ "$PUBLIC_IP" = "None" ] || [ -z "$PUBLIC_IP" ]; then
    echo "❌ Error: Could not get public IP for instance: $INSTANCE_ID"
    exit 1
fi

MASTRA_URL="http://$PUBLIC_IP:3000"

echo "📋 Instance ID: $INSTANCE_ID"
echo "🌐 Public IP: $PUBLIC_IP"
echo "🔗 Mastra API: $MASTRA_URL"
echo ""

# Check if Mastra server is responding
echo "🔍 Checking if Mastra server is ready..."
if ! curl -s --connect-timeout 5 --max-time 10 "$MASTRA_URL/health" >/dev/null 2>&1; then
    echo "⚠️  Mastra server is not responding. It might still be starting up."
    echo ""
    echo "🔧 To check the server status:"
    echo "   ssh -i $SSH_KEY_PATH ubuntu@$PUBLIC_IP 'sudo journalctl -u janitor-mastra -f'"
    echo ""
    echo "🔄 To manually start the service:"
    echo "   ssh -i $SSH_KEY_PATH ubuntu@$PUBLIC_IP 'sudo systemctl start janitor-mastra'"
    echo ""
    echo "⏳ Server might still be bootstrapping. Check bootstrap progress:"
    echo "   ssh -i $SSH_KEY_PATH ubuntu@$PUBLIC_IP 'tail -f /var/log/user-data.log'"
    exit 1
fi

echo "✅ Mastra server is ready"
echo ""

# Send the prompt
echo "📤 Sending prompt to Mastra server..."
echo "💬 Prompt: \"$PROMPT\""
echo ""

# Create JSON payload
JSON_PAYLOAD=$(cat <<EOF
{
  "message": "$PROMPT"
}
EOF
)

# Send POST request to Mastra API
RESPONSE=$(curl -s \
    -X POST \
    -H "Content-Type: application/json" \
    -d "$JSON_PAYLOAD" \
    "$MASTRA_URL/api/prompt" 2>/dev/null || echo "ERROR")

if [ "$RESPONSE" = "ERROR" ]; then
    echo "❌ Error: Failed to send prompt to Mastra server"
    echo ""
    echo "🔧 Debug steps:"
    echo "1. Check if server is running: curl -s $MASTRA_URL/health"
    echo "2. Check server logs: ssh -i $SSH_KEY_PATH ubuntu@$PUBLIC_IP 'sudo journalctl -u janitor-mastra -f'"
    echo "3. Test API manually: curl -X POST -H \"Content-Type: application/json\" -d '{\"message\":\"test\"}' $MASTRA_URL/api/prompt"
    exit 1
fi

# Parse and display response
echo "✅ Prompt sent successfully!"
echo ""
echo "📋 Response:"
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
echo ""

# Extract run ID if available
RUN_ID=$(echo "$RESPONSE" | jq -r '.runId // empty' 2>/dev/null || echo "")

if [ -n "$RUN_ID" ]; then
    echo "🔍 Run ID: $RUN_ID"
    echo ""
    echo "📊 To check validation results:"
    echo "   make query-results RUN_ID=$RUN_ID"
    echo ""
    echo "🔗 Or check in Supabase:"
    echo "   https://app.supabase.com/project/your-project/editor"
fi

echo "⏳ Validation is running in the background..."
echo "📊 Check the Mastra server logs for progress:"
echo "   ssh -i $SSH_KEY_PATH ubuntu@$PUBLIC_IP 'sudo journalctl -u janitor-mastra -f'" 