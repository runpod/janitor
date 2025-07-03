environment   = "dev"
instance_type = "t3.micro"  # Start small for testing, upgrade to g5.xlarge for GPU workloads
key_name      = null        # Set to your EC2 key pair name if you want SSH access
aws_profile   = "runpod-janitor" 