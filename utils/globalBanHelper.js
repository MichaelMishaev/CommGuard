// utils/globalBanHelper.js
// Global Ban Helper - Remove user from all groups where admin has admin privileges

const { getTimestamp } = require('./logger');
const { jidKey, decodeLIDToPhone } = require('./jidUtils');
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
        const normalizedUserJid = jidKey(userJid);

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

            // ULTRA-SAFE: Add delay every 3 groups to avoid rate limiting
            if (processedCount % 3 === 0) {
                await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay every 3 groups
            }

            try {
                // ULTRA-SAFE: Delay before each metadata fetch to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 500)); // 500ms between each group

                // Get group metadata with participants
                const metadata = await sock.groupMetadata(groupId);

                // Note: We skip admin check because:
                // 1. User wouldn't be able to use #kickglobal if not admin in original group
                // 2. LID format makes admin detection unreliable
                // 3. We'll discover if we're not admin when kick fails
                // The kick itself will fail if bot doesn't have permission

                // Check if user is a member of this group
                // Need to match by phone number, handling both @lid and @s.whatsapp.net formats
                const userParticipant = await (async () => {
                    for (const p of metadata.participants) {
                        const participantJid = jidKey(p.id);

                        // Direct JID match
                        if (participantJid === normalizedUserJid) {
                            return p;
                        }

                        // Check if participant phone matches user phone
                        if (participantJid.includes(userPhone)) {
                            return p;
                        }

                        // If participant is LID, decode it and check if it matches user phone
                        if (p.id.includes('@lid')) {
                            const participantPhone = await decodeLIDToPhone(sock, p.id);
                            if (participantPhone && participantPhone === userPhone) {
                                return p;
                            }
                            // Also check with country code variations
                            if (participantPhone && userPhone.includes(participantPhone.replace(/^972/, ''))) {
                                return p;
                            }
                        }

                        // Check if user phone (without country code) matches participant
                        const userPhoneWithout972 = userPhone.replace(/^972/, '0');
                        if (participantJid.includes(userPhoneWithout972.replace(/^0/, '972'))) {
                            return p;
                        }
                    }
                    return null;
                })();

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

                    // ULTRA-SAFE: Longer delay after successful kick to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 2000)); // 2 seconds after each kick

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
                // Handle rate limiting with ULTRA-SAFE delay
                if (groupError.message && groupError.message.includes('rate-overlimit')) {
                    console.log(`[${getTimestamp()}] ⏳ Rate limited - waiting 15 seconds before continuing...`);
                    await new Promise(resolve => setTimeout(resolve, 15000)); // Wait 15 seconds on rate limit
                }

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
