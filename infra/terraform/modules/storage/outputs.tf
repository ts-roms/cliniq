output "phi_bucket_name"     { value = aws_s3_bucket.phi.id }
output "phi_bucket_arn"      { value = aws_s3_bucket.phi.arn }
output "phi_kms_key_arn"     { value = aws_kms_key.phi.arn }
output "public_bucket_name"  { value = aws_s3_bucket.public.id }
output "public_bucket_arn"   { value = aws_s3_bucket.public.arn }
output "phi_logs_bucket_arn" { value = aws_s3_bucket.phi_logs.arn }
