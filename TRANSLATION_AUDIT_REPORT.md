# Bilingual (EN/AR) Translation Audit Report

**Scope:** `messages/en.json`, `messages/ar.json`, and all `t('...')` usage across the codebase.  
**Date:** 2025-02-14.

---

## A) Structural Mismatch Report

### Key counts
- **EN total keys (deep):** 946  
- **AR total keys (deep):** 946  
- **Missing in AR:** 0 (all EN keys exist in AR)  
- **Missing in EN:** 0 (no orphan keys in AR)

### Keys used in code but NOT defined in EN/AR
These keys are referenced in the app (e.g. `SalesAnalyticsSection.tsx`) but have **no entry** in either translation file. The UI will show the raw key or fallback.

| Key | Used in |
|-----|--------|
| `dashboard.sales.sectionTitle` | `components/dashboard/analytics/sections/SalesAnalyticsSection.tsx` |
| `dashboard.sales.target` | Same |
| `dashboard.sales.actual` | Same |
| `dashboard.sales.completionPct` | Same |
| `dashboard.sales.gap` | Same |
| `dashboard.sales.trend` | Same |
| `dashboard.sales.distributionByRole` | Same |
| `dashboard.sales.distributionByEmployee` | Same |
| `dashboard.sales.top5` | Same |
| `dashboard.sales.bottom5` | Same |
| `dashboard.sales.volatilityIndex` | Same |
| `dashboard.sales.na` | Same |

**Action:** Add a `dashboard.sales` subtree to both `en.json` and `ar.json`. Example (place under a top-level `"dashboard": { "sales": { ... } }`; ensure no conflict with existing `nav.dashboard`):

```json
"dashboard": {
  "sales": {
    "sectionTitle": "Sales",
    "target": "Target",
    "actual": "Actual",
    "completionPct": "Completion %",
    "gap": "Gap",
    "trend": "Trend",
    "distributionByRole": "Distribution by Role",
    "distributionByEmployee": "Distribution by Employee",
    "top5": "Top 5",
    "bottom5": "Bottom 5",
    "volatilityIndex": "Volatility Index",
    "na": "N/A"
  }
}
```

Arabic equivalent for `dashboard.sales`:

```json
"dashboard": {
  "sales": {
    "sectionTitle": "المبيعات",
    "target": "الهدف",
    "actual": "الفعلي",
    "completionPct": "نسبة الإنجاز",
    "gap": "الفجوة",
    "trend": "الاتجاه",
    "distributionByRole": "التوزيع حسب الدور",
    "distributionByEmployee": "التوزيع حسب الموظف",
    "top5": "أفضل 5",
    "bottom5": "أقل 5",
    "volatilityIndex": "مؤشر التقلب",
    "na": "غ.م"
  }
}
```

### Unused keys (defined but not referenced by static `t('...')`)
Many of these may be used indirectly (e.g. nav labels from config, or dynamic keys like `days.${key}`). Treat as “review” rather than delete without confirming.

- **Nav / structure:** `nav.home`, `nav.dashboard`, `nav.executive`, `nav.executiveMonthly`, `nav.executiveInsights`, `nav.executiveCompare`, `nav.executiveEmployees`, `nav.schedule`, `nav.scheduleView`, `nav.scheduleEditor`, `nav.scheduleAudit`, `nav.approvals`, `nav.tasks`, `nav.export`, `nav.leaves`, `nav.myLeaves`, `nav.inventory`, `nav.inventoryDaily`, `nav.inventoryDailyHistory`, `nav.inventoryZones`, `nav.inventoryFollowUp`, `nav.syncPlanner`, `nav.about`, `nav.employeeHome`, `nav.group.*`, `nav.admin.kpiTemplates`, `nav.admin.import`, `nav.admin.loginAudit`, `nav.kpiUpload`, `nav.targets`, `nav.myTarget`, `nav.salesEditRequests`, `nav.salesDaily`, etc.
- **Admin / auth:** `admin.cannotDeleteLastAdmin`, `auth.mustChangePassword`
- **Schedule / editor / tasks:** e.g. `schedule.editor`, `schedule.warningAmGtPm`, `schedule.onlyActiveInSchedule`, `editor.teamAOnly`, `editor.teamBOnly`, `tasks.filterToday`, `tasks.filterThisWeek`, `tasks.pending`, `tasks.range`, etc.
- **AdminEmp:** `adminEmp.teamChangeWarning`, `adminEmp.onlyAdminCanOverride`, `adminEmp.teamImbalanceManagerBlock`

**Recommendation:** Confirm how nav and other sections get their labels (e.g. from route config using these keys). If a key is never used, consider removing or documenting as reserved.

