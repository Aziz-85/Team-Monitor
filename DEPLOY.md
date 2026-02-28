# نشر تطبيق Team Monitor على السيرفر

دليل رفع وتشغيل الموقع على سيرفر (VPS أو استضافة تدعم Node.js).

---

## نشر تلقائي (Ubuntu 22.04 / DigitalOcean)

على السيرفر بعد رفع المشروع إلى `/var/www/team-monitor` وتكوين `.env`:

```bash
cd /var/www/team-monitor
chmod +x scripts/deploy-server.sh
./scripts/deploy-server.sh
```

السكربت ينفّذ: تنظيف PM2 القديم، الصلاحيات، `npm install` و `npm run build`، Prisma generate + migrate، تشغيل PM2 على المنفذ 3002 (وضع fork)، تفعيل التشغيل عند إعادة التشغيل، والتحقق من الخدمة.

---

## الاختبار محلياً أولاً ثم الرفع

يُفضّل تجربة التعديلات على جهازك ثم رفعها للسيرفر.

### 1) على جهازك (محلياً)

من مجلد المشروع:

```bash
# تطبيق الهجرات (بما فيها تحديثات الصلاحيات)
npx prisma migrate dev

# تشغيل التطبيق للتجربة
npm run dev
```

افتح المتصفح على `http://localhost:3000` (أو المنفذ الظاهر في الطرفية). تأكد من:

- تسجيل الدخول كأدمن / مدير / مساعد مدير حسب ما تختبره.
- صلاحية **تعديل الجدول** تظهر لمساعد المدير، و**الموافقة على الأسبوع** تظهر للمدير والأدمن فقط.
- عدم ظهور أخطاء في الطرفية أو في المتصفح.

### 2) التحقق من البناء قبل الرفع

```bash
npm run lint
npm run typecheck
npm run build
```

إذا نجحت الأوامر الثلاثة، التعديلات جاهزة للرفع.

### 3) الرفع إلى السيرفر

- إذا تستخدم **Git**:
  ```bash
  git add .
  git commit -m "تحديث الصلاحيات (أدمن/مدير/مساعد مدير)"
  git push
  ```
- على **السيرفر** من مجلد المشروع:
  ```bash
  git pull
  npm install
  npm run build
  npx prisma generate
  npx prisma migrate deploy
  pm2 restart all
  ```
  أو تشغيل سكربت النشر إن وُجد: `./scripts/deploy-server.sh`

بهذا تكون قد جرّبت التعديلات محلياً ثم رفعتها بعد التأكد.

---

## المتطلبات على السيرفر

- **Node.js** 18 أو أحدث (يفضل 20 LTS)
- **PostgreSQL** قاعدة بيانات
- **npm** أو **pnpm**

---

## 1) رفع الملفات للسيرفر

### الطريقة أ: Git (مفضلة)

على السيرفر:

```bash
git clone <رابط-المستودع> dhahran-app
cd dhahran-app
```

### الطريقة ب: رفع أرشيف أو استخدام SCP/SFTP

من جهازك المحلي:

```bash
# إنشاء أرشيف (بدون node_modules و .env)
cd /path/to/dhahran-app
tar --exclude='node_modules' --exclude='.env' --exclude='.next' -czvf dhahran-app.tar.gz .

# رفع الملفات للسيرفر (غيّر user و host)
scp dhahran-app.tar.gz user@your-server-ip:/home/user/
```

على السيرفر:

```bash
mkdir -p dhahran-app && cd dhahran-app
tar -xzvf ../dhahran-app.tar.gz
```

---

## 2) تثبيت المتطلبات والبناء

على السيرفر داخل مجلد المشروع:

```bash
cd dhahran-app   # أو المسار الذي رفعت فيه المشروع

# تثبيت الحزم
npm install --production=false

# توليد عميل Prisma
npm run db:generate

# بناء التطبيق (Next.js)
npm run build
```

إذا ظهرت أخطاء في `npm run build` تأكد من وجود جميع متغيرات البيئة (انظر الخطوة 3).

---

## 3) ملف البيئة (.env) على السيرفر

أنشئ ملف `.env` في نفس مجلد المشروع:

```bash
nano .env
```

أضف على الأقل (عدّل القيم حسب سيرفرك وقاعدة البيانات):

