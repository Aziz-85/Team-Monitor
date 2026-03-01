# Scope & Security Validation Checklist

**Policy:** No cross-boutique data bleed by default. Multi-boutique ONLY via explicit `global=true` (ADMIN/SUPER_ADMIN).

---

## Manual Test Matrix

### 1) Admin with multiple boutique memberships

- **Setup:** Admin user with memberships in Boutique A, B, C. Working on = AlRashid (session boutique).
- **Expected:** Executive pages, dashboard, sales, targets show **AlRashid only**.
- **Pass/Fail:** _ 

### 2) Same admin with UserPreference.scopeJson set to REGION/GROUP/SELECTION

- **Setup:** Admin has stored scope preference = REGION or GROUP or SELECTION (multiple boutiques).
- **Expected:** Executive pages **STILL show only operational boutique** (AlRashid). No fallback to stored scope.
- **Pass/Fail:** _

### 3) Global View (only where UI supports it)

- **Setup:** Navigate to Executive Compare or Employees with `?global=true`.
- **Expected:** Multi-boutique data **only** for ADMIN/SUPER_ADMIN. MANAGER/EMPLOYEE: global ignored.
- **Pass/Fail:** _

### 4) EMPLOYEE role

- **Setup:** EMPLOYEE user.
- **Expected:** `global=true` ignored. Always single boutique (Employee.boutiqueId).
- **Pass/Fail:** _

### 5) DEMO_VIEWER write protection

- **Source of truth:** `middleware.ts` — blocks POST/PUT/PATCH/DELETE on `/api/**` for `role === DEMO_VIEWER`. Exception: `POST /api/auth/logout` allowed.
- **Setup:** Direct API calls (Postman/curl) with DEMO_VIEWER session.
- **Expected:** POST/PUT/PATCH/DELETE to `/api/*` return **403** everywhere (except logout).
- **Pass/Fail:** _

### 6) Cron endpoint secret required

- **Setup:** `POST /api/cron/task-reminders` without `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret`.
- **Expected:** **401 Unauthorized**. No task reminders sent.
- **Pass/Fail:** _

- **Setup:** `CRON_SECRET` not set in env.
- **Expected:** **500** and no execution.
- **Pass/Fail:** _

### 7) Internal deploy register

- **Setup:** `POST /api/internal/deploy/register` without `x-deploy-secret` or wrong secret.
- **Expected:** **401 Unauthorized**.
- **Pass/Fail:** _

---

## Confirmation

**No cross-boutique data bleed by default.**
