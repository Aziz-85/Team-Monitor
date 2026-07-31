# Operations

Start with read-only status. Confirm Agent, PM2 and HTTP health separately. A PM2 `online` state with a failed HTTP check is `Warning` or `Down`; an unavailable agent is `Unknown`. Default thresholds are disk 75% warning/90% critical, memory 80% warning, load above CPU count, health timeout 10 seconds, stale backup 48 hours and a restart-count increase over a short window as a restart-loop warning.

Actions require feature flags, typed confirmation and a request ID. Deploy adds a second confirmation. Watch the operation log and HTTP health; never assume success from a submitted request. Polling runs every five minutes through the systemd timer template and produces no success notification. Connect a future notifier only to transitions such as Healthy→Down, Down→Healthy, persistent Warning, capacity thresholds, stale backup or restart loop.

Nginx verification checklist: run `nginx -t`; inspect all three server names/upstreams, certificate validity and renewal, `Host`/`X-Forwarded-*` headers, WebSocket upgrade where needed, proxy timeouts and existing security headers. Do not add the agent to Nginx.
