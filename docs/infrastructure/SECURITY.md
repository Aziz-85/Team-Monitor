# Security Model

The browser talks only to Team Monitor. Pages and API routes require `SUPER_ADMIN`; mutations additionally require the existing CSRF token. Team Monitor authenticates to a loopback-only agent with a server-side token checked using constant-time comparison. The agent registry owns every path, port, PM2 name and command. It uses `execFile`, fixed argument arrays, request limits, timeouts, per-app locks, request IDs, structured logs and output redaction.

Keep all action flags false until a read-only soak test succeeds. Use a dedicated random token, rotate it after suspected disclosure, restrict environment files to `root:deploy`, and never grant `NOPASSWD: ALL`. If a narrowly scoped privilege is ever unavoidable, authorize only a root-owned wrapper with fixed arguments after security review. Do not expose `.env`, process environments, full PM2 JSON or database URLs.

Redaction is defense in depth, not permission to return arbitrary logs. Returned logs are capped at 500 lines. `Unknown` means the control plane lacks evidence; it must not be presented as `Down`. Rate limiting is per loopback peer and should be supplemented by host controls. Review npm audit findings manually; do not run `npm audit fix --force`.
