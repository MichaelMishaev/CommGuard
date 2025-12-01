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
    await query(`
        UPDATE users
        SET is_blacklisted = true,
            blacklisted_at = NOW(),
            notes = $2
        WHERE phone_number = $1
    `, [phoneNumber, reason]);

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
    logAudit
};
