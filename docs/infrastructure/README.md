# Infrastructure Management

This subsystem provides a disabled-by-default, `SUPER_ADMIN`-only dashboard, a loopback-only agent, fixed application registry, operational scripts, audit models and installation templates. It never accepts a shell command, path or PM2 name from HTTP.

Read in order: `CURRENT_SERVER_ARCHITECTURE.md`, `SECURITY.md`, `INSTALLATION.md`, `OPERATIONS.md`, `BACKUP_AND_RESTORE.md`, `ROLLBACK.md`, `INCIDENT_RESPONSE.md`, and `PM2_MIGRATION_RUNBOOK.md`.

All execution flags default to false. The PM2 and systemd files are templates and have not been installed. The Prisma migration has not been applied to production.
