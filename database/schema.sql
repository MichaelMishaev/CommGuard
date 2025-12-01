-- bCommGuard PostgreSQL Database Schema
-- This schema stores all WhatsApp groups, users, and their relationships

-- =============================================================================
-- USERS TABLE
-- Stores all unique phone numbers across all groups
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    phone_number VARCHAR(20) NOT NULL UNIQUE,
    lid VARCHAR(50) UNIQUE,  -- WhatsApp LID (Link ID) for privacy mode users
    country_code VARCHAR(10),
    is_blacklisted BOOLEAN DEFAULT false,
    is_whitelisted BOOLEAN DEFAULT false,
    blacklisted_at TIMESTAMP,
    whitelisted_at TIMESTAMP,
    first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total_groups INTEGER DEFAULT 0,  -- Denormalized for quick access
    notes TEXT,  -- Admin notes about this user

    -- Indexes for fast lookups
    CONSTRAINT phone_number_format CHECK (phone_number ~ '^[0-9]{10,15}$')
);

-- Indexes on users table
CREATE INDEX idx_users_phone ON users(phone_number);
CREATE INDEX idx_users_lid ON users(lid) WHERE lid IS NOT NULL;
CREATE INDEX idx_users_blacklisted ON users(is_blacklisted) WHERE is_blacklisted = true;
CREATE INDEX idx_users_country ON users(country_code);

-- =============================================================================
-- GROUPS TABLE
-- Stores all WhatsApp groups the bot is in
-- =============================================================================
CREATE TABLE IF NOT EXISTS groups (
    id SERIAL PRIMARY KEY,
    whatsapp_group_id VARCHAR(50) NOT NULL UNIQUE,  -- e.g., "120363377715487594@g.us"
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    bot_joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    member_count INTEGER DEFAULT 0,  -- Cached count
    admin_count INTEGER DEFAULT 0,   -- Cached count
    is_active BOOLEAN DEFAULT true,  -- False if bot was removed
    invite_link TEXT,

    -- Metadata
    creation_timestamp BIGINT,  -- WhatsApp group creation timestamp
    owner_phone VARCHAR(20),    -- Group creator

    -- Settings
    auto_moderation BOOLEAN DEFAULT true,
    allow_links BOOLEAN DEFAULT false,

    CONSTRAINT whatsapp_id_format CHECK (whatsapp_group_id ~ '@g\.us$')
);

-- Indexes on groups table
CREATE INDEX idx_groups_whatsapp_id ON groups(whatsapp_group_id);
CREATE INDEX idx_groups_name ON groups(name);
CREATE INDEX idx_groups_active ON groups(is_active) WHERE is_active = true;
CREATE INDEX idx_groups_last_sync ON groups(last_sync);

-- =============================================================================
-- GROUP_MEMBERS TABLE
-- Junction table linking users to groups (many-to-many relationship)
-- =============================================================================
CREATE TABLE IF NOT EXISTS group_members (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Member status
    is_admin BOOLEAN DEFAULT false,
    is_super_admin BOOLEAN DEFAULT false,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP,  -- NULL if still in group
    is_active BOOLEAN DEFAULT true,  -- False if user left/was kicked

    -- Activity tracking
    last_message_at TIMESTAMP,
    message_count INTEGER DEFAULT 0,

    -- Ensure unique user per group
    CONSTRAINT unique_user_per_group UNIQUE (group_id, user_id)
);

-- Indexes on group_members table
CREATE INDEX idx_gm_group_id ON group_members(group_id);
CREATE INDEX idx_gm_user_id ON group_members(user_id);
CREATE INDEX idx_gm_active ON group_members(is_active) WHERE is_active = true;
CREATE INDEX idx_gm_admins ON group_members(is_admin) WHERE is_admin = true;
CREATE INDEX idx_gm_composite ON group_members(group_id, user_id, is_active);

-- =============================================================================
-- AUDIT_LOG TABLE (OPTIONAL)
-- Track all bot actions for security and debugging
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    action VARCHAR(50) NOT NULL,  -- 'kick', 'ban', 'blacklist', 'sync', etc.
    group_id INTEGER REFERENCES groups(id),
    user_id INTEGER REFERENCES users(id),
    admin_phone VARCHAR(20),  -- Who triggered the action
    reason TEXT,
    metadata JSONB,  -- Additional data (messages, links, etc.)

    -- Index for querying recent actions
    CONSTRAINT action_type_check CHECK (action IN ('kick', 'ban', 'warn', 'blacklist', 'unblacklist', 'sync', 'join', 'leave'))
);