### Duplicate semantic keys
- **Branch vs Boutique:** The same concept appears under two labels:
  - EN: `targets.branchTarget` = "Branch Target", `targets.boutiqueTarget` = "Boutique Monthly Target"
  - AR: `targets.branchTarget` = "هدف الفرع", `targets.boutiqueTarget` = "هدف البوتيك الشهري"  
  So “Branch” and “Boutique” are used for the same entity; terminology should be unified (see B and E).

---

## B) Terminology Inconsistencies

Standard terms (from your glossary) vs current usage:

| Concept | Standard AR | Where it's wrong / inconsistent |
|--------|-------------|-----------------------------------|
| **Boutique** | بوتيك | AR uses **الفرع** in many places: `admin.boutiques.boutique`, `admin.filterByBoutique`, `admin.changeBoutique`, `admin.primaryBoutique`, `admin.boutiques.notFound`, `admin.boutiques.editBoutique`, `schedule.filteredByBoutiqueHint`, `schedule.boutique`, `executive.compare.boutique`, `executive.employees.boutique`, `nav.boutiqueLeaves`, `nav.boutiqueTasks`, etc. |
| **Branch Target** | هدف البوتيك | AR has **هدف الفرع** at `targets.branchTarget`. Should be **هدف البوتيك** to match glossary and avoid mixing Branch/Boutique. |
| **Sales Ledger (Daily)** | دفتر المبيعات اليومي | AR has **سجل المبيعات اليومية** at `nav.salesDaily` and `admin.boutiques.salesDailyLedger`. Prefer **دفتر المبيعات اليومي** for consistency. |
| **Scope (operational)** | نطاق التشغيل | AR has **النطاق** at `schedule.scopeLabel`. For scope selector context, **نطاق التشغيل** is clearer. |
| **Executive** | تنفيذي | AR **التنفيذي** is acceptable (with article). `nav.group.EXECUTIVE` is **تنفيذي** — OK. |
| **Remaining** | المتبقي | Used correctly in `targets.remaining`, `home.remaining`. |
| **Over allocated / Excess** | فائض / زيادة | AR has **زيادة** at `targets.excess`. Glossary allows "فائض / زيادة"; **زيادة** alone is fine; optionally add **فائض** where “over allocated” is meant. |
| **Lock / Locked** | قفل / مقفول | AR **مقفول** at `governance.locked` is good. |
| **Draft / Approved / Pending** | مسودة / معتمد / قيد الانتظار | Used correctly. |
| **Unapproved week** | أسبوع غير معتمد | EN: "Week unapproved" at `governance.weekUnapproved`. AR currently **تم إلغاء اعتماد الأسبوع** (past action). For status label use **أسبوع غير معتمد**. |

**Synonyms to unify:**
- **هدف الفرع** vs **هدف البوتيك** → use **هدف البوتيك** everywhere for “branch/boutique target”.
- **سجل المبيعات اليومية** vs **دفتر المبيعات اليومي** → use **دفتر المبيعات اليومي** for “Daily Sales Ledger”.
- **الفرع** vs **البوتيك** → where EN says “Boutique”, use **بوتيك** (or **البوتيك** with article) consistently.

---

## C) Suggested Improved Arabic Translations

Precise key → suggested value (only where change is recommended).

