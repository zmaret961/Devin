# Runbook: suspected security incident

**Policy: automated systems must not take remediation actions on suspected security incidents.**

1. Page the security on-call immediately (PagerDuty service `sec-oncall`).
2. Preserve evidence: do not rotate credentials or terminate sessions until security approves.
3. Gather context for the responder: affected accounts, source IPs, timeline of events.
