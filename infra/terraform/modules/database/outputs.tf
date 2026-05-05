output "endpoint"           { value = aws_db_instance.this.endpoint }
output "address"            { value = aws_db_instance.this.address }
output "port"               { value = aws_db_instance.this.port }
output "database_name"      { value = aws_db_instance.this.db_name }
output "secret_arn"         { value = aws_secretsmanager_secret.database_url.arn }
output "kms_key_arn"        { value = aws_kms_key.rds.arn }
