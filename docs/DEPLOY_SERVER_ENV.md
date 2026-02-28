# Server: Fix database connection (DATABASE_URL)

If you see in PM2 logs:

```text
[db] PRODUCTION ERROR: DATABASE_URL is missing or points to localhost...
Authentication failed against database server at `localhost`, the provided database credentials for `...` are not valid.
```

the app is using the **wrong** database URL (e.g. your local dev one) or **no** `.env` on the server. Fix it on the **server**.

## 1. Check current state (on the server)

```bash
cd /var/www/team-monitor
ls -la .env
```
If `.env` is missing, create it (step 2). If it exists, open it and ensure `DATABASE_URL` is set to your **production** PostgreSQL URL (not localhost, not your Mac username).

To see whether the app sees DATABASE_URL without printing the password:
```bash
cd /var/www/team-monitor
node -e "require('fs').readFileSync('.env','utf8').split('\n').forEach(l=>{if(l.startsWith('DATABASE_URL=')){const u=l.replace('DATABASE_URL=','').replace(/^["']|["']$/g,''); console.log('Host in URL:', u.replace(/^[^@]+@/,'').split('/')[0].split('?')[0]); console.log('Has localhost:', u.includes('localhost'));}})"
```
If you see "Has localhost: true", replace the value in `.env` with the production DB URL.

## 2. Steps on the server

1. **SSH into the server** and go to the app directory:
   ```bash
   cd /var/www/team-monitor
   ```

2. **Create or edit `.env`** in that directory (same folder as `package.json`):
   ```bash
   nano .env
   ```

3. **Set the production database URL.** Example (replace with your real host, user, password, and database name):
   ```env
   DATABASE_URL="postgresql://USER:PASSWORD@YOUR_DB_HOST:5432/DATABASE_NAME?schema=public"
   ```
   - Do **not** use `localhost` unless PostgreSQL is really on the same machine.
   - Do **not** use your Mac username/password; use the **production** DB user and password.
   - If the DB is on a cloud service (e.g. DigitalOcean, Supabase), use the host and credentials they gave you.

4. **Save the file** (in nano: Ctrl+O, Enter, Ctrl+X).

5. **Restart the app** so it picks up the new env:
   ```bash
   pm2 restart team-monitor
   ```

6. **Check logs** to confirm no more auth errors:
   ```bash
   pm2 logs team-monitor --lines 30
   ```

## If you don’t have a production database yet

- Create a PostgreSQL database (e.g. on DigitalOcean Managed Database, Supabase, or a VPS).
- Get the connection string (host, port, user, password, database name).
- Put it in `.env` as `DATABASE_URL` on the server and run migrations:
  ```bash
  cd /var/www/team-monitor
  npx prisma migrate deploy
  npm run db:seed
  pm2 restart team-monitor
  ```

## Optional: Set DATABASE_URL in PM2 ecosystem

If the app still doesn’t see the correct `DATABASE_URL` after adding `.env`, you can pass it via PM2. Create `ecosystem.config.cjs` in the project root on the server:

```js
module.exports = {
  apps: [{
    name: 'team-monitor',
    cwd: '/var/www/team-monitor',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    env: {
      NODE_ENV: 'production',
      PORT: 3002,
      DATABASE_URL: 'postgresql://USER:PASSWORD@YOUR_DB_HOST:5432/DATABASE_NAME?schema=public',
    },
  }],
};
```

Replace the `DATABASE_URL` value with your real production URL. Then run `pm2 delete team-monitor` (if it exists), then `pm2 start ecosystem.config.cjs`. Prefer fixing `.env` first; use this only if `.env` is not being loaded.
