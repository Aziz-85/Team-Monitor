# SUPER_ADMIN Multi-Boutique Per-Request Context — Verification

## Summary

SUPER_ADMIN gets **real multi-boutique data** via **per-request context** only. No switching: `user.boutiqueId` is never changed; no UI that persists scope; no cookie/preference writes.

- **URL:** `?b=CODE` or `?boutique=CODE` (e.g. `?b=S02`)
- **Header:** `X-Boutique-Code: S02`
- **Validation:** `UserBoutiqueMembership` where `userId`, `boutiqueId` (by code), `canAccess: true`
- **Audit:** `AuthAuditLog` event `BOUTIQUE_CONTEXT_VIEW` when SUPER_ADMIN uses `?b=` successfully (non-blocking)

## Verification Steps (run manually)

1. **Login as SUPER_ADMIN** — default boutique remains S05 (session `user.boutiqueId`).
2. **Open `/sales/summary` or `/sales/ledger`** — shows S05 data.
3. **Open `/sales/summary?b=S02` or `/sales/ledger?b=S02`** — shows S02 data.
4. **Refresh both** — behavior depends only on URL (no persistence).
5. **Logout/login** — default returns to S05.
6. **Login as ADMIN** — `?b=S02` is **ignored**; only session boutique (e.g. S05) is used.
7. **Invalid code** (e.g. `?b=INVALID`) — fallback to default (user.boutiqueId).

## Context Picker (SUPER_ADMIN only)

- **Sidebar / Mobile top bar:** Dropdown "Working on boutique" lists boutiques from `GET /api/scope/allowed-boutiques` (memberships with `canAccess: true`).
- **On change:** `router.replace(currentPath + "?b=CODE")` then `router.refresh()` — no DB writes.

## Post-deploy (on server)

```bash
pm2 status
pm2 logs --lines 50
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health
```

## Files changed (patch)

- `lib/scope/scopeContext.ts` (new) — `resolveEffectiveBoutiqueId(user, request, prisma)`
- `lib/scope/operationalScope.ts` — `getOperationalScope(request?)`, `requireOperationalScope(request?)`
- `lib/scope/requireOperationalBoutique.ts` — `requireOperationalBoutique(request?)`
- `lib/scope/scheduleScope.ts` — `getScheduleScope(request?)`, `requireScheduleScope(request?)`
- `lib/sales/ledgerRbac.ts` — `getSalesScope({ ...options, request? })`
- `app/api/scope/allowed-boutiques/route.ts` (new) — SUPER_ADMIN only
- `components/scope/SuperAdminBoutiqueContextPicker.tsx` (new)
- `components/nav/Sidebar.tsx`, `components/nav/MobileTopBar.tsx` — show picker for SUPER_ADMIN
- All API routes that call scope helpers — pass `request` into the call

No migrations. No change to `User.boutiqueId` or session persistence.
