// utils/globalBanHelper.js
// Global Ban Helper - Remove user from all groups where admin has admin privileges

const { getTimestamp } = require('./logger');
const { normalizeJid, decodeLIDToPhone } = require('./jidUtils');
const { robustKick } = require('./kickHelper');

/**
 * Remove a user from ALL groups where the specified admin is an admin
 * @param {Object} sock - WhatsApp socket connection
 * @param {string} userJid - User's WhatsApp ID (JID) to remove
 * @param {string} adminPhone - Admin's phone number (without @s.whatsapp.net)
 * @returns {Object} Summary report of the operation
 */
async function removeUserFromAllAdminGroups(sock, userJid, adminPhone) {
    console.log(`[${getTimestamp()}] 🌍 Starting Global Ban for user: ${userJid}`);
    console.log(`   Admin phone: ${adminPhone}`);

    const report = {
        totalGroups: 0,
        groupsWhereUserFound: 0,
        successfulKicks: 0,
        failedKicks: 0,
        skippedGroups: 0,
        groupsWhereAdminNotAdmin: 0,
        groupsWhereUserNotMember: 0,
        details: []
    };

    try {
        // Step 1: Get all groups
        console.log(`[${getTimestamp()}] 📋 Fetching all groups...`);
        const groups = await sock.groupFetchAllParticipating();
        const groupIds = Object.keys(groups);
        report.totalGroups = groupIds.length;

        console.log(`[${getTimestamp()}] ✅ Found ${groupIds.length} total groups`);

        // Normalize admin JID for comparison
        const adminJid = `${adminPhone}@s.whatsapp.net`;

        // Normalize user JID
        const normalizedUserJid = normalizeJid(userJid);

        // Decode LID if needed
        let userPhone = userJid.replace('@s.whatsapp.net', '').replace('@lid', '');
        if (userJid.includes('@lid')) {
            const decoded = await decodeLIDToPhone(sock, userJid);
            if (decoded) {
                userPhone = decoded;
                console.log(`[${getTimestamp()}] 🔓 Decoded LID: ${userJid} → ${userPhone}`);
            }
        }

        // Note: Israeli number protection exists for BLACKLISTING (blacklistService.js)
        // Global ban (kicking) is allowed for all numbers including Israeli

        // Step 2: Process each group
        let processedCount = 0;
        for (const groupId of groupIds) {
            processedCount++;
            const group = groups[groupId];
            const groupName = group.subject || 'Unknown Group';

            // Progress update every 10 groups
            if (processedCount % 10 === 0) {
                console.log(`[${getTimestamp()}] 🔄 Progress: ${processedCount}/${groupIds.length} groups checked...`);
            }

            try {
                // Get group metadata with participants
                const metadata = await sock.groupMetadata(groupId);

                // Check if admin is actually an admin in this group
                const adminParticipant = metadata.participants.find(p =>
                    normalizeJid(p.id) === normalizeJid(adminJid)
                );

                if (!adminParticipant || !adminParticipant.admin) {
                    report.groupsWhereAdminNotAdmin++;
                    report.details.push({
                        groupId,
                        groupName,
                        status: 'skipped',
                        reason: 'Admin not an admin in this group'
                    });
                    continue;
                }

                // Check if user is a member of this group
                const userParticipant = metadata.participants.find(p => {
                    const participantJid = normalizeJid(p.id);
                    // Check both JID and phone number
                    return participantJid === normalizedUserJid ||
                           participantJid.includes(userPhone);
                });

                if (!userParticipant) {
                    report.groupsWhereUserNotMember++;
                    report.details.push({
                        groupId,
                        groupName,
                        status: 'skipped',
                        reason: 'User not a member'
                    });
                    continue;
                }

                // User found! Attempt to kick
                report.groupsWhereUserFound++;
                console.log(`[${getTimestamp()}] 🎯 Found user in group: ${groupName}`);
                console.log(`   Attempting to kick...`);

                try {
                    // Use robustKick for reliability
                    await robustKick(sock, groupId, [userParticipant.id]);

                    report.successfulKicks++;
                    report.details.push({
                        groupId,
                        groupName,
                        status: 'success',
                        reason: 'User kicked successfully'
                    });

                    console.log(`[${getTimestamp()}] ✅ Successfully kicked from: ${groupName}`);

                    // Small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 500));

                } catch (kickError) {
                    report.failedKicks++;
                    report.details.push({
                        groupId,
                        groupName,
                        status: 'failed',
                        reason: kickError.message
                    });

                    console.error(`[${getTimestamp()}] ❌ Failed to kick from ${groupName}: ${kickError.message}`);
                }

            } catch (groupError) {
                // Error getting group metadata
                report.skippedGroups++;
                report.details.push({
                    groupId,
                    groupName,
                    status: 'error',
                    reason: `Failed to fetch group data: ${groupError.message}`
                });

                console.error(`[${getTimestamp()}] ⚠️ Error processing group ${groupName}: ${groupError.message}`);
            }
        }

        console.log(`[${getTimestamp()}] 🏁 Global Ban Complete!`);
        console.log(`   Total Groups: ${report.totalGroups}`);
        console.log(`   User Found In: ${report.groupsWhereUserFound}`);
        console.log(`   Successful Kicks: ${report.successfulKicks}`);
        console.log(`   Failed Kicks: ${report.failedKicks}`);
        console.log(`   Skipped (not admin): ${report.groupsWhereAdminNotAdmin}`);
        console.log(`   Skipped (user not member): ${report.groupsWhereUserNotMember}`);

    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Global Ban failed:`, error.message);
        report.error = error.message;
    }

    return report;
}

/**
 * Format global ban report for user-friendly display
 * @param {Object} report - Report from removeUserFromAllAdminGroups
 * @returns {string} Formatted message
 */
function formatGlobalBanReport(report) {
    if (report.error) {
        return `❌ Global Ban Failed\n\n${report.error}`;
    }

    let message = `🌍 *Global Ban Report*\n\n`;
    message += `📊 Summary:\n`;
    message += `   • Total Groups Checked: ${report.totalGroups}\n`;
    message += `   • User Found In: ${report.groupsWhereUserFound} groups\n`;
    message += `   • Successfully Removed: ${report.successfulKicks} ✅\n`;

    if (report.failedKicks > 0) {
        message += `   • Failed Removals: ${report.failedKicks} ❌\n`;
    }

    message += `\n`;
    message += `ℹ️ Additional Info:\n`;
    message += `   • You're not admin in: ${report.groupsWhereAdminNotAdmin} groups\n`;
    message += `   • User not member of: ${report.groupsWhereUserNotMember} groups\n`;

    // Show failed groups if any
    if (report.failedKicks > 0) {
        message += `\n❌ Failed Groups:\n`;
        const failedGroups = report.details.filter(d => d.status === 'failed');
        failedGroups.slice(0, 5).forEach(group => {
            message += `   • ${group.groupName}: ${group.reason}\n`;
        });
        if (failedGroups.length > 5) {
            message += `   ... and ${failedGroups.length - 5} more\n`;
        }
    }

    return message;
}

module.exports = {
    removeUserFromAllAdminGroups,
    formatGlobalBanReport
};
