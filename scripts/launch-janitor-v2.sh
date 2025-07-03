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

echo "✅ Instance launched successfully!"
echo "   Instance ID: $INSTANCE_ID"
echo "   State: $INSTANCE_STATE"
echo ""
echo "🔍 Monitor progress:"
echo "   - EC2 Console: https://$AWS_REGION.console.aws.amazon.com/ec2/home?region=$AWS_REGION#Instances:instanceId=$INSTANCE_ID"
echo "   - CloudWatch Logs: https://$AWS_REGION.console.aws.amazon.com/cloudwatch/home?region=$AWS_REGION#logsV2:log-groups/log-group/%252Fjanitor-runner"
echo ""
echo "⏳ The instance will:"
echo "   1. Boot and run the bootstrap script"
echo "   2. Pull and run your Janitor Docker image"
echo "   3. Process repositories with Docker-in-Docker"
echo "   4. Upload reports to S3"
echo "   5. Auto-terminate when complete"
echo ""
echo "📊 To check status later:"
echo "   aws ec2 describe-instances --instance-ids $INSTANCE_ID --profile $AWS_PROFILE --region $AWS_REGION --query 'Reservations[0].Instances[0].State.Name' --output text" 