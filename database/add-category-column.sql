-- Add category column to groups table
-- Categories: personal, business, community, family, friends, hobby, education, work, other

ALTER TABLE groups
    ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT NULL;

-- Add index for fast filtering by category
CREATE INDEX IF NOT EXISTS idx_groups_category ON groups(category)
    WHERE category IS NOT NULL;

-- Add notes column for additional information
ALTER TABLE groups
    ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL;

-- Update constraint to validate category values
-- Note: PostgreSQL allows NULL values even with CHECK constraints
ALTER TABLE groups
    DROP CONSTRAINT IF EXISTS valid_category;

ALTER TABLE groups
    ADD CONSTRAINT valid_category CHECK (
        category IS NULL OR
        category IN ('personal', 'business', 'community', 'family', 'friends', 'hobby', 'education', 'work', 'other')
    );

-- Examples:
-- UPDATE groups SET category = 'personal', notes = 'Family group' WHERE whatsapp_group_id = 'YOUR_GROUP_ID@g.us';
-- SELECT name, category, is_mine FROM groups WHERE is_mine = true ORDER BY category, name;
