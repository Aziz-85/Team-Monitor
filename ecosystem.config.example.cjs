/**
 * PM2 ecosystem example. Copy to ecosystem.config.cjs and adjust.
 * Ensures the app runs from this directory and Next.js serves the built .next folder.
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
        PORT: 3000,
      },
      // Set BUILD_COMMIT and BUILD_TIME before: pm2 start ecosystem.config.cjs --update-env
      // e.g. BUILD_COMMIT=$(git rev-parse HEAD) BUILD_TIME=$(date -Iseconds) pm2 start ...
    },
  ],
};
