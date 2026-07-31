# Backup and Restore

Team Monitor uses `pg_dump --format=custom` with `TEAM_MONITOR_DATABASE_URL` supplied through a protected environment file. Aqua uses `docker exec aquamonitors_db_prod pg_dump` with protected database/user variables. Scripts verify non-empty output and create a SHA-256 checksum. Passwords are never arguments or source literals.

Suggested retention is 7 daily, 4 weekly and 3 monthly copies. The implementation intentionally deletes nothing; an operator must classify copies, verify checksums and off-host replication, then approve pruning.

Restore only into a disposable database first: verify the checksum, use `pg_restore --list`, restore with a dedicated least-privileged operator, run application smoke tests and compare counts. Production restoration requires downtime approval, a fresh pre-restore backup and a named rollback decision. Never auto-restore after a failed deploy.
