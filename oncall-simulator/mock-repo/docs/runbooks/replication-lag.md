# Runbook: database replication lag

Replication lag on read replicas can be caused by heavy write bursts, long-running queries on the replica,
vacuum conflicts, or network saturation between AZs.

Diagnosis requires access to `pg_stat_replication`, host network graphs, and recent batch-job schedules.
**If the cause is not obvious within 15 minutes, escalate to the on-call DBA** — failover decisions require a human.
