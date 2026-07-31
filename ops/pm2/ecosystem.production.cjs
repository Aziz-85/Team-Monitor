'use strict';
const nodeApp = (name, cwd, port) => ({
  name, cwd, script: 'npm', args: 'run start', instances: 1, exec_mode: 'fork',
  env: { NODE_ENV: 'production', PORT: String(port) }, autorestart: true,
  max_memory_restart: '450M', restart_delay: 5000, time: true, merge_logs: true,
  kill_timeout: 10000, listen_timeout: 15000, watch: false,
});
module.exports = { apps: [
  nodeApp('team-monitor', '/var/www/team-monitor', 3002),
  nodeApp('aquamonitors', '/var/www/aquamonitors', 3001),
  nodeApp('echoes-library', '/var/www/echoes-library', 3000),
  { name: 'infrastructure-agent', cwd: '/var/www/team-monitor', script: 'npm', args: 'run infrastructure:agent', instances: 1, exec_mode: 'fork', env: { NODE_ENV: 'production' }, autorestart: true, max_memory_restart: '180M', restart_delay: 5000, time: true, merge_logs: true, kill_timeout: 10000, listen_timeout: 15000, watch: false },
] };
