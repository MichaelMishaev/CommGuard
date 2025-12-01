-- Add violations JSONB column to existing users table
-- Run this on Railway PostgreSQL to update existing schema

ALTER TABLE users ADD COLUMN IF NOT EXISTS violations JSONB DEFAULT '{}';

-- Add index for querying violations
CREATE INDEX IF NOT EXISTS idx_users_violations ON users USING GIN (violations);

-- Comment for documentation
COMMENT ON COLUMN users.violations IS 'Tracks violations by type: {"invite_link": 3, "kicked_by_admin": 2}';
