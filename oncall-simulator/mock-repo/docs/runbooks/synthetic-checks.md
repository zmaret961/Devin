# Runbook: synthetic checks (Pingdom)

Synthetic checks probe the storefront from 3 locations every minute.
Single-location failures are frequently caused by probe-side network blips and recover within 1–3 minutes.

Investigate only if the check fails from 2+ locations or stays red for more than 5 minutes.
