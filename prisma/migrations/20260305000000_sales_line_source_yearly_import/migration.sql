-- Add YEARLY_IMPORT to SalesLineSource (Mode B yearly Excel import)
ALTER TYPE "SalesLineSource" ADD VALUE IF NOT EXISTS 'YEARLY_IMPORT';
