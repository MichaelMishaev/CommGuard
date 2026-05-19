-- Add restrict_country_codes column to groups table
-- Enables per-group auto-kick of +1/+6 country codes on join
-- Default false — only activated when admin runs #botforeign in the group

ALTER TABLE groups
ADD COLUMN IF NOT EXISTS restrict_country_codes BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_groups_restrict_country_codes
ON groups(restrict_country_codes)
WHERE restrict_country_codes = true;

COMMENT ON COLUMN groups.restrict_country_codes IS
'Auto-kick users with +1/+6 country codes when they join — enabled per-group by running #botforeign';
