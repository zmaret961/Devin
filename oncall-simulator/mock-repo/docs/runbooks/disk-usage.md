# Runbook: disk usage high on database hosts

**Owner:** platform · **Severity guidance:** warn at 80%, page at 90%

## Likely causes
1. WAL / archive logs not being shipped (check `archive_command` failures).
2. Postgres log files not rotated (`log_rotation_age` misconfigured after an upgrade).
3. Long-running transaction preventing vacuum (table bloat).

## Remediation
- Rotate and compress logs: `sudo logrotate -f /etc/logrotate.d/postgresql`.
- Confirm WAL archiving is healthy; free space by pruning archived WAL older than 7 days.
- If above 90%, expand the volume (EBS online resize) before investigating further.

No application code change is normally required.
