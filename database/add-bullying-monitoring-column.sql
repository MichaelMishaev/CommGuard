-- Add bullying_monitoring column to groups table
-- This enables per-group offensive content monitoring for bullying detection

ALTER TABLE groups
ADD COLUMN IF NOT EXISTS bullying_monitoring BOOLEAN DEFAULT false;

-- Add index for faster queries on groups with monitoring enabled
CREATE INDEX IF NOT EXISTS idx_groups_bullying_monitoring
ON groups(bullying_monitoring)
WHERE bullying_monitoring = true;

-- Add comment for documentation
COMMENT ON COLUMN groups.bullying_monitoring IS
'Enable offensive content monitoring for this group - sends alerts to admin when detected';
