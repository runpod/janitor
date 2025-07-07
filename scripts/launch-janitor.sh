#!/bin/bash
set -euo pipefail

# Janitor Launch Script - Fixed to use correct AWS CLI parameters
# Uses --count instead of --min-count/--max-count

# Get parameters from environment or use defaults
AWS_REGION="${AWS_REGION:-eu-west-2}"
AWS_PROFILE="${AWS_PROFILE:-runpod-janitor}"
ENV="${ENV:-dev}"
LAUNCH_TEMPLATE_ID="${LAUNCH_TEMPLATE_ID:-lt-07e8afaf830e05126}"

echo "🚀 Launching Janitor EC2 instance (using correct --count parameter)..."
echo "   Region: $AWS_REGION"
echo "   Profile: $AWS_PROFILE"
echo "   Environment: $ENV"
echo "   Launch Template: $LAUNCH_TEMPLATE_ID"

# Launch the instance using the correct --count parameter
echo "🚀 Launching instance..."
RESULT=$(aws ec2 run-instances \
    --launch-template LaunchTemplateId="$LAUNCH_TEMPLATE_ID",Version=\$Latest \
    --count 1 \
    --tag-specifications \
        "ResourceType=instance,Tags=[{Key=Name,Value=janitor-$ENV-runner},{Key=Project,Value=janitor-$ENV},{Key=Environment,Value=$ENV}]" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --output text \
    --query 'Instances[0].[InstanceId,State.Name]')

# Extract instance ID and state
INSTANCE_ID=$(echo "$RESULT" | cut -f1)
INSTANCE_STATE=$(echo "$RESULT" | cut -f2)

echo "✅ Instance launched: $INSTANCE_ID ($INSTANCE_STATE)" 