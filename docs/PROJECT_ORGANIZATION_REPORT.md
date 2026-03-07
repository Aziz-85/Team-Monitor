# تقرير تنظيم المشروع — Dhahran Team Monitor

**التاريخ:** 2026-02-26  
**النطاق:** تحليل شامل، إعادة هيكلة، وتوثيق وفق أفضل الممارسات العالمية.

---

## 1. تحليل محتوى المشروع

### 1.1 نظرة عامة على الهيكل الحالي

| المجموعة | المفتاح | عدد الصفحات | الوصف |
|----------|---------|-------------|-------|
| **OPERATIONS** | العمليات | ~18 | لوحة التحكم، الجدولة، المهام، المخزون، المبيعات اليومية |
| **PERFORMANCE** | الأداء | ~12 | Executive، الأهداف، KPI، ملخص المبيعات، المرتجعات |
| **HR_AND_TEAM** | الموارد البشرية | ~8 | الموظفون، الإجازات، التفويض، الصلاحيات |
| **SYSTEM** | النظام | ~20 | الإدارة، البوتيكات، الاستيراد، التصدير |
| **HELP** | المساعدة | 1 | حول التطبيق |

**إجمالي الصفحات:** ~81 صفحة (بما فيها الصفحات الديناميكية والتفاصيل).

---

### 1.2 التكرار والمواضيع المتكررة المكتشفة

#### أ) مسارات مُوجّهة (Redirects) — تكرار وظيفي

| المسار القديم/البديل | المسار المستهدف | الحالة |
|---------------------|-----------------|--------|
| `/admin/import/month-snapshot` | `/admin/import/monthly-snapshot` | ✓ موجود للتوافق العكسي |
| `/admin/administration/users` | `/admin/users` | ✓ موجود |
| `/sales/import` | `/admin/import/sales?section=import` | ✓ موحّد |
| `/sales/import-matrix` | `/admin/import/sales?section=matrix` | ✓ موحّد |
| `/sales/monthly-matrix` | `/admin/import/sales?section=monthly` | ✓ موحّد |
| `/sales/import-issues` | `/admin/import/sales?section=issues` | ✓ موحّد |
| `/admin/import/issues` | `/sales/import-issues` → ثم إلى `admin/import/sales?section=issues` | ⚠️ سلسلة غير ضرورية |

**التوصية:** تبسيط `/admin/import/issues` ليعيد التوجيه مباشرةً إلى `/admin/import/sales?section=issues`.

---

#### ب) مكونات واجهة المستخدم المتشابهة

| الفئة | المكونات | التكرار | التوصية |
|-------|----------|---------|----------|
| **الجداول** | `Table`, `ExecTable`, `MiniTable`, `AdminDataTable`, `LuxuryTable`, `ExecSimpleTable` | 6 مكونات ذات وظائف متقاربة | توحيد تدريجي عبر `Table` مع variants (مثل `variant="exec"`, `variant="admin"`) |
| **بطاقات KPI** | `KpiCard`, `ExecKpiBlock`, `KPIBlock` | 3 مكونات | الإبقاء على `ExecKpiBlock` و`KpiCard` كمرجعين رئيسيين؛ توثيق الفروقات والاستخدام |
| **البطاقات/الألواح** | `Card`, `Panel`, `PanelCard`, `CardShell`, `ExecPanel`, `OpsCard` | 6 مكونات | الإبقاء على `OpsCard` للبطاقات القابلة للنقر، و`CardShell` للعرض؛ توثيق الاستخدام |

---

#### ج) محرري الجدولة المزدوجين

| المسار | الوصف | الاستخدام |
|--------|-------|-----------|
| `/schedule/edit` | محرر Excel (شبكة أسبوعية) | `ScheduleEditClient` |
| `/schedule/editor` | محرر يومي | `ScheduleEditorClient` |

**الحالة:** كلاهما مطلوب؛ يخدمان سيناريوهات مختلفة (تعديل أسبوعي vs يومي). لا دمج مطلوب.

---

### 1.3 هيكل الاستيراد (Import)

```
/admin/import                    ← لوحة مركزية (AdminImportClient)
├── /sales                       ← تبويبات: import, matrix, monthly, ledger, issues
├── /monthly-snapshot            ← رفع لقطة شهرية (MonthSnapshotUploadClient)
├── /historical                  ← استيراد تاريخي
├── /issues                      ← يعيد التوجيه إلى sales?section=issues
└── /monthly-matrix              ← رفع مصفوفة شهرية
```

