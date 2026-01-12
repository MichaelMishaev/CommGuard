// database/groupService.js
// Service for managing groups and users in PostgreSQL

const { query } = require('./connection');
const { getTimestamp } = require('../utils/logger');

/**
 * Get all groups from database
 * @returns {Promise<Array>} List of groups
 */
async function getAllGroups() {
    const result = await query(`
        SELECT * FROM v_group_stats
        ORDER BY total_members DESC
    `);
    return result.rows;
}

/**
 * Get group by WhatsApp ID
 * @param {string} whatsappGroupId - WhatsApp group ID
 * @returns {Promise<Object|null>} Group object or null
 */
async function getGroupByWhatsAppId(whatsappGroupId) {
    const result = await query(`
        SELECT * FROM groups
        WHERE whatsapp_group_id = $1
    `, [whatsappGroupId]);

    return result.rows[0] || null;
}

/**
 * Get all members of a group
 * @param {string} whatsappGroupId - WhatsApp group ID
 * @returns {Promise<Array>} List of members
 */
async function getGroupMembers(whatsappGroupId) {
    const result = await query(`
        SELECT
            u.phone_number,
            u.lid,
            u.country_code,
            u.is_blacklisted,
            u.is_whitelisted,
            gm.is_admin,
            gm.is_super_admin,
            gm.joined_at
        FROM group_members gm
        JOIN users u ON gm.user_id = u.id
        JOIN groups g ON gm.group_id = g.id
        WHERE g.whatsapp_group_id = $1
        AND gm.is_active = true
        ORDER BY gm.is_admin DESC, u.phone_number
    `, [whatsappGroupId]);

    return result.rows;
}

/**
 * Get all groups a user is in
 * @param {string} phoneNumber - User phone number
 * @returns {Promise<Array>} List of groups
 */
async function getUserGroups(phoneNumber) {
    const result = await query(`
        SELECT
            g.name,
            g.whatsapp_group_id,
            gm.is_admin,
            gm.joined_at,
            g.member_count
        FROM groups g
        JOIN group_members gm ON g.id = gm.group_id
        JOIN users u ON gm.user_id = u.id
        WHERE u.phone_number = $1
        AND gm.is_active = true
        AND g.is_active = true
        ORDER BY g.name
    `, [phoneNumber]);

    return result.rows;
}

/**
 * Get user by phone number
 * @param {string} phoneNumber - Phone number
 * @returns {Promise<Object|null>} User object or null
 */
async function getUserByPhone(phoneNumber) {
    const result = await query(`
        SELECT * FROM users
        WHERE phone_number = $1
    `, [phoneNumber]);

    return result.rows[0] || null;
}

/**
 * Get all blacklisted users
 * @returns {Promise<Array>} List of blacklisted users
 */
async function getBlacklistedUsers() {
    const result = await query(`
        SELECT phone_number, lid, blacklisted_at, notes
        FROM users
        WHERE is_blacklisted = true
        ORDER BY blacklisted_at DESC
    `);

    return result.rows;
}

/**
 * Add user to blacklist
 * @param {string} phoneNumber - Phone number
 * @param {string} reason - Blacklist reason
 */
async function blacklistUser(phoneNumber, reason = null) {
    // Extract country code from phone number
    let countryCode = null;
    if (phoneNumber.startsWith('972')) countryCode = '+972';
    else if (phoneNumber.startsWith('1')) countryCode = '+1';
    else if (phoneNumber.startsWith('44')) countryCode = '+44';

    // Use UPSERT to create user if doesn't exist, then blacklist
    await query(`
        INSERT INTO users (phone_number, country_code, is_blacklisted, blacklisted_at, notes)
        VALUES ($1, $2, true, NOW(), $3)
        ON CONFLICT (phone_number)
        DO UPDATE SET
            is_blacklisted = true,
            blacklisted_at = NOW(),
            notes = $3
    `, [phoneNumber, countryCode, reason]);

    console.log(`[${getTimestamp()}] 🚫 Blacklisted user: ${phoneNumber}`);
}

/**
 * Remove user from blacklist
 * @param {string} phoneNumber - Phone number
 */
async function unblacklistUser(phoneNumber) {
    await query(`
        UPDATE users
        SET is_blacklisted = false,
            blacklisted_at = NULL
        WHERE phone_number = $1
    `, [phoneNumber]);

    console.log(`[${getTimestamp()}] ✅ Unblacklisted user: ${phoneNumber}`);
}

