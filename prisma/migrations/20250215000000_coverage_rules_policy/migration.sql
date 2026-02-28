-- Align CoverageRule with effective policy:
-- Friday (dayOfWeek=5): PM-only, minAM=0
-- Other days: minAM at least 2
-- minPM unchanged (informational)

UPDATE "CoverageRule" SET "minAM" = 0 WHERE "dayOfWeek" = 5;

UPDATE "CoverageRule" SET "minAM" = 2 WHERE "dayOfWeek" != 5 AND "minAM" < 2;
