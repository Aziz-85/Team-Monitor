-- CreateIndex (non-destructive): operational roster queries filter by boutiqueId + active
CREATE INDEX IF NOT EXISTS "Employee_boutiqueId_active_idx" ON "Employee"("boutiqueId", "active");
