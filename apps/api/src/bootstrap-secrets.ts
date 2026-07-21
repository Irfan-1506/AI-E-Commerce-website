import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

/**
 * Honest scope note: this makes the CODE ready for a real secret manager —
 * it does not itself provision one. Plain env vars (.env / CI secrets /
 * docker-compose env) remain what's actually used until AWS_SECRETS_ID is
 * set, because there's no AWS account in this environment to test against.
 * What this closes: previously there was no code path AT ALL for loading
 * secrets from a real secret store — switching to one meant a rewrite. Now
 * it's one env var.
 *
 * Expects the secret (in AWS Secrets Manager) to be a JSON object of
 * KEY: "value" pairs matching the env var names elsewhere in this codebase,
 * e.g. {"JWT_ACCESS_SECRET": "...", "SSLCOMMERZ_STORE_PASSWORD": "..."}.
 */
export async function loadSecrets(): Promise<void> {
  const secretId = process.env.AWS_SECRETS_ID;
  if (!secretId) return; // no secret manager configured — env vars are the source of truth

  const client = new SecretsManagerClient({ region: process.env.AWS_REGION ?? 'ap-southeast-1' });
  const result = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  if (!result.SecretString) throw new Error(`Secret ${secretId} has no SecretString`);

  const secrets: Record<string, string> = JSON.parse(result.SecretString);
  for (const [key, value] of Object.entries(secrets)) {
    // Secrets Manager wins over whatever's in .env — deliberate: a stale
    // local .env value should never silently override the managed secret
    // in an environment that's supposed to be using it.
    process.env[key] = value;
  }
}
