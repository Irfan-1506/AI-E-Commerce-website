# Infrastructure — honest scope

Everything under `infra/` (Terraform + Kubernetes) is real, structurally
correct code that would provision and deploy this application on AWS/EKS.
**None of it has been applied or run.** There's no AWS account, no domain,
no cluster in this environment — writing it here is the same as writing it
in an editor with no cloud credentials configured. That's a meaningful
difference from "this is running infrastructure," and it matters to say so
plainly rather than let the presence of the files imply otherwise.

## What's here

```
infra/terraform/modules/
  network/      VPC, public/private subnets across 2 AZs, single NAT gateway
  database/     RDS Postgres, least-privilege security group, 30-day backups
  cache/        ElastiCache Redis, replication group (failover-ready)
  eks/          EKS cluster + managed node group + OIDC provider for IRSA
  storage/      S3 (product images + DB backups), encrypted, versioned
  dr-region/    Cross-region RDS read replica — DISABLED by default

infra/terraform/environments/
  staging/      Smaller instances, single-AZ, no DR module referenced
  production/   Multi-AZ RDS/Redis, larger node pool

infra/k8s/base/           Deployment/Service/HPA/PDB for api, worker, web;
                           Ingress; ConfigMaps; a secret TEMPLATE (not real
                           secrets); default-deny NetworkPolicy
infra/k8s/overlays/       staging (1 replica, smaller HPA ceiling) and
                           production (base as-is, CI-pinned image tags)
```

## Named gaps — things that look wired up but aren't quite

- **The Kustomize `secret-template.yaml`** is not real secrets and is not
  meant to be applied directly — production secrets come from External
  Secrets Operator reading AWS Secrets Manager (the cluster-side half of
  `apps/api/src/bootstrap-secrets.ts`), which itself isn't installed by
  anything in this repo.
- **`cert-manager` and `ingress-nginx`** are assumed to exist on the
  cluster by `ingress.yaml`'s annotations and `network-policy.yaml`'s
  namespace selector, but nothing here installs them — they're standard
  Helm-chart cluster add-ons, intentionally out of scope for
  application-level IaC.
- **Worker HPA is CPU-only.** Queue-depth-based autoscaling (the more
  correct signal for a queue consumer) needs KEDA or the Prometheus
  adapter installed on the cluster; the config for it is commented out in
  `worker-hpa.yaml` rather than silently omitted.

## Why single-region, not multi-region

The `dr-region` module exists and works (cross-region RDS read replica +
versioned S3 replica bucket) but defaults to `enabled = false`. This is a
Bangladesh-market e-commerce platform — ap-southeast-1 (Singapore) is
already the lowest-latency AWS region for that traffic, and there's no
current requirement (contractual SLA, regulatory, or genuine multi-region
customer base) that justifies the real ongoing cost of a second region.
What's built is disaster-recovery readiness (promote the replica if the
primary region has a prolonged outage), not active-active multi-region
(serving live traffic from two regions at once) — those are different
problems with very different costs, and conflating them would be the kind
of overclaiming this whole project has tried to avoid throughout. Flip
`enabled = true` when there's a concrete RTO/RPO requirement driving it.

## If you actually wanted to run this

1. Bootstrap Terraform state (S3 bucket + DynamoDB lock table) by hand once.
2. `terraform init && terraform plan` in `environments/staging` first.
3. Install `ingress-nginx`, `cert-manager`, and `external-secrets` on the
   resulting cluster via Helm.
4. Point `kubectl` at the new cluster, `kubectl apply -k infra/k8s/overlays/staging`.
5. Only then does `.github/workflows/deploy.yml` have somewhere real to deploy to.

Note: `terraform plan` itself has not been run anywhere in this environment
(no `terraform` binary, no AWS credentials) — "would plan correctly" above
is based on manual review of the module wiring, not an actual `plan` run.
