/**
 * PM2 ecosystem config — production (fork mode, port 3002).
 * Server path: /var/www/team-monitor
 * Usage: pm2 start ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: 'team-monitor',
      cwd: __dirname,
      script: 'npm',
      args: 'run start',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '700M',
      env: {
        NODE_ENV: 'production',
        PORT: '3002',
      },
      merge_logs: true,
      time: true,
    },
  ],
};