**ملاحظة:** مجلد `month-snapshot` يحتوي على `MonthSnapshotUploadClient` الذي تستورده صفحة `monthly-snapshot`. التسمية غير متسقة؛ يُفضّل نقل المكون إلى مجلد `monthly-snapshot` لاحقاً.

---

## 2. إعادة هيكلة المحتوى

### 2.1 التعديلات المُنفّذة (آمنة، قابلة للتطبيق فوراً)

| التعديل | الملف | السبب |
|---------|-------|-------|
| تبسيط إعادة التوجيه | `app/(dashboard)/admin/import/issues/page.tsx` | إزالة السلسلة غير الضرورية `issues → sales/import-issues → sales?section=issues` |

### 2.2 التعديلات المقترحة (للمراجعة لاحقاً)

| التعديل | الأولوية | الفائدة |
|---------|----------|---------|
| نقل `MonthSnapshotUploadClient` من `month-snapshot/` إلى `monthly-snapshot/` | منخفضة | توحيد التسمية وتقليل الالتباس |
| توحيد مكونات الجدول في `Table` مع variants | متوسطة | تقليل التكرار وتحسين الصيانة |
| دمج `ExecKpiBlock` و`KPIBlock` في مكون واحد مع props | منخفضة | تقليل ازدواجية الكود |

---

## 3. الهيكل التنظيمي الكامل

### 3.1 التسلسل الإداري والوظيفي

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Dhahran Team Monitor                                 │
│                         (Next.js 14 + Prisma)                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
        ▼                             ▼                             ▼
┌───────────────┐           ┌───────────────┐           ┌───────────────┐
│  OPERATIONS   │           │  PERFORMANCE  │           │ HR_AND_TEAM   │
│   العمليات    │           │    الأداء     │           │  الموارد البشرية │
└───────┬───────┘           └───────┬───────┘           └───────┬───────┘
        │                           │                           │
        ├─ Dashboard                ├─ Executive                ├─ Employees
        ├─ Schedule (view/edit)      ├─ Targets                  ├─ Leaves
        ├─ Tasks                    ├─ KPI Upload               ├─ Delegation
        ├─ Inventory                ├─ Sales Summary            └─ Access
        ├─ Approvals                ├─ Returns
        └─ Daily Sales              └─ My Target
                │
                ▼
        ┌───────────────┐
        │    SYSTEM     │
        │    النظام     │
        └───────┬───────┘
                │
                ├─ Administration (users, audit, settings, version)
                ├─ Boutiques, Regions, Groups
                ├─ Import Hub (sales, snapshot, historical, matrix)
                └─ Planner Export / Sync
