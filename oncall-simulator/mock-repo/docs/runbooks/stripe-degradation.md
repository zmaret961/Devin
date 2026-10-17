# Runbook: Stripe (payment processor) degradation

1. Check https://status.stripe.com — if an incident is open, this is upstream.
2. Our worker retries transient 5xx/429 responses with exponential backoff; do **not** disable retries.
3. Post in #payments-incidents and enable the "payments delayed" banner if p95 > 5s for 15 minutes.
4. No code change is required for upstream incidents. Re-check after Stripe resolves.
