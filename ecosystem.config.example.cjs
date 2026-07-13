/**
 * PM2 ecosystem example. Copy to ecosystem.config.cjs (production) or
 * ecosystem.staging.config.cjs (staging) and adjust.
 *
 * Production: APP_ENV=production, PORT=3002
 * Staging:    APP_ENV=staging,    PORT=3003, separate DATABASE_URL + UPLOAD_ROOT
 *
 * Set BUILD_COMMIT and BUILD_TIME when starting so /api/health returns the deploy stamp.
 */
module.exports = {
  apps: [
    {
      name: 'dhahran-app',
      cwd: __dirname,
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        APP_ENV: 'production',
        PORT: 3000,
      },
    },
    {
      name: 'dhahran-staging',
      cwd: __dirname,
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3003',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        APP_ENV: 'staging',
        PORT: 3003,
      },
    },
  ],
};
