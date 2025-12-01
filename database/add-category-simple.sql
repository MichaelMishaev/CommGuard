-- Add category and notes columns to groups table

ALTER TABLE groups ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT NULL;

ALTER TABLE groups ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_groups_category ON groups(category) WHERE category IS NOT NULL;
