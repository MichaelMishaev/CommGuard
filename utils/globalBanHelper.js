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

            // ULTRA-SAFE: Add VERY long delay every 3 groups to avoid rate limiting
            if (processedCount % 3 === 0) {
                console.log(`[${getTimestamp()}] ⏸️  Pausing 20 seconds to avoid rate limiting...`);
                await new Promise(resolve => setTimeout(resolve, 20000)); // 20 second delay every 3 groups
            }

            try {
                // ULTRA-SAFE: MUCH longer delay before each metadata fetch to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 3000)); // 3 seconds between each group

                // Get group metadata with participants
                const metadata = await sock.groupMetadata(groupId);

                // No admin check - just try to kick. If it fails, we'll catch the error.

                // Check if user is a member of this group
                // WhatsApp provides both 'id' (LID) and 'phoneNumber' (real phone) in participant objects
                // We need to match against BOTH to find the user regardless of which format was used
                const userParticipant = metadata.participants.find(p => {
                    // Method 1: Direct match on participant.id (e.g., 77709346664559@lid)
                    if (p.id === userJid) {
                        console.log(`[${getTimestamp()}]    ✓ Matched by ID: ${p.id}`);
                        return true;
                    }

                    // Method 2: Match on participant.phoneNumber (e.g., 972527332312@s.whatsapp.net)
                    if (p.phoneNumber && p.phoneNumber === userJid) {
                        console.log(`[${getTimestamp()}]    ✓ Matched by phoneNumber: ${p.phoneNumber}`);
                        return true;
                    }

                    // Method 3: If userJid is a phone number, check if it matches participant.phoneNumber
                    if (userJid.includes('@s.whatsapp.net') && p.phoneNumber) {
                        const userPhoneOnly = userJid.split('@')[0];
                        const participantPhoneOnly = p.phoneNumber.split('@')[0];
                        if (userPhoneOnly === participantPhoneOnly) {
                            console.log(`[${getTimestamp()}]    ✓ Matched by phone number: ${userPhoneOnly}`);
                            return true;
                        }
                    }

                    // Method 4: If userJid is a LID, check if participant.id matches
                    if (userJid.includes('@lid') && p.id.includes('@lid')) {
                        const userLidOnly = userJid.split('@')[0];
                        const participantLidOnly = p.id.split('@')[0];
                        if (userLidOnly === participantLidOnly) {
                            console.log(`[${getTimestamp()}]    ✓ Matched by LID: ${userLidOnly}`);
                            return true;
                        }
                    }

                    return false;
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
    message += `   • User not member of: ${report.groupsWhereUserNotMember} groups\n`;

    // Show failed groups if any (bot not admin)
    if (report.failedKicks > 0) {
        message += `\n❌ Failed Groups (Bot Not Admin):\n`;
        const failedGroups = report.details.filter(d => d.status === 'failed');
        failedGroups.forEach(group => {
            const groupUrl = `https://chat.whatsapp.com/${group.groupId}`;
            message += `   • ${group.groupName}\n`;
            message += `     Reason: ${group.reason}\n`;
            message += `     URL: ${groupUrl}\n\n`;
        });
    }

    return message;
}

module.exports = {
    removeUserFromAllAdminGroups,
    formatGlobalBanReport
};