-- Indexes on audit_log table
CREATE INDEX idx_audit_timestamp ON audit_log(timestamp DESC);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_user ON audit_log(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_audit_group ON audit_log(group_id) WHERE group_id IS NOT NULL;

-- =============================================================================
-- VIEWS FOR COMMON QUERIES
-- =============================================================================

-- View: Active group members with phone numbers
CREATE OR REPLACE VIEW v_active_group_members AS
SELECT
    g.name AS group_name,
    g.whatsapp_group_id,
    u.phone_number,
    u.lid,
    gm.is_admin,
    gm.is_super_admin,
    gm.joined_at,
    gm.message_count,
    u.is_blacklisted
FROM group_members gm
JOIN groups g ON gm.group_id = g.id
JOIN users u ON gm.user_id = u.id
WHERE gm.is_active = true AND g.is_active = true;

-- View: Group statistics
CREATE OR REPLACE VIEW v_group_stats AS
SELECT
    g.id,
    g.name,
    g.whatsapp_group_id,
    COUNT(gm.id) AS total_members,
    COUNT(CASE WHEN gm.is_admin THEN 1 END) AS admin_count,
    COUNT(CASE WHEN u.is_blacklisted THEN 1 END) AS blacklisted_members,
    MAX(gm.last_message_at) AS last_activity,
    g.created_at
FROM groups g
LEFT JOIN group_members gm ON g.id = gm.group_id AND gm.is_active = true
LEFT JOIN users u ON gm.user_id = u.id
WHERE g.is_active = true
GROUP BY g.id, g.name, g.whatsapp_group_id, g.created_at;

-- View: User activity across groups
CREATE OR REPLACE VIEW v_user_activity AS
SELECT
    u.phone_number,
    u.lid,
    COUNT(DISTINCT gm.group_id) AS group_count,
    COUNT(CASE WHEN gm.is_admin THEN 1 END) AS admin_in_groups,
    SUM(gm.message_count) AS total_messages,
    MAX(gm.last_message_at) AS last_active,
    u.is_blacklisted,
    u.is_whitelisted
FROM users u
LEFT JOIN group_members gm ON u.id = gm.user_id AND gm.is_active = true
GROUP BY u.id, u.phone_number, u.lid, u.is_blacklisted, u.is_whitelisted;

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Function: Update group member count (trigger)
CREATE OR REPLACE FUNCTION update_group_member_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE groups
    SET member_count = (
        SELECT COUNT(*)
        FROM group_members
        WHERE group_id = COALESCE(NEW.group_id, OLD.group_id)
        AND is_active = true
    ),
    admin_count = (
        SELECT COUNT(*)
        FROM group_members
        WHERE group_id = COALESCE(NEW.group_id, OLD.group_id)
        AND is_active = true
        AND is_admin = true
    )
    WHERE id = COALESCE(NEW.group_id, OLD.group_id);

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update member counts
CREATE TRIGGER trg_update_member_count
AFTER INSERT OR UPDATE OR DELETE ON group_members
FOR EACH ROW
EXECUTE FUNCTION update_group_member_count();

-- Function: Update user total groups count
CREATE OR REPLACE FUNCTION update_user_group_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE users
    SET total_groups = (
        SELECT COUNT(*)
        FROM group_members
        WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
        AND is_active = true
    )
    WHERE id = COALESCE(NEW.user_id, OLD.user_id);

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update user group counts
CREATE TRIGGER trg_update_user_groups
AFTER INSERT OR UPDATE OR DELETE ON group_members
FOR EACH ROW
EXECUTE FUNCTION update_user_group_count();

-- =============================================================================
-- USEFUL QUERIES (COMMENTS FOR REFERENCE)
-- =============================================================================

-- Get all members of a specific group:
-- SELECT u.phone_number, u.lid, gm.is_admin
-- FROM users u
-- JOIN group_members gm ON u.id = gm.user_id
-- WHERE gm.group_id = 1 AND gm.is_active = true;

-- Find all groups a user is in:
-- SELECT g.name, gm.is_admin
-- FROM groups g
-- JOIN group_members gm ON g.id = gm.group_id
-- WHERE gm.user_id = 1 AND gm.is_active = true;

-- Find power users (in most groups):
-- SELECT u.phone_number, COUNT(gm.group_id) as group_count
-- FROM users u
-- JOIN group_members gm ON u.id = gm.user_id
-- WHERE gm.is_active = true
-- GROUP BY u.phone_number
-- ORDER BY group_count DESC LIMIT 10;

-- Export all phone numbers:
-- SELECT phone_number FROM users ORDER BY phone_number;

-- Find Israeli numbers:
-- SELECT phone_number FROM users WHERE phone_number LIKE '972%';

-- =============================================================================
-- INITIAL DATA (EXAMPLE)
-- =============================================================================

-- Insert admin user (update with your phone)
INSERT INTO users (phone_number, country_code, is_whitelisted, notes)
VALUES ('972544345287', '972', true, 'Bot admin')
ON CONFLICT (phone_number) DO NOTHING;

-- =============================================================================
-- GRANTS (For Railway/Production)
-- =============================================================================

-- Grant permissions to application user
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_app_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_app_user;

-- =============================================================================
-- END OF SCHEMA
-- =============================================================================