/**
 * Get power users (users in most groups)
 * @param {number} limit - Number of results
 * @returns {Promise<Array>} List of power users
 */
async function getPowerUsers(limit = 10) {
    const result = await query(`
        SELECT
            phone_number,
            group_count,
            admin_in_groups,
            total_messages,
            last_active
        FROM v_user_activity
        WHERE group_count > 1
        ORDER BY group_count DESC
        LIMIT $1
    `, [limit]);

    return result.rows;
}

/**
 * Get users by country code
 * @param {string} countryCode - Country code (e.g., '972', '1')
 * @returns {Promise<Array>} List of users
 */
async function getUsersByCountry(countryCode) {
    const result = await query(`
        SELECT phone_number, lid, total_groups, is_blacklisted
        FROM users
        WHERE country_code = $1
        ORDER BY total_groups DESC
    `, [countryCode]);

    return result.rows;
}

/**
 * Export all phone numbers to array
 * @returns {Promise<Array>} Array of phone numbers
 */
async function exportAllPhoneNumbers() {
    const result = await query(`
        SELECT phone_number FROM users
        ORDER BY phone_number
    `);

    return result.rows.map(row => row.phone_number);
}

/**
 * Get database statistics
 * @returns {Promise<Object>} Statistics
 */
async function getDatabaseStats() {
    const result = await query(`
        SELECT
            (SELECT COUNT(*) FROM users) as total_users,
            (SELECT COUNT(*) FROM users WHERE is_blacklisted = true) as blacklisted_users,
            (SELECT COUNT(*) FROM users WHERE is_whitelisted = true) as whitelisted_users,
            (SELECT COUNT(*) FROM groups WHERE is_active = true) as active_groups,
            (SELECT COUNT(*) FROM group_members WHERE is_active = true) as total_memberships,
            (SELECT COUNT(*) FROM group_members WHERE is_admin = true AND is_active = true) as total_admins
    `);

    return result.rows[0];
}

/**
 * Search users by phone number pattern
 * @param {string} pattern - Search pattern (e.g., '972%', '%555%')
 * @returns {Promise<Array>} List of matching users
 */
async function searchUsers(pattern) {
    const result = await query(`
        SELECT phone_number, lid, country_code, total_groups, is_blacklisted
        FROM users
        WHERE phone_number LIKE $1
        ORDER BY total_groups DESC
    `, [pattern]);

    return result.rows;
}

/**
 * Increment violation count for a user
 * @param {string} phoneNumber - Phone number
 * @param {string} violationType - Type of violation ('invite_link', 'kicked_by_admin', etc.)
 * @returns {Promise<Object>} Updated violations object
 */
