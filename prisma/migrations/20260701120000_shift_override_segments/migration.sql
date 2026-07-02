-- Persist time segments for shift overrides (Generate Schedule integration)

CREATE TABLE "ShiftOverrideSegment" (
    "id" TEXT NOT NULL,
    "shiftOverrideId" TEXT NOT NULL,
    "periodIndex" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ShiftOverrideSegment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShiftOverrideSegment_shiftOverrideId_idx" ON "ShiftOverrideSegment"("shiftOverrideId");

ALTER TABLE "ShiftOverrideSegment" ADD CONSTRAINT "ShiftOverrideSegment_shiftOverrideId_fkey" FOREIGN KEY ("shiftOverrideId") REFERENCES "ShiftOverride"("id") ON DELETE CASCADE ON UPDATE CASCADE;