```env
# رابط اتصال PostgreSQL على السيرفر
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/dhahran_db?schema=public"
```

احفظ الملف (في nano: `Ctrl+O` ثم `Enter` ثم `Ctrl+X`).

**مهم:** لا ترفع ملف `.env` إلى Git ولا تشاركه؛ أنشئه يدوياً على السيرفر فقط.

---

## 4) قاعدة البيانات

تأكد أن PostgreSQL يعمل وأنك أنشأت قاعدة البيانات. ثم نفّذ الهجرات:

```bash
# إنشاء الجداول وتطبيق الهجرات
npm run db:migrate
# أو إذا كنت تستخدم db push فقط:
# npm run db:push

# (اختياري) تشغيل البذور إذا كان عندك seed
# npm run db:seed
```

---

## 5) تشغيل التطبيق

### تشغيل مؤقت (للتجربة)

```bash
# التشغيل على المنفذ 3000
npm run start

# أو على منفذ معيّن
PORT=3001 npm run start
```

افتح في المتصفح: `http://عنوان-السيرفر:3000`

### تشغيل دائم باستخدام PM2 (مُوصى به)

1. تثبيت PM2 عالمياً:

```bash
npm install -g pm2
```

2. تشغيل التطبيق بملف الإعداد الجاهز:

```bash
pm2 start ecosystem.config.cjs
```

3. أوامر مفيدة:

```bash
pm2 status          # حالة التطبيق
pm2 logs            # عرض السجلات
pm2 restart all     # إعادة تشغيل
pm2 save            # حفظ القائمة
pm2 startup         # تشغيل تلقائي عند إعادة تشغيل السيرفر
```

---

## 6) وضع Nginx كـ Reverse Proxy (اختياري)

إذا أردت أن يعمل الموقع على المنفذ 80 أو 443 مع دومين:

1. ثبّت Nginx على السيرفر.
2. أنشئ ملف إعداد، مثلاً:

`/etc/nginx/sites-available/dhahran-team`:

```nginx
server {
    listen 80;
    server_name your-domain.com;   # غيّر إلى دومينك

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

3. تفعيل الموقع وإعادة تحميل Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/dhahran-team /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

لتفعيل HTTPS يمكن لاحقاً إضافة شهادة (مثلاً Let's Encrypt مع `certbot`).

---

## 7) تحديث الموقع بعد تعديلات جديدة

```bash
cd dhahran-app
git pull   # إذا كنت تستخدم Git
# أو ارفع الملفات الجديدة بنفس الطريقة التي استخدمتها أول مرة

npm install
npm run db:generate
npm run build
pm2 restart all
```

---

## ملخص أوامر سريع (بعد أول إعداد)

```bash
cd dhahran-app
npm install && npm run db:generate && npm run build
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

---

## استكشاف الأخطاء: P1000 (فشل مصادقة PostgreSQL)

إذا ظهر: **P1000: Authentication failed... the provided database credentials for USER are not valid**:

1. **التأكد من تشغيل PostgreSQL**
   ```bash
   sudo systemctl status postgresql
   ```

2. **إنشاء مستخدم وقاعدة بيانات (إن لم تكونا موجودتين)**
   ```bash
   sudo -u postgres psql -c "\du"                    # عرض المستخدمين
   sudo -u postgres psql -c "\l"                     # عرض قواعد البيانات
   sudo -u postgres createuser -P deploy              # إنشاء مستخدم deploy بكلمة مرور
   sudo -u postgres createdb -O deploy dhahran_db    # إنشاء قاعدة dhahran_db للمستخدم deploy
   ```

3. **السماح للمستخدم بالاتصال (pg_hba)**
   تأكد أن في ملف `pg_hba.conf` (مثلاً `/etc/postgresql/14/main/pg_hba.conf`) يوجد سطر للاتصال المحلي:
   ```text
   local   all   deploy   md5
   host    all   deploy   127.0.0.1/32   md5
   ```
   ثم إعادة تحميل الخدمة:
   ```bash
   sudo systemctl reload postgresql
   ```

4. **تعديل `.env` على السيرفر**
   استخدم نفس اسم المستخدم وكلمة المرور التي أنشأتها:
   ```env
   DATABASE_URL="postgresql://deploy:YOUR_PASSWORD@localhost:5432/dhahran_db?schema=public"
   ```

