-- Migration: Add alert_recipients column to groups table
-- This allows sending bullying alerts to multiple phone numbers per group
--
-- Usage: node database/apply-alert-recipients.js

-- Add alert_recipients column (stores array of phone numbers)
ALTER TABLE groups
ADD COLUMN IF NOT EXISTS alert_recipients TEXT[] DEFAULT '{}';

-- Add comment for documentation
COMMENT ON COLUMN groups.alert_recipients IS
'Additional phone numbers to receive bullying alerts (besides main admin 0544345287)';

-- Create index for faster queries (optional, but helpful)
CREATE INDEX IF NOT EXISTS idx_groups_alert_recipients
ON groups USING GIN (alert_recipients)
WHERE alert_recipients IS NOT NULL AND array_length(alert_recipients, 1) > 0;

-- Example usage after migration:
-- UPDATE groups SET alert_recipients = ARRAY['972501234567', '972502345678'] WHERE whatsapp_group_id = '...';
