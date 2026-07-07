-- Multi-boutique targets: unique per boutique (not globally per month).
-- BoutiqueMonthlyTarget: was unique(month), now unique(boutiqueId, month).
-- EmployeeMonthlyTarget: was unique(month, userId), now unique(boutiqueId, month, userId).

DROP INDEX IF EXISTS "BoutiqueMonthlyTarget_month_key";
CREATE UNIQUE INDEX "BoutiqueMonthlyTarget_boutiqueId_month_key" ON "BoutiqueMonthlyTarget"("boutiqueId", "month");

DROP INDEX IF EXISTS "EmployeeMonthlyTarget_month_userId_key";
CREATE UNIQUE INDEX "EmployeeMonthlyTarget_boutiqueId_month_userId_key" ON "EmployeeMonthlyTarget"("boutiqueId", "month", "userId");
