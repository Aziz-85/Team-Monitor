-- CreateTable
CREATE TABLE "SalesTargetRoleWeight" (
    "role" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SalesTargetRoleWeight_pkey" PRIMARY KEY ("role")
);

-- Seed default weights (MSR template)
INSERT INTO "SalesTargetRoleWeight" ("role", "weight") VALUES
  ('MANAGER', 0.5),
  ('ASSISTANT_MANAGER', 0.75),
  ('HIGH_JEWELLERY_EXPERT', 2.0),
  ('SENIOR_SALES_ADVISOR', 1.5),
  ('SALES_ADVISOR', 1.0);
