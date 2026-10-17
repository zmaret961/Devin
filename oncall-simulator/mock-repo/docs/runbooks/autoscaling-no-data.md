# Runbook: "No data" monitors

"No data" alerts fire when a host stops reporting metrics. When the autoscaler terminates an instance during
scale-in, its monitors go silent and fire a no-data alert. Check the ASG activity history: if the instance
was terminated by the autoscaler, the alert is expected and can be closed.
