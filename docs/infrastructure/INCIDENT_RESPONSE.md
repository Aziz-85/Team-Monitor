# Incident Response

Record time, app, reporter and request ID. Preserve Agent structured logs, operation records, PM2 logs and relevant Nginx entries after redaction. Determine whether the application, HTTP upstream, database, container or control plane failed; `Unknown` alone is not proof of outage.

For suspected token exposure, disable all infrastructure actions, stop the agent if necessary, rotate the token in both protected environments, restart only the agent and review operation/audit records. For a restart loop, disable autorestart for only the affected app through an approved operator action after preserving evidence. For disk pressure, use `storage-audit.sh`; do not delete archives, databases, Docker volumes or current builds ad hoc.

After recovery, document cause, impact, actions, verification and prevention. Never place secrets or unredacted logs in the incident record.