5. **اختبار الاتصال**
   ```bash
   cd /var/www/team-monitor
   npx prisma db pull
   # أو
   npx prisma migrate deploy
   ```

إذا واجهت خطأ معيّن (بناء، قاعدة بيانات، أو PM2) اذكر رسالة الخطأ وسأوضح لك الحل خطوة بخطوة.

---

## التحقق من قاعدة البيانات: المهام والإجازات

إذا **لا تظهر المهام** أو **لا تظهر الإجازات** في التطبيق:

### 1) عدّات الجداول

من مجلد المشروع:

```bash
npm run db:check
```

يُظهر عدد السجلات في: Task (النشطة)، Leave، TaskPlan، TaskSchedule. إن كانت الأعداد 0 فالجداول فارغة.

### 2) لماذا لا أرى المهام؟

- **Task:** يجب أن يكون هناك مهام نشطة (من صفحة **Task Setup**).
- **TaskPlan:** كل مهمة تحتاج خطة (أساسي + احتياط 1 + احتياط 2) من نفس الصفحة.
- **TaskSchedule:** كل مهمة تحتاج جدولة (مثلاً يومي DAILY أو أسبوعي WEEKLY).
- **"مهامي اليوم":** تظهر فقط إذا كنت معيّناً (أساسي أو احتياط) لمهمة تُجرى اليوم ولم تكن إجازة/يوم راحة.

### 3) لماذا لا أرى الإجازات؟

- **Leave:** يجب إدخال إجازات من صفحة **Leaves** (إضافة إجازة).
- الصلاحيات: تم السماح للمدير **ومساعد المدير** والأدمن بعرض وإضافة الإجازات؛ إن كنت مساعد مدير وكانت الصفحة فارغة سابقاً فجرّب بعد التحديث.

### 4) فتح البيانات يدوياً (Prisma Studio)

```bash
npx prisma studio
```

تفتح واجهة في المتصفح لتصفح جداول **Task**، **Leave**، **TaskPlan**، **TaskSchedule** والتأكد من وجود سجلات.

---

## تنفيذ الصلاحيات (أدمن / مدير / مساعد مدير) — خطواتك بالترتيب

الصلاحيات مُبرمجة في الكود، لكن **يجب تطبيق هجرة قاعدة البيانات** و**إعادة تشغيل التطبيق** حتى تعمل. اتبع التالي:

### المسار الصحيح في المشروع

| الملف | الوظيفة |
|--------|----------|
| `lib/rbac/schedulePermissions.ts` | تحديد من يعدّل الجدول (`canEditSchedule`) ومن يوافق على الأسبوع (`canApproveWeek`) |
| `app/(dashboard)/layout.tsx` | يقرأ المستخدم من قاعدة البيانات ويمرّر الصلاحيات للشريط الجانبي |
| `components/nav/Sidebar.tsx` و `MobileTopBar.tsx` | يعرضان روابط "تعديل الجدول" و"الموافقات" حسب الصلاحيات |
| `prisma/migrations/20260214130000_allow_assistant_manager_schedule_edit_default/migration.sql` | يضع `canEditSchedule = true` لجميع مستخدمي دور مساعد المدير في قاعدة البيانات |

إذا لم تُطبَّق هذه الهجرة، يبقى مساعدو المدير في قاعدة البيانات بقيمة `canEditSchedule = false` ولا يظهر لهم "تعديل الجدول".

**التحقق من حالة الهجرات:** من مجلد المشروع نفّذ:
```bash
npx prisma migrate status
```
إذا ظهر أن هجرة `20260214130000_allow_assistant_manager_schedule_edit_default` لم تُطبَّق بعد، نفّذ:
```bash
npx prisma migrate deploy
```

---

### خطوات تنفذها بنفسك

#### أ) تجربة محلياً (على جهازك)

1. من مجلد المشروع:
   ```bash
   cd /path/to/dhahran-app
   npx prisma migrate deploy
   ```
   تأكد أن الطرفية تظهر أن الهجرة `20260214130000_allow_assistant_manager_schedule_edit_default` تم تطبيقها (أو أن قاعدة البيانات محدّثة).