async function incrementViolation(phoneNumber, violationType) {
    try {
        // Extract country code from phone number
        let countryCode = null;
        if (phoneNumber.startsWith('972')) countryCode = '+972';
        else if (phoneNumber.startsWith('1')) countryCode = '+1';
        else if (phoneNumber.startsWith('44')) countryCode = '+44';

        // Use UPSERT to create user if doesn't exist, then increment violation
        const result = await query(`
            INSERT INTO users (phone_number, country_code, violations)
            VALUES ($1, $2, jsonb_build_object($3::text, 1))
            ON CONFLICT (phone_number)
            DO UPDATE SET violations = jsonb_set(
                users.violations,
                $4,
                (COALESCE((users.violations->$5::text)::int, 0) + 1)::text::jsonb,
                true
            )
            RETURNING violations
        `, [phoneNumber, countryCode, violationType, `{${violationType}}`, violationType]);

        const violations = result.rows[0]?.violations || {};
        console.log(`[${getTimestamp()}] 📊 Violation recorded: ${phoneNumber} - ${violationType} = ${violations[violationType]}`);

        return violations;
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to increment violation:`, error.message);
        return {};
    }
}

/**
 * Get violation counts for a user
 * @param {string} phoneNumber - Phone number
 * @returns {Promise<Object>} Violations object (e.g., {invite_link: 3, kicked_by_admin: 2})
 */
async function getViolations(phoneNumber) {
    const user = await getUserByPhone(phoneNumber);
    return user?.violations || {};
}

/**
 * Format violations object into readable string
 * @param {Object} violations - Violations object
 * @returns {string} Formatted string (e.g., "invite_link: 3, kicked_by_admin: 2")
 */
function formatViolations(violations) {
    if (!violations || Object.keys(violations).length === 0) {
        return 'No violations';
    }

    return Object.entries(violations)
        .map(([type, count]) => `${type}: ${count}`)
        .join(', ');
}

/**
 * Log audit event
 * @param {string} action - Action type
 * @param {Object} details - Action details
 */
async function logAudit(action, details = {}) {
    try {
        await query(`
            INSERT INTO audit_log (action, group_id, user_id, admin_phone, reason, metadata)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [
            action,
            details.groupId || null,
            details.userId || null,
            details.adminPhone || null,
            details.reason || null,
            JSON.stringify(details.metadata || {})
        ]);
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to log audit:`, error.message);
    }
}

/**
 * Mark group as mine (owned by admin)
 * @param {string} whatsappGroupId - WhatsApp group ID
 * @param {string} category - Optional category (personal, business, community, family, friends, hobby, education, work, other)
 * @param {string} notes - Optional notes
 * @returns {Promise<boolean>} Success status
 */
async function markMine(whatsappGroupId, category = null, notes = null) {
    try {
        const result = await query(`
            UPDATE groups
            SET is_mine = true,
                category = COALESCE($2, category),
                notes = COALESCE($3, notes)
            WHERE whatsapp_group_id = $1
            RETURNING name, category
        `, [whatsappGroupId, category, notes]);

        if (result.rows.length > 0) {
            const catInfo = result.rows[0].category ? ` (${result.rows[0].category})` : '';
            console.log(`[${getTimestamp()}] ✅ Marked as mine: ${result.rows[0].name}${catInfo}`);
            return true;
        } else {
            console.log(`[${getTimestamp()}] ❌ Group not found: ${whatsappGroupId}`);
            return false;
        }
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to mark group as mine:`, error.message);
        return false;
    }
}

/**
 * Unmark group as mine
 * @param {string} whatsappGroupId - WhatsApp group ID
 * @returns {Promise<boolean>} Success status
 */
async function unmarkMine(whatsappGroupId) {
    try {
        const result = await query(`
            UPDATE groups
            SET is_mine = false
            WHERE whatsapp_group_id = $1
            RETURNING name
        `, [whatsappGroupId]);

        if (result.rows.length > 0) {
            console.log(`[${getTimestamp()}] ✅ Unmarked: ${result.rows[0].name}`);
            return true;
        } else {
            console.log(`[${getTimestamp()}] ❌ Group not found: ${whatsappGroupId}`);
            return false;
        }
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to unmark group:`, error.message);
        return false;
    }
}

/**
 * Get all groups marked as mine
 * @param {string} categoryFilter - Optional category filter
 * @returns {Promise<Array>} List of owned groups
 */
async function getMyGroups(categoryFilter = null) {
    try {
        let sql = `
            SELECT
                name,
                whatsapp_group_id,
                member_count,
                admin_count,
                category,
                notes,
                created_at,
                last_sync,
                owner_phone
            FROM groups
            WHERE is_mine = true AND is_active = true
        `;

        const params = [];
        if (categoryFilter) {
            sql += ` AND category = $1`;
            params.push(categoryFilter);
        }

        sql += ` ORDER BY category NULLS LAST, name`;

        const result = await query(sql, params);
        return result.rows;
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to get my groups:`, error.message);
        return [];
    }
}

/**
 * Check if group is marked as mine
 * @param {string} whatsappGroupId - WhatsApp group ID
 * @returns {Promise<boolean>} True if marked as mine
 */
async function isMine(whatsappGroupId) {
    try {
        const result = await query(`
            SELECT is_mine
            FROM groups
            WHERE whatsapp_group_id = $1
        `, [whatsappGroupId]);

        return result.rows.length > 0 && result.rows[0].is_mine === true;
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to check if mine:`, error.message);
        return false;
    }
}

/**
 * Set category for a group
 * @param {string} whatsappGroupId - WhatsApp group ID
 * @param {string} category - Category name
 * @returns {Promise<boolean>} Success status
 */
async function setCategory(whatsappGroupId, category) {
    const validCategories = ['personal', 'business', 'community', 'family', 'friends', 'hobby', 'education', 'work', 'other'];

    if (!validCategories.includes(category.toLowerCase())) {
        console.error(`[${getTimestamp()}] ❌ Invalid category: ${category}`);
        return false;
    }

    try {
        const result = await query(`
            UPDATE groups
            SET category = $2
            WHERE whatsapp_group_id = $1
            RETURNING name, category
        `, [whatsappGroupId, category.toLowerCase()]);

        if (result.rows.length > 0) {
            console.log(`[${getTimestamp()}] ✅ Set category for ${result.rows[0].name}: ${result.rows[0].category}`);
            return true;
        } else {
            console.log(`[${getTimestamp()}] ❌ Group not found: ${whatsappGroupId}`);
            return false;
        }
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to set category:`, error.message);
        return false;
    }
}

