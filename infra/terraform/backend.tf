terraform {
  backend "s3" {
    bucket         = "janitor-terraform-state-nd4avnob"
    key            = "janitor/terraform.tfstate"
    region         = "eu-west-2"
    dynamodb_table = "janitor-terraform-state-lock"
    encrypt        = true
    profile        = "janitor"
  }
} 