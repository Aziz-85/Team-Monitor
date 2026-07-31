# Storage Cleanup Plan

Reported candidates include `/var/www/team-monitor` (~4.7 GB), two Team Monitor backup directories (~2.2 GB and ~906 MB), an Echoes backup (~1.3 GB), and `team-monitor-clean.tar.gz`/`.zip`. These figures are unverified and nothing is authorized for deletion.

Run `scripts/infrastructure/storage-audit.sh /var/www` to list node_modules, `.next`, logs, Git objects, files over 200 MB and files older than 90 days. Classify each result as active runtime, source, database/volume, verified backup, replaceable build/cache or unknown owner. Confirm owner, checksum, off-host copy, retention and rollback need. Produce an explicit deletion list and obtain approval; prefer moving to quarantine during a maintenance window before permanent removal.
