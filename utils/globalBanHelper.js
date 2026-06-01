// utils/globalBanHelper.js
// Global Ban Helper - Remove user from all groups where admin has admin privileges

const { getTimestamp } = require('./logger');
const { jidKey, decodeLIDToPhone } = require('./jidUtils');
const { robustKick } = require('./kickHelper');
const globalBanTracker = require('../services/globalBanTracker');

/**
 * Remove a user from ALL groups where the specified admin is an admin
 * @param {Object} sock - WhatsApp socket connection
 * @param {string} userJid - User's WhatsApp ID (JID) to remove
 * @param {string} adminPhone - Admin's phone number (without @s.whatsapp.net)
 * @param {string} userPhoneDecoded - Decoded real phone number (optional, for better matching)
 * @param {number} maxGroups - Maximum number of groups to process (default: 10 for safety)
 * @returns {Object} Summary report of the operation
 */
async function removeUserFromAllAdminGroups(sock, userJid, adminPhone, userPhoneDecoded = null, maxGroups = 100) {
    console.log(`[${getTimestamp()}] 🌍 Starting Global Ban for user: ${userJid}`);
    console.log(`   Admin phone: ${adminPhone}`);
    console.log(`   ⚠️ SAFETY LIMIT: Processing max ${maxGroups} groups to prevent Meta bans`);

    const report = {
        totalGroups: 0,
        groupsProcessed: 0,
        groupsWhereUserFound: 0,
        successfulKicks: 0,
        failedKicks: 0,
        skippedGroups: 0,
        groupsWhereAdminNotAdmin: 0,
        groupsWhereUserNotMember: 0,
        limitReached: false,
        details: []
    };

    try {
        const knownBotLids = ['171012763213843@lid'];

        // Step 1: Get admin groups from DB — source of truth.
        const { query } = require('../database/connection');

        const dbResult = await query(`
            SELECT g.whatsapp_group_id
            FROM groups g
            JOIN group_members gm ON gm.group_id = g.id
            JOIN users u ON u.id = gm.user_id
            WHERE (gm.is_admin = true OR gm.is_super_admin = true)
              AND u.phone_number = $1
        `, [adminPhone]);

        const groupIds = dbResult.rows.map(r => r.whatsapp_group_id);
        report.totalGroups = groupIds.length;
        console.log(`[${getTimestamp()}] 📋 Bot is admin in ${groupIds.length} groups (from DB)`);

        // Get already processed groups for this user
        const processedGroups = await globalBanTracker.getProcessedGroups(userJid);
        console.log(`[${getTimestamp()}] 📋 Already processed ${processedGroups.length} groups for this user`);

        // Filter out already processed groups
        const unprocessedGroups = groupIds.filter(gid => !processedGroups.includes(gid));
        console.log(`[${getTimestamp()}] 📋 ${unprocessedGroups.length} groups remaining to process`);

        if (unprocessedGroups.length === 0) {
            console.log(`[${getTimestamp()}] ✅ All groups already processed for this user!`);
            report.allGroupsProcessed = true;
            return report;
        }

        // Safety check: Limit to maxGroups to prevent Meta bans
        if (unprocessedGroups.length > maxGroups) {
            console.log(`[${getTimestamp()}] ⚠️ SAFETY: Limiting to first ${maxGroups} groups (out of ${unprocessedGroups.length} remaining)`);
            report.limitReached = true;
        }

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

        // Resolve user's LID from file cache (phone → LID reverse lookup)
        // Needed because Baileys returns participant IDs in LID format, not phone format
        let userLid = null;
        try {
            const fs = require('fs');
            const path = require('path');
            const authDir = path.join(process.cwd(), 'baileys_auth_info');
            if (fs.existsSync(authDir)) {
                const files = fs.readdirSync(authDir).filter(f => f.startsWith('lid-mapping-') && f.endsWith('_reverse.json'));
                for (const file of files) {
                    try {
                        const content = fs.readFileSync(path.join(authDir, file), 'utf8').replace(/['"]/g, '').trim();
                        if (content === userPhone) {
                            userLid = file.replace('lid-mapping-', '').replace('_reverse.json', '') + '@lid';
                            console.log(`[${getTimestamp()}] 🔓 Resolved user LID from cache: ${userLid}`);
                            break;
                        }
                    } catch(e) { /* skip unreadable files */ }
                }
            }
            if (!userLid) console.log(`[${getTimestamp()}] ⚠️  No LID cache found for phone ${userPhone}`);
        } catch(e) {
            console.log(`[${getTimestamp()}] ⚠️  LID resolution error: ${e.message}`);
        }

        // Note: Israeli number protection exists for BLACKLISTING (blacklistService.js)
        // Global ban (kicking) is allowed for all numbers including Israeli

        // Step 2: Process each group (LIMITED to maxGroups for safety)
        let processedCount = 0;
        const groupsToProcess = unprocessedGroups.slice(0, maxGroups); // Only take first maxGroups

        for (const groupId of groupsToProcess) {
            processedCount++;
            report.groupsProcessed = processedCount;
            let groupName = groupId; // will be overwritten by fresh metadata below

            // Progress update every 5 groups
            if (processedCount % 5 === 0) {
                console.log(`[${getTimestamp()}] 🔄 Progress: ${processedCount}/${groupsToProcess.length} groups checked...`);
            }

            // ULTRA-SAFE: Add VERY long delay every 3 groups to avoid rate limiting
            if (processedCount % 3 === 0) {
                console.log(`[${getTimestamp()}] ⏸️  Pausing 20 seconds to avoid rate limiting...`);
                await new Promise(resolve => setTimeout(resolve, 20000)); // 20 second delay every 3 groups
            }

            try {
                // ULTRA-SAFE: MUCH longer delay before each metadata fetch to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 3000)); // 3 seconds between each group

                // Get group metadata with participants (always fresh — don't trust groupFetchAllParticipating cache)
                const metadata = await sock.groupMetadata(groupId);
                groupName = metadata.subject || groupId;

                // Fix 1: Re-verify bot is actually admin using fresh metadata (groupFetchAllParticipating can be stale)
                const botIdFresh = sock.user?.id || '';
                const botPhoneFresh = botIdFresh.split(':')[0].split('@')[0];
                const botInFresh = metadata.participants.find(p => {
                    if (p.id === botIdFresh) return true;
                    if (knownBotLids.includes(p.id)) return true;
                    const pPhone = p.id.split(':')[0].split('@')[0];
                    return pPhone === botPhoneFresh;
                });
                if (!botInFresh || (botInFresh.admin !== 'admin' && botInFresh.admin !== 'superadmin')) {
                    report.groupsWhereAdminNotAdmin++;
                    report.details.push({
                        groupId,
                        groupName,
                        status: 'skipped',
                        reason: 'Bot is not admin in this group (verified via fresh metadata)'
                    });
                    console.log(`[${getTimestamp()}]    ⚠️ Skipping ${groupName} — bot not admin (fresh check)`);
                    continue;
                }

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
                        console.log(`[${getTimestamp()}]    ✓ Matched by phoneNumber exact: ${p.phoneNumber}`);
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

                    // Method 5: Use decoded phone number for matching (CRITICAL FIX)
                    // If we have a decoded phone (e.g., "972527332312"), match against participant.phoneNumber
                    if (userPhoneDecoded && p.phoneNumber) {
                        // Check if phoneNumber contains the decoded phone digits
                        // Remove any non-digit characters for comparison
                        const decodedDigits = userPhoneDecoded.replace(/\D/g, '');
                        const participantPhoneDigits = p.phoneNumber.split('@')[0];

                        // Match last 9 digits of real phone (e.g., "527332312")
                        const last9 = decodedDigits.slice(-9);
                        if (participantPhoneDigits.includes(last9)) {
                            console.log(`[${getTimestamp()}]    ✓ Matched by decoded phone (last 9): ${last9} in ${p.phoneNumber}`);
                            return true;
                        }
                    }

                    // Method 6: Direct LID match using resolved LID cache
                    // This handles the case where Baileys returns participant IDs in LID format
                    if (userLid && p.id === userLid) {
                        console.log(`[${getTimestamp()}]    ✓ Matched by LID: ${p.id}`);
                        return true;
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

        // Track processed groups for batching safety
        const processedGroupIds = groupsToProcess.map(gid => gid);
        await globalBanTracker.addProcessedGroups(userJid, processedGroupIds);

        // Clear tracking only when all groups were processed with no errors
        if (!report.limitReached && report.skippedGroups === 0) {
            await globalBanTracker.clearTracking(userJid);
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

    // Safety warning if limit was reached
    if (report.limitReached) {
        message += `⚠️ *SAFETY MODE ACTIVE*\n`;
        message += `   Limited to ${report.groupsProcessed} groups (of ${report.totalGroups} total)\n`;
        message += `   This prevents Meta bans from mass actions\n\n`;
    }

    const adminGroups = report.groupsProcessed - report.groupsWhereAdminNotAdmin;
    message += `📊 Summary:\n`;
    message += `   • Total Groups: ${report.totalGroups}\n`;
    message += `   • Bot is Admin in: ${adminGroups} groups\n`;
    message += `   • User Found In: ${report.groupsWhereUserFound} groups\n`;
    message += `   • Successfully Kicked: ${report.successfulKicks} ✅\n`;

    if (report.failedKicks > 0) {
        message += `   • Failed Kicks: ${report.failedKicks} ❌\n`;
    }
    if (report.groupsWhereAdminNotAdmin > 0) {
        message += `   • Skipped (bot not admin): ${report.groupsWhereAdminNotAdmin}\n`;
    }

    message += `   • User not in: ${report.groupsWhereUserNotMember} groups\n`;

    if (report.successfulKicks === 0 && report.groupsWhereUserNotMember > 0) {
        message += `\n⚠️ User may have been auto-kicked before global ban ran.\n`;
    }

    if (report.limitReached) {
        const remaining = report.totalGroups - report.groupsProcessed;
        message += `\n💡 *Tip:* ${remaining} groups not checked yet.\n`;
        message += `   Run #kickglobal again to process next batch.\n`;
    }

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

/**
 * List all groups where user is a member, formatted for selection
 * @param {Object} sock - WhatsApp socket connection
 * @param {string} userJid - User's WhatsApp ID (JID)
 * @param {string} userPhone - User's decoded phone number
 * @returns {string} Formatted list of groups
 */
async function listGroupsForSelection(sock, userJid, userPhone) {
    try {
        console.log(`[${getTimestamp()}] 📋 Listing groups for selection...`);

        // Get all groups
        const groups = await sock.groupFetchAllParticipating();
        const allGroupIds = Object.keys(groups);

        // Filter to only groups where bot is admin
        const botId = sock.user?.id || '';
        const botPhone = botId.split(':')[0].split('@')[0];
        const knownBotLids = ['171012763213843@lid'];

        const groupIds = allGroupIds.filter(gid => {
            const group = groups[gid];
            if (!group.participants) return false;
            const botP = group.participants.find(p => {
                if (p.id === botId) return true;
                if (knownBotLids.includes(p.id)) return true;
                const pPhone = p.id.split(':')[0].split('@')[0];
                return pPhone === botPhone;
            });
            return botP && (botP.admin === 'admin' || botP.admin === 'superadmin');
        });

        console.log(`[${getTimestamp()}] ✅ Bot is admin in ${groupIds.length} groups (of ${allGroupIds.length} total)`);

        const groupsWithUser = [];
        let index = 1;

        for (const groupId of groupIds) {
            try {
                const metadata = await sock.groupMetadata(groupId);

                // Check if user is a member (same matching logic as removeUserFromAllAdminGroups)
                const userParticipant = metadata.participants.find(p => {
                    if (p.id === userJid) return true;
                    if (p.phoneNumber && p.phoneNumber === userJid) return true;

                    if (userJid.includes('@s.whatsapp.net') && p.phoneNumber) {
                        const userPhoneOnly = userJid.split('@')[0];
                        const participantPhoneOnly = p.phoneNumber.split('@')[0];
                        if (userPhoneOnly === participantPhoneOnly) return true;
                    }

                    if (userJid.includes('@lid') && p.id.includes('@lid')) {
                        const userLidOnly = userJid.split('@')[0];
                        const participantLidOnly = p.id.split('@')[0];
                        if (userLidOnly === participantLidOnly) return true;
                    }

                    if (userPhone && p.phoneNumber) {
                        const decodedDigits = userPhone.replace(/\D/g, '');
                        const participantPhoneDigits = p.phoneNumber.split('@')[0];
                        const last9 = decodedDigits.slice(-9);
                        if (participantPhoneDigits.includes(last9)) return true;
                    }

                    return false;
                });

                if (userParticipant) {
                    const groupName = metadata.subject || 'Unknown Group';
                    const memberCount = metadata.participants.length;
                    groupsWithUser.push({
                        index: index++,
                        groupId,
                        groupName,
                        memberCount
                    });
                }

                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (error) {
                console.error(`[${getTimestamp()}] ⚠️ Error checking group: ${error.message}`);
            }
        }

        // Format the list
        if (groupsWithUser.length === 0) {
            return `❌ User is not a member of any of your groups`;
        }

        let list = `Found in ${groupsWithUser.length} groups:\n\n`;
        groupsWithUser.forEach(g => {
            list += `${g.index}. ${g.groupName} (${g.memberCount} members)\n`;
        });

        // Store the mapping for later use
        global.groupSelectionMap = groupsWithUser;

        return list;

    } catch (error) {
        console.error(`[${getTimestamp()}] ❌ Failed to list groups:`, error.message);
        return `❌ Error listing groups: ${error.message}`;
    }
}

/**
 * Execute global ban on selected groups
 * @param {Object} sock - WhatsApp socket connection
 * @param {string} userJid - User's WhatsApp ID (JID) to remove
 * @param {Array<string>} selectedGroupIds - Array of group IDs to ban from
 * @param {string} userPhone - User's decoded phone number
 * @returns {Object} Summary report
 */
async function executeGlobalBanOnSelectedGroups(sock, userJid, selectedGroupIds, userPhone) {
    console.log(`[${getTimestamp()}] 🌍 Executing Global Ban on ${selectedGroupIds.length} selected groups`);

    const report = {
        totalGroupsSelected: selectedGroupIds.length,
        successfulKicks: 0,
        failedKicks: 0,
        details: []
    };

    for (const groupId of selectedGroupIds) {
        try {
            const metadata = await sock.groupMetadata(groupId);
            const groupName = metadata.subject || 'Unknown Group';

            // Find user participant (same matching logic)
            const userParticipant = metadata.participants.find(p => {
                if (p.id === userJid) return true;
                if (p.phoneNumber && p.phoneNumber === userJid) return true;

                if (userJid.includes('@s.whatsapp.net') && p.phoneNumber) {
                    const userPhoneOnly = userJid.split('@')[0];
                    const participantPhoneOnly = p.phoneNumber.split('@')[0];
                    if (userPhoneOnly === participantPhoneOnly) return true;
                }

                if (userPhone && p.phoneNumber) {
                    const decodedDigits = userPhone.replace(/\D/g, '');
                    const participantPhoneDigits = p.phoneNumber.split('@')[0];
                    const last9 = decodedDigits.slice(-9);
                    if (participantPhoneDigits.includes(last9)) return true;
                }

                return false;
            });

            if (!userParticipant) {
                report.failedKicks++;
                report.details.push({
                    groupName,
                    status: 'failed',
                    reason: 'User not found in group'
                });
                continue;
            }

            // Kick user
            console.log(`[${getTimestamp()}] 🎯 Kicking from: ${groupName}`);
            await robustKick(sock, groupId, [userParticipant.id]);

            report.successfulKicks++;
            report.details.push({
                groupName,
                status: 'success',
                reason: 'User kicked successfully'
            });

            console.log(`[${getTimestamp()}] ✅ Kicked from: ${groupName}`);

            // Delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (error) {
            report.failedKicks++;
            report.details.push({
                groupName: 'Unknown',
                status: 'failed',
                reason: error.message
            });
            console.error(`[${getTimestamp()}] ❌ Error kicking from group:`, error.message);
        }
    }

    return report;
}

/**
 * Format selected groups ban report
 * @param {Object} report - Report from executeGlobalBanOnSelectedGroups
 * @returns {string} Formatted message
 */
function formatSelectedGroupsBanReport(report) {
    let message = `🌍 *Global Ban Complete*\n\n`;
    message += `📊 Summary:\n`;
    message += `   • Groups Selected: ${report.totalGroupsSelected}\n`;
    message += `   • Successfully Removed: ${report.successfulKicks} ✅\n`;
    message += `   • Failed Removals: ${report.failedKicks} ❌\n\n`;

    if (report.successfulKicks > 0) {
        message += `✅ *Successful Kicks:*\n`;
        const successful = report.details.filter(d => d.status === 'success');
        successful.forEach(g => {
            message += `   • ${g.groupName}\n`;
        });
        message += `\n`;
    }

    if (report.failedKicks > 0) {
        message += `❌ *Failed Kicks:*\n`;
        const failed = report.details.filter(d => d.status === 'failed');
        failed.forEach(g => {
            message += `   • ${g.groupName}\n`;
            message += `     Reason: ${g.reason}\n`;
        });
    }

    return message;
}

module.exports = {
    removeUserFromAllAdminGroups,
    formatGlobalBanReport,
    listGroupsForSelection,
    executeGlobalBanOnSelectedGroups,
    formatSelectedGroupsBanReport
};
