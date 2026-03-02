# ملاحظات النشر و PM2 — Team Monitor

## أخطاء شائعة في السجلات وحلولها

### 1. `Failed to find Server Action "x"`

**السبب:** المتصفح يستخدم نسخة قديمة من التطبيق (JS/HTML مخزنة في الكاش) بينما السيرفر يعمل بنسخة جديدة بعد النشر. طلب الـ Server Action يأتي بمعرّف قديم أو تالف فيظهر كـ `"x"`.

**الحل:**
- **بعد كل نشر:** إعادة تشغيل التطبيق بالكامل حتى تُحمّل كل العمليات البناء الجديد:
  ```bash
  cd /var/www/team-monitor
  pm2 restart team-monitor
  ```
- **للمستخدمين:** تحديث الصفحة (F5 أو Ctrl+Shift+R) بعد النشر إن استمروا برؤية أخطاء.
- لا يوجد Server Actions مخصصة في المشروع؛ الخطأ عادة من كاش المتصفح أو طلبات قديمة.

---

### 2. `Invalid prisma.session.delete() … Record to delete does not exist`

**السبب:** استدعاء `session.delete()` عندما السجل محذوف مسبقاً (مثلاً انتهت الجلسة وحُذفت من مكان آخر أو طلب متزامن).

**الحل (مُطبّق في الكود):** تم استبدال `prisma.session.delete()` بـ `prisma.session.deleteMany()` في `lib/auth.ts` حتى لا يرمي الخطأ إن لم يُوجد السجل. بعد نشر آخر نسخة من الكود وإعادة تشغيل PM2، هذا الخطأ لا يظهر من هذا السبب.

---

## إذا لم تُحفظ المبيعات على السيرفر (Daily Sales)

إذا كانت المبيعات تُدخل محلياً ولا تظهر على السيرفر (دون رسالة خطأ واضحة)، تم إضافة عرض رسائل الخطأ في صفحة **Daily Sales Ledger**:

- **خطأ التحميل (أحمر):** يظهر عند فشل `GET /api/sales/daily`، مثلاً:
  - `Unauthorized` — الجلسة منتهية أو الكوكي غير مرسلة (تحقق من الدومين/HTTPS/SameSite).
  - `No operational boutique available` — المستخدم غير مرتبط ببوتيك (حقل `boutiqueId` في الجلسة فارغ).
- **خطأ الحفظ/الإضافة/القفل (أصفر، مع زر Dismiss):** يظهر عند فشل Save أو Add أو Lock، مثلاً:
  - `Demo mode: read-only. This action is not allowed.` — الحساب من نوع DEMO_VIEWER؛ لا يُسمح بالتعديل على السيرفر.
  - `Forbidden` — الدور ليس ADMIN أو MANAGER.
  - `You do not have permission to manage sales for this boutique` — المستخدم لا يملك صلاحية إدارة المبيعات لهذا البوتيك.
  - `Boutique not in your operational scope` — البوتيك المطلوب خارج النطاق التشغيلي للمستخدم.

**حل رسالة "You do not have permission to manage sales for this boutique":**  
الصلاحية تتحكم بها **عضويات البوتيك** (UserBoutiqueMembership). للمدير (MANAGER) يجب تفعيل علم **Sales** للبوتيك المعروض في النطاق (مثلاً AlRashid S02).

1. دخول حساب **ADMIN** (أو SUPER_ADMIN) على السيرفر.
2. من القائمة: **Admin** → **Memberships** (أو **Administration** → **Access** الذي يحوّل إلى نفس الصفحة).
3. البحث عن العضوية الخاصة بالمستخدم المعني + البوتيك (مثلاً AlRashid S02).
4. الضغط **Edit** ثم تفعيل خيار **Sales** (canManageSales) ثم **Save**.

إن لم توجد عضوية للمستخدم مع هذا البوتيك، من نفس الصفحة يمكن **Add** عضوية جديدة واختيار المستخدم والبوتيك وتفعيل **canAccess** و **Sales** (والصلاحيات الأخرى إن لزم).

**ما الذي تتحقق منه على السيرفر:**
1. أن المستخدم ليس DEMO_VIEWER إذا كان يجب عليه إدخال المبيعات.
2. أن للمستخدم دور ADMIN أو MANAGER وأنه مرتبط بالبوتيك الصحيح (في الجلسة/قاعدة البيانات).
3. إن ظهر `No operational boutique` — ربط المستخدم ببوتيك من لوحة الإدارة أو إدخال البوتيك عبر `?b=` أو `X-Boutique-Code` لـ SUPER_ADMIN.

---

## خطوات النشر الموصى بها

```bash
cd /var/www/team-monitor
git pull origin main
npm ci
npm run build
pm2 restart team-monitor
```

بعد النشر، مراقبة السجلات:

```bash
pm2 logs team-monitor --lines 50
```