```

### 3.2 مصفوفة الصلاحيات (RBAC) — ملخص

| الدور | العمليات | الأداء | الموارد البشرية | النظام |
|-------|----------|--------|-----------------|--------|
| EMPLOYEE | محدود (مهام، مبيعاتي) | My Target | My Leaves | — |
| ASSISTANT_MANAGER | أوسع | Sales Summary, Returns | My Leaves | — |
| MANAGER | كامل | كامل | Leaves, Delegation | Import, Export |
| ADMIN | كامل | كامل | كامل | كامل |
| SUPER_ADMIN | كامل | كامل | كامل | كامل |
| DEMO_VIEWER | عرض فقط | عرض فقط | — | — |

---

## 4. التوازن بين التنظيم والمرونة

### 4.1 المبادئ المطبقة

1. **عدم الإطاحة بالنظام القائم:** التعديلات additive؛ لا حذف مسارات أو مكونات أساسية.
2. **التوافق العكسي:** المسارات القديمة (`/sales/import`, `/admin/administration/users`) تُحافظ على إعادة التوجيه.
3. **مصدر واحد للحقيقة:** `lib/navConfig.ts` يحدد التنقل؛ `getNavGroupsForUser` يطبق RBAC.
4. **التوثيق أولاً:** أي تغيير هيكلي يُوثَّق قبل التنفيذ.

### 4.2 حدود المعقول

- **لا دمج لمحرري الجدولة:** `/schedule/edit` و`/schedule/editor` يخدمان أغراضاً مختلفة.
- **لا حذف مكونات UI قديمة:** الإبقاء عليها مع توثيق الاستخدام المفضل.
- **لا تغيير في API:** مسارات الـ API تبقى كما هي ما لم يُتفق على خطة ترحيل.

---

## 5. توثيق التعديلات

### 5.1 التعديل المُنفّذ في هذه الجلسة

| الملف | التغيير | السبب | الفائدة |
|-------|---------|-------|---------|
| `app/(dashboard)/admin/import/issues/page.tsx` | `redirect('/sales/import-issues')` → `redirect('/admin/import/sales?section=issues')` | إزالة سلسلة إعادة التوجيه غير الضرورية | تبسيط التدفق، تقليل الارتداد بين الصفحات |

### 5.2 الفوائد المتوقعة

| الفئة | الفائدة |
|-------|---------|
| **تجربة المستخدم** | وصول أسرع إلى صفحة Issues دون توجيه وسيط |
| **الصيانة** | مسار واحد واضح لصفحة استيراد المبيعات |
| **الاتساق** | توحيد نقطة الدخول لجميع تبويبات الاستيراد تحت `/admin/import/sales` |

---

## 6. خريطة الملفات المرجعية

### 6.1 الملفات الرئيسية للتنظيم

| الغرض | الملف |
|-------|-------|
| التنقل | `lib/navConfig.ts` |
| الصلاحيات | `lib/permissions.ts`, `lib/rbac/effectiveAccess.ts` |
| التخطيط الرئيسي | `app/(dashboard)/layout.tsx` |
| لوحة الاستيراد | `app/(dashboard)/admin/import/AdminImportClient.tsx` |
| لوحة الإدارة | `app/(dashboard)/admin/administration/AdminAdministrationClient.tsx` |

### 6.2 التقارير ذات الصلة

| التقرير | الوصف |
|---------|-------|
| `docs/NAV_DEMO_THEME_REPORT.md` | التنقل، وضع العرض التجريبي، الثيم |
| `docs/SCOPE_AUDIT.md` | نطاق الصلاحيات والـ SSOT |
| `docs/audit/routes_pages.json` | مسارات الصفحات |
| `docs/audit/nav_map.json` | خريطة التنقل والصلاحيات |

---

## 7. التوصيات المستقبلية

1. ~~**توحيد مكونات الجدول:**~~ ✅ **تم تنفيذه** — `components/ui/DataTable.tsx` موحد؛ `AdminDataTable` و`LuxuryTable` يستخدمانه.
2. ~~**توحيد مجلد month-snapshot:**~~ ✅ **تم تنفيذه** — `MonthSnapshotUploadClient` نُقل إلى `monthly-snapshot/`؛ مجلد `month-snapshot` يُبقي فقط على صفحة إعادة التوجيه للتوافق العكسي.
3. ~~**توثيق مكونات UI:**~~ ✅ **تم تنفيذه** — `docs/UI_COMPONENTS_GUIDE.md`.
4. **مراجعة دورية:** إجراء مراجعة ربع سنوية للتنظيم والتكرار بناءً على هذا التقرير.

---

## 8. تنظيف الملفات غير المستخدمة (تنفيذ لاحق)

تم حذف المكونات التالية لعدم استخدامها في أي صفحة أو واجهة:
- `components/ui/Table.tsx` — جدول بيانات (استُبدل بالاعتماد على DataTable / AdminDataTable / LuxuryTable)
- `components/ui/MiniTable.tsx` — جدول مصغّر غير مستخدم
- `components/nav/DesktopNav.tsx` — تنقل سطح المكتب غير مستخدم (الواجهة تستخدم Sidebar)
- `components/dashboard-ui/ExecCard.tsx` — غير مستخدم
- `components/dashboard-ui/ExecGauge.tsx` — غير مستخدم
- `components/dashboard-ui/ExecKpiCard.tsx` — غير مستخدم
- `components/ui/ExecutivePanel.tsx` — غير مستخدم
- `components/ui/WarningCard.tsx` — غير مستخدم
- `components/scope/ScopeSelector.tsx` — غير مستخدم

تم تحديث `docs/UI_COMPONENTS_GUIDE.md` و `docs/NAV_DEMO_THEME_REPORT.md` لتعكس الحذف.

---

*تم إعداد هذا التقرير بناءً على تحليل شامل للمشروع وتطبيق معايير التنظيم المؤسسي.*
