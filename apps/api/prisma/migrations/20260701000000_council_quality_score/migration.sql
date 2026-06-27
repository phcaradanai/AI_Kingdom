-- Council quality scoring: deterministic scorer for Grand Vizier synthesis output.
-- qualityScore (0.0–1.0) measures how well the synthesis follows the sharpened
-- role contracts (precision, committed verdict, specific paths, no unresolved hedges).
-- qualityFlags (JSON) stores the per-criterion boolean breakdown.
-- Used to gate memory auto-save and surface quality trends in intelligence:measure.

ALTER TABLE "CouncilSession" ADD COLUMN "qualityScore" DOUBLE PRECISION;
ALTER TABLE "CouncilSession" ADD COLUMN "qualityFlags" JSONB;
