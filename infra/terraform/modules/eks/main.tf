variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "public_subnet_ids" { type = list(string) }

variable "node_instance_types" {
  type    = list(string)
  default = ["t4g.medium"] # Graviton — same reasoning as the RDS instance class
}

variable "min_nodes" {
  type    = number
  default = 2
}

variable "max_nodes" {
  type    = number
  default = 8
}

variable "desired_nodes" {
  type    = number
  default = 3
}

resource "aws_iam_role" "cluster" {
  name = "ai-commerce-${var.environment}-eks-cluster"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "eks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "cluster_policy" {
  role       = aws_iam_role.cluster.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
}

resource "aws_eks_cluster" "main" {
  name     = "ai-commerce-${var.environment}"
  role_arn = aws_iam_role.cluster.arn
  version  = "1.30"

  vpc_config {
    subnet_ids              = concat(var.private_subnet_ids, var.public_subnet_ids)
    endpoint_private_access = true
    endpoint_public_access  = true # restrict to a CIDR allowlist in production rather than 0.0.0.0/0 — see environments/production/terraform.tfvars
  }

  depends_on = [aws_iam_role_policy_attachment.cluster_policy]
}

# IRSA: lets Kubernetes ServiceAccounts assume AWS IAM roles directly,
# rather than every pod needing long-lived AWS credentials baked into a
# Secret. This is the mechanism External Secrets Operator would use to read
# from AWS Secrets Manager — the cluster-side half of bootstrap-secrets.ts.
data "tls_certificate" "eks" {
  url = aws_eks_cluster.main.identity[0].oidc[0].issuer
}

resource "aws_iam_openid_connect_provider" "eks" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.eks.certificates[0].sha1_fingerprint]
  url             = aws_eks_cluster.main.identity[0].oidc[0].issuer
}

resource "aws_iam_role" "node_group" {
  name = "ai-commerce-${var.environment}-eks-nodes"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "node_policies" {
  for_each = toset([
    "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
    "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
    "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
  ])
  role       = aws_iam_role.node_group.name
  policy_arn = each.value
}

resource "aws_eks_node_group" "main" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "ai-commerce-${var.environment}"
  node_role_arn   = aws_iam_role.node_group.arn
  subnet_ids      = var.private_subnet_ids # nodes in private subnets only — no public IPs on worker nodes

  instance_types = var.node_instance_types

  scaling_config {
    min_size     = var.min_nodes
    max_size     = var.max_nodes
    desired_size = var.desired_nodes
  }

  update_config {
    max_unavailable = 1 # node-level rolling update — the cluster equivalent of the Deployment's maxUnavailable: 0 (pods reschedule onto remaining nodes during a node replacement)
  }

  depends_on = [aws_iam_role_policy_attachment.node_policies]
}

output "cluster_name" { value = aws_eks_cluster.main.name }
output "cluster_endpoint" { value = aws_eks_cluster.main.endpoint }
output "oidc_provider_arn" { value = aws_iam_openid_connect_provider.eks.arn }

# The security group EKS auto-creates and attaches to the cluster's ENIs and,
# by default, to nodes in the managed node group — this is the real ID other
# modules (e.g. database, cache) need when authorizing ingress from cluster
# workloads, not the cluster name string that was wired through before.
output "cluster_security_group_id" { value = aws_eks_cluster.main.vpc_config[0].cluster_security_group_id }

