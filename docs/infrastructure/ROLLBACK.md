# Rollback

Application deployment rollback requires a clean working tree and a recorded 40-character commit. `rollback-app.sh` verifies the commit, performs the documented controlled `git reset --hard`, installs locked dependencies, regenerates Prisma Client if applicable, rebuilds before reload and health-checks afterward. It does not roll back database migrations.

Dashboard rollback: set every `INFRASTRUCTURE_*_ENABLED` flag to false and restart Team Monitor. Agent rollback: stop/disable only `infrastructure-agent.service`; the applications remain independent. Timer rollback: disable the relevant timer and service. Database schema rollback should normally be forward-fixed; dropping audit tables/types is destructive and requires separate DBA approval.