2. إعادة تشغيل التطبيق:
   ```bash
   npm run dev
   ```
   (أو أوقف السيرفر ثم شغّله من جديد إن كنت تستخدم `npm run start`.)

3. تسجيل الدخول بمستخدم له دور **مساعد مدير (ASSISTANT_MANAGER)** وتحقّق:
   - يظهر في الشريط الجانبي: **عرض الجدول** و **تعديل الجدول**.
   - لا يظهر: **الموافقات** و **سجل تعديلات الجدول** (هذه للمدير والأدمن فقط).

4. (اختياري) التحقق من الـ API:
   - بعد تسجيل الدخول افتح: `http://localhost:3000/api/auth/session`
   - يجب أن ترى شيئاً مثل: `"canEditSchedule": true` و `"canApproveWeek": false` لمساعد المدير.

#### ب) على السيرفر (بعد التأكد محلياً)

1. رفع التعديلات (إن لم تكن مرفوعة):
   ```bash
   git add .
   git commit -m "صلاحيات أدمن/مدير/مساعد مدير"
   git push
   ```

2. على السيرفر من مجلد المشروع (مثلاً `/var/www/team-monitor`):
   ```bash
   git pull
   npm install
   npm run build
   npx prisma generate
   npx prisma migrate deploy
   pm2 restart all
   ```
   أو تشغيل سكربت النشر إن وُجد: `./scripts/deploy-server.sh`

3. بعد النشر: حدّث الصفحة بقوة (`Ctrl+Shift+R`) أو سجّل خروجاً ثم دخولاً، ثم تحقق من القائمة و/أو من `https://موقعك/api/auth/session`.

---

### ماذا تتوقع حسب الدور

| الدور | تعديل الجدول | الموافقة على الأسبوع | سجل تعديلات الجدول / الموافقات |
|--------|----------------|------------------------|----------------------------------|
| **أدمن (ADMIN)** | نعم | نعم | نعم |
| **مدير (MANAGER)** | نعم | نعم | نعم (الموافقات وسجل التعديلات) |
| **مساعد مدير (ASSISTANT_MANAGER)** | نعم (إلا إذا سحبه الأدمن) | لا | لا |

إذا نفّذت الخطوات وما زالت الصلاحيات لا تظهر، راجع قسم "لا أرى التحديثات في الموقع" أدناه.

---

## لا أرى التحديثات في الموقع

إذا رفعت تعديلات جديدة (مثلاً صلاحيات الأدمن/المدير/مساعد المدير) ولا تظهر في الموقع:

1. **التأكد من وصول التعديلات للسيرفر**
   - إذا تستخدم Git: على السيرفر نفّذ `git pull` من داخل مجلد المشروع.
   - إذا ترفع ملفات يدوياً: تأكد أن الملفات المعدّلة (مثل `lib/rbac/schedulePermissions.ts` ومجلد `prisma/migrations`) موجودة على السيرفر.

2. **تشغيل النشر من جديد**
   - من مجلد المشروع على السيرفر (مثلاً `/var/www/team-monitor`):
   ```bash
   npm install
   npm run build
   npx prisma generate
   npx prisma migrate deploy
   pm2 restart all
   ```
   أو تشغيل سكربت النشر إن وُجد: `./scripts/deploy-server.sh`

3. **تحديث قاعدة البيانات (الهجرات)**
   - التحديثات التي تغيّر الصلاحيات قد تحتاج هجرة جديدة. تأكد أنك نفّذت:
   ```bash
   npx prisma migrate deploy
   ```
   حتى تُطبَّق كل الهجرات المعلّقة (مثل `20260214130000_allow_assistant_manager_schedule_edit_default`).

4. **تحديث الصفحة والمتصفح**
   - حدّث الصفحة بقوة: `Ctrl+Shift+R` (أو `Cmd+Shift+R` على Mac).
   - أو جرّب نافذة خاصة أو متصفح آخر لاستبعاد الكاش.

5. **التحقق من الصلاحيات**
   - بعد تسجيل الدخول افتح في المتصفح:  
     `https://موقعك/api/auth/session`  
   - يجب أن ترى شيئاً مثل: `canEditSchedule: true/false` و `canApproveWeek: true/false` حسب دورك. إن كانت القيم قديمة، سجّل خروجاً ثم دخولاً من جديد وجرّب مرة أخرى.
