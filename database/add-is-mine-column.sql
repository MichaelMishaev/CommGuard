-- Add is_mine column to groups table
-- This marks groups that are owned/managed by the bot admin

ALTER TABLE groups
    ADD COLUMN IF NOT EXISTS is_mine BOOLEAN DEFAULT false;

-- Add index for fast filtering of owned groups
CREATE INDEX IF NOT EXISTS idx_groups_is_mine ON groups(is_mine)
    WHERE is_mine = true;

-- Comment for documentation
COMMENT ON COLUMN groups.is_mine IS 'Indicates if this group is owned/managed by the bot admin';

-- Example: Mark a specific group as mine
-- UPDATE groups SET is_mine = true WHERE whatsapp_group_id = 'YOUR_GROUP_ID@g.us';

-- Query all my groups
-- SELECT name, member_count, whatsapp_group_id FROM groups WHERE is_mine = true ORDER BY name;
