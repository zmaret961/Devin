# Runbook: TLS certificate expiring

Certificates for `*.shopfast.io` are issued by ACM and should auto-renew 30 days before expiry.

## If an expiry alert fires
1. Check that the DNS validation CNAME still exists (auto-renew silently fails without it).
2. Re-request validation in ACM, or rotate manually with the `edge-certs` Terraform module.
3. Open a ticket for the platform team; this is not urgent unless < 7 days remain.

No application code change is required.
