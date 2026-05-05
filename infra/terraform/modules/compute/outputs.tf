output "cluster_name"         { value = aws_ecs_cluster.this.name }
output "alb_dns_name"         { value = aws_lb.this.dns_name }
output "alb_zone_id"          { value = aws_lb.this.zone_id }
output "ecr_api_repo_url"     { value = aws_ecr_repository.api.repository_url }
output "task_role_arn"        { value = aws_iam_role.task.arn }
output "execution_role_arn"   { value = aws_iam_role.task_execution.arn }
output "api_service_name"     { value = aws_ecs_service.api.name }
output "api_log_group"        { value = aws_cloudwatch_log_group.api.name }
