# Server: Fix "Could not find a production build in the '.next' directory"

**إصلاح فوري (على السيرفر):** نفّذ الأمر التالي من مجلد المشروع ثم أعد تشغيل PM2:

```bash
cd /var/www/team-monitor
npm ci
npm run build
pm2 restart team-monitor
```

إذا ظهر الخطأ في لوج PM2:

```text
Error: Could not find a production build in the '.next' directory. Try building your app with 'next build' before starting the production server.
```

the app is running `next start` but the production build was never created (or the `.next` folder was removed).

## Fix: build on the server, then restart

Run these on the server as the deploy user (e.g. `deploy`):

```bash
cd /var/www/team-monitor
npm run build
pm2 restart team-monitor
```

If you see **`Cannot find module '.../node_modules/next/dist/bin/next'`**, either `node_modules` is incomplete or PM2 is using a direct path. Do:

1. **Reinstall dependencies:** `npm install` (or `npm ci` if you use lockfile).
2. **Use updated ecosystem:** the project’s `ecosystem.config.cjs` runs `npm run start` so it no longer depends on next’s internal path. After `git pull`, run `pm2 delete team-monitor` then `pm2 start ecosystem.config.cjs` so the new config is used.
3. Then **build and restart:** `npm run build` and `pm2 restart team-monitor`.

- `npm run build` creates the `.next` folder (can take 1–2 minutes).
- Then `pm2 restart team-monitor` starts the app using that build.

## Recommended deploy flow after each `git pull`

1. **Pull**
   ```bash
   cd /var/www/team-monitor
   git pull
   ```

2. **Install dependencies** (if `package.json` or lockfile changed)
   ```bash
   npm install
   ```

3. **Build**
   ```bash
   npm run build
   ```

4. **Migrations** (if there are new Prisma migrations)
   ```bash
   npx prisma migrate deploy
   ```

5. **Restart**
   ```bash
   pm2 restart team-monitor
   ```

If you use a deploy script, include `npm run build` before `pm2 restart`.

---

## EmpId correction and verification (optional)

**Fix wrong empId (e.g. Muslim Algumiah 1100 → 2011):** Call the admin-only endpoint once (as ADMIN or SUPER_ADMIN):

```bash
# Example: fix empId 1100 → 2011 for "Muslim Algumiah"
curl -X POST https://your-app/api/admin/users/fix-empid \
  -H "Content-Type: application/json" \
  -H "Cookie: dt_session=YOUR_SESSION_COOKIE" \
  -d '{"fullName":"Muslim Algumiah","oldEmpId":"1100","newEmpId":"2011"}'
```

**DB verification (Prisma or psql):**

```bash
# From project root (Prisma)
npx prisma db execute --stdin <<< 'SELECT id, "empId", role FROM "User" WHERE "empId" IN (\'1100\', \'2011\');'

# Or with psql (DB: dhahran_team)
psql -d dhahran_team -c 'SELECT id, "empId", role FROM "User" WHERE "empId" IN ('\''1100'\'', '\''2011'\'');'
```

After a successful fix, the user with name "Muslim Algumiah" should have `empId` = 2011 and no user should have empId 1100.
