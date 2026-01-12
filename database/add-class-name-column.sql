-- Add class_name column to groups table
-- This enables per-group class identification for school bullying monitoring
-- Format: Hebrew letter + number (e.g., ג3, א7, ב10)

ALTER TABLE groups
ADD COLUMN IF NOT EXISTS class_name VARCHAR(20) DEFAULT NULL;

-- Add index for filtering by class
CREATE INDEX IF NOT EXISTS idx_groups_class_name
ON groups(class_name)
WHERE class_name IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN groups.class_name IS
'Class identifier for school groups (e.g., ג3, א7) - used with #bullywatch monitoring';