| Key | Current AR | Suggested AR | Note |
|-----|-------------|--------------|------|
| `admin.boutiques.boutique` | الفرع | بوتيك | Align with glossary (Boutique → بوتيك). |
| `admin.filterByBoutique` | حسب الفرع | حسب البوتيك | Same. |
| `admin.filterByBoutiqueHint` | (long text with الفرع) | Replace كل الفروع → كل البوتيكات, الفرع → البوتيك where it means boutique. | Terminology. |
| `admin.employeesEmptyByBoutique` | (text with الفرع) | Replace الفرع with البوتيك. | Same. |
| `admin.changeBoutique` | تغيير الفرع | تغيير البوتيك | Same. |
| `admin.primaryBoutique` | الفرع الأساسي | البوتيك الأساسي | Same. |
| `admin.boutiques.confirmDisable` | تعطيل هذا الفرع؟ | تعطيل هذا البوتيك؟ | Same. |
| `admin.boutiques.editBoutique` | تعديل الفرع | تعديل البوتيك | Same. |
| `admin.boutiques.notFound` | الفرع غير موجود. | البوتيك غير موجود. | Same. |
| `admin.boutiques.salesDailyLedger` | سجل المبيعات اليومية | دفتر المبيعات اليومي | Glossary. |
| `admin.boutiques.wizardStep1` | بيانات الفرع (...) | بيانات البوتيك (...) | Same. |
| `admin.boutiques.bootstrapWizard` | معالج إعداد الفرع | معالج إعداد البوتيك | Same. |
| `admin.system.defaultBoutiqueDescription` | الفرع الافتراضي... | البوتيك الافتراضي... | Same. |
| `admin.system.confirmDefaultBoutique` | تغيير الفرع الافتراضي؟ | تغيير البوتيك الافتراضي؟ | Same. |
| `nav.salesDaily` | سجل المبيعات اليومية | دفتر المبيعات اليومي | Glossary. |
| `nav.boutiqueLeaves` | طلبات إجازات الفرع | طلبات إجازات البوتيك | Unify with بوتيك. |
| `nav.boutiqueTasks` | مهام الفرع | مهام البوتيك | Same. |
| `schedule.scopeLabel` | النطاق | نطاق التشغيل | UI context (scope selector). |
| `schedule.filteredByBoutiqueHint` | (الفرع المحدد...) | (البوتيك المحدد...) | Same. |
| `schedule.boutique` | الفرع | البوتيك | Same. |
| `targets.branchTarget` | هدف الفرع | هدف البوتيك | Glossary: Branch Target → هدف البوتيك. |
| `executive.compare.boutique` | الفرع | البوتيك | Same. |
| `executive.employees.boutique` | الفرع | البوتيك | Same. |
| `targets.excess` | زيادة | فائض / زيادة (or keep زيادة) | Optional; glossary allows both. |
| `governance.weekUnapproved` | تم إلغاء اعتماد الأسبوع | أسبوع غير معتمد | Use when showing status; keep current if the string describes the action "week was unapproved". |

---

## D) Suggested English Refinements

Precise key → suggested value (tone, casing, clarity).

| Key | Current EN | Suggested EN | Note |
|-----|------------|--------------|------|
| `targets.masterTitle` | Sales Targets (Master) | Sales Targets (Master) or "Master Sales Targets" | Optional; "Master" is clear. |
| `targets.employeesTotal` | Employees Total | Manager Total (if it means manager total) or keep as is | Glossary has "Manager total → إجمالي المدير"; confirm meaning. |
| `governance.weekUnapproved` | Week unapproved | Unapproved Week | Title-style. |
| `schedule.filteredByBoutiqueHint` | Showing only employees assigned to the selected branch. | "...selected boutique." | Avoid mixing "branch" where entity is boutique. |
| `schedule.scopeLabel` | Scope | Scope (no change) or "Operating Scope" | If you add "Operating Scope", AR **نطاق التشغيل** matches. |
| Dashboard section (missing) | — | Add "Sales" subsection with title case: "Target", "Actual", "Completion %", "Gap", "Trend", "Distribution by Role", "Distribution by Employee", "Top 5", "Bottom 5", "Volatility Index", "N/A" | New keys; use consistent title casing. |

---

## E) Final Standardized Glossary Table (EN → AR)

| English | Arabic |
|---------|--------|
| Boutique | بوتيك |
| Branch | فرع (do not mix with Boutique unless intentional) |
| Target | الهدف |
| Branch Target | هدف البوتيك |
| Employee Target | هدف الموظف |
| Sales | المبيعات |
| Sales Ledger / Daily Sales Ledger | دفتر المبيعات اليومي |
| Manager total | إجمالي المدير |
| Remaining | المتبقي |
| Over allocated / Excess | فائض / زيادة |
| Lock | قفل |
| Locked | مقفول |
| Draft | مسودة |
| Approved | معتمد |
| Pending | قيد الانتظار |
| Executive | تنفيذي |
| Monthly Board Report | تقرير مجلس الإدارة الشهري |
| Score | تقييم |
| Performance Score | تقييم الأداء |
| Discipline | الانضباط |
| Zone Compliance | التزام المنطقة |
| Schedule | الجدول |
| Schedule Health | صحة الجدول |
| Unapproved week | أسبوع غير معتمد |

---

## Summary of Required Code/File Changes

1. **Add missing keys** in both `en.json` and `ar.json`: entire `dashboard.sales` subtree (sectionTitle, target, actual, completionPct, gap, trend, distributionByRole, distributionByEmployee, top5, bottom5, volatilityIndex, na).
2. **Terminology:** Replace الفرع with بوتيك/البوتيك where the EN term is "Boutique"; set `targets.branchTarget` AR to **هدف البوتيك**; set Sales Ledger AR to **دفتر المبيعات اليومي**; set `schedule.scopeLabel` AR to **نطاق التشغيل** (if you adopt "Operating Scope" in EN).
3. **English:** Use "boutique" (not "branch") in schedule hint; optionally "Unapproved Week" and consistent title case for new dashboard.sales labels.
4. **Do not** blindly rewrite entire JSON files; apply only the precise key-level corrections above.
