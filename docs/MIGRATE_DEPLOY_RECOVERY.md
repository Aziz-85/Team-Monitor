# Prisma migrate deploy – استعادة بعد فشل الهجرة (P3018)

إذا فشل `npx prisma migrate deploy` مع خطأ مثل:

- **P3018**: A migration failed to apply. New migrations cannot be applied before the error is recovered from.
- **42P01**: relation "Boutique" does not exist (أو جداول أخرى)

فالسبب أن ترتيب الهجرات كان يطبق هجرة تعتمد على جدول لم يُنشأ بعد. تم إصلاح الترتيب في المستودع.

## خطوات الاستعادة على السيرفر

1. **تحديد الهجرة الفاشلة**  
   من رسالة الخطأ، الاسم يكون مثل:  
   `20260217000002_admin_boutique_region_group_membership_fields`

2. **تسجيل الهجرة كـ "rolled back"** (حتى يقبل Prisma تطبيق الهجرات من جديد):

   ```bash
   cd /var/www/team-monitor
   npx prisma migrate resolve --rolled-back "20260217000002_admin_boutique_region_group_membership_fields"
   ```

   استبدل اسم الهجرة بالاسم الفعلي من رسالة الخطأ إن اختلف.

3. **جلب آخر التحديثات** (تحتوي على ترتيب الهجرات المصحح):

   ```bash
   git pull origin main
   ```

4. **تطبيق الهجرات من جديد**:

   ```bash
   npx prisma generate
   npx prisma migrate deploy
   ```

5. **تشغيل البذور** (إن لزم):

   ```bash
   npm run db:seed
   ```

6. **إعادة تشغيل التطبيق**:

   ```bash
   pm2 restart team-monitor
   ```

## ما الذي تم إصلاحه؟

- هجرة **إنشاء أساس Multi-Boutique** (Organization, Region, Boutique, UserBoutiqueMembership، إلخ) كانت بتاريخ لاحق (20260220) بينما هجرة **تعديل** جدول `Boutique` كانت بتاريخ أبكر (20260217)، فكانت تُطبَّق أولاً وتفشل لأن الجدول غير موجود.
- تم إعادة ترتيب الهجرات بحيث:
  - `20260217000001_multi_boutique_foundation` تُطبَّق أولاً (إنشاء الجداول).
  - ثم `20260217000002_admin_boutique_region_group_membership_fields` (تعديل Boutique وغيرها).
  - ثم `20260217000003_multi_boutique_enforce_not_null` (البذور وNOT NULL).

بعد `git pull` و`migrate resolve --rolled-back` و`migrate deploy` يجب أن تكتمل كل الهجرات بنجاح.

---

## إذا ظهر: must be owner of table (42501)

الخطأ يعني أن مستخدم قاعدة البيانات في `DATABASE_URL` **ليس مالكاً** للجداول الحالية (غالباً الجداول مملوكة لـ `postgres` أو مستخدم آخر أنشأها).

### الحل: نقل ملكية الجداول لمستخدم التطبيق

1. **معرفة اسم المستخدم الذي يشغّل الهجرات**  
   من ملف `.env`: المستخدم في الرابط، مثلاً:
   - `postgresql://deploy:xxx@localhost:5432/dhahran_team` → المستخدم هو `deploy`
   - أو `postgresql://dhahran_team:xxx@...` → المستخدم هو `dhahran_team`

2. **تشغيل سكربت نقل الملكية كـ superuser (مرة واحدة)**  
   على السيرفر، استبدل `deploy` باسم المستخدم الفعلي من `DATABASE_URL` في `.env` ثم شغّل:

   ```bash
   cd /var/www/team-monitor
   sed 's/YOUR_APP_USER/deploy/g' scripts/fix-db-ownership.sql | sudo -u postgres psql -d dhahran_team -f -
   ```

   أو عدّل ملف `scripts/fix-db-ownership.sql` وضَع اسم المستخدم مكان `YOUR_APP_USER` ثم:

   ```bash
   sudo -u postgres psql -d dhahran_team -f scripts/fix-db-ownership.sql
   ```

3. **إعادة تشغيل الهجرة الفاشلة ثم deploy**  
   بعد نقل الملكية:

   ```bash
   npx prisma migrate resolve --rolled-back "20260217000001_multi_boutique_foundation"
   npx prisma migrate deploy
   npm run db:seed
   pm2 restart team-monitor
   ```
