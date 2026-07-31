# PM2 Migration Runbook

Do not run this outside an approved maintenance window. Migrate Aqua first or Echoes first based on lowest business risk, one application at a time.

1. Inspect `pm2 jlist` under both explicit PM2 homes, owners, ports, env-file references and health behavior.
2. Save `/root/.pm2/dump.pm2` to a root-only timestamped backup. Back up secret files outside Git without displaying them.
3. Change ownership only for files the selected app must write; keep secret files least-privileged.
4. As `deploy`, start the selected app from the reviewed ecosystem definition on a temporary loopback port.
5. Check the temporary HTTP endpoint and logs.
6. Stop only the selected root-owned PM2 process. Start its deploy-owned definition on the original port.
7. Check loopback and public HTTPS, then Nginx logs/configuration.
8. Run `PM2_HOME=/home/deploy/.pm2 pm2 save` and record evidence.
9. Roll back immediately if any check fails: stop only the deploy copy, restart only the saved root entry, verify the original port/domain and restore narrowly changed ownership if needed.
10. Repeat for the other root app. In a later window, reboot-test. Disable `pm2-root.service` only after both apps survive that test.

Never use `pm2 kill`, stop all processes, overwrite dumps blindly or disable `pm2-root.service` during an individual migration.