/**
 * Set notes for a group
 * @param {string} whatsappGroupId - WhatsApp group ID
 * @param {string} notes - Notes text
 * @returns {Promise<boolean>} Success status
 */
async function setNotes(whatsappGroupId, notes) {
    try {
        const result = await query(`
            UPDATE groups
            SET notes = $2
            WHERE whatsapp_group_id = $1
            RETURNING name
        `, [whatsappGroupId, notes]);

        if (result.rows.length > 0) {
            console.log(`[${getTimestamp()}] ✅ Set notes for ${result.rows[0].name}`);
            return true;
        } else {
            console.log(`[${getTimestamp()}] ❌ Group not found: ${whatsappGroupId}`);
            return false;
        }
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to set notes:`, error.message);
        return false;
    }
}

/**
 * Get category statistics for owned groups
 * @returns {Promise<Array>} Category stats with counts
 */
async function getCategoryStats() {
    try {
        const result = await query(`
            SELECT
                COALESCE(category, 'uncategorized') as category,
                COUNT(*) as count,
                SUM(member_count) as total_members
            FROM groups
            WHERE is_mine = true AND is_active = true
            GROUP BY category
            ORDER BY count DESC, category
        `);

        return result.rows;
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to get category stats:`, error.message);
        return [];
    }
}

/**
 * Enable or disable bullying monitoring for a group
 * @param {string} whatsappGroupId - WhatsApp group ID
 * @param {boolean} enabled - Enable (true) or disable (false) monitoring
 * @param {string|null} className - Class identifier (e.g., ג3, א7) - required when enabling
 * @returns {Promise<boolean>} Success status
 */
async function setBullyingMonitoring(whatsappGroupId, enabled, className = null) {
    try {
        const result = await query(`
            UPDATE groups
            SET bullying_monitoring = $2,
                class_name = $3
            WHERE whatsapp_group_id = $1
            RETURNING name, bullying_monitoring, class_name
        `, [whatsappGroupId, enabled, className]);

        if (result.rows.length > 0) {
            const group = result.rows[0];
            const status = enabled ? 'enabled' : 'disabled';
            const classInfo = group.class_name ? ` (Class: ${group.class_name})` : '';
            console.log(`[${getTimestamp()}] ✅ Bullying monitoring ${status} for ${group.name}${classInfo}`);
            return true;
        } else {
            console.log(`[${getTimestamp()}] ❌ Group not found: ${whatsappGroupId}`);
            return false;
        }
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to set bullying monitoring:`, error.message);
        return false;
    }
}

/**
 * Check if bullying monitoring is enabled for a group
 * @param {string} whatsappGroupId - WhatsApp group ID
 * @returns {Promise<boolean>} True if enabled, false otherwise
 */
async function isBullyingMonitoringEnabled(whatsappGroupId) {
    try {
        const result = await query(`
            SELECT bullying_monitoring
            FROM groups
            WHERE whatsapp_group_id = $1
        `, [whatsappGroupId]);

        return result.rows[0]?.bullying_monitoring || false;
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to check bullying monitoring:`, error.message);
        return false;
    }
}

/**
 * Get class name for a group
 * @param {string} whatsappGroupId - WhatsApp group ID
 * @returns {Promise<string|null>} Class name or null if not set
 */
