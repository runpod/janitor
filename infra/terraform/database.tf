# VPC Configuration for Database
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# Database Subnet Group
resource "aws_db_subnet_group" "janitor_db" {
  name       = "${local.name_prefix}-db-subnet-group"
  subnet_ids = data.aws_subnets.default.ids

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-db-subnet-group"
  })
}

# Database Secret for Master Password
resource "aws_secretsmanager_secret" "db_master_password" {
  name                    = "${local.name_prefix}-db-master-password"
  description             = "Master password for Janitor PostgreSQL database"
  recovery_window_in_days = 7

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "db_master_password" {
  secret_id = aws_secretsmanager_secret.db_master_password.id
  secret_string = jsonencode({
    username = "janitor_admin"
    password = random_password.db_master_password.result
  })
}

resource "random_password" "db_master_password" {
  length  = 32
  special = true
}

# Database Secret for Agent User
resource "aws_secretsmanager_secret" "db_agent_credentials" {
  name                    = "${local.name_prefix}-db-agent-credentials"
  description             = "Agent credentials for Janitor PostgreSQL database"
  recovery_window_in_days = 7

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "db_agent_credentials" {
  secret_id = aws_secretsmanager_secret.db_agent_credentials.id
  secret_string = jsonencode({
    username = "janitor_agent"
    password = random_password.db_agent_password.result
    host     = aws_rds_cluster.janitor_db.endpoint
    port     = aws_rds_cluster.janitor_db.port
    database = aws_rds_cluster.janitor_db.database_name
  })
}

resource "random_password" "db_agent_password" {
  length  = 32
  special = true
}

# Database Secret for Query User (Read-only)
resource "aws_secretsmanager_secret" "db_query_credentials" {
  name                    = "${local.name_prefix}-db-query-credentials"
  description             = "Query credentials for Janitor PostgreSQL database"
  recovery_window_in_days = 7

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "db_query_credentials" {
  secret_id = aws_secretsmanager_secret.db_query_credentials.id
  secret_string = jsonencode({
    username = "janitor_query"
    password = random_password.db_query_password.result
    host     = aws_rds_cluster.janitor_db.endpoint
    port     = aws_rds_cluster.janitor_db.port
    database = aws_rds_cluster.janitor_db.database_name
  })
}

resource "random_password" "db_query_password" {
  length  = 32
  special = true
}

# Security Group for Database
resource "aws_security_group" "janitor_db" {
  name_prefix = "${local.name_prefix}-db-sg"
  description = "Security group for Janitor database"
  vpc_id      = data.aws_vpc.default.id

  # Allow PostgreSQL access from Janitor instances
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.janitor_instance.id]
  }

  # Allow PostgreSQL access from developer IP for local development
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["149.249.151.246/32"]
    description = "Developer local access"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-db-sg"
  })
}

# Aurora Serverless v2 Cluster
resource "aws_rds_cluster" "janitor_db" {
  cluster_identifier              = "${local.name_prefix}-db-cluster"
  engine                          = "aurora-postgresql"
  engine_mode                     = "provisioned"
  engine_version                  = "15.4"
  database_name                   = "janitor"
  master_username                 = "janitor_admin"
  master_password                 = random_password.db_master_password.result
  
  db_subnet_group_name            = aws_db_subnet_group.janitor_db.name
  vpc_security_group_ids          = [aws_security_group.janitor_db.id]
  
  backup_retention_period         = 7
  preferred_backup_window         = "03:00-04:00"
  preferred_maintenance_window    = "sun:04:00-sun:05:00"
  
  storage_encrypted               = true
  deletion_protection             = false
  
  serverlessv2_scaling_configuration {
    max_capacity = 1.0
    min_capacity = 0.5
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-db-cluster"
  })
}

# Aurora Serverless v2 Instance
resource "aws_rds_cluster_instance" "janitor_db" {
  identifier         = "${local.name_prefix}-db-instance"
  cluster_identifier = aws_rds_cluster.janitor_db.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.janitor_db.engine
  engine_version     = aws_rds_cluster.janitor_db.engine_version
  publicly_accessible = true

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-db-instance"
  })
}

# IAM Role for Database Access (for EC2 instances)
resource "aws_iam_role_policy" "janitor_database_policy" {
  name = "${local.name_prefix}-database-policy"
  role = aws_iam_role.janitor_instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # Secrets Manager permissions for database credentials
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [
          aws_secretsmanager_secret.db_master_password.arn,
          aws_secretsmanager_secret.db_agent_credentials.arn,
          aws_secretsmanager_secret.db_query_credentials.arn
        ]
      }
    ]
  })
}

# Outputs for database configuration
output "database_cluster_endpoint" {
  description = "RDS cluster endpoint"
  value       = aws_rds_cluster.janitor_db.endpoint
}

output "database_cluster_identifier" {
  description = "RDS cluster identifier"
  value       = aws_rds_cluster.janitor_db.cluster_identifier
}

output "database_name" {
  description = "Database name"
  value       = aws_rds_cluster.janitor_db.database_name
}

output "database_agent_secret_arn" {
  description = "ARN of the agent database credentials secret"
  value       = aws_secretsmanager_secret.db_agent_credentials.arn
}

output "database_query_secret_arn" {
  description = "ARN of the query database credentials secret"
  value       = aws_secretsmanager_secret.db_query_credentials.arn
}

output "database_master_secret_arn" {
  description = "ARN of the master database credentials secret"
  value       = aws_secretsmanager_secret.db_master_password.arn
}

output "database_security_group_id" {
  description = "ID of the database security group"
  value       = aws_security_group.janitor_db.id
}

# Database migration is now handled by EC2 instances launched via make db-migrate

# Data source still needed by other resources
data "aws_region" "current" {} 