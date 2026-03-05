# دليل مكونات الواجهة — UI Components Guide

**التاريخ:** 2026-02-26  
**الغرض:** توضيح متى يُستخدم كل مكون وتقليل التكرار والالتباس.

---

## 1. الجداول (Tables)

### المكون الموحد: `DataTable`

| المكون | الموقع | الاستخدام المفضل |
|--------|--------|------------------|
| **DataTable** | `components/ui/DataTable.tsx` | المصدر الموحد. استخدم `variant="admin"` أو `variant="luxury"` حسب الحاجة. |
| **AdminDataTable** | `components/admin/AdminDataTable.tsx` | جداول إدارية: قوائم، أعضاء، إجازات، إلخ. **يُقتطع** النص الطويل. |
| **LuxuryTable** | `components/ui/LuxuryTable.tsx` | جداول عامة: الجدولة، المستخدمين، المهام. استخدم `noScroll` عند الحاجة لملاءمة الحاوية. |
| **Table** | `components/ui/Table.tsx` | جدول بيانات (columns + data) مع CSS vars. للاستخدام العام. |
| **ExecTable** | `components/dashboard-ui/ExecTable.tsx` | لوحة Executive: أسلوب slate، بدون إطار. |
| **ExecSimpleTable** | `components/dashboard-ui/ExecSimpleTable.tsx` | Executive: header + children (صفوف مخصصة). |
| **MiniTable** | `components/ui/MiniTable.tsx` | جدول بيانات مصغّر. |

**اختيار سريع:**
- **قائمة إدارية** (موظفون، إجازات، إعدادات) → `AdminDataTable`
- **جدول تفاعلي** (جدولة، مهام) → `LuxuryTable` (مع `noScroll` عند الحاجة)
- **بيانات مع أعمدة ثابتة** → `Table` أو `ExecTable`
- **صفوف مخصصة** → `ExecSimpleTable`

---

## 2. البطاقات والألواح (Cards & Panels)

### البطاقات

| المكون | الموقع | الاستخدام المفضل |
|--------|--------|------------------|
| **OpsCard** | `components/ui/OpsCard.tsx` | **بطاقات قابلة للنقر** (لوحة الاستيراد، لوحة الإدارة). عنوان + وصف. |
| **Card** | `components/ui/Card.tsx` | حاوية عامة: `var(--surface)`, `var(--border)`. |
| **CardShell** | `components/ui/CardShell.tsx` | **ثيم Luxury:** 12px radius، ظل خفيف، padding واسع. للعرض الهرمي. |

### الألواح

| المكون | الموقع | الاستخدام المفضل |
|--------|--------|------------------|
| **Panel** | `components/ui/Panel.tsx` | لوحة بعنوان + actions اختيارية. يستخدم CSS vars. |
| **PanelCard** | `components/ui/PanelCard.tsx` | لوحة بعنوان ثابت. أسلوب slate. |
| **ExecPanel** | `components/dashboard-ui/ExecPanel.tsx` | لوحة للوحة Executive. |

**اختيار سريع:**
- **قائمة روابط/بطاقات** (Import Dashboard، Administration) → `OpsCard`
- **محتوى داخل صفحة** → `Card` أو `CardShell`
- **قسم بعنوان وأزرار** → `Panel` أو `PanelCard`

---

## 3. بطاقات KPI

| المكون | الموقع | الاستخدام المفضل |
|--------|--------|------------------|
| **KpiCard** | `components/ui/KpiCard.tsx` | **مقياس واحد** مع label, value, note, delta, status. |
| **ExecKpiBlock** | `components/dashboard-ui/ExecKpiBlock.tsx` | **Executive:** actual vs target, variance, status badge, bullet. |
| **KPIBlock** | `components/ui/KPIBlock.tsx` | **ثيم Luxury:** مقياس واحد مع `highlight` (ذهبي) للمقاييس المهمة. |
| **ExecKpiCard** | `components/dashboard-ui/ExecKpiCard.tsx` | بطاقة Executive بمستوى (tone). |

**اختيار سريع:**
- **لوحة Executive** (actual/target/variance) → `ExecKpiBlock`
- **مقياس بسيط** → `KpiCard` أو `KPIBlock`
- **تأكيد بصري** → `KPIBlock` مع `highlight={true}`

---

## 4. عناوين الأقسام

| المكون | الموقع | الاستخدام |
|--------|--------|-----------|
| **SectionHeader** | `components/ui/SectionHeader.tsx` | عنوان + subtitle + rightSlot (أزرار). يستخدم `var(--primary)` و `var(--muted)`. |

---

## 5. أزرار وحقول

| المكون | الموقع | الاستخدام |
|--------|--------|-----------|
| **Button** | `components/ui/Button.tsx` | أزرار موحدة. |
| **Input** | `components/ui/Input.tsx` | حقول إدخال. |
| **Badge** | `components/ui/Badge.tsx` | شارات. |

---

## 6. مخطط التبعيات (اختيار سريع)

```
محتوى جديد؟
├── قائمة/جدول بيانات
│   ├── إداري (تقطيع) → AdminDataTable
│   ├── تفاعلي (جدولة، مهام) → LuxuryTable
│   └── عرض بسيط → Table
├── بطاقة/لوحة
│   ├── للنقر (رابط) → OpsCard
│   ├── عرض ثيم Luxury → CardShell
│   └── قسم بعنوان → Panel أو PanelCard
├── مقياس KPI
│   ├── Executive (actual/target) → ExecKpiBlock
│   └── بسيط → KpiCard أو KPIBlock
└── عنوان قسم → SectionHeader
```

---

## 7. التوصيات

1. **مكونات جديدة:** استخدم `DataTable` مع `variant` بدلاً من إنشاء جداول جديدة.
2. **البطاقات:** `OpsCard` للروابط، `CardShell` للعرض.
3. **KPI:** `ExecKpiBlock` للوحة Executive، `KpiCard` أو `KPIBlock` للباقي.
4. **التوحيد التدريجي:** `ExecTable` و `ExecSimpleTable` يمكن دمجهما لاحقاً في `DataTable` مع `variant="exec"`.

---

*تم إعداد هذا الدليل بناءً على تحليل مكونات المشروع وتقرير التنظيم `docs/PROJECT_ORGANIZATION_REPORT.md`.*