async function getGroupClassName(whatsappGroupId) {
    try {
        const result = await query(`
            SELECT class_name
            FROM groups
            WHERE whatsapp_group_id = $1
        `, [whatsappGroupId]);

        return result.rows[0]?.class_name || null;
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to get class name:`, error.message);
        return null;
    }
}

/**
 * Update class name for a group
 * @param {string} whatsappGroupId - WhatsApp group ID
 * @param {string} className - New class name (e.g., ג3, א7)
 * @returns {Promise<boolean>} Success status
 */
async function setGroupClassName(whatsappGroupId, className) {
    try {
        const result = await query(`
            UPDATE groups
            SET class_name = $2
            WHERE whatsapp_group_id = $1
            RETURNING name, class_name
        `, [whatsappGroupId, className]);

        if (result.rows.length > 0) {
            const group = result.rows[0];
            console.log(`[${getTimestamp()}] ✅ Class name updated to ${className} for ${group.name}`);
            return true;
        } else {
            console.log(`[${getTimestamp()}] ❌ Group not found: ${whatsappGroupId}`);
            return false;
        }
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to set class name:`, error.message);
        return false;
    }
}

/**
 * Get all groups with bullying monitoring enabled
 * @returns {Promise<Array>} Array of groups with {whatsapp_group_id, name, class_name}
 */
async function getBullywatchGroups() {
    try {
        const result = await query(`
            SELECT whatsapp_group_id, name, class_name
            FROM groups
            WHERE bullying_monitoring = true
            ORDER BY class_name NULLS LAST, name
        `);

        return result.rows;
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to get bullywatch groups:`, error.message);
        return [];
    }
}

/**
 * Add phone number to group's alert recipients list
 * @param {string} whatsappGroupId - WhatsApp group ID
 * @param {string} phoneNumber - Phone number to add (e.g., '972501234567')
 * @returns {Promise<boolean>} Success status
 */
async function addAlertRecipient(whatsappGroupId, phoneNumber) {
    try {
        // Validate phone number format
        if (!/^[0-9]{10,15}$/.test(phoneNumber)) {
            throw new Error('Invalid phone number format');
        }

        // Add to array if not already present (PostgreSQL array_append + DISTINCT)
        await query(`
            UPDATE groups
            SET alert_recipients = (
                SELECT ARRAY(
                    SELECT DISTINCT unnest(alert_recipients || $2::text)
                )
            )
            WHERE whatsapp_group_id = $1
        `, [whatsappGroupId, phoneNumber]);

        console.log(`[${getTimestamp()}] ➕ Added alert recipient ${phoneNumber} to group ${whatsappGroupId}`);
        return true;
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to add alert recipient:`, error.message);
        throw error;
    }
}

/**
 * Remove phone number from group's alert recipients list
 * @param {string} whatsappGroupId - WhatsApp group ID
 * @param {string} phoneNumber - Phone number to remove
 * @returns {Promise<boolean>} Success status
 */
async function removeAlertRecipient(whatsappGroupId, phoneNumber) {
    try {
        // Remove from array (PostgreSQL array_remove)
        await query(`
            UPDATE groups
            SET alert_recipients = array_remove(alert_recipients, $2)
            WHERE whatsapp_group_id = $1
        `, [whatsappGroupId, phoneNumber]);

        console.log(`[${getTimestamp()}] ➖ Removed alert recipient ${phoneNumber} from group ${whatsappGroupId}`);
        return true;
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to remove alert recipient:`, error.message);
        throw error;
    }
}

/**
 * Get all alert recipients for a group
 * @param {string} whatsappGroupId - WhatsApp group ID
 * @returns {Promise<Array<string>>} Array of phone numbers
 */
async function getAlertRecipients(whatsappGroupId) {
    try {
        const result = await query(`
            SELECT alert_recipients
            FROM groups
            WHERE whatsapp_group_id = $1
        `, [whatsappGroupId]);

        if (result.rows.length === 0) {
            return [];
        }

        // PostgreSQL returns array, handle null case
        return result.rows[0].alert_recipients || [];
    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to get alert recipients:`, error.message);
        return [];
    }
}

module.exports = {
    getAllGroups,
    getGroupByWhatsAppId,
    getGroupMembers,
    getUserGroups,
    getUserByPhone,
    getBlacklistedUsers,
    blacklistUser,
    unblacklistUser,
    getPowerUsers,
    getUsersByCountry,
    exportAllPhoneNumbers,
    getDatabaseStats,
    searchUsers,
    incrementViolation,
    getViolations,
    formatViolations,
    logAudit,
    markMine,
    unmarkMine,
    getMyGroups,
    isMine,
    setCategory,
    setNotes,
    getCategoryStats,
    addAlertRecipient,
    removeAlertRecipient,
    getAlertRecipients,
    setBullyingMonitoring,
    isBullyingMonitoringEnabled,
    getGroupClassName,
    setGroupClassName,
    getBullywatchGroups
};
